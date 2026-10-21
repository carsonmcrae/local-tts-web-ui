# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for audiobook outputs: M4B with chapters, read-along EPUB 3 and document covers.

Scope: FFMETADATA escaping and the exact ffmpeg command (no shell, a copied cover); an M4B export
through a stand-in ffmpeg (with subtitles too) and, when this machine has ffmpeg, a real one checked
with ffprobe; a clear failure without ffmpeg, when ffmpeg fails or when the run is stopped; a
read-along EPUB whose package, navigation, chapters and SMIL timings are valid XML and agree with each
other (with hostile text escaped); and the audiobook details and cover endpoints (JPEG/PNG only,
size-limited, viewed, removed by hand and with the document).
Does NOT belong: Resuming exports (test_resumable_exports.py).
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from defusedxml import ElementTree
from fastapi.testclient import TestClient

from conftest import wait_job
from ltts.container import Services
from ltts.documents.details import MAX_COVER_BYTES
from ltts.errors import UnsupportedDocumentError
from ltts.exports import m4b
from ltts.exports.assemble import Chapter

BACKSLASH = chr(92)
TEXT = "\n\n".join(
    [
        "Chapter 1",
        "The ferry docked at noon. <script>alert(1)</script> & friends waved from the pier.",
        "Chapter 2",
        "By evening the harbour was quiet again.",
    ]
)
PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64
OPF = "{http://www.idpf.org/2007/opf}"
SMIL = "{http://www.w3.org/ns/SMIL}"


def document(client: TestClient) -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": TEXT, "title": "Ferry: Book 1"}).json()["id"]
    return doc_id


def test_ffmetadata_escapes_every_special_character() -> None:
    raw = f"a=b;c#d{BACKSLASH}e{chr(10)}f"
    escaped = m4b.escape(raw)
    assert escaped == f"a{BACKSLASH}=b{BACKSLASH};c{BACKSLASH}#d{BACKSLASH * 2}e{BACKSLASH}{chr(10)}f"
    text = m4b.metadata({"title": "T=1", "artist": ""}, [Chapter(0, "One; two", 0.0, 1.5)])
    assert text.startswith(";FFMETADATA1") and "artist=" not in text
    assert f"title=One{BACKSLASH}; two" in text and "START=0" in text and "END=1500" in text


def test_the_ffmpeg_command_is_fixed_and_copies_the_cover(tmp_path: Path) -> None:
    args = m4b.command(Path("ffmpeg"), tmp_path / "a.wav", tmp_path / "m.txt", tmp_path / "c.png", tmp_path / "o.m4b")
    assert args[-2:] == ["ipod", str(tmp_path / "o.m4b")] and "-map_chapters" in args
    assert args[args.index("-c:v") + 1] == "copy" and "attached_pic" in args  # never decoded
    assert "-map" in args and "2:v" not in m4b.command(Path("f"), Path("a"), Path("m"), None, Path("o"))


def test_find_ffmpeg_accepts_only_an_ffmpeg_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LTTS_FFMPEG", raising=False)
    monkeypatch.setattr(m4b.shutil, "which", lambda _name: None)
    assert m4b.find_ffmpeg() is None  # nothing configured and nothing on the PATH
    monkeypatch.setenv("LTTS_FFMPEG", str(tmp_path / "missing" / "ffmpeg.exe"))
    assert m4b.find_ffmpeg() is None
    other = tmp_path / "notffmpeg.exe"
    other.write_bytes(b"")
    monkeypatch.setenv("LTTS_FFMPEG", str(other))
    assert m4b.find_ffmpeg() is None
    real = tmp_path / "ffmpeg.exe"
    real.write_bytes(b"")
    monkeypatch.setenv("LTTS_FFMPEG", str(real))
    assert m4b.find_ffmpeg() == real


FAKE_FFMPEG = """
import shutil, sys
args = sys.argv[1:]
meta = open(args[args.index("-i", args.index("-i") + 1) + 1], encoding="utf-8").read()
assert meta.count("[CHAPTER]") == 2, meta
shutil.copyfile(args[args.index("-i") + 1], args[-1])
"""


