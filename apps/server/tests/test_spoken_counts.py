# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for a document's spoken word count, listening estimate and progress (``documents/spoken.py``).

Scope: Through the API: the spoken counts and the estimate leave out skipped sentences and the footnote
and citation markers left unread, while the counts of all the extracted text stay as stored; they
follow every skip and read-again by hand, every undo and apply of the cleanup, in the library list as in
the document; reaching the last sentence that is read finishes a document whose last lines are skipped.
Does NOT belong: Finding what to skip (test_document_cleanup.py) or whole documents (test_document_corpus.py).
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from builders import make_pdf
from ltts.documents.cleanup import SUPERSCRIPT_DIGITS
from ltts.documents.normalize import word_count
from ltts.documents.schemas import CHARS_PER_SECOND
from ltts.documents.spoken import Unread, as_read

ONE = SUPERSCRIPT_DIGITS[1]
EN = "\N{EN DASH}"
SENTENCES = [
    f"The war{ONE} ended in spring.",
    "Caching helps [12].",
    "Prior work [3, 4] agrees.",
    f"Studies [5{EN}7] say so.",
    "Nobody came back.",
]
# The same sentences as they are read: no footnote or citation markers.
READ = ["The war ended in spring.", "Caching helps .", "Prior work agrees.", "Studies say so.", "Nobody came back."]
FIELDS = ("charCount", "wordCount", "spokenCharCount", "spokenWordCount", "estimatedSeconds")


def counts(client: TestClient, doc_id: str) -> dict[str, Any]:
    """The document's counts, checked to be the same in the library list."""
    document = client.get(f"/api/documents/{doc_id}").json()
    listed = next(item for item in client.get("/api/documents").json() if item["id"] == doc_id)
    assert {field: listed[field] for field in FIELDS} == {field: document[field] for field in FIELDS}
    return {field: document[field] for field in FIELDS}


def expected(sentences: list[str], read: list[str]) -> dict[str, Any]:
    """The counts of ``sentences`` when what is read of them is ``read``."""
    spoken = " ".join(read)
    return {
        "charCount": len(" ".join(sentences)),
        "wordCount": word_count(" ".join(sentences)),
        "spokenCharCount": len(spoken),
        "spokenWordCount": word_count(spoken),
        "estimatedSeconds": round(len(spoken) / CHARS_PER_SECOND, 1),
    }


def skip(client: TestClient, doc_id: str, indexes: list[int], value: bool) -> None:
    response = client.put(f"/api/documents/{doc_id}/styles", json={"indexes": indexes, "skip": value})
    assert response.status_code == 200


def test_spoken_counts_leave_out_markers_and_skipped_sentences(client: TestClient) -> None:
    doc_id = client.post("/api/documents/text", json={"text": " ".join(SENTENCES)}).json()["id"]
    assert counts(client, doc_id) == expected(SENTENCES, READ)
    assert expected(SENTENCES, READ)["spokenWordCount"] == expected(SENTENCES, SENTENCES)["wordCount"] - 5

    skip(client, doc_id, [4], True)
    assert counts(client, doc_id) == expected(SENTENCES, READ[:4])
    client.post(f"/api/documents/{doc_id}/cleanup/undo")  # markers read again; the reader's skip stays
    assert counts(client, doc_id) == expected(SENTENCES, SENTENCES[:4])
    skip(client, doc_id, [4], False)
    assert counts(client, doc_id) == expected(SENTENCES, SENTENCES)
    client.post(f"/api/documents/{doc_id}/cleanup/apply")
    assert counts(client, doc_id) == expected(SENTENCES, READ)
    skip(client, doc_id, [0, 1, 2, 3, 4], True)
    assert counts(client, doc_id) == expected(SENTENCES, [])


def test_reaching_the_last_sentence_read_finishes_a_document_whose_last_lines_are_skipped(
    client: TestClient,
) -> None:
    story = ["Rain fell all night.", "Nobody answered.", "The lamp went out.", "Morning came slowly."]
    pages = [["THE SILENT HARBOUR", line, f"Page {number} of 4"] for number, line in enumerate(story, start=1)]
    upload = client.post("/api/documents/upload", params={"filename": "harbour.pdf"}, content=make_pdf(pages))
    doc_id = upload.json()["id"]

    def percent(segment: int) -> float:
        client.put(f"/api/documents/{doc_id}/progress", json={"segmentIndex": segment, "voiceId": "kokoro:alpha"})
        value: float = client.get(f"/api/documents/{doc_id}").json()["progress"]["percent"]
        return value

    # Twelve sentences: each page's header, its line of the story and its page number, which is skipped.
    assert (percent(10), percent(11), percent(4)) == (100.0, 100.0, 40.0)
    client.post(f"/api/documents/{doc_id}/cleanup/undo")
    assert percent(10) == round(100 * 10 / 11, 1)


def test_unread_text_is_counted_as_synthesis_replaces_markers() -> None:
    assert (
        as_read("Caching helps [12] a lot, [12]x and y[12].", [("[12]", "")]) == "Caching helps a lot, [12]x and y[12]."
    )
    assert as_read(f"The war{ONE} ended.", [(f"war{ONE}", "war")]) == "The war ended."
    assert (Unread(skipped={3, 2}).last_read(4), Unread(skipped={0, 1}).last_read(2)) == (1, 1)
