# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Package marker and single source of the application version.

Scope: Exposes ``__version__`` (kept in sync with pyproject.toml and the web app by
``scripts/check-version.mjs``).
Does NOT belong: Any runtime behaviour.
"""

__version__ = "2.0.0"
