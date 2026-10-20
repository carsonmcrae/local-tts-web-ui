# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for the extraction sandbox's protocol and the ingestion service's limits.

Scope: The sandbox child function run in-process (success, application errors, memory exhaustion,
unexpected crashes), the parent side with a stand-in process (child exited without a reply,
reported crash), the Linux memory cap without a hard limit, and DocumentService behaviour when
extraction slots are busy, when extraction is isolated, and for over-long, blank or textless input.
Does NOT belong: Real subprocess isolation and timeouts (test_document_security.py).
"""

from __future__ import annotations

import multiprocessing
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from ltts.config import Settings
from ltts.container import Services
from ltts.documents import sandbox
from ltts.documents import service as service_module
from ltts.documents.service import DocumentService
from ltts.documents.structures import Block, DocumentType, ExtractedSection, Extraction, ExtractionLimits
from ltts.errors import BusyError, DocumentExtractionError

LIMITS = ExtractionLimits(1_000_000, 50, 100, 20 * 1024 * 1024, 200)


@pytest.fixture
def no_memory_cap(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """The child function runs in this process here, so it must never cap the test runner's memory."""
    capped: list[int] = []
    monkeypatch.setattr(sandbox, "_limit_memory", capped.append)
    return capped


def run_child(path: Path, doc_type: str = "txt") -> Any:
    receiver, sender = multiprocessing.Pipe(duplex=False)
    sandbox._child(sender, str(path), doc_type, "title", LIMITS, 256)
    reply = receiver.recv()
    with pytest.raises(EOFError):
        receiver.recv()  # the child always closes its end
    return reply


def test_child_sends_the_extraction(tmp_path: Path, no_memory_cap: list[int]) -> None:
    path = tmp_path / "a.txt"
    path.write_bytes(b"Hello from the sandbox.")
    status, extraction = run_child(path)
    assert status == "ok" and extraction.sections[0].blocks[0].text == "Hello from the sandbox."
    assert no_memory_cap == [256]


def test_child_reports_application_errors(tmp_path: Path, no_memory_cap: list[int]) -> None:
    path = tmp_path / "blank.txt"
    path.write_bytes(b"   ")
    assert run_child(path) == ("app_error", ("empty_document", "No readable text was found in this document."))


@pytest.mark.parametrize(
    ("failure", "reply"),
    [
        (MemoryError, ("app_error", ("resource_limit", "The document needed too much memory to process."))),
        (RuntimeError, ("crash", "RuntimeError")),
    ],
)
def test_child_reports_memory_exhaustion_and_crashes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_memory_cap: list[int], failure: type[Exception], reply: Any
) -> None:
    def explode(*_: object) -> None:
        raise failure

    monkeypatch.setattr(sandbox, "extract", explode)
    assert run_child(tmp_path / "any.txt") == reply


class _Connection:
    def __init__(self, reply: object) -> None:
        self.reply = reply
        self.closed = False

    def poll(self, _timeout: float) -> bool:
        return True

    def recv(self) -> object:
        if isinstance(self.reply, BaseException):
            raise self.reply
        return self.reply

    def close(self) -> None:
        self.closed = True


class _ExitedProcess:
    """A child that has already exited by the time the parent checks on it."""

    def __init__(self, **_: object) -> None:
        self.joined = False

    def start(self) -> None:
        return None

    def is_alive(self) -> bool:
        return False

    def kill(self) -> None:
        raise AssertionError("an exited process must not be killed")

    def join(self, timeout: float) -> None:
        self.joined = True


def isolate_with(monkeypatch: pytest.MonkeyPatch, reply: object) -> _Connection:
    parent = _Connection(reply)
    context = SimpleNamespace(Pipe=lambda duplex: (parent, _Connection(None)), Process=_ExitedProcess)
    monkeypatch.setattr(sandbox, "_CONTEXT", context)
    return parent


