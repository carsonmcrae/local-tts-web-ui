# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for verse: a line break inside a paragraph keeps its line when read, shown and exported.

Scope: The HTML block builder marks a block that a ``<br>`` ends (also a stray ``</br>``), drops the
mark when the paragraph ends right after the break, and keeps headings whole; the segmenter gives such
blocks the ``line`` boundary and one paragraph number; the ``line`` pause sits between a sentence's and
a paragraph's; an uploaded page with verse reads back with those boundaries and its read-along EPUB
breaks the line.
Does NOT belong: Sentence splitting rules (test_text_processing.py) or EPUB packaging (test_audiobook_formats.py).
"""

from __future__ import annotations

import io
import zipfile

from fastapi.testclient import TestClient

from conftest import wait_job
from ltts.audio import PAUSE_SECONDS
from ltts.documents.html_text import html_to_blocks
from ltts.documents.segmenter import segment_extraction
from ltts.documents.structures import ExtractedSection, Extraction

VERSE = (
    "<html><head><title>Poem</title></head><body><h1>Poem</h1>"
    "<p><span>Line one, no stop</span><br/><span>Line two.</span><br/></p>"
    "<p>Prose here. More prose.</p><h2>A<br/>title</h2><p>Odd</br>break</p></body></html>"
)


def test_line_breaks_mark_blocks_and_a_break_before_the_paragraph_ends_is_dropped() -> None:
    blocks = html_to_blocks(VERSE)
    assert [(b.kind, b.text, b.line_break) for b in blocks] == [
        ("heading", "Poem", False),
        ("paragraph", "Line one, no stop", True),
        ("paragraph", "Line two.", False),  # the <br/> before </p> broke no line
        ("paragraph", "Prose here. More prose.", False),
        ("heading", "A", True),
        ("heading", "title", False),
        ("paragraph", "Odd", True),  # </br> breaks a line like <br>
        ("paragraph", "break", False),
    ]


def test_lines_share_a_paragraph_and_get_the_line_boundary() -> None:
    segments, sections = segment_extraction(Extraction("Poem", [ExtractedSection("Poem", html_to_blocks(VERSE))]))
    assert [(s.paragraph_index, s.boundary, s.text) for s in segments] == [
        (0, "paragraph", "Poem"),
        (1, "line", "Line one, no stop"),
        (1, "paragraph", "Line two."),
        (2, "sentence", "Prose here."),
        (2, "paragraph", "More prose."),
        (3, "line", "A"),
        (3, "paragraph", "title"),
        (4, "line", "Odd"),
        (4, "section", "break"),
    ]
    assert sections[0].segment_count == len(segments)
    # A section that ends on a broken line still ends with a section pause.
    tail = segment_extraction(Extraction("P", [ExtractedSection("P", html_to_blocks("<p>a<br/>b"))]))[0]
    assert [s.boundary for s in tail] == ["line", "section"]
    assert PAUSE_SECONDS["sentence"] < PAUSE_SECONDS["line"] < PAUSE_SECONDS["paragraph"]


def test_an_uploaded_poem_keeps_its_lines_in_the_reader_and_the_read_along_book(client: TestClient) -> None:
    response = client.post("/api/documents/upload", params={"filename": "poem.html"}, content=VERSE.encode())
    assert response.status_code == 201, response.text
    doc_id = response.json()["id"]
    segments = client.get(f"/api/documents/{doc_id}/sections/0").json()["segments"]
    assert [(s["paragraphIndex"], s["boundary"]) for s in segments[:3]] == [
        (0, "paragraph"),
        (1, "line"),
        (1, "paragraph"),
    ]
    body = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "epub"}
    job = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    assert job["status"] == "succeeded", job
    book = zipfile.ZipFile(io.BytesIO(client.get(f"/api/exports/{job['id']}/download").content))
    chapter = book.read("OEBPS/text/c001.xhtml").decode("utf-8")
    assert '<span id="s1">Line one, no stop</span> <br/> <span id="s2">Line two.</span></p>' in chapter
    assert '<br/> <span id="s3">' not in chapter  # prose lines are joined by spaces
