# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Wire-format models for the documents API.

Scope: Library summaries, document detail with sections, section contents, paste requests,
section corrections (title and where it starts), search results and reading-progress updates. ``estimated_seconds``
is a character-rate estimate until real audio exists.
Does NOT belong: Internal extraction structures (``types.py``).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ltts.common import ApiModel

CHARS_PER_SECOND = 15.0
MAX_TITLE_CHARS = 200


class ReadingProgress(ApiModel):
    segment_index: int
    voice_id: str | None
    updated_at: str
    percent: float


class SectionOut(ApiModel):
    index: int
    title: str
    start_segment: int
    segment_count: int
    page: int | None = None


class DocumentSummary(ApiModel):
    id: str
    title: str
    filename: str | None
    file_type: str
    size_bytes: int
    char_count: int
    word_count: int
    page_count: int | None
    segment_count: int
    section_count: int
    estimated_seconds: float
    created_at: str
    last_opened_at: str | None
    progress: ReadingProgress | None = None


class DocumentDetail(DocumentSummary):
    sections: list[SectionOut]
    warnings: list[str]


class SegmentOut(ApiModel):
    index: int
    section_index: int
    paragraph_index: int
    kind: Literal["heading", "paragraph"]
    boundary: Literal["sentence", "paragraph", "section"]
    text: str


class SectionContent(ApiModel):
    section_index: int
    segments: list[SegmentOut]


class PasteTextRequest(ApiModel):
    text: str = Field(min_length=1, max_length=2_000_000)
    title: str | None = Field(default=None, max_length=MAX_TITLE_CHARS)


class SearchHit(ApiModel):
    segment_index: int
    section_index: int
    text: str  # the whole sentence; the client marks the match


class SearchResults(ApiModel):
    query: str
    total: int  # every matching sentence, even beyond the hits returned
    hits: list[SearchHit]


class SectionUpdate(ApiModel):
    """A reader's correction to a section: a new title, and/or the sentence it should start at."""

    title: str | None = Field(default=None, min_length=1, max_length=MAX_TITLE_CHARS)
    start_segment: int | None = Field(default=None, ge=0)


class ProgressUpdate(ApiModel):
    segment_index: int = Field(ge=0)
    voice_id: str | None = Field(default=None, max_length=120)
