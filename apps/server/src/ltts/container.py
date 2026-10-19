"""Purpose: Build and hold the application's service graph (manual dependency injection).

Scope: Constructs every service once per app from ``Settings`` and exposes them to routes through
the ``ServicesDep`` FastAPI dependency. Tests build their own container with custom settings.
Does NOT belong: Business logic or HTTP routes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Request

if TYPE_CHECKING:
    from ltts.config import Settings
    from ltts.db import Database
    from ltts.documents.repository import DocumentRepository
    from ltts.documents.service import DocumentService
    from ltts.engines.registry import EngineRegistry
    from ltts.exports.service import ExportService
    from ltts.jobs import JobManager
    from ltts.modelstore.store import ModelStore
    from ltts.preferences import PreferenceStore
    from ltts.synthesis.cache import AudioCache
    from ltts.synthesis.service import SynthesisService
    from ltts.voices.profiles import VoiceProfileService


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
    exports: ExportService
    preferences: PreferenceStore


def build_services(settings: Settings, *, isolate_extraction: bool = True) -> Services:
    from ltts.common import MB
    from ltts.db import Database
    from ltts.documents.repository import DocumentRepository
    from ltts.documents.service import DocumentService
    from ltts.engines.chatterbox import ChatterboxEngine
    from ltts.engines.kokoro import KokoroEngine
    from ltts.engines.registry import EngineRegistry
    from ltts.exports.service import ExportService
    from ltts.jobs import JobManager
    from ltts.modelstore.store import ModelStore
    from ltts.preferences import PreferenceStore
    from ltts.synthesis.cache import AudioCache
    from ltts.synthesis.service import SynthesisService
    from ltts.voices.profiles import VoiceProfileService

    db = Database(settings.database_path)
    db.migrate()
    jobs = JobManager(db)
    documents = DocumentRepository(db)
    store = ModelStore(settings.resolved_models_dir, reserve_mb=settings.min_free_disk_mb)
    chatterbox = ChatterboxEngine(settings, store)
    registry = EngineRegistry([KokoroEngine(store), chatterbox], jobs)
    cache = AudioCache(settings.path("cache", "audio"), db, settings.audio_cache_max_mb * MB)
    synthesis = SynthesisService(registry, cache, documents)
    voices = VoiceProfileService(settings, db, cache.purge_voice)
    registry.attach_custom_voices(voices.resolve, lambda: voices.as_voices(chatterbox.is_ready))
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
        exports=ExportService(settings, jobs, documents, synthesis),
        preferences=PreferenceStore(db),
    )


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


ServicesDep = Annotated[Services, Depends(get_services)]
