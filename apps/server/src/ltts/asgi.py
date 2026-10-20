# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Import target for uvicorn (``ltts.asgi:app``), including auto-reload workers.

Scope: Builds settings from the environment (the CLI exports its overrides there so reload
subprocesses see the same configuration) and creates the app, serving static files if requested.
Does NOT belong: Any configuration logic of its own.
"""

from __future__ import annotations

import os
from pathlib import Path

from ltts.app import create_app
from ltts.config import Settings
from ltts.logging_setup import configure_logging

_settings = Settings()
configure_logging(_settings.env)
_static = os.environ.get("LTTS_STATIC_DIR")
app = create_app(_settings, static_dir=Path(_static) if _static else None)