@pytest.mark.parametrize(
    ("reply", "code"),
    [(EOFError(), "extraction_crashed"), (("crash", "ValueError"), "corrupt_document")],
)
def test_parent_maps_a_silent_exit_or_crash_to_clean_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reply: object, code: str
) -> None:
    parent = isolate_with(monkeypatch, reply)
    with pytest.raises(DocumentExtractionError) as error:
        sandbox.extract_isolated(tmp_path / "x.pdf", DocumentType.PDF, "x", LIMITS, timeout_s=5, memory_mb=256)
    assert error.value.code == code and parent.closed


def test_memory_cap_without_a_hard_limit_uses_the_configured_size(monkeypatch: pytest.MonkeyPatch) -> None:
    applied: list[tuple[int, int]] = []
    resource = SimpleNamespace(
        RLIMIT_AS=9, RLIM_INFINITY=-1, getrlimit=lambda _: (-1, -1), setrlimit=lambda _, value: applied.append(value)
    )
    monkeypatch.setattr(sandbox, "platform", SimpleNamespace(system=lambda: "Linux"))
    monkeypatch.setattr(sandbox, "importlib", SimpleNamespace(import_module=lambda _: resource))
    sandbox._limit_memory(64)
    assert applied == [(64 * 1024 * 1024, 64 * 1024 * 1024)]


# -- DocumentService ------------------------------------------------------------------
def service_for(services: Services, *, isolate: bool = False, **settings: Any) -> DocumentService:
    custom: Settings = services.settings.model_copy(update=settings)
    return DocumentService(custom, services.document_repo, isolate=isolate)


def test_busy_extraction_slots_are_reported(
    tmp_path: Path, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(service_module, "_BUSY_WAIT_S", 0.01)
    documents = service_for(services, max_concurrent_extractions=1)
    assert documents._slots.acquire(timeout=1)  # another upload holds the only slot
    upload = tmp_path / "queued.upload"
    upload.write_bytes(b"Waiting for a slot.")
    with pytest.raises(BusyError):
        documents.ingest_file(upload, "queued.txt", 19, "0" * 64)
    assert not upload.exists()  # the temporary upload is removed either way


def test_isolated_extraction_gets_the_configured_limits(
    tmp_path: Path, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_isolated(
        path: Path, doc_type: DocumentType, title: str, limits: ExtractionLimits, **kwargs: Any
    ) -> Extraction:
        calls.append({"type": doc_type, "title": title, "limits": limits, **kwargs})
        return Extraction(title=None, sections=[ExtractedSection("Text", [Block("paragraph", "Isolated words.")])])

    monkeypatch.setattr(service_module, "extract_isolated", fake_isolated)
    documents = service_for(services, isolate=True, extraction_timeout_s=12.5, extraction_memory_mb=512)
    upload = tmp_path / "doc.upload"
    upload.write_bytes(b"Isolated words.")
    detail = documents.ingest_file(upload, "notes.txt", 15, "0" * 64)
    assert detail.title == "Isolated words." and detail.filename == "notes.txt"
    assert calls == [
        {"type": DocumentType.TEXT, "title": "notes", "limits": documents.limits, "timeout_s": 12.5, "memory_mb": 512}
    ]
    assert documents._slots.acquire(timeout=1)  # the extraction slot was released afterwards


def test_extraction_without_any_segment_is_rejected(
    tmp_path: Path, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    empty = Extraction(title="Hollow", sections=[ExtractedSection("Hollow", [Block("paragraph", "")])])
    monkeypatch.setattr(service_module, "extract", lambda *_: empty)
    upload = tmp_path / "hollow.upload"
    upload.write_bytes(b"x")
    with pytest.raises(DocumentExtractionError) as error:
        service_for(services).ingest_file(upload, "hollow.txt", 1, "0" * 64)
    assert error.value.code == "empty_document"


def test_pasted_text_limits(services: Services) -> None:
    documents = service_for(services, max_text_chars=1_000)
    with pytest.raises(DocumentExtractionError) as too_long:
        documents.ingest_text("a" * 1_001, None)
    assert too_long.value.code == "text_limit"
    with pytest.raises(DocumentExtractionError) as blank:
        documents.ingest_text(" \n\t ", None)
    assert blank.value.code == "empty_document"
