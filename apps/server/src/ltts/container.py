# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Build and hold the application's service graph (manual dependency injection).

Scope: Constructs every service once per app from ``Settings`` and exposes them to routes through
the ``ServicesDep`` FastAPI dependency. Tests build their own container with custom settings.
Does NOT belong: Business logic or HTTP routes.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Request

from ltts.common import MB
from ltts.db import Database
from ltts.documents.bookmarks import BookmarkStore
from ltts.documents.repository import DocumentRepository
from ltts.documents.service import DocumentService
from ltts.engines.registry import EngineRegistry
from ltts.exports.service import ExportService
from ltts.jobs import JobManager
from ltts.modelstore.store import ModelStore
from ltts.pronunciation.store import PronunciationStore
from ltts.synthesis.cache import AudioCache
from ltts.synthesis.service import SynthesisService
from ltts.voices.profiles import CLONING_ENGINE, VoiceProfileService
from ltts.voices.sessions import VoiceSessionService
from ltts.voices.studio import StudioService

if TYPE_CHECKING:
    from ltts.config import Settings
    from ltts.engines.base import Engine
    from ltts.preferences import PreferenceStore


EngineFactory = Callable[["Settings", "ModelStore"], list["Engine"]]


@dataclass
class Services:
    settings: Settings
    db: Database
    jobs: JobManager
    document_repo: DocumentRepository
    document_service: DocumentService
    model_store: ModelStore
    engines: EngineRegistry
    audio_cache: AudioCache
    synthesis: SynthesisService
    voices: VoiceProfileService
    voice_sessions: VoiceSessionService
    studio: StudioService
    exports: ExportService
    preferences: PreferenceStore
    pronunciations: PronunciationStore
    bookmarks: BookmarkStore


def build_services(
    settings: Settings,
    *,
    isolate_extraction: bool = True,
    engine_factory: EngineFactory | None = None,
) -> Services:
    """Wire the app. ``engine_factory`` lets tests substitute deterministic engines."""
    # Engines load heavy runtimes, and preferences imports this module for its routes: both stay lazy.
    from ltts.engines.chatterbox import ChatterboxEngine
    from ltts.engines.kokoro import KokoroEngine
    from ltts.preferences import PreferenceStore

    db = Database(settings.database_path)
    db.migrate()
    jobs = JobManager(db)
    documents = DocumentRepository(db)
    store = ModelStore(
        settings.resolved_models_dir, reserve_mb=settings.min_free_disk_mb, bundled_dir=settings.bundled_models_dir
    )
    factory = engine_factory or (lambda s, m: [KokoroEngine(m), ChatterboxEngine(s, m)])
    registry = EngineRegistry(factory(settings, store), jobs)
    cache = AudioCache(settings.path("cache", "audio"), db, settings.audio_cache_max_mb * MB)
    pronunciations = PronunciationStore(db)
    synthesis = SynthesisService(registry, cache, documents, pronunciations.apply)
    voices = VoiceProfileService(settings, db, cache.purge_voice)
    registry.attach_custom_voices(voices.resolve, lambda: voices.as_voices(lambda: registry.is_ready(CLONING_ENGINE)))
    sessions = VoiceSessionService(settings, db, jobs)
    studio = StudioService(sessions, voices, jobs, lambda: registry.voice_builder(CLONING_ENGINE))
    return Services(
        settings=settings,
        db=db,
        jobs=jobs,
        document_repo=documents,
        document_service=DocumentService(settings, documents, isolate=isolate_extraction),
        model_store=store,
        engines=registry,
        audio_cache=cache,
        synthesis=synthesis,
        voices=voices,
        voice_sessions=sessions,
        studio=studio,
        exports=ExportService(settings, jobs, documents, synthesis),
        preferences=PreferenceStore(db),
        pronunciations=pronunciations,
        bookmarks=BookmarkStore(db),
    )


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


ServicesDep = Annotated[Services, Depends(get_services)]
