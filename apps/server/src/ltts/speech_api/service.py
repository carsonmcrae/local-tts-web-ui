# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Turn one speech API request into audio with TTSNative's own voices.

Scope: The models and voices a client may use (every built-in voice of an installed engine, and only
the custom voices the owner allowed; any other kind of voice is refused), checking a requested model
and voice, cleaning the input and splitting it with the document segmenter, rendering each sentence
through the synthesis service (cache, pronunciation dictionary and engine queues included, at preview
priority so reading in the app comes first), joining the sentences and encoding them. One request is
synthesised at a time (another gets 429), and a request that runs out of time or whose client
disconnects releases its queued work. Also the status the Settings page shows.
Does NOT belong: HTTP concerns such as access checks and parsing (``router.py``) or stored settings
(``store.py``).
"""

from __future__ import annotations

import asyncio
import threading
import time
import unicodedata
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import numpy as np

from ltts.audio import Float32Array, encode_audio, resample
from ltts.config import Settings
from ltts.documents.extract_text import text_to_extraction
from ltts.documents.segmenter import segment_extraction
from ltts.engines.base import VoiceInfo
from ltts.engines.registry import EngineRegistry
from ltts.errors import AppError, BusyError, ForbiddenError, NotFoundError
from ltts.speech_api.guard import RateLimiter, Usage
from ltts.speech_api.schemas import SpeechApiStatus, SpeechApiUsage, SpeechRequest
from ltts.speech_api.store import SpeechApiConfig, SpeechApiStore
from ltts.synthesis.scheduler import PRIORITY_PREVIEW
from ltts.synthesis.service import ClientGoneError, SynthesisService

MODEL = "ttsnative"
OPENAI_MODELS = ("tts-1", "tts-1-hd", "gpt-4o-mini-tts")  # accepted so OpenAI clients work unchanged
MAX_SENTENCES = 200
CUSTOM_PREFIX = "custom:"  # cloned voices: only those the owner allowed
CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "opus": "audio/ogg",
    "flac": "audio/flac",
    "wav": "audio/wav",
    "pcm": "audio/pcm",
}
PCM_RATE = 24_000  # raw PCM is 24 kHz, as OpenAI documents it
OPUS_RATES = frozenset({8_000, 12_000, 16_000, 24_000, 48_000})
DROPPED = frozenset({"Co", "Cs"})  # private-use characters (the app's speech marks) and lone surrogates


class InvalidSpeechError(AppError):
    status_code = 422
    code = "invalid_input"


class SpeechTimeoutError(AppError):
    status_code = 504
    code = "timeout"


@dataclass(frozen=True, slots=True)
class SpeechAudio:
    body: bytes
    content_type: str
    sample_rate: int
    duration_s: float
    sentences: int


def speech_parts(text: str) -> list[tuple[str, str]]:
    """The input's sentences with the pause after each; the last one keeps only a short pause."""
    cleaned = "".join(char for char in text if unicodedata.category(char) not in DROPPED)
    segments, _ = segment_extraction(text_to_extraction(cleaned, None))
    parts: list[tuple[str, str]] = [(segment.text, segment.boundary) for segment in segments]
    if parts:
        parts[-1] = (parts[-1][0], "sentence")
    return parts


def encode_clips(clips: list[tuple[Float32Array, int]], audio_format: str) -> SpeechAudio:
    """Join the sentences (resampled to one rate) and encode them."""
    rate = clips[0][1]
    if audio_format == "pcm" or (audio_format == "opus" and rate not in OPUS_RATES):
        rate = PCM_RATE
    samples = np.concatenate([resample(clip, clip_rate, rate) for clip, clip_rate in clips])
    body = encode_audio(samples, rate, audio_format)
    return SpeechAudio(body, CONTENT_TYPES[audio_format], rate, len(samples) / rate, len(clips))


