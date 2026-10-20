# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Typed application errors and their translation into safe JSON responses.

Scope: The ``AppError`` hierarchy (stable machine-readable ``code`` + human message + HTTP status)
and FastAPI exception handlers that never leak stack traces or internal paths to clients.
Does NOT belong: Logging configuration (``logging_setup``) or domain logic.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("ltts.errors")


class AppError(Exception):
    """Base class: every expected failure carries a stable code and a user-facing message."""

    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details or {}


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "payload_too_large"


class UnsupportedDocumentError(AppError):
    status_code = 415
    code = "unsupported_document"


class DocumentExtractionError(AppError):
    status_code = 422
    code = "extraction_failed"


class BusyError(AppError):
    status_code = 429
    code = "busy"


class InsufficientStorageError(AppError):
    status_code = 507
    code = "insufficient_disk_space"


class EngineUnavailableError(AppError):
    status_code = 503
    code = "engine_unavailable"


class SynthesisError(AppError):
    status_code = 500
    code = "synthesis_failed"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


def _body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def install_error_handlers(app: FastAPI) -> None:
    """Register handlers so every error response has the same safe shape."""

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in err.get("loc", ())) for err in exc.errors()]
        return JSONResponse(
            _body("invalid_request", "Some request fields were missing or invalid.", {"fields": fields}),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(_body("http_error", message), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", extra={"path": request.url.path, "error_type": type(exc).__name__})
        return JSONResponse(
            _body("internal_error", "Something went wrong on the local server. Check the terminal log."),
            status_code=500,
        )
