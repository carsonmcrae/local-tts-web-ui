# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Centralised, validated runtime configuration for the server.

Scope: Every tunable limit, path and network setting, read from ``LTTS_*`` environment variables
(or a repository ``.env`` file) with conservative defaults. Derived paths are created on demand.
Does NOT belong: Per-user preferences (stored in the database) or model artifact pins
(``modelstore/manifest.json``).
"""

from __future__ import annotations

from functools import cached_property
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MB = 1024 * 1024
REPO_ROOT = Path(__file__).resolve().parents[4]
LOOPBACK_HOSTS = ("127.0.0.1", "::1", "localhost")


class Settings(BaseSettings):
    """Server settings. Field names map to ``LTTS_<NAME>`` environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="LTTS_", env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    env: Literal["development", "production", "test"] = "production"
    data_dir: Path = REPO_ROOT / "data"
    models_dir: Path | None = Field(default=None, description="Defaults to <data_dir>/models")
    engines_dir: Path | None = Field(default=None, description="Defaults to <data_dir>/engines")
    # Read-only models shipped with the desktop app, used until the user's own copy exists.
    bundled_models_dir: Path | None = None

    # Network exposure. Loopback only unless the user explicitly opts in (see docs/guides/lan-access.md).
    host: str = "127.0.0.1"
    allow_network: bool = False
    access_token: str | None = Field(default=None, min_length=24)
    extra_allowed_hosts: list[str] = Field(default_factory=list)

    # Upload and extraction limits (server-side; the browser's checks are only a convenience).
    max_upload_mb: int = Field(default=25, ge=1, le=500)
    max_text_chars: int = Field(default=2_000_000, ge=1_000)
    max_pdf_pages: int = Field(default=2_000, ge=1)
    max_archive_entries: int = Field(default=5_000, ge=10)
    max_archive_uncompressed_mb: int = Field(default=300, ge=1)
    max_compression_ratio: int = Field(default=200, ge=10)
    extraction_timeout_s: float = Field(default=90.0, gt=0)
    extraction_memory_mb: int = Field(default=1_536, ge=128)
    max_concurrent_extractions: int = Field(default=2, ge=1, le=8)
    max_documents: int = Field(default=500, ge=1)

    # Audio and storage.
    audio_cache_max_mb: int = Field(default=2_048, ge=64)
    min_free_disk_mb: int = Field(default=500, ge=0)
    max_voice_reference_s: float = Field(default=60.0, gt=5)
    max_voice_profiles: int = Field(default=50, ge=1)
    # Studio voices: usable speech needed before a build, per-session limits, and one imported file's length.
    min_studio_speech_s: float = Field(default=300.0, ge=10)
    max_session_takes: int = Field(default=200, ge=1)
    max_voice_import_s: float = Field(default=1_800.0, gt=10)

    # Synthesis.
    warm_up_engines: bool = True
    clone_worker_idle_unload_s: float = Field(default=600.0, ge=30)

    @field_validator("host")
    @classmethod
    def _strip_host(cls, value: str) -> str:
        return value.strip()

    @cached_property
    def resolved_models_dir(self) -> Path:
        return (self.models_dir or self.data_dir / "models").resolve()

    @cached_property
    def resolved_engines_dir(self) -> Path:
        return (self.engines_dir or self.data_dir / "engines").resolve()

    @cached_property
    def resolved_data_dir(self) -> Path:
        return self.data_dir.resolve()

    def path(self, *parts: str) -> Path:
        """Return a directory inside the data dir, creating it if needed."""
        target = self.resolved_data_dir.joinpath(*parts)
        target.mkdir(parents=True, exist_ok=True)
        return target

    @property
    def database_path(self) -> Path:
        return self.path() / "ltts.sqlite3"

    @property
    def is_loopback_only(self) -> bool:
        return self.host in LOOPBACK_HOSTS and not self.allow_network

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * MB
