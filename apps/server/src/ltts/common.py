"""Purpose: Small shared primitives used across feature packages.

Scope: The camelCase API base model, identifier generation, UTC timestamps, disk-space checks and
streaming a request body to disk under a hard byte limit.
Does NOT belong: Feature logic. Keep this module tiny; promote helpers only when two features need them.
"""

from __future__ import annotations

import hashlib
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

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


async def save_request_body(request: Request, destination: Path, max_bytes: int) -> tuple[int, str]:
    """Stream the raw request body to ``destination``; abort as soon as it exceeds ``max_bytes``."""
    digest = hashlib.sha256()
    received = 0
    try:
        with destination.open("xb") as handle:
            async for chunk in request.stream():
                received += len(chunk)
                if received > max_bytes:
                    raise PayloadTooLargeError(
                        f"The file is larger than the {max_bytes // MB} MB limit.",
                        details={"limitBytes": max_bytes},
                    )
                digest.update(chunk)
                handle.write(chunk)
    except BaseException:
        destination.unlink(missing_ok=True)  # noqa: ASYNC240 - single local unlink on the failure path
        raise
    return received, digest.hexdigest()
