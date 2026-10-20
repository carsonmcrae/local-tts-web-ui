# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Write the PDF the demo video uploads: an original three-chapter short story.

Scope: Wraps the story into lines and builds a real text-layer PDF with a chapter outline using the
test suite's PDF builder (apps/server/tests/builders.py). The story was written for this project, so
the video contains no third-party text. Usage: `python make_demo_pdf.py <out.pdf>` with the server's
environment (record-demo.mjs runs it through uv).
Does NOT belong: Recording (record-demo.mjs) or test fixtures (tests/fixtures).
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps" / "server" / "tests"))
from builders import make_pdf  # noqa: E402

TITLE = "The Lighthouse Keeper"
CHAPTERS = [
    (
        "The Last Light",
        "Every evening at dusk, Maren climbed the ninety-two steps of the old lighthouse. The stairs curled "
        "upward like the inside of a seashell, and her lantern threw long shadows on the stone. At the top, "
        "she wound the great clockwork and watched the lamp begin to turn. Far out at sea, the fishing boats "
        "answered with small, steady lights of their own. It was, she thought, a kind of conversation that "
        "needed no words at all.",
    ),
    (
        "The Visitor",
        "One stormy night, someone knocked at the lighthouse door. A young man stood on the step, soaked "
        "through, holding a box wrapped in oilcloth. His boat had lost its rudder near the rocks, he said, and "
        "he had followed the light to shore. Maren gave him dry clothes, a bowl of soup and a chair by the "
        "stove. When he finally opened the box, it held a battered radio, and nothing else.",
    ),
    (
        "Morning",
        "By sunrise the storm had moved on, leaving the harbour bright and still. Together they repaired the "
        "radio, and a crackling voice drifted out of it, reading the morning news. The young man laughed and "
        "said it was strange to hear a voice from so far away. Maren smiled, because she knew the feeling "
        "well. Then she walked him down to the harbour, where the boats were already heading home.",
    ),
]


def main() -> None:
    pages = [[heading, "", *textwrap.wrap(body, 82)] for heading, body in CHAPTERS]
    outline = [(heading, index) for index, (heading, _) in enumerate(CHAPTERS)]
    Path(sys.argv[1]).write_bytes(make_pdf(pages, outline=outline, title=TITLE))


if __name__ == "__main__":
    main()
