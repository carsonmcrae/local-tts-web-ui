"""Purpose: Small shared primitives used across feature packages.

Scope: The camelCase API base model, identifier generation, UTC timestamps, disk-space checks and
streaming a request body to disk under a hard byte limit.
Does NOT belong: Feature logic. Keep this module tiny; promote helpers only when two features need them.
"""

from __future__ import annotations

import asyncio
import hashlib
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

from fastapi import Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from ltts.errors import InsufficientStorageError, PayloadTooLargeError

MB = 1024 * 1024


class ApiModel(BaseModel):
    """Base for request/response bodies: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


def new_id() -> str:
    return uuid.uuid4().hex


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def ensure_free_space(directory: Path, needed_bytes: int, reserve_mb: int) -> None:
    free = shutil.disk_usage(directory).free
    if free - needed_bytes < reserve_mb * MB:
        raise InsufficientStorageError(
            f"Not enough free disk space: {free // MB:,} MB free, about {needed_bytes // MB + reserve_mb:,} MB needed.",
            details={"freeBytes": free, "neededBytes": needed_bytes},
        )


def _discard(handle: BinaryIO, destination: Path) -> None:
    """Close and delete a partly written file."""
    try:
        handle.close()
    finally:
        destination.unlink(missing_ok=True)


async def save_request_body(request: Request, destination: Path, max_bytes: int) -> tuple[int, str]:
    """Stream the raw request body to ``destination``; abort as soon as it exceeds ``max_bytes``.

    File operations run in worker threads, so a slow disk never stalls the event loop.
    """
    digest = hashlib.sha256()
    received = 0
    handle: BinaryIO = await asyncio.to_thread(destination.open, "xb")
    try:
        async for chunk in request.stream():
            received += len(chunk)
            if received > max_bytes:
                raise PayloadTooLargeError(
                    f"The file is larger than the {max_bytes // MB} MB limit.",
                    details={"limitBytes": max_bytes},
                )
            digest.update(chunk)
            await asyncio.to_thread(handle.write, chunk)
        await asyncio.to_thread(handle.close)
    except BaseException:
        # Any failure, including a request cancelled mid-upload, leaves no partial file behind.
        await asyncio.to_thread(_discard, handle, destination)
        raise
    return received, digest.hexdigest()
