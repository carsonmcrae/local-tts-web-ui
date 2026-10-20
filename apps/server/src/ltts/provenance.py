# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Where this software comes from: its name, author, licence, homepage and fingerprint.

Scope: One place for the project's identity, used by the API description, ``/api/system``, the
startup log and the metadata written into exported audio. The fingerprint is a unique string that
identifies copies of this project (see ATTRIBUTION.md).
Does NOT belong: Version numbers (``ltts.__version__``) or settings.
"""

from __future__ import annotations

from ltts.common import ApiModel

PROJECT = "Local TTS Web UI"
AUTHOR = "Carson McRae"
LICENSE = "MIT"
HOMEPAGE = "https://github.com/carsonmcrae/local-tts-web-ui"
COPYRIGHT = f"Copyright (c) 2026 {AUTHOR}"
FINGERPRINT = "ltts-origin-c44dbf7e-6172-4e3a-a46a-636998263e03"
CREDIT = f"{PROJECT} by {AUTHOR} ({HOMEPAGE})"


class About(ApiModel):
    project: str = PROJECT
    author: str = AUTHOR
    license: str = LICENSE
    homepage: str = HOMEPAGE
    copyright: str = COPYRIGHT
    fingerprint: str = FINGERPRINT
