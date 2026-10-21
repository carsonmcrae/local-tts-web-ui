# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Produce audio for a document segment or arbitrary preview text, using the cache first.

Scope: Rewrites display text into speech text, plans a document sentence (the voice that reads
it, an effect, a sound before it; ``documents.styling``), builds the cache key, schedules synthesis on
the engine's queue at the right priority, applies the effect, finalises the clip (fades + natural
pause) and stores it.
Exposes a blocking API for export jobs and an async API that stops waiting (and releases queued
work) when the HTTP client disconnects.
Does NOT belong: HTTP routing or export assembly.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Awaitable, Callable
from concurrent.futures import Future

from ltts.audio import Float32Array, encode_wav, finalize_segment, read_audio
from ltts.documents.normalize import speech_text
from ltts.documents.repository import DocumentRepository
from ltts.documents.styling import SegmentPlan, Sound, StylingStore
from ltts.effects import Effect, apply_effect
from ltts.engines.registry import EngineRegistry, ResolvedVoice
from ltts.errors import AppError, SynthesisError
from ltts.synthesis.cache import AudioCache, CachedAudio, cache_key
from ltts.synthesis.scheduler import EngineScheduler

log = logging.getLogger("ltts.synthesis")
MAX_PREVIEW_CHARS = 400
SOUND_ENGINES = frozenset({"chatterbox"})  # engines that perform a sound tag instead of reading it out


class ClientGoneError(Exception):
    """The requester disconnected before audio was ready."""


class SynthesisService:
    def __init__(
        self,
        registry: EngineRegistry,
        cache: AudioCache,
        documents: DocumentRepository,
        pronounce: Callable[[str], str] = lambda text: text,
        styling: StylingStore | None = None,
    ):
        self._registry = registry
        self._cache = cache
        self._documents = documents
        self._pronounce = pronounce  # the pronunciation dictionary, applied before normalising
        self._styling = styling
        self._schedulers: dict[str, EngineScheduler] = {}
        self._lock = threading.Lock()

    def _scheduler(self, engine_id: str) -> EngineScheduler:
        with self._lock:
            if engine_id not in self._schedulers:
                self._schedulers[engine_id] = EngineScheduler(engine_id)
            return self._schedulers[engine_id]

    def _key(self, voice: ResolvedVoice, spoken: str, boundary: str, pace: float, effect: Effect | None) -> str:
        # The effect is only part of the key when there is one, so plain audio keeps its earlier keys.
        extra = {"effect": effect} if effect else {}
        return cache_key(
            engine=voice.engine.revision(),
            voice=voice.voice_id,
            voice_revision=voice.revision,
            pace=round(pace, 2),
            boundary=boundary,
            text=spoken,
            **extra,
        )

    def _render(
        self, voice: ResolvedVoice, key: str, spoken: str, boundary: str, pace: float, effect: Effect | None
    ) -> CachedAudio:
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        started = time.perf_counter()
        clip = voice.engine.synthesize(spoken, voice.spec, pace)
        if clip.samples.size == 0:
            raise SynthesisError("The engine returned no audio for this passage.", code="empty_audio")
        raw = apply_effect(effect, clip.samples, clip.sample_rate) if effect else clip.samples
        samples = finalize_segment(raw, clip.sample_rate, boundary)
        duration = len(samples) / clip.sample_rate
        log.debug(
            "synthesised",
            extra={
                "engine": voice.engine.id,
                "chars": len(spoken),
                "audio_s": round(duration, 2),
                "elapsed_s": round(time.perf_counter() - started, 3),
            },
        )
        return self._cache.put(key, encode_wav(samples, clip.sample_rate), duration, voice.engine.id, voice.voice_id)

    def _submit(
        self, voice_id: str, text: str, boundary: str, pace: float, priority: int, plan: SegmentPlan | None = None
    ) -> tuple[Future[CachedAudio], str, str]:
        voice = self._registry.resolve(voice_id)
        effect = plan.effect if plan else None
        spoken = self._spoken(text, voice, plan.sound if plan else None)
        key = self._key(voice, spoken, boundary, pace, effect)
        scheduler = self._scheduler(voice.engine.id)
        future = scheduler.submit(key, priority, lambda: self._render(voice, key, spoken, boundary, pace, effect))
        return future, key, voice.engine.id

    def cached_or_none(self, voice_id: str, text: str, boundary: str, pace: float) -> CachedAudio | None:
        voice = self._registry.resolve(voice_id)
        return self._cache.get(self._key(voice, self._spoken(text, voice, None), boundary, pace, None))

    def _spoken(self, text: str, voice: ResolvedVoice, sound: Sound | None) -> str:
        """What the engine is asked to say: the dictionary's pronunciations, then speech normalisation,
        after the sound to make first (only for an engine that performs it rather than reading it out)."""
        spoken = speech_text(self._pronounce(text)) or "."
        return f"[{sound}] {spoken}" if sound and voice.engine.id in SOUND_ENGINES else spoken

    def key_for(self, voice: str | SegmentPlan, text: str, boundary: str, pace: float) -> str:
        """The cache key a render would use; it changes whenever the audio would (text, voice, styling, engine)."""
        plan = voice if isinstance(voice, SegmentPlan) else SegmentPlan(voice)
        resolved = self._registry.resolve(plan.voice_id)
        return self._key(resolved, self._spoken(text, resolved, plan.sound), boundary, pace, plan.effect)

    def read(self, audio: CachedAudio) -> tuple[Float32Array, int]:
        """A rendered clip's samples (exports keep their own copy, so cache eviction can't lose them)."""
        return read_audio(audio.path)

    def language_of(self, voice_id: str) -> str:
        """A voice's language as a BCP 47 tag, such as ``en-US``."""
        code = self._registry.resolve(voice_id).spec.language_code or "en"
        language, _, region = code.partition("-")
        return f"{language}-{region.upper()}" if region else language

    def plan_segment(self, document_id: str, index: int, text: str, voice_id: str) -> SegmentPlan:
        """Which voice reads a document sentence, with which effect and sound (none without styling)."""
        return self._styling.plan(document_id, index, text, voice_id) if self._styling else SegmentPlan(voice_id)

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
        plan = voice if isinstance(voice, SegmentPlan) else SegmentPlan(voice)
        future, key, engine_id = self._submit(plan.voice_id, text, boundary, pace, priority, plan)
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
        plan = voice if isinstance(voice, SegmentPlan) else SegmentPlan(voice)
        future, key, engine_id = self._submit(plan.voice_id, text, boundary, pace, priority, plan)
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
