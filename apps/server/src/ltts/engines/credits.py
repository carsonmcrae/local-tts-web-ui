# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What every voice says about where it comes from: a one-line credit for its card and the full wording.

Scope: One short credit and one full attribution per source of voices: Kokoro's built-in voices, Chatterbox
Turbo's built-in voice, voices cloned from a consented recording, and blends of Kokoro voices. Each says the
voice is synthetic speech and names the model and its licence; the full Kokoro wording names everything the
model's licence notice in the Windows installer credits (``apps/desktop/licenses/kokoro/README.txt``).
Does NOT belong: The licence files themselves (``apps/desktop/licenses``), engines, or how the web app shows these.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Credit:
    short: str  # one line on a voice card
    full: str  # shown once per source, in the voice library's credits


KOKORO = Credit(
    short="Synthetic voice · Kokoro-82M, Apache-2.0",
    full=(
        "Synthetic voice from the Kokoro-82M model by hexgrad (Apache-2.0), which builds on StyleTTS 2 by yl4579, run "
        "with kokoro-onnx (MIT). Not a recording of a person: its authors say it was trained on permissively licensed "
        "and public-domain audio, including Koniwa by tnc (CC BY 3.0) and SIWIS (CC BY 4.0), and on synthetic speech "
        "from other text-to-speech systems; no speaker is named for any voice. TTSNative is not affiliated with the "
        "model's authors."
    ),
)
CHATTERBOX = Credit(
    short="Synthetic voice · Chatterbox Turbo, MIT",
    full=(
        "Synthetic voice built into Chatterbox Turbo by Resemble AI (MIT); its origin is not documented. Not a "
        "recording of a person. Every clip carries Resemble AI's Perth watermark, which is designed to be inaudible."
    ),
)
CLONED = Credit(
    short="Consented synthetic clone · Chatterbox Turbo, MIT",
    full=(
        "Synthetic speech from Chatterbox Turbo by Resemble AI (MIT), conditioned on a recording made with the "
        "speaker's consent; it is not that recording. Every clip carries Resemble AI's Perth watermark, which is "
        "designed to be inaudible."
    ),
)
BLEND = Credit(
    short="Synthetic blend · Kokoro-82M, Apache-2.0",
    full=f"A weighted mix of built-in Kokoro voices. {KOKORO.full}",
)
