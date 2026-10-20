# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Best-effort, read-only hardware detection used for diagnostics and install advice.

Scope: NVIDIA GPUs via ``nvidia-smi`` (fixed arguments, short timeout) and Apple Silicon via the
platform module. Results are cached for the process lifetime.
Does NOT belong: Choosing devices at inference time (engines/workers decide that themselves).
"""

from __future__ import annotations

import functools
import platform
import shutil
import subprocess
import sys

from ltts.common import ApiModel


class GpuInfo(ApiModel):
    vendor: str
    name: str
    memory_mb: int | None


@functools.cache
def detect_gpus() -> tuple[GpuInfo, ...]:
    gpus: list[GpuInfo] = []
    smi = shutil.which("nvidia-smi")
    if smi:
        try:
            # Fixed arguments to the binary resolved above, and no shell.
            out = subprocess.run(  # noqa: S603
                [smi, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=5,
                check=True,
            ).stdout
            for line in out.strip().splitlines():
                name, _, memory = line.partition(",")
                gpus.append(
                    GpuInfo(
                        vendor="NVIDIA",
                        name=name.strip(),
                        memory_mb=int(memory) if memory.strip().isdigit() else None,
                    )
                )
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    if sys.platform == "darwin" and platform.machine() == "arm64":
        gpus.append(GpuInfo(vendor="Apple", name="Apple Silicon GPU (Metal)", memory_mb=None))
    return tuple(gpus)
