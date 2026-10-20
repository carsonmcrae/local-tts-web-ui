# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Run untrusted-document parsers in a separate, killable process.

Scope: Spawns a fresh interpreter per extraction (no shared state with the server), applies an
address-space limit on Linux (``RLIMIT_AS``), enforces a wall-clock timeout and converts crashes,
hangs and memory exhaustion into clean ``DocumentExtractionError``s. A parser bug can therefore
never take down or wedge the API server.
Does NOT belong: Format dispatch (``extractors.py``) or ingestion orchestration (``service.py``).
"""

from __future__ import annotations

import importlib
import logging
import multiprocessing as mp
import platform
from multiprocessing.connection import Connection
from pathlib import Path

from ltts.documents.extractors import extract
from ltts.documents.structures import DocumentType, Extraction, ExtractionLimits
from ltts.errors import AppError, DocumentExtractionError

log = logging.getLogger("ltts.documents")

_CONTEXT = mp.get_context("spawn")


def _limit_memory(memory_mb: int) -> None:
    # Only Linux gets an address-space cap. Windows has no RLIMIT_AS, and macOS reserves far more
    # virtual address space at start-up than any sensible cap, so a cap there fails every parse.
    # The timeout and archive/text limits apply everywhere.
    if platform.system() != "Linux":
        return
    resource = importlib.import_module("resource")
    limit = memory_mb * 1024 * 1024
    _, hard = resource.getrlimit(resource.RLIMIT_AS)
    if hard != resource.RLIM_INFINITY:
        limit = min(limit, hard)  # an unprivileged process may lower its hard limit, never raise it
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))


def _child(
    conn: Connection, path: str, doc_type: str, title: str | None, limits: ExtractionLimits, memory_mb: int
) -> None:
    try:
        _limit_memory(memory_mb)
        conn.send(("ok", extract(Path(path), DocumentType(doc_type), title, limits)))
    except AppError as exc:
        conn.send(("app_error", (exc.code, exc.message)))
    except MemoryError:
        conn.send(("app_error", ("resource_limit", "The document needed too much memory to process.")))
    # Any other parser failure must become a clean error.
    except Exception as exc:  # noqa: BLE001
        conn.send(("crash", type(exc).__name__))
    finally:
        conn.close()


def extract_isolated(
    path: Path,
    doc_type: DocumentType,
    title: str | None,
    limits: ExtractionLimits,
    *,
    timeout_s: float,
    memory_mb: int,
) -> Extraction:
    parent, child = _CONTEXT.Pipe(duplex=False)
    process = _CONTEXT.Process(
        target=_child, args=(child, str(path), doc_type.value, title, limits, memory_mb), daemon=True
    )
    process.start()
    child.close()
    try:
        if not parent.poll(timeout_s):
            raise DocumentExtractionError(
                f"Reading this document took longer than {int(timeout_s)} seconds and was stopped.",
                code="extraction_timeout",
            )
        try:
            status, payload = parent.recv()
        except EOFError as exc:
            raise DocumentExtractionError(
                "The document parser stopped unexpectedly (the file may be malformed or too complex).",
                code="extraction_crashed",
            ) from exc
    finally:
        parent.close()
        if process.is_alive():
            process.kill()
        process.join(timeout=5)

    if status == "ok":
        return payload  # type: ignore[no-any-return]
    if status == "app_error":
        code, message = payload
        raise DocumentExtractionError(message, code=code)
    log.warning("Document parser failed in its sandbox process with %s", payload)
    raise DocumentExtractionError("The document could not be read; it may be damaged.", code="corrupt_document")