def test_an_m4b_export_through_ffmpeg(
    client: TestClient, services: Services, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = tmp_path / "fake_ffmpeg.py"
    script.write_text(FAKE_FFMPEG, encoding="utf-8")
    monkeypatch.setattr(m4b, "find_ffmpeg", lambda: Path(sys.executable))
    real_command = m4b.command
    monkeypatch.setattr(m4b, "command", lambda *a: [sys.executable, str(script), *real_command(*a)[1:]])
    doc_id = document(client)
    client.put(f"/api/documents/{doc_id}/details", json={"author": "A. Writer", "narrator": "Me"})
    client.put(f"/api/documents/{doc_id}/cover", content=PNG)
    job = wait_job(client, client.post("/api/exports", json={"documentId": doc_id, "voiceId": "kokoro:alpha",
                                                            "format": "m4b"}).json()["id"])  # fmt: skip
    assert job["status"] == "succeeded", job
    assert job["result"]["filename"] == "Ferry Book 1.m4b"
    download = client.get(f"/api/exports/{job['id']}/download")
    assert download.headers["content-type"] == "audio/mp4"
    assert not list(services.exports.folder(job["id"]).glob("*.wav"))  # the working WAV is removed
    body = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "m4b", "captions": True}
    subtitled = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    assert subtitled["status"] == "succeeded" and subtitled["result"]["filename"].endswith("(M4B with subtitles).zip")
    with zipfile.ZipFile(services.exports.folder(subtitled["id"]) / subtitled["result"]["filename"]) as archive:
        assert sorted(Path(name).suffix for name in archive.namelist()) == [".m4b", ".srt"]


class FakeFfmpeg:
    """Stands in for the ffmpeg process: still running, or finished with an exit code and an error."""

    def __init__(self, returncode: int | None, stderr: bytes | None = None) -> None:
        self.returncode = returncode
        self.stderr = io.BytesIO(stderr) if stderr is not None else None
        self.killed = False

    def poll(self) -> int | None:
        return self.returncode

    def kill(self) -> None:
        self.killed, self.returncode = True, -9

    def wait(self) -> int | None:
        return self.returncode


def test_writing_an_m4b_can_be_stopped_and_says_what_ffmpeg_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    processes: list[FakeFfmpeg] = []
    answers = iter([FakeFfmpeg(None), FakeFfmpeg(1, b"Unknown encoder 'aac'")])

    def popen(_args: list[str], **_options: Any) -> FakeFfmpeg:
        processes.append(next(answers))
        return processes[-1]

    monkeypatch.setattr(m4b, "find_ffmpeg", lambda: Path("ffmpeg"))
    monkeypatch.setattr(m4b, "subprocess", SimpleNamespace(Popen=popen, DEVNULL=-3, PIPE=-1))
    book = m4b.Book({"title": "Ferry"}, [Chapter(0, "One", 0.0, 1.0)])
    audio, output = tmp_path / "Ferry.wav", tmp_path / "Ferry.m4b"
    with pytest.raises(m4b.FfmpegFailedError, match="was stopped"):
        m4b.write_m4b(audio, output, book, lambda: True, timeout_s=600)  # the export was paused or canceled
    assert processes[0].killed and not output.with_suffix(".ffmeta").exists()  # the chapter list is tidied away
    with pytest.raises(m4b.FfmpegFailedError, match="Unknown encoder 'aac'"):
        m4b.write_m4b(audio, output, book, lambda: False, timeout_s=600)
    assert not processes[1].killed and not output.exists()


def test_m4b_without_ffmpeg_fails_clearly(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(m4b, "find_ffmpeg", lambda: None)
    doc_id = document(client)
    body = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "m4b"}
    job = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    assert job["status"] == "failed" and job["errorCode"] == "ffmpeg_missing" and "MP3" in job["message"]


@pytest.mark.skipif(m4b.find_ffmpeg() is None, reason="ffmpeg isn't installed on this machine")
def test_a_real_m4b_has_chapters_tags_and_cover(client: TestClient, tmp_path: Path) -> None:
    doc_id = document(client)
    client.put(f"/api/documents/{doc_id}/details", json={"author": "A. Writer"})
    job = wait_job(client, client.post("/api/exports", json={"documentId": doc_id, "voiceId": "kokoro:alpha",
                                                            "format": "m4b"}).json()["id"])  # fmt: skip
    assert job["status"] == "succeeded", job
    book = tmp_path / "book.m4b"
    book.write_bytes(client.get(f"/api/exports/{job['id']}/download").content)
    ffmpeg = m4b.find_ffmpeg()
    assert ffmpeg is not None
    probe = ffmpeg.with_name(ffmpeg.name.replace("ffmpeg", "ffprobe"))
    if not probe.is_file():
        pytest.skip("ffprobe isn't next to ffmpeg")
    report = json.loads(
        subprocess.run(  # noqa: S603 - a fixed command on a file this test made
            [str(probe), "-v", "error", "-show_chapters", "-show_format", "-of", "json", str(book)],
            capture_output=True,
            check=True,
            timeout=60,
        ).stdout
    )
    assert [c["tags"]["title"] for c in report["chapters"]] == ["Chapter 1", "Chapter 2"]
    assert report["format"]["tags"]["title"] == "Ferry: Book 1" and report["format"]["tags"]["artist"] == "A. Writer"
    assert report["format"]["tags"]["genre"] == "Audiobook"


