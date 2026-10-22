# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Write a read-along EPUB 3 book: the text with its narration, synchronised sentence by sentence.

Scope: Builds a standard EPUB 3 with Media Overlays (no proprietary format). Each chapter is
an XHTML page whose sentences carry ids, with an MP3 of the chapter. A SMIL file pairs every
sentence with its clip of that MP3, using the times the export recorded. The package also has a
navigation document, an optional cover, overlay durations and an active-class style, so readers
that support Media Overlays (for example Thorium and Apple Books) highlight each sentence as it is
read. All text is XML-escaped and stripped of characters XML can't hold, and the archive starts with
an uncompressed ``mimetype`` as the format requires.
Does NOT belong: Synthesis, assembling the chapter audio (``assemble.py``) or M4B (``m4b.py``).
"""

from __future__ import annotations

import uuid
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

from ltts.exports.assemble import Cue

ACTIVE_CLASS = "-epub-media-overlay-active"
STYLE = f""".{ACTIVE_CLASS} {{ background-color: #fff3b0; color: inherit; }}
body {{ line-height: 1.6; }}
h1, h2 {{ line-height: 1.3; }}
"""


@dataclass(frozen=True, slots=True)
class Sentence:
    index: int
    paragraph: int
    heading: bool
    text: str
    line_break: bool = False  # a verse line ends here: the next sentence starts a new line, not a new paragraph


@dataclass(frozen=True, slots=True)
class EpubChapter:
    title: str
    sentences: Sequence[Sentence]
    audio: Path  # the chapter's MP3
    cues: Sequence[Cue]  # the sentences' times in that MP3
    duration: float


def _xml_char(char: str) -> bool:
    code = ord(char)
    return code in (0x9, 0xA, 0xD) or 0x20 <= code <= 0xD7FF or 0xE000 <= code <= 0xFFFD or code >= 0x10000


def clean(text: str) -> str:
    """Text safe inside XML: characters XML 1.0 can't hold are dropped, the rest escaped."""
    return escape("".join(char for char in text if _xml_char(char)))


def clock(seconds: float) -> str:
    """A SMIL clock value, ``h:mm:ss.fff``."""
    millis = max(round(seconds * 1000), 0)
    hours, rest = divmod(millis, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    return f"{hours}:{minutes:02d}:{rest // 1000:02d}.{rest % 1000:03d}"


def _xhtml(chapter: EpubChapter, language: str) -> str:
    blocks: list[str] = []
    current: tuple[int, bool] | None = None
    parts: list[str] = []

    def close() -> None:
        if current is not None:
            tag = "h2" if current[1] else "p"
            blocks.append(f"<{tag}>{' '.join(parts)}</{tag}>")

    for sentence in chapter.sentences:
        key = (sentence.paragraph, sentence.heading)
        if key != current:
            close()
            current, parts = key, []
        parts.append(f'<span id="s{sentence.index}">{clean(sentence.text)}</span>')
        if sentence.line_break:
            parts.append("<br/>")
    close()
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
        f"xml:lang={quoteattr(language)} lang={quoteattr(language)}>\n"
        f'<head><meta charset="UTF-8"/><title>{clean(chapter.title)}</title>'
        '<link rel="stylesheet" type="text/css" href="../style.css"/></head>\n'
        f'<body><section epub:type="chapter">\n{chr(10).join(blocks)}\n</section></body></html>\n'
    )


def _smil(chapter: EpubChapter, number: int) -> str:
    text = f"../text/c{number:03d}.xhtml"
    pars = [
        f'<par id="p{cue.index}"><text src="{text}#s{cue.index}"/>'
        f'<audio src="../audio/c{number:03d}.mp3" clipBegin="{clock(cue.start)}" clipEnd="{clock(cue.end)}"/></par>'
        for cue in chapter.cues
    ]
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">\n'
        f'<body><seq id="seq{number}" epub:textref="{text}" epub:type="chapter">\n'
        f"{chr(10).join(pars)}\n</seq></body></smil>\n"
    )


def _nav(chapters: Sequence[EpubChapter], title: str, language: str) -> str:
    items = "".join(
        f'<li><a href="text/c{n:03d}.xhtml">{clean(chapter.title)}</a></li>' for n, chapter in enumerate(chapters, 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
        f"xml:lang={quoteattr(language)} lang={quoteattr(language)}>\n"
        f"<head><title>{clean(title)}</title></head>\n"
        f'<body><nav epub:type="toc" id="toc"><h1>{clean(title)}</h1><ol>{items}</ol></nav></body></html>\n'
    )


def _opf(
    chapters: Sequence[EpubChapter], title: str, author: str | None, language: str, cover: tuple[str, str] | None
) -> str:
    modified = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    total = sum(chapter.duration for chapter in chapters)
    meta = [
        f'<dc:identifier id="uid">urn:uuid:{uuid.uuid4()}</dc:identifier>',
        f"<dc:title>{clean(title)}</dc:title>",
        f"<dc:language>{clean(language)}</dc:language>",
        f'<meta property="dcterms:modified">{modified}</meta>',
        f'<meta property="media:duration">{clock(total)}</meta>',
        f'<meta property="media:active-class">{ACTIVE_CLASS}</meta>',
    ]
    if author:
        meta.insert(2, f"<dc:creator>{clean(author)}</dc:creator>")
    items = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="css" href="style.css" media-type="text/css"/>',
    ]
    spine = []
    for n, chapter in enumerate(chapters, 1):
        meta.append(f'<meta property="media:duration" refines="#mo{n:03d}">{clock(chapter.duration)}</meta>')
        items += [
            f'<item id="c{n:03d}" href="text/c{n:03d}.xhtml" media-type="application/xhtml+xml" '
            f'media-overlay="mo{n:03d}"/>',
            f'<item id="mo{n:03d}" href="smil/c{n:03d}.smil" media-type="application/smil+xml"/>',
            f'<item id="a{n:03d}" href="audio/c{n:03d}.mp3" media-type="audio/mpeg"/>',
        ]
        spine.append(f'<itemref idref="c{n:03d}"/>')
    if cover:
        items.append(f'<item id="cover" href="images/{cover[0]}" media-type="{cover[1]}" properties="cover-image"/>')
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" '
        f"xml:lang={quoteattr(language)}>\n"
        f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n{chr(10).join(meta)}\n</metadata>\n'
        f"<manifest>\n{chr(10).join(items)}\n</manifest>\n<spine>\n{chr(10).join(spine)}\n</spine>\n</package>\n"
    )


CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""


def write_epub(
    output: Path,
    chapters: Sequence[EpubChapter],
    *,
    title: str,
    author: str | None,
    language: str,
    cover: tuple[bytes, str] | None,
) -> Path:
    """Write the book; ``cover`` is the image's bytes and media type (image/jpeg or image/png)."""
    cover_name = None
    if cover:
        cover_name = ("cover.jpg" if cover[1] == "image/jpeg" else "cover.png", cover[1])
    with zipfile.ZipFile(output, "w") as book:
        book.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        book.writestr("META-INF/container.xml", CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
        book.writestr("OEBPS/package.opf", _opf(chapters, title, author, language, cover_name), zipfile.ZIP_DEFLATED)
        book.writestr("OEBPS/nav.xhtml", _nav(chapters, title, language), zipfile.ZIP_DEFLATED)
        book.writestr("OEBPS/style.css", STYLE, zipfile.ZIP_DEFLATED)
        for n, chapter in enumerate(chapters, 1):
            book.writestr(f"OEBPS/text/c{n:03d}.xhtml", _xhtml(chapter, language), zipfile.ZIP_DEFLATED)
            book.writestr(f"OEBPS/smil/c{n:03d}.smil", _smil(chapter, n), zipfile.ZIP_DEFLATED)
            book.write(chapter.audio, f"OEBPS/audio/c{n:03d}.mp3", compress_type=zipfile.ZIP_STORED)
        if cover and cover_name:
            book.writestr(f"OEBPS/images/{cover_name[0]}", cover[0], compress_type=zipfile.ZIP_STORED)
    return output
