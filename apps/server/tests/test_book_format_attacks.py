# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Hostile and malformed HTML, FB2 and MOBI files fail cleanly, quickly and safely.

Scope: MOBI files that are truncated, claim absurd record counts or offsets, decompress without end
(compression bombs), carry DRM, HUFF/CDIC or KF8 content, or hold broken PalmDOC data, EXTH blocks
and trailing entries; FB2 books with entity declarations, broken XML, huge embedded binaries and
wrong or unknown encodings; HTML pages with huge text, absurd nesting and markup inside scripts.
Does NOT belong: Happy paths (test_book_formats.py) or web page fetching (test_web_page_import.py).
"""

from __future__ import annotations

import base64
import struct
import time
from pathlib import Path

import pytest

from book_builders import (
    LIMITS,
    MobiSpec,
    exth_block,
    make_fb2,
    make_mobi,
    make_record0,
    palm_database,
    palmdoc_compress,
    write,
)
from builders import BILLION_LAUGHS, make_zip, make_zip_bomb
from ltts.documents import extract_mobi
from ltts.documents.extract_html import html_to_extraction
from ltts.documents.extractors import extract
from ltts.documents.palmdoc import decompress, record_bounds, strip_trailing_entries
from ltts.documents.structures import DocumentType, ExtractionLimits
from ltts.errors import DocumentExtractionError


def refusal(tmp_path: Path, data: bytes, doc_type: DocumentType, limits: ExtractionLimits = LIMITS) -> str:
    started = time.monotonic()
    with pytest.raises(DocumentExtractionError) as error:
        extract(write(tmp_path, f"x.{doc_type.value}", data), doc_type, "x", limits)
    assert time.monotonic() - started < 5, "a malformed file must fail quickly"
    return error.value.code


# -- MOBI -------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("spec", "code"),
    [
        (MobiSpec(encryption=2), "drm_protected"),
        (MobiSpec(encryption=1, compression=17480, version=8), "drm_protected"),
        (MobiSpec(compression=17480), "unsupported_compression"),
        (MobiSpec(version=8), "unsupported_kindle_format"),
        (MobiSpec(compression=7), "corrupt_document"),
        (MobiSpec(text_records=0), "corrupt_document"),
        (MobiSpec(text_records=60_000), "corrupt_document"),
    ],
)
def test_mobi_refusals(tmp_path: Path, spec: MobiSpec, code: str) -> None:
    assert refusal(tmp_path, make_mobi(spec), DocumentType.MOBI) == code


def test_drm_message_is_clear(tmp_path: Path) -> None:
    with pytest.raises(DocumentExtractionError) as error:
        extract(write(tmp_path, "d.mobi", make_mobi(MobiSpec(encryption=2))), DocumentType.MOBI, "d", LIMITS)
    assert error.value.message.startswith("DRM-protected books can't be opened.")


def test_truncated_and_broken_record_tables(tmp_path: Path) -> None:
    book = make_mobi()
    absurd = bytearray(book)
    struct.pack_into(">H", absurd, 76, 65_535)  # claims far more records than the file holds
    backwards = bytearray(book)
    struct.pack_into(">I", backwards, 78 + 8, 10)  # record 1 starts before the table ends
    beyond = bytearray(book)
    struct.pack_into(">I", beyond, 78 + 8, len(book) + 1)
    empty = bytearray(book[:78])
    struct.pack_into(">H", empty, 76, 0)
    for data in (book[:70], book[:90], bytes(absurd), bytes(backwards), bytes(beyond), bytes(empty)):
        assert refusal(tmp_path, data, DocumentType.MOBI) == "corrupt_document"


def test_truncated_record0_and_missing_mobi_header(tmp_path: Path) -> None:
    short = palm_database([b"\0" * 20, b"text"])
    not_mobi = bytearray(make_record0(MobiSpec(), 4, 1))
    not_mobi[16:20] = b"XXXX"
    for data in (short, palm_database([bytes(not_mobi), b"text"]), b"\0" * 100):
        assert refusal(tmp_path, data, DocumentType.MOBI) == "corrupt_document"


def test_compression_bombs_stop_at_the_size_cap(tmp_path: Path) -> None:
    # Each record repeats one back-reference: 2 bytes that expand to 10, far past the per-record cap.
    bomb_record = b"a" + b"\x80\x0f" * 5_000
    record0 = make_record0(MobiSpec(), 4096 * 200, 200)
    data = palm_database([record0, *[bomb_record] * 200])
    assert refusal(tmp_path, data, DocumentType.MOBI) == "archive_limits"
    # Records within the per-record cap that add up past the book's decompressed-size cap.
    tiny = ExtractionLimits(1_000, 50, 500, 20 * 1024 * 1024, 200)
    honest = b"a" + b"\x80\x0f" * 300
    data = palm_database([make_record0(MobiSpec(), 3_001 * 100, 100), *[honest] * 100])
    assert refusal(tmp_path, data, DocumentType.MOBI, tiny) == "archive_limits"
    uncompressed = palm_database([make_record0(MobiSpec(compression=1), 9_000, 3), *[b"x" * 3_000] * 3])
    assert refusal(tmp_path, uncompressed, DocumentType.MOBI, tiny) == "archive_limits"


@pytest.mark.parametrize(
    "source",
    [
        b"\x05abc",  # a literal run longer than the data left
        b"\x80",  # a back-reference cut in half
        b"\x80\x08",  # a back-reference before any output
        b"ab\x80\x18",  # a distance beyond the output
        b"\x80\x00",  # distance zero
    ],
)
def test_broken_palmdoc_data(source: bytes) -> None:
    with pytest.raises(DocumentExtractionError) as error:
        decompress(source, 1000)
    assert error.value.code == "corrupt_document"


@pytest.mark.parametrize(
    ("record", "flags", "expected"),
    [
        (b"text\x00", 1, b"text"),
        (b"text\x01\x81", 0b11, b"tex"),  # one overlap byte, then a one-byte entry
        (b"text" + b"\x00\x00\x00\x04", 0b10, b"text"),  # four size bytes without an end marker
        (b"", 0b11, b""),
        (b"t\x7f", 0b10, None),  # an entry claiming to be larger than the record
        (b"\x03", 1, None),  # overlap longer than the record
    ],
)
def test_trailing_entries(record: bytes, flags: int, expected: bytes | None) -> None:
    if expected is None:
        with pytest.raises(DocumentExtractionError):
            strip_trailing_entries(record, flags)
    else:
        assert strip_trailing_entries(record, flags) == expected


_EXTH = exth_block([(503, b"Title From EXTH")])


@pytest.mark.parametrize(
    ("block", "found"),
    [
        (_EXTH, {503: [b"Title From EXTH"]}),
        (_EXTH[:8] + struct.pack(">I", 1_000_000) + _EXTH[12:], {503: [b"Title From EXTH"]}),  # absurd count
        (_EXTH[:12] + struct.pack(">II", 503, 4), {}),  # an entry smaller than its own header
        (_EXTH[:12] + struct.pack(">II", 503, 400), {}),  # an entry running past the block
        (_EXTH[:10], {}),  # cut inside the EXTH header
        (b"NOPE" + _EXTH[4:], {}),
    ],
)
def test_exth_parsing_is_bounded(block: bytes, found: dict[int, list[bytes]]) -> None:
    assert extract_mobi._exth(b"\0" * 16 + block, 16) == found


def test_a_minimal_header_with_only_the_required_fields_still_reads(tmp_path: Path) -> None:
    text = palmdoc_compress(b"<p>Minimal.</p>")
    data = palm_database([make_record0(MobiSpec(), 15, 1)[:24], text])
    result = extract(write(tmp_path, "m.mobi", data), DocumentType.MOBI, "m", LIMITS)
    assert (result.title, result.sections[0].blocks[0].text) == ("m", "Minimal.")


def test_non_mobi_bytes_are_refused_directly(tmp_path: Path) -> None:
    with pytest.raises(DocumentExtractionError) as error:
        extract_mobi.extract_mobi_file(write(tmp_path, "x.mobi", b"\0" * 100), "x", LIMITS)
    assert error.value.code == "corrupt_document"


def test_record_bounds_accepts_a_valid_table() -> None:
    assert record_bounds(palm_database([b"a", b"bc"]))[-1] == 78 + 16 + 2 + 3


# -- FB2 --------------------------------------------------------------------------
def test_fb2_entity_declarations_are_refused(tmp_path: Path) -> None:
    laughs = BILLION_LAUGHS.replace("<package>&lol3;</package>", "<FictionBook>&lol3;</FictionBook>").encode()
    external = (
        b'<?xml version="1.0"?><!DOCTYPE f [<!ENTITY x SYSTEM "file:///etc/passwd">]><FictionBook>&x;</FictionBook>'
    )
    zipped = make_zip({"book.fb2": laughs})
    for data in (laughs, external, zipped):
        assert refusal(tmp_path, data, DocumentType.FB2) == "unsafe_document"


def test_fb2_broken_xml_and_wrong_roots(tmp_path: Path) -> None:
    for data in (
        b"<FictionBook><body><p>unclosed",
        b"<?xml version='1.0'?><html><body/></html>",
        make_zip({"a.txt": "x"}),
    ):
        assert refusal(tmp_path, data, DocumentType.FB2) == "corrupt_document"


def test_fb2_zip_bombs_are_refused(tmp_path: Path) -> None:
    assert refusal(tmp_path, make_zip_bomb(), DocumentType.FB2) == "archive_limits"


def test_fb2_huge_binaries_are_ignored_quickly(tmp_path: Path) -> None:
    blob = base64.b64encode(b"\xff" * 6_000_000).decode()
    data = make_fb2(
        [("One", ["Text survives."])], extra=f'<binary id="cover.jpg" content-type="image/jpeg">{blob}</binary>'
    )
    started = time.monotonic()
    result = extract(write(tmp_path, "big.fb2", data), DocumentType.FB2, "big", LIMITS)
    assert time.monotonic() - started < 10
    assert [b.text for s in result.sections for b in s.blocks] == ["One", "Text survives."]


@pytest.mark.parametrize(
    ("declared", "body", "expected"),
    [
        ("utf-8", b"Caf\xe9", "Caf\N{REPLACEMENT CHARACTER}"),
        ("x-made-up", b"Caf\xc3\xa9", "Caf\N{LATIN SMALL LETTER E WITH ACUTE}"),
        ("rot13", b"Caf\xe9", "Caf\N{LATIN SMALL LETTER E WITH ACUTE}"),
    ],
)
def test_fb2_wrong_or_unknown_encodings_still_read(tmp_path: Path, declared: str, body: bytes, expected: str) -> None:
    data = make_fb2([("One", ["PLACEHOLDER"])], declared=declared).replace(b"PLACEHOLDER", body)
    result = extract(write(tmp_path, "e.fb2", data), DocumentType.FB2, "e", LIMITS)
    assert result.sections[0].blocks[1].text == expected


# -- HTML -------------------------------------------------------------------------
def test_html_scripts_and_styles_never_leak(tmp_path: Path) -> None:
    markup = (
        "<html><head><script>document.write('<p>injected</p>')</script><style>body:after{content:'css'}</style></head>"
        "<body><p>Real text.</p><script type='text/template'><p>template</p></script><template><p>t</p></template>"
        "<STYLE>p{}</STYLE><SCRIPT>alert('</p>')</SCRIPT></body></html>"
    )
    result = extract(write(tmp_path, "s.html", markup.encode()), DocumentType.HTML, "s", LIMITS)
    assert [b.text for s in result.sections for b in s.blocks] == ["Real text."]


def test_html_text_limit_stops_reading_early() -> None:
    tiny = ExtractionLimits(1_000, 50, 500, 20 * 1024 * 1024, 200)
    for markup in ("<p>" + "word " * 1_000 + "</p>" * 3, "<p>" + "word " * 1_000):
        with pytest.raises(DocumentExtractionError) as error:
            html_to_extraction(markup, None, tiny)
        assert error.value.code == "text_limit"


def test_html_absurd_nesting_is_bounded() -> None:
    markup = "<div>" * 5_000 + "<p>Deep text.</p>" + "</div>" * 5_000 + "<p>After.</p>" + "</span>" * 10_000
    started = time.monotonic()
    result = html_to_extraction(markup, None, LIMITS)
    assert time.monotonic() - started < 5
    assert [b.text for s in result.sections for b in s.blocks] == ["Deep text.", "After."]


def test_html_entities_are_never_expanded_from_a_doctype() -> None:
    markup = '<!DOCTYPE html [<!ENTITY boom "BOOM">]><html><body><p>&boom; &amp; &#65;</p></body></html>'
    texts = [b.text for s in html_to_extraction(markup, None, LIMITS).sections for b in s.blocks]
    assert "&boom; & A" in texts and not any("BOOM" in text for text in texts)
