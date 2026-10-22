# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: FastAPI application factory.

Scope: Builds services, registers routers, error handlers and the security middleware, runs
startup housekeeping (migrations, interrupted-job recovery, temp-file cleanup, engine warm-up) and
optionally serves the built web UI as static files with an SPA fallback.
Does NOT belong: Route logic (feature routers) or process launching (``cli.py``).
"""

from __future__ import annotations

import logging
import shutil
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from ltts import __version__
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.errors import NotFoundError, install_error_handlers
from ltts.security import SecurityMiddleware

log = logging.getLogger("ltts.app")
# Shown in the OpenAPI description (the interactive docs in development).
AUTHOR = "Carson McRae"
HOMEPAGE = "https://github.com/carsonmcrae/ttsnative"


def _housekeeping(services: Services) -> None:
    interrupted = services.jobs.recover()
    tmp = services.settings.resolved_data_dir / "tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True, exist_ok=True)
    services.audio_cache.evict()
    orphans = services.exports.clean_orphans()
    log.info("startup housekeeping done", extra={"interrupted_jobs": interrupted, "removed_exports": orphans})


def _warm_up(services: Services) -> None:
    for engine in services.engines.all():
        try:
            engine.warm_up()
        # Warm-up is best effort; any error surfaces again on first use.
        except Exception:  # noqa: BLE001
            log.warning("engine warm-up failed", extra={"engine": engine.id})


def _mount_static(app: FastAPI, static_dir: Path) -> None:
    index = static_dir / "index.html"
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> Response:
        if path.startswith("api/"):
            raise NotFoundError("Unknown API endpoint.")
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


def create_app(
    settings: Settings | None = None,
    *,
    static_dir: Path | None = None,
    services: Services | None = None,
) -> FastAPI:
    settings = settings or Settings()
    services = services or build_services(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        log.info("starting", extra={"version": __version__})
        _housekeeping(services)
        if settings.warm_up_engines:
            threading.Thread(target=_warm_up, args=(services,), name="warm-up", daemon=True).start()
        yield
        await services.lan.disable()  # stop listening on the network before anything else goes
        for engine in services.engines.all():
            engine.close()

    app = FastAPI(
        title="TTSNative API",
        description=f"The local API of TTSNative by {AUTHOR} ({HOMEPAGE}).",
        version=__version__,
        contact={"name": AUTHOR, "url": HOMEPAGE},
        license_info={"name": "MIT", "identifier": "MIT"},
        lifespan=lifespan,
        docs_url="/api/docs" if settings.env == "development" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.env != "production" else None,
    )
    app.state.services = services
    install_error_handlers(app)

    from ltts.documents.details_router import router as details_router
    from ltts.documents.router import router as documents_router
    from ltts.documents.shelf_router import router as shelf_router
    from ltts.documents.styling_router import router as styling_router
    from ltts.engines.router import router as engines_router
    from ltts.exports.router import router as exports_router
    from ltts.integrations_router import router as integrations_router
    from ltts.lan.router import router as lan_router
    from ltts.library.router import presets_router
    from ltts.library.router import router as catalog_router
    from ltts.preferences import router as preferences_router
    from ltts.pronunciation.router import router as pronunciation_router
    from ltts.sfx.router import router as sfx_router
    from ltts.speech_api.router import router as speech_api_router
    from ltts.speech_api.settings_router import router as speech_api_settings_router
    from ltts.synthesis.router import router as audio_router
    from ltts.system import router as system_router
    from ltts.voices.router import router as voices_router
    from ltts.voices.sessions_router import router as voice_sessions_router

    for router in (system_router, documents_router, audio_router, engines_router, voices_router,
                   voice_sessions_router, exports_router, preferences_router, pronunciation_router,
                   styling_router, details_router, shelf_router, catalog_router, presets_router, integrations_router,
                   speech_api_settings_router, speech_api_router, lan_router, sfx_router):  # fmt: skip
        app.include_router(router)
    if static_dir is not None:
        _mount_static(app, static_dir)
    app.add_middleware(SecurityMiddleware, settings=settings, lan=services.lan)
    services.lan.attach(app)  # LAN mode serves this same app, with the same checks
    return app
