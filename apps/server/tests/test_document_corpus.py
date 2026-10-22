# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The document cleanup on whole documents: a technical paper, a textbook and a novel, as PDFs.

Scope: Each is built here (``builders.make_pdf``) and added through the API. What must be read is
(code, arrays, intervals, equations, numbered headings, figures, years, numbers, dialogue, chapter
headings), what must not is skipped or left unread (running headers, page numbers, footnotes at the foot
of pages, footnote and citation markers), the spoken counts and the estimate match what the voice is
asked to say, and an export reads exactly the sentences that aren't skipped. Undoing the cleanup reads
exactly what was read before it, as often as it is undone, and never changes the stored text.
Does NOT belong: The rules one by one (test_document_cleanup.py, test_document_citations.py,
test_document_page_notes.py) or counting edge cases (test_spoken_counts.py).
"""

from __future__ import annotations

import dataclasses
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from builders import make_pdf
from conftest import FakeEngine
from ltts.container import Services
from ltts.documents.extract_pdf import extract_pdf_file
from ltts.documents.normalize import speech_text, word_count
from ltts.documents.schemas import CHARS_PER_SECOND
from ltts.documents.segmenter import segment_extraction
from ltts.documents.structures import ExtractionLimits
from test_document_cleanup_api import cleanup, exported, skip

VOICE = "kokoro:alpha"
LIMITS = ExtractionLimits(1_000_000, 50, 500, 20 * 1024 * 1024, 200)


@dataclass(frozen=True)
class Corpus:
    name: str
    pages: list[list[str]]
    options: dict[str, Any]
    read: list[str]  # read aloud, as written
    unread: list[str]  # in the text, never read aloud
    skipped: dict[str, int]  # sentences skipped, by reason
    markers: dict[str, int] = field(default_factory=dict)  # markers left unread, by reason

    def pdf(self) -> bytes:
        return make_pdf(self.pages, **self.options)


PAPER = Corpus(
    "paper",
    [
        ["SYSTEMS NOTES", "Caching keeps hot data close to the processor [12].",
         "Read array[3] before the loop, then x[i+1] and matrix[2][3] after it.",
         "Prior work [3, 4] and several surveys [5-7] agree on this."],
        ["SYSTEMS NOTES", "The interval [0, 1] holds every weight, and list[-1] is the last one.",
         "As shown in [12, 15-17], the cost drops when the cache is warm.",
         "Then x^2 + y^2 = r^2 holds for every point on the circle."],
        ["SYSTEMS NOTES", "The lookup returns [3] when the key is missing.",
         "In 2019 the team measured 3.5 ms for each lookup on 64 cores.", "Figure 2 shows the miss rate falling.[8]"],
        ["SYSTEMS NOTES", "References", "[3] A. Smith. Caches. 2001.", "[4] B. Jones. Memory. 2004.",
         "[12] C. Wu. Warm caches. 2019."],
    ],
    {"footers": ["1", "2", "3", "4"]},
    read=["array[3]", "x[i+1]", "matrix[2][3]", "The interval [0, 1]", "list[-1]", "x^2 + y^2 = r^2", "returns [3]",
          "In 2019", "3.5 ms", "64 cores", "[3] A. Smith.", "[12] C. Wu."],
    unread=["SYSTEMS NOTES", "processor [12]", "work [3, 4]", "surveys [5-7]", "in [12, 15-17]", "falling.[8]"],
    skipped={"header": 4, "page_number": 4},
    markers={"citation": 5},
)  # fmt: skip
TEXTBOOK = Corpus(
    "textbook",
    [
        ["BIOLOGY TODAY", "1.2 Cell structure", "Every cell is wrapped in a thin membrane.1 Inside it, the",
         "cytoplasm holds the organelles.2 Figure 1.3 shows the nucleus."],
        ["BIOLOGY TODAY", "Table 1.1 lists 12 organelles and their jobs.",
         "The nucleus stores the genes.3 Each gene is a recipe."],
        ["BIOLOGY TODAY", "1.3 Cell division", "A cell divides in 4 stages, shown in Figure 1.4.",
         "Step 3 is the shortest of them."],
        ["BIOLOGY TODAY", "Exercise 1.5: Name two organelles found in plant cells."],
    ],
    {
        "notes": [["1 The membrane is about 8 nm thick.", "2 Organelles are the small organs of", "the cell."],
                  ["3 Genes are made of DNA."], [], []],
        "footers": ["12", "13", "14", "15"],
        "outline": [("1.2 Cell structure", 0), ("1.3 Cell division", 2)],
    },
    read=["1.2 Cell structure", "1.3 Cell division", "Figure 1.3 shows the nucleus.", "Table 1.1 lists 12 organelles",
          "in 4 stages, shown in Figure 1.4.", "Step 3 is the shortest", "Exercise 1.5:", "membrane. Inside",
          "organelles. Figure", "genes. Each"],
    unread=["BIOLOGY TODAY", "membrane.1", "organelles.2", "genes.3", "8 nm thick", "small organs of the cell",
            "made of DNA"],
    skipped={"header": 4, "page_number": 4, "footnote_text": 3},
    markers={"footnote": 3},
)  # fmt: skip
NOVEL = Corpus(
    "novel",
    [
        ["THE SILENT HARBOUR", "Chapter 1", "In 1984 the ferry carried 12 people across the bay.",
         '"Come in," she said. "The door is open."'],
        ["THE SILENT HARBOUR", "He counted 3 boats, then 7 more, before the tide turned.",
         "It was 9.30 when the bell rang twice."],
        ["THE SILENT HARBOUR", "Chapter 2", '"Will you stay?" he asked. She did not answer.',
         "By 1990 the town had 2,000 people and one road."],
        ["THE SILENT HARBOUR", "The lamp in the window flickered and went out."],
    ],
    {"footers": ["7", "8", "9", "10"], "outline": [("Chapter 1", 0), ("Chapter 2", 2)]},
    read=["Chapter 1", "In 1984 the ferry carried 12 people", '"Come in," she said.', '"The door is open."',
          "3 boats, then 7 more", "9.30 when", "Chapter 2", '"Will you stay?" he asked.',
          "By 1990 the town had 2,000 people"],
    unread=["THE SILENT HARBOUR"],
    skipped={"header": 4, "page_number": 4},
)  # fmt: skip
CORPORA = [PAPER, TEXTBOOK, NOVEL]


def add(client: TestClient, corpus: Corpus) -> str:
    response = client.post("/api/documents/upload", params={"filename": f"{corpus.name}.pdf"}, content=corpus.pdf())
    assert response.status_code == 201
    doc_id: str = response.json()["id"]
    return doc_id


def reading(services: Services, doc_id: str, *, cleaned: bool = True) -> list[tuple[int, str]]:
    """Each sentence read aloud and what the voice is asked to say for it; without ``cleaned``, as if the
    document had never been cleaned up (every sentence, every marker)."""
    skipped = services.synthesis.skipped(doc_id) if cleaned else set()
    said = []
    for index, _, text, boundary in services.document_repo.all_segments(doc_id):
        if index in skipped:
            continue
        plan = services.synthesis.plan_segment(doc_id, index, text, VOICE)
        if not cleaned:
            plan = dataclasses.replace(plan, replacements=())
        said.append((index, " ".join(piece.spoken for piece in services.synthesis.job(plan, text, boundary, 1).pieces)))
    return said


def as_written(services: Services, doc_id: str) -> list[str]:
    """What is read of each sentence, as written: its markers taken out, nothing else changed."""
    skipped = services.synthesis.skipped(doc_id)
    read = []
    for index, _, text, _ in services.document_repo.all_segments(doc_id):
        if index not in skipped:
            sentence = text
            for written, spoken in services.synthesis.plan_segment(doc_id, index, text, VOICE).replacements:
                sentence = sentence.replace(written, spoken)
            read.append(" ".join(sentence.split()))
    return read


def stored(services: Services, doc_id: str) -> list[str]:
    return [text for _, _, text, _ in services.document_repo.all_segments(doc_id)]


@pytest.mark.parametrize("corpus", CORPORA, ids=lambda corpus: corpus.name)
def test_what_is_read_what_is_not_and_the_counts_of_it(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], corpus: Corpus
) -> None:
    doc_id = add(client, corpus)
    said = reading(services, doc_id)
    spoken, text = " ".join(words for _, words in said), " ".join(stored(services, doc_id))
    assert [phrase for phrase in corpus.read if phrase not in spoken] == []
    assert [phrase for phrase in corpus.unread if phrase not in text or phrase in spoken] == []
    # Nothing but the markers changes what a sentence says.
    assert [words for _, words in said] == [speech_text(sentence) for sentence in as_written(services, doc_id)]
    found: Counter[str] = Counter()
    for item in cleanup(client, doc_id)["items"]:  # sentences skipped, and markers one by one
        found[item["reason"]] += len(item["markers"]) if item["reason"] in ("footnote", "citation") else 1
    assert found == Counter(corpus.skipped) + Counter(corpus.markers)

    document = client.get(f"/api/documents/{doc_id}").json()
    read = " ".join(as_written(services, doc_id))
    assert (document["wordCount"], document["charCount"]) == (word_count(text), len(text))
    assert (document["spokenWordCount"], document["spokenCharCount"]) == (word_count(spoken), len(read))
    assert document["estimatedSeconds"] == round(len(read) / CHARS_PER_SECOND, 1)
    assert exported(client, engines["kokoro"], doc_id) == (len(said), [words for _, words in said])


@pytest.mark.parametrize("corpus", CORPORA, ids=lambda corpus: corpus.name)
def test_undoing_the_cleanup_reads_exactly_what_was_read_before_it(
    client: TestClient, services: Services, tmp_path: Path, corpus: Corpus
) -> None:
    doc_id = add(client, corpus)
    path = tmp_path / f"{corpus.name}.pdf"
    path.write_bytes(corpus.pdf())
    original = [segment.text for segment in segment_extraction(extract_pdf_file(path, corpus.name, LIMITS))[0]]
    assert stored(services, doc_id) == original  # the original text is kept, every sentence of it
    before, cleaned, report = (
        reading(services, doc_id, cleaned=False),
        reading(services, doc_id),
        cleanup(client, doc_id),
    )
    assert len(before) == len(original) > len(cleaned)

    for _ in range(2):  # as often as it is undone and applied again
        undone = cleanup(client, doc_id, "undo")
        assert reading(services, doc_id) == before
        assert not any(item["applied"] for item in undone["items"]) and undone["notice"] == report["notice"]
        document = client.get(f"/api/documents/{doc_id}").json()
        assert (document["spokenWordCount"], document["spokenCharCount"]) == (
            document["wordCount"],
            document["charCount"],
        )
        assert cleanup(client, doc_id, "apply") == report
        assert reading(services, doc_id) == cleaned

    # A sentence skipped by hand stays skipped through an undo, and read again it reads as before.
    first_read = cleaned[0][0]
    skip(client, doc_id, [first_read], True)
    cleanup(client, doc_id, "undo")
    assert reading(services, doc_id) == [line for line in before if line[0] != first_read]
    skip(client, doc_id, [first_read], False)
    assert reading(services, doc_id) == before
    assert stored(services, doc_id) == original
