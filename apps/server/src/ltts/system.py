# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Health, diagnostics, storage usage and cache management endpoints.

Scope: Reports app/runtime versions, OS, CPU/RAM, GPU detection (NVIDIA via nvidia-smi, Apple
Silicon via platform), ONNX Runtime providers, per-category disk usage, network exposure and the
privacy posture. Offers cache clearing. Never reports document contents or filenames.
Does NOT belong: Engine install logic (``engines``).
"""

from __future__ import annotations

import platform
import shutil
from pathlib import Path

import psutil
from fastapi import APIRouter

from ltts import __version__
from ltts.common import ApiModel
from ltts.container import ServicesDep
from ltts.hardware import GpuInfo, detect_gpus
from ltts.onnx import onnxruntime

router = APIRouter(prefix="/api", tags=["system"])


class Health(ApiModel):
    status: str
    version: str


class StorageInfo(ApiModel):
    data_dir: str
    free_bytes: int
    total_bytes: int
    models_bytes: int
    audio_cache_bytes: int
    audio_cache_limit_bytes: int
    voices_bytes: int
    exports_bytes: int
    database_bytes: int


class SystemInfo(ApiModel):
    version: str
    python: str
    platform: str
    machine: str
    cpu_cores: int
    memory_total_bytes: int
    memory_available_bytes: int
    gpus: list[GpuInfo]
    onnx_providers: list[str]
    network_exposed: bool
    storage: StorageInfo
    telemetry: bool = False
    limits: dict[str, int | float]


class CacheCleared(ApiModel):
    removed_entries: int


def _folder_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


@router.get("/health")
def health() -> Health:
    return Health(status="ok", version=__version__)


@router.get("/system")
def system_info(services: ServicesDep) -> SystemInfo:
    settings = services.settings
    data = settings.resolved_data_dir
    disk = shutil.disk_usage(data)
    memory = psutil.virtual_memory()
    cache = services.audio_cache.stats()
    db_files = [settings.database_path, Path(f"{settings.database_path}-wal")]
    return SystemInfo(
        version=__version__,
        python=platform.python_version(),
        platform=f"{platform.system()} {platform.release()}",
        machine=platform.machine(),
        cpu_cores=psutil.cpu_count(logical=True) or 1,
        memory_total_bytes=memory.total,
        memory_available_bytes=memory.available,
        gpus=list(detect_gpus()),
        onnx_providers=list(onnxruntime().get_available_providers()),
        network_exposed=not settings.is_loopback_only,
        storage=StorageInfo(
            data_dir=str(data),
            free_bytes=disk.free,
            total_bytes=disk.total,
            models_bytes=_folder_bytes(settings.resolved_models_dir),
            audio_cache_bytes=cache["bytes"],
            audio_cache_limit_bytes=cache["limitBytes"],
            voices_bytes=_folder_bytes(data / "voices"),
            exports_bytes=_folder_bytes(data / "exports"),
            database_bytes=sum(p.stat().st_size for p in db_files if p.exists()),
        ),
        limits={
            "maxUploadMb": settings.max_upload_mb,
            "maxTextChars": settings.max_text_chars,
            "maxPdfPages": settings.max_pdf_pages,
            "maxDocuments": settings.max_documents,
            "extractionTimeoutS": settings.extraction_timeout_s,
        },
    )


@router.post("/system/cache/clear")
def clear_cache(services: ServicesDep) -> CacheCleared:
    return CacheCleared(removed_entries=services.audio_cache.clear())
