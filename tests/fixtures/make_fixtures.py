"""Purpose: Regenerate the small document fixtures used by the Playwright end-to-end tests.

Scope: Writes sample TXT/Markdown/PDF (with outline)/DOCX/EPUB files plus deliberately invalid ones
(scanned PDF, text disguised as PDF) into tests/fixtures/documents. Reuses the server test builders so
fixture structure is documented in one place. Run with:
``node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../tests/fixtures/make_fixtures.py``
Does NOT belong: Test assertions.
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "apps" / "server" / "tests"))

from builders import make_docx, make_epub, make_pdf  # noqa: E402

OUT = HERE / "documents"
OUT.mkdir(exist_ok=True)

(OUT / "sample.txt").write_text(
    "Chapter 1\n\nThe lighthouse keeper climbed the stairs. He counted every step.\n\n"
    "Chapter 2\n\nThe storm arrived at midnight. Nobody slept.\n",
    encoding="utf-8",
)
(OUT / "sample.md").write_text(
    "# Field Notes\n\nThe tide came in **slowly** this morning.\n\n## Observations\n\nThree gulls, one heron.\n",
    encoding="utf-8",
)
(OUT / "sample.pdf").write_bytes(
    make_pdf(
        [
            ["Harbour Stories"],
            ["The Return", "The boats returned just after seven in the evening.", "Gulls circled overhead."],
            ["The Storm", "By midnight the wind had turned and the rain began."],
        ],
        outline=[("The Return", 1), ("The Storm", 2)],
        title="Harbour Stories",
    )
)
make_docx(
    OUT / "sample.docx",
    [("Heading 1", "Quarterly Letter"), ("Normal", "Thank you for reading this letter aloud."),
     ("Heading 2", "Next Steps"), ("Normal", "We will meet again in spring.")],
    title="Quarterly Letter",
)  # fmt: skip
(OUT / "sample.epub").write_bytes(
    make_epub(
        [("Opening", "<p>The train left the station at dawn.</p>"), ("Arrival", "<p>The city was still asleep.</p>")],
        title="The Night Train",
    )
)
(OUT / "scanned.pdf").write_bytes(make_pdf([[], []], image_only=True))
(OUT / "disguised.pdf").write_text("This is plain text pretending to be a PDF.", encoding="utf-8")
print(f"wrote fixtures to {OUT}")
