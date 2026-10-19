"""Purpose: Produce audio for a document segment or arbitrary preview text, using the cache first.

Scope: Rewrites display text into speech text, builds the cache key, schedules synthesis on the
engine's queue at the right priority, finalises the clip (fades + natural pause) and stores it.
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

from ltts.audio import encode_wav, finalize_segment
from ltts.documents.normalize import speech_text
from ltts.documents.repository import DocumentRepository
from ltts.engines.registry import EngineRegistry, ResolvedVoice
from ltts.errors import AppError, SynthesisError
from ltts.synthesis.cache import AudioCache, CachedAudio, cache_key
from ltts.synthesis.scheduler import EngineScheduler

log = logging.getLogger("ltts.synthesis")
MAX_PREVIEW_CHARS = 400


class ClientGoneError(Exception):
    """The requester disconnected before audio was ready."""


class SynthesisService:
    def __init__(self, registry: EngineRegistry, cache: AudioCache, documents: DocumentRepository):
        self._registry = registry
        self._cache = cache
        self._documents = documents
        self._schedulers: dict[str, EngineScheduler] = {}
        self._lock = threading.Lock()

    def _scheduler(self, engine_id: str) -> EngineScheduler:
        with self._lock:
            if engine_id not in self._schedulers:
                self._schedulers[engine_id] = EngineScheduler(engine_id)
            return self._schedulers[engine_id]

    def _key(self, voice: ResolvedVoice, spoken: str, boundary: str, pace: float) -> str:
        return cache_key(
            engine=voice.engine.revision(),
            voice=voice.voice_id,
            voice_revision=voice.revision,
            pace=round(pace, 2),
            boundary=boundary,
            text=spoken,
        )

    def _render(self, voice: ResolvedVoice, key: str, spoken: str, boundary: str, pace: float) -> CachedAudio:
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        started = time.perf_counter()
        clip = voice.engine.synthesize(spoken, voice.spec, pace)
        if clip.samples.size == 0:
            raise SynthesisError("The engine returned no audio for this passage.", code="empty_audio")
        samples = finalize_segment(clip.samples, clip.sample_rate, boundary)
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
        self, voice_id: str, text: str, boundary: str, pace: float, priority: int
    ) -> tuple[Future[CachedAudio], str, str]:
        voice = self._registry.resolve(voice_id)
        spoken = speech_text(text) or "."
        key = self._key(voice, spoken, boundary, pace)
        scheduler = self._scheduler(voice.engine.id)
        future = scheduler.submit(key, priority, lambda: self._render(voice, key, spoken, boundary, pace))
        return future, key, voice.engine.id

    def cached_or_none(self, voice_id: str, text: str, boundary: str, pace: float) -> CachedAudio | None:
        voice = self._registry.resolve(voice_id)
        return self._cache.get(self._key(voice, speech_text(text) or ".", boundary, pace))

    def render_blocking(
        self,
        voice_id: str,
        text: str,
        boundary: str,
        pace: float,
        priority: int,
        canceled: Callable[[], bool],
    ) -> CachedAudio:
        future, key, engine_id = self._submit(voice_id, text, boundary, pace, priority)
        while True:
            try:
                return future.result(timeout=0.5)
            except TimeoutError:
                if canceled():
                    self._scheduler(engine_id).release(key)
                    raise

    async def render(
        self,
        voice_id: str,
        text: str,
        boundary: str,
        pace: float,
        priority: int,
        disconnected: Callable[[], Awaitable[bool]],
    ) -> CachedAudio:
        future, key, engine_id = self._submit(voice_id, text, boundary, pace, priority)
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
        return await self.render(voice_id, text, boundary, pace, priority, disconnected)

    def purge_voice(self, voice_id: str) -> int:
        return self._cache.purge_voice(voice_id)