class SpeechApi:
    def __init__(self, settings: Settings, store: SpeechApiStore, synthesis: SynthesisService, engines: EngineRegistry):
        self.settings = settings
        self.store = store
        self._synthesis = synthesis
        self._engines = engines
        self.usage = Usage()
        self.limiter = RateLimiter(settings.speech_api_requests_per_minute)
        self._slot = threading.Lock()  # one API synthesis at a time

    # -- discovery -------------------------------------------------------------
    def _engine_ids(self) -> list[str]:
        return [engine.id for engine in self._engines.all() if engine.is_ready()]

    def models(self) -> list[str]:
        """``ttsnative`` and the OpenAI names (any voice), and each installed engine (only its voices)."""
        return [MODEL, *OPENAI_MODELS, *self._engine_ids()]

    def voices(self, config: SpeechApiConfig) -> list[VoiceInfo]:
        allowed = set(config.allowed_voices)
        return [
            voice
            for voice in self._engines.voices()
            if voice.available and (voice.category == "built-in" or voice.id in allowed)
        ]

    def check(self, config: SpeechApiConfig, request: SpeechRequest) -> None:
        """Refuse an unknown model, an unknown voice, or any voice that is neither one of an engine's
        own built-in voices nor allowed by the owner (cloned voices are checked before they are read)."""
        engines = self._engine_ids()
        if request.model not in (MODEL, *OPENAI_MODELS, *engines):
            raise NotFoundError("Unknown model. GET /v1/models lists the models you can use.", code="model_not_found")
        allowed = request.voice in config.allowed_voices
        refused = ForbiddenError(
            "This voice isn't allowed for the speech API. Its owner can allow a custom voice in TTSNative's "
            "Settings, under Local speech API.",
            code="voice_not_allowed",
        )
        if request.voice.startswith(CUSTOM_PREFIX) and not allowed:
            raise refused
        try:
            engine = self._engines.resolve(request.voice).engine
        except NotFoundError as exc:
            raise NotFoundError(
                "Unknown voice. Use a TTSNative voice id such as kokoro:af_heart; GET /v1/voices lists them.",
                code="voice_not_found",
            ) from exc
        built_in = any(voice.id == request.voice and voice.category == "built-in" for voice in engine.voices())
        if not (built_in or allowed):
            raise refused
        if request.model in engines and engine.id != request.model:
            raise InvalidSpeechError(
                f"That voice isn't a {request.model} voice. Use the model {MODEL} for any voice.",
                code="model_voice_mismatch",
            )

    # -- synthesis -------------------------------------------------------------
    def sentences(self, text: str) -> list[tuple[str, str]]:
        limit = self.settings.speech_api_max_chars
        if len(text) > limit:
            raise InvalidSpeechError(
                f"The input is longer than {limit:,} characters. Send it in smaller pieces.",
                code="input_too_long",
                details={"limitChars": limit},
            )
        parts = speech_parts(text)
        if not parts:
            raise InvalidSpeechError("The input has no text to read aloud.", code="empty_input")
        if len(parts) > MAX_SENTENCES:
            raise InvalidSpeechError(
                f"The input has more than {MAX_SENTENCES} sentences. Send it in smaller pieces.",
                code="too_many_sentences",
            )
        return parts

    async def speak(
        self, request: SpeechRequest, parts: list[tuple[str, str]], disconnected: Callable[[], Awaitable[bool]]
    ) -> SpeechAudio:
        if not self._slot.acquire(blocking=False):
            raise BusyError(
                "The speech API is already making audio for another request. Try again in a moment.",
                code="speech_busy",
                headers={"Retry-After": "2"},
            )
        self.usage.started()
        served: str | None = None
        try:
            clips = await self._render(request, parts, disconnected)
            audio = await asyncio.to_thread(encode_clips, clips, request.response_format)
            served = request.voice
            return audio
        finally:
            self.usage.finished(served)
            self._slot.release()

    async def _render(
        self, request: SpeechRequest, parts: list[tuple[str, str]], disconnected: Callable[[], Awaitable[bool]]
    ) -> list[tuple[Float32Array, int]]:
        deadline = time.monotonic() + self.settings.speech_api_timeout_s

        async def stop() -> bool:
            return time.monotonic() > deadline or await disconnected()

        clips: list[tuple[Float32Array, int]] = []
        try:
            for text, boundary in parts:
                audio = await self._synthesis.render(
                    request.voice, text, boundary, request.speed, PRIORITY_PREVIEW, stop
                )
                clips.append(await asyncio.to_thread(self._synthesis.read, audio))
        except ClientGoneError:
            if time.monotonic() > deadline:
                raise SpeechTimeoutError(
                    "Making this audio took too long. Send a shorter input, or try again when the computer is "
                    "less busy."
                ) from None
            raise
        return clips

    # -- settings ----------------------------------------------------------------
    def status(self, config: SpeechApiConfig, port: int | None) -> SpeechApiStatus:
        usage = self.usage.snapshot()
        return SpeechApiStatus(
            enabled=config.enabled,
            allow_network=config.allow_network,
            allowed_voices=list(config.allowed_voices),
            has_token=config.token_hash is not None,
            token_created_at=config.token_created_at,
            network_mode=self.settings.allow_network,
            port=port,
            max_input_chars=self.settings.speech_api_max_chars,
            requests_per_minute=self.settings.speech_api_requests_per_minute,
            usage=SpeechApiUsage(
                requests=usage.requests,
                last_used_at=usage.last_used_at,
                last_voice_id=usage.last_voice_id,
                in_progress=usage.in_progress,
                active=usage.active,
            ),
        )
