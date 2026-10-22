# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Happy-path tests for HTML, FB2 and MOBI documents and their type detection.

Scope: Sniffing the new types by content (``.fb2.zip`` included), HTML main-content selection,
dropped page furniture and hidden elements, titles and charsets; FB2 metadata, sections, notes and
encodings; MOBI PalmDOC and uncompressed text, trailing entries, EXTH metadata and long books.
Does NOT belong: Malformed and hostile files (test_book_format_attacks.py) or web page fetching
(test_web_page_import.py).
"""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from book_builders import LIMITS, MobiSpec, make_fb2, make_mobi, palmdoc_compress, write
from builders import make_zip
from ltts.documents.extract_html import decode_html, html_to_extraction
from ltts.documents.extractors import extract
from ltts.documents.palmdoc import decompress
from ltts.documents.sniff import detect_type, looks_like_html
from ltts.documents.structures import DocumentType, Extraction
from ltts.errors import UnsupportedDocumentError


def outline(extraction: Extraction) -> list[tuple[str, list[tuple[str, str]]]]:
    return [(s.title, [(b.kind, b.text) for b in s.blocks]) for s in extraction.sections]


def page(body: str, head: str = "<title>A Page</title>") -> str:
    return f"<!doctype html><html><head>{head}</head><body>{body}</body></html>"


# -- sniffing -------------------------------------------------------------------
@pytest.mark.parametrize(
    ("name", "data", "expected"),
    [
        ("a.html", page("<p>Hi.</p>").encode(), DocumentType.HTML),
        ("b.htm", b"\xef\xbb\xbf  <p>Just a fragment.</p>", DocumentType.HTML),
        ("c.fb2", make_fb2([("One", ["Hi."])]), DocumentType.FB2),
        ("d.FB2.ZIP", make_zip({"book.fb2": make_fb2([("One", ["Hi."])])}), DocumentType.FB2),
        ("e.mobi", make_mobi(), DocumentType.MOBI),
        ("f.azw3", make_mobi(MobiSpec(version=8)), DocumentType.MOBI),
        ("plain.html", b"Just words, no markup at all.", None),
        ("fake.fb2", b"<?xml version='1.0'?><book>not fiction</book>", None),
        ("fake.mobi", b"plain text pretending to be a book", None),
        ("other.fb2.zip", make_zip({"readme.txt": "no book here"}), None),
        ("book.pdf", page("<p>HTML in disguise</p>").encode(), None),
    ],
    # Named by file: the zips' bytes carry their build time, so parallel workers would name them differently.
    ids=[
        "a.html",
        "b.htm",
        "c.fb2",
        "d.FB2.ZIP",
        "e.mobi",
        "f.azw3",
        "plain.html",
        "fake.fb2",
        "fake.mobi",
        "other.fb2.zip",
        "book.pdf",
    ],
)
def test_detects_new_types_by_content(tmp_path: Path, name: str, data: bytes, expected: DocumentType | None) -> None:
    path = write(tmp_path, name, data)
    if expected is None:  # the name promises a type the bytes don't have
        with pytest.raises(UnsupportedDocumentError, match="contents don't match"):
            detect_type(path, name)
    else:
        assert detect_type(path, name) is expected


def test_html_sniffing_needs_markup_and_text() -> None:
    assert looks_like_html(b"<HTML lang='en'>") and looks_like_html(b"\n<div class='x'>hi</div>")
    assert not looks_like_html(b"") and not looks_like_html(b"<html>\x00\x01\x02\x03\x04\x05")
    assert not looks_like_html(b"Dear <name>, thanks for the tips.")


def test_text_files_may_contain_markup(tmp_path: Path) -> None:
    assert detect_type(write(tmp_path, "notes.txt", b"<FictionBook> <html>"), "notes.txt") is DocumentType.TEXT


# -- HTML -------------------------------------------------------------------------
def test_html_reads_the_article_and_drops_page_furniture(tmp_path: Path) -> None:
    markup = page(
        "<header><h1>Site banner</h1><nav><a href='/'>Home</a></nav></header>"
        "<div role='navigation'>Skip links</div>"
        "<main><article><header><h1>The headline</h1><p>By A. Writer</p></header>"
        "<p>First paragraph.<p>Second <span hidden>secret</span>paragraph."
        "<div style='display: none'>Hidden <p>nested</p></div><p aria-hidden='true'>Decoration</p>"
        "<h2>Part two</h2><p>Text &amp; more.</p><form><label>Name</label><button>Send</button></form>"
        "<aside>Related links</aside><footer>Share this</footer><dialog>Cookie notice</dialog>"
        "<dialog open><p>An open dialog is visible.</p></dialog></article></main>"
        "<footer>Copyright</footer><script>var t = '<p>code</p>';</script><noscript>Enable JS</noscript>",
        head="<title> My Article | Site </title><style>p { color: red }</style>",
    )
    result = extract(write(tmp_path, "a.html", markup.encode()), DocumentType.HTML, "a", LIMITS)
    assert result.title == "My Article | Site"
    assert outline(result) == [
        (
            "The headline",
            [
                ("heading", "The headline"),
                ("paragraph", "By A. Writer"),
                ("paragraph", "First paragraph."),
                ("paragraph", "Second paragraph."),
            ],
        ),
        (
            "Part two",
            [("heading", "Part two"), ("paragraph", "Text & more."), ("paragraph", "An open dialog is visible.")],
        ),
    ]


def test_html_prefers_main_then_articles_then_the_whole_page() -> None:
    articles = page("<p>Intro.</p><article><p>One.</p></article><div role='article'><p>Two.</p></div>")
    whole = page("<header role='banner'>Top</header><div><p>Everything visible.</p></div>")
    empty_main = page("<main></main><p>Outside the empty main.</p>")
    texts = [
        [b.text for s in html_to_extraction(m, None, LIMITS).sections for b in s.blocks] for m in (articles, whole)
    ]
    assert texts == [["One.", "Two."], ["Everything visible."]]
    assert (
        html_to_extraction(page("<div role='main'><p>Main.</p></div><p>Aside.</p>"), None, LIMITS)
        .sections[0]
        .blocks[0]
        .text
        == "Main."
    )
    assert html_to_extraction(empty_main, None, LIMITS).sections[0].blocks[0].text == "Outside the empty main."


def test_html_titles_fall_back_to_the_first_heading_then_the_file_name() -> None:
    svg_title = "<svg><title>Icon</title></svg><h3>Small heading</h3><p>Text.</p>"
    assert html_to_extraction(page(svg_title, head=""), "file", LIMITS).title == "Small heading"
    assert (
        html_to_extraction(page("<p>Text.</p>", head="<title>  </title><title>Second</title>"), "file", LIMITS).title
        == "file"
    )
    untitled = html_to_extraction(page("<p>Text.</p>", head=""), None, LIMITS)
    assert (untitled.title, untitled.sections[0].title) == (None, "Document")
    assert html_to_extraction(page("<p>x</p>"), None, LIMITS, known_title="Book").title == "Book"


def test_html_tolerates_sloppy_markup() -> None:
    markup = page("<ul><li>One<li>Two</ul></p></span><div><b>Bold<i>open</div><p>After<br/>break</br>end.<hr>")
    blocks = [b.text for s in html_to_extraction(markup, None, LIMITS).sections for b in s.blocks]
    assert blocks == ["One", "Two", "Boldopen", "After", "break", "end."]


@pytest.mark.parametrize(
    ("raw", "declared", "expected"),
    [
        (
            "Caf\N{LATIN SMALL LETTER E WITH ACUTE}".encode("utf-16"),
            "windows-1251",
            "Caf\N{LATIN SMALL LETTER E WITH ACUTE}",
        ),
        (b"<p>\xc0\xc1</p>", "windows-1251", "<p>\N{CYRILLIC CAPITAL LETTER A}\N{CYRILLIC CAPITAL LETTER BE}</p>"),
        (b"<meta charset='koi8-r'><p>\xe1</p>", None, "<meta charset='koi8-r'><p>\N{CYRILLIC CAPITAL LETTER A}</p>"),
        (b'<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>\x93q\x94</p>', None, None),
        (
            b"<meta charset=utf-16><p>caf\xc3\xa9</p>",
            "rot13",
            "<meta charset=utf-16><p>caf\N{LATIN SMALL LETTER E WITH ACUTE}</p>",
        ),
        (b"<p>caf\xe9</p>", "not-a-charset", "<p>caf\N{LATIN SMALL LETTER E WITH ACUTE}</p>"),
    ],
)
def test_html_charsets(raw: bytes, declared: str | None, expected: str | None) -> None:
    decoded = decode_html(raw, declared)
    if expected is None:  # ISO-8859-1 is read as Windows-1252, as browsers do: curly quotes survive
        assert "\N{LEFT DOUBLE QUOTATION MARK}q\N{RIGHT DOUBLE QUOTATION MARK}" in decoded
    else:
        assert decoded == expected


# -- FB2 --------------------------------------------------------------------------
def test_fb2_metadata_sections_and_notes(tmp_path: Path) -> None:
    data = make_fb2(
        [("Chapter 1", ["First paragraph.", "Second [1]."]), (None, ["An untitled part."]), ("Chapter 3", ["Third."])],
        title="The Book",
        authors=(("Anna", "Writer"), ("Ben", "Author")),
        lang="ru",
        notes=[("1", "The note's text."), ("2.", "Another note.")],
    )
    result = extract(write(tmp_path, "b.fb2", data), DocumentType.FB2, "file", LIMITS)
    assert (result.title, result.author, result.language) == ("The Book", "Anna Writer, Ben Author", "ru")
    assert outline(result) == [
        ("Chapter 1", [("heading", "Chapter 1"), ("paragraph", "First paragraph."), ("paragraph", "Second [1].")]),
        ("Part 2", [("paragraph", "An untitled part.")]),
        ("Chapter 3", [("heading", "Chapter 3"), ("paragraph", "Third.")]),
        ("Notes", [("heading", "Notes"), ("paragraph", "1. The note's text."), ("paragraph", "2. Another note.")]),
    ]


def test_fb2_nested_sections_poems_and_untitled_parts(tmp_path: Path) -> None:
    body = (
        "<title><p>Anna Writer</p><p>The Book</p></title><epigraph><p>A wise saying.</p><text-author>Someone</text-author></epigraph>"
        "<section><title><p>Part One</p></title><section><title><p>Chapter 1</p></title><p>Text one.</p>"
        "<poem><stanza><v>Line one,</v><v>line two.</v></stanza></poem><empty-line/><image/><p> </p></section>"
        "<section><p>Untitled scene.</p></section></section>"
        "<section><section><title><p>Chapter 2</p></title><p>Text two.</p></section></section>"
        "<section><title><p> </p></title><p>Blank title.</p></section>"
    )
    data = make_fb2([], notes=None).replace(b"<body></body>", f"<body>{body}</body>".encode())
    result = extract(write(tmp_path, "n.fb2", data), DocumentType.FB2, "n", LIMITS)
    assert outline(result) == [
        (
            "Anna Writer \N{EM DASH} The Book",
            [
                ("heading", "Anna Writer \N{EM DASH} The Book"),
                ("paragraph", "A wise saying."),
                ("paragraph", "Someone"),
            ],
        ),
        (
            "Part One",
            [
                ("heading", "Part One"),
                ("heading", "Chapter 1"),
                ("paragraph", "Text one."),
                ("paragraph", "Line one,"),
                ("paragraph", "line two."),
                ("paragraph", "Untitled scene."),
            ],
        ),
        ("Chapter 2", [("heading", "Chapter 2"), ("paragraph", "Text two."), ("paragraph", "Blank title.")]),
    ]


def test_fb2_without_title_info_uses_the_file_name(tmp_path: Path) -> None:
    data = (
        b'<?xml version="1.0"?><FictionBook><description/><body><section><p>Loose paragraph.</p></section></body>'
        b'<body name="Notes"><section><p>Unlabelled note.</p></section><section><title><p>3</p></title></section></body>'
        b"<binary id='cover.jpg' content-type='image/jpeg'>AAAA</binary></FictionBook>"
    )
    result = extract(write(tmp_path, "x.fb2", data), DocumentType.FB2, "x", LIMITS)
    assert (result.title, result.author, result.language) == ("x", None, None)
    assert outline(result) == [
        ("Part 1", [("paragraph", "Loose paragraph.")]),
        ("Notes", [("heading", "Notes"), ("paragraph", "Unlabelled note.")]),
    ]


def test_fb2_author_nicknames_and_empty_authors(tmp_path: Path) -> None:
    data = make_fb2([("One", ["Hi."])]).replace(
        b"<author><first-name>Anna</first-name><last-name>Writer</last-name></author>",
        b"<author><nickname>anon</nickname></author><author><first-name> </first-name></author>",
    )
    assert extract(write(tmp_path, "a.fb2", data), DocumentType.FB2, "a", LIMITS).author == "anon"


@pytest.mark.parametrize("encoding", ["windows-1251", "koi8-r", "utf-8", "utf-16"])
def test_fb2_declared_encodings(tmp_path: Path, encoding: str) -> None:
    text = "\N{CYRILLIC CAPITAL LETTER PE}\N{CYRILLIC SMALL LETTER IE}\N{CYRILLIC SMALL LETTER ER}"
    data = make_fb2([(text, [f"{text}."])], title=text, encoding=encoding)
    result = extract(write(tmp_path, "c.fb2", data), DocumentType.FB2, "c", LIMITS)
    assert result.title == text and result.sections[0].blocks[1].text == f"{text}."


def test_fb2_inside_a_zip(tmp_path: Path) -> None:
    archive = make_zip(
        {"cover.jpg": b"\xff\xd8\xff", "book.FB2": make_fb2([("Zipped", ["From a ZIP."])])},
        compression=zipfile.ZIP_DEFLATED,
    )
    result = extract(write(tmp_path, "b.fb2.zip", archive), DocumentType.FB2, "b", LIMITS)
    assert outline(result)[0] == ("Zipped", [("heading", "Zipped"), ("paragraph", "From a ZIP.")])


# -- MOBI -------------------------------------------------------------------------
def test_palmdoc_round_trip_covers_every_code() -> None:
    data = b"Spaces and Letters, \x01\x08 bytes \xe9\xff, repeats repeats repeats." * 3
    packed = palmdoc_compress(data)
    assert any(0x80 <= b <= 0xBF for b in packed) and any(b >= 0xC0 for b in packed)
    assert decompress(packed, len(data)) == data
    assert decompress(b"a\x80\x0f", 100) == b"a" * 11  # distance 1, length 10: the copy overlaps itself


def test_mobi_reads_compressed_text_with_trailing_entries(tmp_path: Path) -> None:
    chapters = b"".join(
        b"<h2>Chapter %d</h2><p>Some text about chapter %d.</p><mbp:pagebreak/>" % (i, i) for i in range(1, 400)
    )
    html = (
        b"<html><head><guide></guide></head><body>"
        + chapters
        + "<p>\N{LATIN SMALL LETTER E WITH ACUTE}nd.</p></body></html>".encode()
    )
    spec = MobiSpec(html=html, extra_flags=0b111, trailing=b"\x00\x81\x00\x82")
    result = extract(write(tmp_path, "b.mobi", make_mobi(spec)), DocumentType.MOBI, "b", LIMITS)
    assert (result.title, result.author) == ("The EXTH Title", "Anna Writer")
    assert len(result.sections) == 399
    assert (
        result.sections[0].blocks
        == extract(write(tmp_path, "c.mobi", make_mobi(MobiSpec(html=html))), DocumentType.MOBI, "c", LIMITS)
        .sections[0]
        .blocks
    )
    assert result.sections[-1].blocks[-1].text == "\N{LATIN SMALL LETTER E WITH ACUTE}nd."


def test_mobi_uncompressed_cp1252_with_full_name_title(tmp_path: Path) -> None:
    spec = MobiSpec(
        html=b"<html><body><p>Caf\xe9 \x93quoted\x94.</p></body></html>",
        compression=1,
        trailing=b"<p>Past the declared text length.</p>",
        encoding=1252,
        exth=[(100, b"Anna Writer"), (100, b"Ben Author"), (524, b"en"), (999, b"ignored")],
        title="Full Name Title",
    )
    result = extract(write(tmp_path, "u.mobi", make_mobi(spec)), DocumentType.MOBI, "u", LIMITS)
    assert (result.title, result.author, result.language) == ("Full Name Title", "Anna Writer, Ben Author", "en")
    assert (
        result.sections[0].blocks[0].text
        == "Caf\N{LATIN SMALL LETTER E WITH ACUTE} \N{LEFT DOUBLE QUOTATION MARK}quoted\N{RIGHT DOUBLE QUOTATION MARK}."
    )


def test_mobi_without_exth_or_name_falls_back_to_the_page(tmp_path: Path) -> None:
    spec = MobiSpec(
        html=b"<html><body><h1>Inner Heading</h1><p>Text.</p></body></html>", exth=[], title="", header_length=0x74
    )
    result = extract(write(tmp_path, "n.mobi", make_mobi(spec)), DocumentType.MOBI, "n", LIMITS)
    assert (result.title, result.author) == ("Inner Heading", None)
