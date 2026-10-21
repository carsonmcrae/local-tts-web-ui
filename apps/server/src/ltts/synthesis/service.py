# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Produce audio for a document segment or arbitrary preview text, using the cache first.

Scope: Plans a document sentence with ``documents.styling``: its voice (its own, its character's,
the dialogue voice or the reader's), effect, sound, speaking style, take and pause, and narration and
quoted speech voiced separately where the cast asks for it. It then rewrites display text into speech
text (the sentence's own pronunciations, the dictionary, normalisation) and builds a render job
(``render.py``). The job waits on the right engine's queue at the right priority, and the result is
cached by a key that changes whenever the sound would. Offers a blocking API for export jobs and an
async one that stops waiting (and releases queued work) when the HTTP client disconnects, plus
candidate takes of one sentence, and which sentences are skipped (left out of exports and playback).
Does NOT belong: HTTP routing, export assembly or how a job is rendered (``render.py``).
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from collections.abc import Awaitable, Callable
from concurrent.futures import Future

from ltts.audio import Float32Array, encode_wav, read_audio
from ltts.documents.casting import CastingStore
from ltts.documents.normalize import speech_text
from ltts.documents.repository import DocumentRepository
from ltts.documents.styling import SegmentPlan, Sound, StylingStore
from ltts.engines.registry import EngineRegistry, ResolvedVoice
from ltts.errors import AppError, SynthesisError
from ltts.synthesis.cache import AudioCache, CachedAudio
from ltts.synthesis.render import TAKE_ENGINES, Piece, RenderJob, render, tuned
from ltts.synthesis.scheduler import EngineScheduler

log = logging.getLogger("ltts.synthesis")
MAX_PREVIEW_CHARS = 400
SOUND_ENGINES = frozenset({"chatterbox"})  # engines that perform a sound tag instead of reading it out


class ClientGoneError(Exception):
    """The requester disconnected before audio was ready."""


def _constant(value: str) -> Callable[[re.Match[str]], str]:
    return lambda _match: value


def _replace(text: str, replacements: tuple[tuple[str, str], ...]) -> str:
    """Whole-word replacements (the replacement is used literally, never as a pattern)."""
    for written, spoken in replacements:
        text = re.sub(rf"(?<!\w){re.escape(written)}(?!\w)", _constant(spoken), text)
    return text


class SynthesisService:
    def __init__(
        self,
        registry: EngineRegistry,
        cache: AudioCache,
        documents: DocumentRepository,
        pronounce: Callable[[str], str] = lambda text: text,
        styling: StylingStore | None = None,
        casting: CastingStore | None = None,
    ):
        self._registry = registry
        self._cache = cache
        self._documents = documents
        self._pronounce = pronounce  # the pronunciation dictionary, applied before normalising
        self._styling = styling
        self._casting = casting
        self._schedulers: dict[str, EngineScheduler] = {}
        self._lock = threading.Lock()

    def _scheduler(self, engine_id: str) -> EngineScheduler:
        with self._lock:
            if engine_id not in self._schedulers:
                self._schedulers[engine_id] = EngineScheduler(engine_id)
            return self._schedulers[engine_id]

    # -- planning --------------------------------------------------------------
    def plan_segment(self, document_id: str, index: int, text: str, voice_id: str) -> SegmentPlan:
        """Which voices read a document sentence, and how (a plain plan without styling)."""
        if self._styling is None:
            return SegmentPlan(voice_id)
        characters = self._casting.voices(document_id) if self._casting else None
        return self._styling.plan(document_id, index, text, voice_id, characters)

    def skipped(self, document_id: str) -> set[int]:
        """The sentences of a document that are never read (the cleanup's finds, or skipped by hand)."""
        return self._styling.skipped(document_id) if self._styling else set()

    def _spoken(self, text: str, voice: ResolvedVoice, sound: Sound | None, plan: SegmentPlan | None = None) -> str:
        """What the engine is asked to say: the sentence's and the dictionary's pronunciations, speech
        normalisation, then the sound to make first (only for an engine that performs it)."""
        written = _replace(text, plan.replacements) if plan and plan.replacements else text
        spoken = speech_text(self._pronounce(written)) or "."
        return f"[{sound}] {spoken}" if sound and voice.engine.id in SOUND_ENGINES else spoken

    def job(self, voice: str | SegmentPlan, text: str, boundary: str, pace: float) -> RenderJob:
        plan = voice if isinstance(voice, SegmentPlan) else SegmentPlan(voice)
        pieces: list[Piece] = []
        for position, (part_text, part_voice) in enumerate(
            [(part.text, part.voice_id) for part in plan.parts] or [(text, plan.voice_id)]
        ):
            resolved = self._registry.resolve(part_voice)
            sound = plan.sound if position == 0 else None
            spec = tuned(resolved, plan.style, plan.take, plan.steady)
            pieces.append(Piece(resolved, spec, self._spoken(part_text, resolved, sound, plan)))
        return RenderJob(tuple(pieces), boundary, pace, plan.effect, plan.pause_ms)

    def key_for(self, voice: str | SegmentPlan, text: str, boundary: str, pace: float) -> str:
        """The cache key a render would use; it changes whenever the audio would (text, voice, styling, engine)."""
        return self.job(voice, text, boundary, pace).key()

    def supports_takes(self, plan: SegmentPlan) -> bool:
        """Whether another take of this sentence can sound different (built-in voices are always the same)."""
        voices = [part.voice_id for part in plan.parts] or [plan.voice_id]
        return any(self._registry.resolve(voice).engine.id in TAKE_ENGINES for voice in voices)

    # -- rendering -------------------------------------------------------------
    def _render(self, job: RenderJob, key: str) -> CachedAudio:
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        started = time.perf_counter()
        clip = render(job)
        duration = len(clip.samples) / clip.sample_rate
        log.debug(
            "synthesised",
            extra={
                "engine": job.engine_id,
                "pieces": len(job.pieces),
                "audio_s": round(duration, 2),
                "elapsed_s": round(time.perf_counter() - started, 3),
            },
        )
        return self._cache.put(key, encode_wav(clip.samples, clip.sample_rate), duration, job.engine_id, job.voice_id)

    def _submit(
        self, voice: str | SegmentPlan, text: str, boundary: str, pace: float, priority: int
    ) -> tuple[Future[CachedAudio], str, str]:
        job = self.job(voice, text, boundary, pace)
        key = job.key()
        future = self._scheduler(job.engine_id).submit(key, priority, lambda: self._render(job, key))
        return future, key, job.engine_id

    def cached_or_none(self, voice_id: str, text: str, boundary: str, pace: float) -> CachedAudio | None:
        return self._cache.get(self.key_for(voice_id, text, boundary, pace))

    def read(self, audio: CachedAudio) -> tuple[Float32Array, int]:
        """A rendered clip's samples (exports keep their own copy, so cache eviction can't lose them)."""
        return read_audio(audio.path)

    def language_of(self, voice_id: str) -> str:
        """A voice's language as a BCP 47 tag, such as ``en-US``."""
        code = self._registry.resolve(voice_id).spec.language_code or "en"
        language, _, region = code.partition("-")
        return f"{language}-{region.upper()}" if region else language

    def render_blocking(
        self,
        voice: str | SegmentPlan,
        text: str,
        boundary: str,
        pace: float,
        priority: int,
        canceled: Callable[[], bool],
    ) -> CachedAudio:
        """Audio for ``text`` read by a voice id, or as a document sentence's plan says."""
        future, key, engine_id = self._submit(voice, text, boundary, pace, priority)
        while True:
            try:
                return future.result(timeout=0.5)
            except TimeoutError:
                if canceled():
                    self._scheduler(engine_id).release(key)
                    raise

    async def render(
        self,
        voice: str | SegmentPlan,
        text: str,
        boundary: str,
        pace: float,
        priority: int,
        disconnected: Callable[[], Awaitable[bool]],
    ) -> CachedAudio:
        future, key, engine_id = self._submit(voice, text, boundary, pace, priority)
        wrapped = asyncio.wrap_future(future)
        while True:
            done, _ = await asyncio.wait({wrapped}, timeout=0.25)
            if done:
                try:
                    return wrapped.result()
                except AppError:
                    raise
                except Exception as exc:
                    log.exception("synthesis failed")
                    raise SynthesisError("Speech generation failed for this passage.") from exc
            if await disconnected():
                self._scheduler(engine_id).release(key)
                raise ClientGoneError

    async def segment_audio(
        self,
        document_id: str,
        index: int,
        voice_id: str,
        pace: float,
        priority: int,
        disconnected: Callable[[], Awaitable[bool]],
    ) -> CachedAudio:
        text, boundary = self._documents.segment(document_id, index)
        plan = self.plan_segment(document_id, index, text, voice_id)
        return await self.render(plan, text, boundary, pace, priority, disconnected)

    def purge_voice(self, voice_id: str) -> int:
        return self._cache.purge_voice(voice_id)
