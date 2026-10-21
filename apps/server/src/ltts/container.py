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
from ltts.documents.casting import CastingStore
from ltts.documents.delivery import Sentence
from ltts.documents.details import DocumentDetailsStore
from ltts.documents.repository import DocumentRepository
from ltts.documents.service import DocumentService
from ltts.documents.speech_marks import MarkHooks, voice_finder
from ltts.documents.styling import StylingStore
from ltts.engines.registry import EngineRegistry
from ltts.exports.audiobookshelf import Audiobookshelf
from ltts.exports.service import ExportService
from ltts.jobs import JobManager
from ltts.modelstore.store import ModelStore
from ltts.pronunciation.store import PronunciationStore
from ltts.secrets import SecretStore
from ltts.speech_api.service import SpeechApi
from ltts.speech_api.store import SpeechApiStore
from ltts.synthesis.cache import AudioCache
from ltts.synthesis.service import SynthesisService
from ltts.voices.profiles import CLONING_ENGINE, VoiceProfileService
from ltts.voices.sessions import VoiceSessionService
from ltts.voices.sharing import VoiceSharing
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
    voice_sharing: VoiceSharing
    exports: ExportService
    preferences: PreferenceStore
    pronunciations: PronunciationStore
    bookmarks: BookmarkStore
    styling: StylingStore
    casting: CastingStore
    details: DocumentDetailsStore
    audiobookshelf: Audiobookshelf
    speech_api: SpeechApi


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
    store = ModelStore(settings.resolved_models_dir, reserve_mb=settings.min_free_disk_mb)
    factory = engine_factory or (lambda s, m: [KokoroEngine(m), ChatterboxEngine(s, m)])
    registry = EngineRegistry(factory(settings, store), jobs)
    cache = AudioCache(settings.path("cache", "audio"), db, settings.audio_cache_max_mb * MB)
    pronunciations = PronunciationStore(db)
    styling = StylingStore(db, lambda doc: [Sentence(s.index, s.paragraph_index, s.kind, s.text)
                                             for s in documents.segments_detail(doc)])  # fmt: skip
    casting = CastingStore(db, styling.lines, lambda doc: {s.index: s.text for s in documents.segments_detail(doc)})
    details = DocumentDetailsStore(settings, db)
    synthesis = SynthesisService(registry, cache, documents, pronunciations.apply, styling, casting)
    speech_store = SpeechApiStore(db, lambda: {profile.voice_id for profile in voices.list_all()})

    def purge_voice(voice_id: str) -> int:
        purged = cache.purge_voice(voice_id)
        speech_store.prune_voices()  # a deleted custom voice loses its speech API permission
        return purged

    voices = VoiceProfileService(settings, db, purge_voice)
    registry.attach_custom_voices(voices.resolve, lambda: voices.as_voices(lambda: registry.is_ready(CLONING_ENGINE)))
    sessions = VoiceSessionService(settings, db, jobs)
    studio = StudioService(sessions, voices, jobs, lambda: registry.voice_builder(CLONING_ENGINE))
    marks = MarkHooks(voice_finder(lambda: [(v.id, v.name) for v in registry.voices()]), styling.annotate)
    return Services(
        settings=settings,
        db=db,
        jobs=jobs,
        document_repo=documents,
        document_service=DocumentService(settings, documents, isolate=isolate_extraction, marks=marks),
        model_store=store,
        engines=registry,
        audio_cache=cache,
        synthesis=synthesis,
        voices=voices,
        voice_sessions=sessions,
        studio=studio,
        voice_sharing=VoiceSharing(settings, voices),
        exports=ExportService(settings, jobs, documents, synthesis, details),
        preferences=PreferenceStore(db),
        pronunciations=pronunciations,
        bookmarks=BookmarkStore(db),
        styling=styling,
        casting=casting,
        details=details,
        audiobookshelf=Audiobookshelf(db, SecretStore(settings.path("secrets"))),
        speech_api=SpeechApi(settings, speech_store, synthesis, registry),
    )


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


ServicesDep = Annotated[Services, Depends(get_services)]
