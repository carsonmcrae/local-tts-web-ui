"""Purpose: Run untrusted-document parsers in a separate, killable process.

Scope: Spawns a fresh interpreter per extraction (no shared state with the server), applies an
address-space limit where the OS supports it (POSIX ``RLIMIT_AS``), enforces a wall-clock timeout
and converts crashes, hangs and memory exhaustion into clean ``DocumentExtractionError``s. A parser
bug can therefore never take down or wedge the API server.
Does NOT belong: Format dispatch (``extractors.py``) or ingestion orchestration (``service.py``).
"""

from __future__ import annotations

import importlib
import multiprocessing as mp
from multiprocessing.connection import Connection
from pathlib import Path

from ltts.documents.extractors import extract
from ltts.documents.structures import DocumentType, Extraction, ExtractionLimits
from ltts.errors import AppError, DocumentExtractionError

_CONTEXT = mp.get_context("spawn")


def _limit_memory(memory_mb: int) -> None:
    try:
        resource = importlib.import_module("resource")
    except ImportError:
        return  # Windows has no RLIMIT_AS; the timeout and archive/text limits still apply.
    limit = memory_mb * 1024 * 1024
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
    except Exception as exc:  # noqa: BLE001 - any parser failure must become a clean error
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
    raise DocumentExtractionError("The document could not be read; it may be damaged.", code="corrupt_document")
