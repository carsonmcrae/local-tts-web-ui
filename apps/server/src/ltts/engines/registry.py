# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Wire engines together and resolve any voice id to an engine plus voice specification.

Scope: Holds the engine instances, maps ``engine:key`` and ``custom:<profile>`` voice ids, merges
built-in and custom voices for the library, runs engine install and update jobs, and hands out the
cloning engine for building studio voices.
Does NOT belong: Engine internals, caching or HTTP.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from ltts.engines.base import Engine, EngineInfo, VoiceBuilder, VoiceInfo, VoiceSpec
from ltts.errors import ConflictError, EngineUnavailableError, NotFoundError
from ltts.jobs import JobManager, JobOut, JobStatus

CustomVoiceResolver = Callable[[str], tuple[str, VoiceSpec, str]]
CustomVoiceLister = Callable[[], list[VoiceInfo]]


@dataclass(frozen=True, slots=True)
class ResolvedVoice:
    voice_id: str
    engine: Engine
    spec: VoiceSpec
    revision: str


class EngineRegistry:
    def __init__(self, engines: list[Engine], jobs: JobManager):
        self._engines = {engine.id: engine for engine in engines}
        self._jobs = jobs
        self._custom_resolver: CustomVoiceResolver | None = None
        self._custom_lister: CustomVoiceLister | None = None

    def attach_custom_voices(self, resolver: CustomVoiceResolver, lister: CustomVoiceLister) -> None:
        self._custom_resolver = resolver
        self._custom_lister = lister

    def get(self, engine_id: str) -> Engine:
        try:
            return self._engines[engine_id]
        except KeyError as exc:
            raise NotFoundError("Unknown engine.", code="engine_not_found") from exc

    def is_ready(self, engine_id: str) -> bool:
        engine = self._engines.get(engine_id)
        return engine is not None and engine.is_ready()

    def voice_builder(self, engine_id: str) -> VoiceBuilder:
        """The cloning engine, installed and able to build studio voices."""
        engine = self._engines.get(engine_id)
        if engine is None or not engine.is_ready() or not isinstance(engine, VoiceBuilder):
            raise EngineUnavailableError(
                "Install the voice-cloning engine to build a studio voice.", code="engine_not_installed"
            )
        return engine

    def all(self) -> list[Engine]:
        return list(self._engines.values())

    def info(self, engine_id: str) -> EngineInfo:
        engine = self.get(engine_id)
        info = engine.info()
        active = self._jobs.find_active("install", engine_id)
        if active is not None:
            info.status = "installing"
            info.install_job_id = active.id
        return info

    def infos(self) -> list[EngineInfo]:
        return [self.info(engine_id) for engine_id in self._engines]

    def voices(self) -> list[VoiceInfo]:
        voices = [voice for engine in self._engines.values() for voice in engine.voices()]
        if self._custom_lister is not None:
            voices.extend(self._custom_lister())
        return voices

    def resolve(self, voice_id: str) -> ResolvedVoice:
        prefix, _, key = voice_id.partition(":")
        if prefix == "custom":
            if self._custom_resolver is None:
                raise NotFoundError("Custom voices are unavailable.", code="voice_not_found")
            engine_id, spec, revision = self._custom_resolver(key)
            engine = self.get(engine_id)
        else:
            engine = self.get(prefix)
            known = {voice.id for voice in engine.voices()}
            if voice_id not in known:
                raise NotFoundError("That voice doesn't exist.", code="voice_not_found")
            language = next((v.language_code for v in engine.voices() if v.id == voice_id), "en-us")
            spec, revision = VoiceSpec(key=key, language_code=language), "builtin"
        if not engine.is_ready():
            raise EngineUnavailableError(
                f"The {engine.info().name} engine isn't installed. Install it from Settings → Engines & models.",
                code="engine_not_installed",
                details={"engineId": engine.id},
            )
        return ResolvedVoice(voice_id, engine, spec, revision)

    def install(self, engine_id: str, option: str | None) -> JobOut:
        engine = self.get(engine_id)
        return self._jobs.submit(
            "install",
            {"engineId": engine_id, "option": option},
            lambda ctx: engine.install(ctx, option),
            key=engine_id,
        )

    def update(self, engine_id: str) -> JobOut:
        """Runs as an ``install`` job so status, progress, de-duplication and uninstall guards are shared."""
        engine = self.get(engine_id)
        if (active := self._jobs.find_active("install", engine_id)) is not None:
            return active
        if not (info := engine.info()).update_available:
            raise ConflictError(f"{info.name} is already up to date.", code="no_update")
        return self._jobs.submit("install", {"engineId": engine_id, "update": True}, engine.update, key=engine_id)

    def uninstall(self, engine_id: str) -> None:
        active = self._jobs.find_active("install", engine_id)
        if active is not None and active.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            raise EngineUnavailableError(
                "Wait for the installation to finish or cancel it first.", code="install_running"
            )
        self.get(engine_id).uninstall()
