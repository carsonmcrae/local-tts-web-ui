# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for verified model downloads (no real network: httpx MockTransport).

Scope: Successful install with marker, checksum mismatch (nothing installed, partial removed), size
overrun, refusal of unknown artifacts, unapproved hosts and redirects to them, resume via HTTP Range
(and hosts that ignore it), retries with backoff, network/HTTP/redirect failures, verify/remove,
cancellation, and that the shipped manifest is well-formed (HTTPS, approved hosts, sha256 digests).
Does NOT belong: Engine loading.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from ltts.errors import NotFoundError
from ltts.jobs import JobCanceledError
from ltts.modelstore import store as store_module
from ltts.modelstore.store import (
    MARKER,
    RETRY_DELAYS_S,
    ChecksumError,
    DownloadError,
    ModelStore,
    load_manifest,
)

PAYLOAD = b"model-bytes-" * 1000
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()


def store_with(
    tmp_path: Path,
    handler,
    *,
    sha: str = DIGEST,
    size: int = len(PAYLOAD),
    url: str = "https://github.com/x/model.onnx",
) -> ModelStore:  # type: ignore[no-untyped-def]
    store = ModelStore(
        tmp_path / "models", reserve_mb=0, client_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    store.artifacts = {
        "test": type(store.artifact("kokoro-v1.0"))(
            id="test", engine="kokoro", label="Test", source="test", license="test",
            files=(type(store.artifact("kokoro-v1.0").files[0])(name="model.onnx", url=url, size=size, sha256=sha),),
        )
    }  # fmt: skip
    return store


def ok_handler(request: httpx.Request) -> httpx.Response:
    start = int(request.headers.get("range", "bytes=0-").split("=")[1].split("-")[0])
    status = 206 if start else 200
    return httpx.Response(status, content=PAYLOAD[start:])


def test_install_verifies_and_writes_marker(tmp_path: Path) -> None:
    store = store_with(tmp_path, ok_handler)
    progress: list[int] = []
    store.install("test", lambda done, total, name: progress.append(done), lambda: False)
    assert store.is_installed("test") and store.verify("test")
    assert (tmp_path / "models" / "test" / MARKER).is_file()
    assert progress[-1] == len(PAYLOAD)
    store.remove("test")
    assert not store.is_installed("test")


def test_checksum_mismatch_installs_nothing(tmp_path: Path) -> None:
    store = store_with(tmp_path, ok_handler, sha="0" * 64)
    with pytest.raises(ChecksumError):
        store._download_with_retry(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)
    assert not list(tmp_path.glob("model.onnx*"))


def test_oversized_download_is_aborted(tmp_path: Path) -> None:
    store = store_with(tmp_path, ok_handler, size=10)
    with pytest.raises(DownloadError):
        store._download(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)


def test_unapproved_host_is_refused(tmp_path: Path) -> None:
    store = store_with(tmp_path, ok_handler, url="https://evil.example/model.onnx")
    with pytest.raises(DownloadError, match="unapproved"):
        store._download(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)


def test_redirect_to_unapproved_host_is_refused(tmp_path: Path) -> None:
    def redirect(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://evil.example/payload"})

    store = store_with(tmp_path, redirect)
    with pytest.raises(DownloadError, match="unapproved"):
        store._download(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)


def test_redirect_to_approved_cdn_is_followed(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "github.com":
            return httpx.Response(302, headers={"location": "https://release-assets.githubusercontent.com/f"})
        return ok_handler(request)

    store = store_with(tmp_path, handler)
    store.install("test", lambda *_: None, lambda: False)
    assert store.verify("test")


def test_partial_download_resumes_with_range(tmp_path: Path) -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("range"))
        return ok_handler(request)

    store = store_with(tmp_path, handler)
    folder = tmp_path / "models" / "test"
    folder.mkdir(parents=True)
    (folder / "model.onnx.part").write_bytes(PAYLOAD[:5000])
    store.install("test", lambda *_: None, lambda: False)
    assert seen == ["bytes=5000-"] and store.verify("test")


def test_cancellation_stops_download(tmp_path: Path) -> None:
    store = store_with(tmp_path, ok_handler)
    with pytest.raises(JobCanceledError):
        store.install("test", lambda *_: None, lambda: True)
    assert not store.is_installed("test")


def test_shipped_manifest_is_pinned_and_https() -> None:
    artifacts, hosts = load_manifest()
    assert {"kokoro-v1.0", "chatterbox-turbo"} <= set(artifacts)
    for artifact in artifacts.values():
        for file in artifact.files:
            assert file.url.startswith("https://")
            assert re.fullmatch(r"[0-9a-f]{64}", file.sha256)
            assert file.size > 0
            host = file.url.split("/")[2]
            assert host in hosts
    raw = json.loads((Path(__file__).parents[1] / "src/ltts/modelstore/manifest.json").read_text("utf-8"))
    assert (
        "chatterbox-turbo" in raw["artifacts"]
        and "/resolve/749d1c1a" in raw["artifacts"]["chatterbox-turbo"]["files"][0]["url"]
    )


def test_unknown_artifacts_and_hosts_are_refused(tmp_path: Path) -> None:
    store = store_with(tmp_path, ok_handler)
    with pytest.raises(NotFoundError) as error:
        store.artifact("no-such-model")
    assert error.value.code == "artifact_not_found"
    assert not store.host_allowed(None) and not store.host_allowed("")


@pytest.fixture
def no_backoff(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    delays: list[float] = []
    monkeypatch.setattr(store_module, "time", SimpleNamespace(sleep=delays.append))  # this module only
    return delays


def flaky(failures: int) -> tuple[list[int], Callable[[httpx.Request], httpx.Response]]:
    """A host that answers 503 ``failures`` times before serving the payload."""
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(503) if len(attempts) <= failures else ok_handler(request)

    return attempts, handler


def test_failed_downloads_are_retried_with_backoff(tmp_path: Path, no_backoff: list[float]) -> None:
    attempts, handler = flaky(failures=2)
    store = store_with(tmp_path, handler)
    store.install("test", lambda *_: None, lambda: False)
    assert len(attempts) == 3 and no_backoff == [2.0, 5.0] and store.verify("test")


def test_downloads_give_up_after_the_last_retry(tmp_path: Path, no_backoff: list[float]) -> None:
    attempts, handler = flaky(failures=10)
    store = store_with(tmp_path, handler)
    with pytest.raises(DownloadError, match="HTTP 503"):
        store.install("test", lambda *_: None, lambda: False)
    assert len(attempts) == 4 and no_backoff == list(RETRY_DELAYS_S)


def test_a_cancelled_install_is_not_retried(tmp_path: Path, no_backoff: list[float]) -> None:
    attempts, handler = flaky(failures=10)
    store = store_with(tmp_path, handler)
    with pytest.raises(DownloadError):
        store._download_with_retry(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: True)
    assert len(attempts) == 1 and no_backoff == []


def test_an_oversized_partial_file_is_restarted(tmp_path: Path) -> None:
    (tmp_path / "model.onnx.part").write_bytes(PAYLOAD + b"extra")
    store = store_with(tmp_path, ok_handler)
    store._download(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)
    assert (tmp_path / "model.onnx").read_bytes() == PAYLOAD


def test_a_host_that_ignores_ranges_is_downloaded_from_the_start(tmp_path: Path) -> None:
    (tmp_path / "model.onnx.part").write_bytes(PAYLOAD[:5000])
    store = store_with(tmp_path, lambda request: httpx.Response(200, content=PAYLOAD))
    store._download(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)
    assert (tmp_path / "model.onnx").read_bytes() == PAYLOAD


def network_down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("connection refused", request=request)


@pytest.mark.parametrize(
    ("handler", "message"),
    [
        (network_down, "Network error while downloading model.onnx: ConnectError"),
        (lambda request: httpx.Response(200, content=PAYLOAD[:100]), "was incomplete"),
        (lambda request: httpx.Response(404), "answered HTTP 404"),
        (lambda request: httpx.Response(302, headers={"location": "https://github.com/again"}), "Too many redirects"),
    ],
)
def test_download_failures_are_explained(
    tmp_path: Path, handler: Callable[[httpx.Request], httpx.Response], message: str
) -> None:
    store = store_with(tmp_path, handler)
    with pytest.raises(DownloadError, match=message):
        store._download(store.artifact("test").files[0], tmp_path, lambda n: None, lambda: False)