def test_a_read_along_epub_is_valid_and_synchronised(client: TestClient) -> None:
    doc_id = document(client)
    client.put(f"/api/documents/{doc_id}/details", json={"author": "A. Writer"})
    client.put(f"/api/documents/{doc_id}/cover", content=PNG)
    body = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "epub"}
    job = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    assert job["status"] == "succeeded", job
    content = client.get(f"/api/exports/{job['id']}/download").content
    book = zipfile.ZipFile(io.BytesIO(content))
    first = book.infolist()[0]
    assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED
    assert book.read("mimetype") == b"application/epub+zip"
    for name in book.namelist():
        if name.endswith((".opf", ".xhtml", ".smil", ".xml")):
            ElementTree.fromstring(book.read(name))  # well-formed XML, hostile text escaped
    opf = ElementTree.fromstring(book.read("OEBPS/package.opf"))
    items = {item.get("id"): item for item in opf.iter(f"{OPF}item")}
    assert items["c001"].get("media-overlay") == "mo001" and items["cover"].get("properties") == "cover-image"
    durations = [m for m in opf.iter(f"{OPF}meta") if m.get("property") == "media:duration"]
    assert len(durations) == 3  # the book and its two chapters
    smil = ElementTree.fromstring(book.read("OEBPS/smil/c001.smil"))
    pars = list(smil.iter(f"{SMIL}par"))
    chapter = book.read("OEBPS/text/c001.xhtml").decode("utf-8")
    assert len(pars) == 3 and "&lt;script&gt;" in chapter and "<script>" not in chapter
    for par in pars:
        target = par.find(f"{SMIL}text")
        audio = par.find(f"{SMIL}audio")
        assert target is not None and audio is not None
        assert f'id="{target.get("src", "").split("#")[1]}"' in chapter
        assert audio.get("clipBegin", "") < audio.get("clipEnd", "")


def test_details_and_cover_endpoints(client: TestClient, services: Services, tmp_path: Path) -> None:
    doc_id = document(client)
    url = f"/api/documents/{doc_id}"
    assert client.get(f"{url}/details").json() == {"author": None, "narrator": None, "description": None,
                                                    "hasCover": False}  # fmt: skip
    saved = client.put(f"{url}/details", json={"author": "  A. Writer ", "description": ""}).json()
    assert saved["author"] == "A. Writer" and saved["description"] is None
    assert client.get(f"{url}/cover").json()["error"]["code"] == "cover_not_found"
    big = tmp_path / "big.cover"
    with big.open("wb") as handle:
        handle.truncate(MAX_COVER_BYTES + 1)  # the store checks the size itself, whatever brought the file
    with pytest.raises(UnsupportedDocumentError) as too_large:
        services.details.set_cover(doc_id, big)
    assert too_large.value.code == "cover_too_large"
    assert client.put(f"{url}/cover", content=b"GIF89a....").json()["error"]["code"] == "unsupported_cover"
    assert client.put(f"{url}/cover", content=b"\xff\xd8\xff" + b"0" * (5 * 1024 * 1024 + 10)).status_code == 413
    assert client.put(f"{url}/cover", content=PNG).json()["hasCover"] is True
    cover = client.get(f"{url}/cover")
    assert cover.headers["content-type"] == "image/png" and cover.content == PNG
    assert client.delete(f"{url}/cover").status_code == 204  # removed by hand
    assert client.get(f"{url}/details").json()["hasCover"] is False
    client.put(f"{url}/cover", content=PNG)
    client.delete(url)
    assert services.details.cover(doc_id) is None
    assert client.get(f"/api/documents/{'0' * 32}/details").status_code == 404


def payload(response: Any) -> Any:
    return response.json()
