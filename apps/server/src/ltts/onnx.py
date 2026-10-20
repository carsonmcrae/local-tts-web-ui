# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Load ONNX Runtime with its usage telemetry switched off.

Scope: Official ONNX Runtime builds send usage telemetry to Microsoft by default (Windows TraceLogging,
or the 1DS SDK over HTTPS on other platforms; see the project's docs/Privacy.md). This sets
``ORT_DISABLE_TELEMETRY`` before the first import and calls ``disable_telemetry_events()``, so the app
keeps its promise that nothing is sent anywhere. Every module that needs ONNX Runtime gets it from here.
Does NOT belong: Loading models (``engines/kokoro.py``) or hardware detection.
"""

from __future__ import annotations

import importlib
import os
from types import ModuleType


def onnxruntime() -> ModuleType:
    """The onnxruntime module, imported (once) with telemetry disabled."""
    os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")
    ort = importlib.import_module("onnxruntime")
    ort.disable_telemetry_events()
    return ort
