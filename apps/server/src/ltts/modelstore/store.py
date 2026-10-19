"""Purpose: Download, verify, install and remove model artifacts listed in ``manifest.json``.

Scope: HTTPS-only downloads restricted to approved hosts (checked after every redirect), resumable
``.part`` files, retries with backoff, exact size + SHA-256 verification before an atomic rename,
an install marker written only after every file verifies, and a full re-hash on demand. Model
files are data: nothing downloaded is ever executed.
Does NOT belong: Loading models into an inference runtime (engines).
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import time
from collections.abc import Callable
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from ltts.common import ensure_free_space, utc_now
from ltts.errors import AppError, NotFoundError
from ltts.jobs import JobCanceledError

log = logging.getLogger("ltts.models")
CHUNK = 1024 * 1024
RETRY_DELAYS_S = (2.0, 5.0, 15.0)
MARKER = ".installed.json"

ProgressFn = Callable[[int, int, str], None]
CancelFn = Callable[[], bool]


class DownloadError(AppError):
    status_code = 502
    code = "download_failed"


class ChecksumError(AppError):
    status_code = 502
    code = "checksum_mismatch"


@dataclass(frozen=True, slots=True)
class ArtifactFile:
    name: str
    url: str
    size: int
    sha256: str


@dataclass(frozen=True, slots=True)
class Artifact:
    id: str
    engine: str
    label: str
    source: str
    license: str
    files: tuple[ArtifactFile, ...]

    @property
    def total_bytes(self) -> int:
        return sum(f.size for f in self.files)


def load_manifest() -> tuple[dict[str, Artifact], frozenset[str]]:
    raw: dict[str, Any] = json.loads(resources.files("ltts.modelstore").joinpath("manifest.json").read_text("utf-8"))
    artifacts = {
        key: Artifact(
            id=key,
            engine=value["engine"],
            label=value["label"],
            source=value["source"],
            license=value["license"],
            files=tuple(ArtifactFile(**f) for f in value["files"]),
        )
        for key, value in raw["artifacts"].items()
    }
    return artifacts, frozenset(raw["allowedHosts"])


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


class ModelStore:
    def __init__(self, models_dir: Path, *, reserve_mb: int, client_factory: Callable[[], httpx.Client] | None = None):
        self.root = models_dir
        self.artifacts, self.allowed_hosts = load_manifest()
        self._reserve_mb = reserve_mb
        self._client_factory = client_factory or (lambda: httpx.Client(follow_redirects=False, timeout=60.0))

    def artifact(self, artifact_id: str) -> Artifact:
        try:
            return self.artifacts[artifact_id]
        except KeyError as exc:
            raise NotFoundError("Unknown model artifact.", code="artifact_not_found") from exc

    def directory(self, artifact_id: str) -> Path:
        return self.root / artifact_id

    def file_path(self, artifact_id: str, name: str) -> Path:
        return self.directory(artifact_id) / name

    def is_installed(self, artifact_id: str) -> bool:
        art = self.artifact(artifact_id)
        folder = self.directory(artifact_id)
        if not (folder / MARKER).is_file():
            return False
        return all((folder / f.name).is_file() and (folder / f.name).stat().st_size == f.size for f in art.files)

    def installed_bytes(self, artifact_id: str) -> int:
        folder = self.directory(artifact_id)
        return sum(p.stat().st_size for p in folder.glob("*") if p.is_file()) if folder.is_dir() else 0

    def verify(self, artifact_id: str) -> bool:
        art = self.artifact(artifact_id)
        return self.is_installed(artifact_id) and all(
            _sha256(self.file_path(artifact_id, f.name)) == f.sha256 for f in art.files
        )

    def remove(self, artifact_id: str) -> None:
        self.artifact(artifact_id)
        shutil.rmtree(self.directory(artifact_id), ignore_errors=True)

    def install(self, artifact_id: str, progress: ProgressFn, canceled: CancelFn) -> None:
        art = self.artifact(artifact_id)
        folder = self.directory(artifact_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / MARKER).unlink(missing_ok=True)
        pending = [f for f in art.files if not self._file_ok(folder / f.name, f)]
        remaining = sum(f.size for f in pending)
        ensure_free_space(folder, remaining, self._reserve_mb)
        done = art.total_bytes - remaining
        for file in pending:

            def report(received: int, base: int = done, name: str = file.name) -> None:
                progress(base + received, art.total_bytes, name)

            self._download_with_retry(file, folder, report, canceled)
            done += file.size
        marker = {
            "artifact": art.id,
            "files": {f.name: f.sha256 for f in art.files},
            "installedAt": utc_now(),
        }
        (folder / MARKER).write_text(json.dumps(marker, indent=2), encoding="utf-8")
        log.info("artifact installed", extra={"artifact": art.id})

    @staticmethod
    def _file_ok(path: Path, file: ArtifactFile) -> bool:
        return path.is_file() and path.stat().st_size == file.size and _sha256(path) == file.sha256

    def _download_with_retry(
        self, file: ArtifactFile, folder: Path, progress: Callable[[int], None], canceled: CancelFn
    ) -> None:
        for attempt, delay in enumerate((*RETRY_DELAYS_S, None), start=1):
            try:
                self._download(file, folder, progress, canceled)
                return
            except DownloadError as exc:
                if delay is None or canceled():
                    raise
                log.warning("download retry", extra={"file": file.name, "attempt": attempt, "reason": exc.message})
                time.sleep(delay)

    def host_allowed(self, host: str | None) -> bool:
        """Exact entries match one host; entries starting with '.' match that domain's subdomains (CDNs)."""
        if not host:
            return False
        return any(host == entry if not entry.startswith(".") else host.endswith(entry) for entry in self.allowed_hosts)

    def _check_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not self.host_allowed(parsed.hostname):
            raise DownloadError(f"Refusing to download from an unapproved location ({parsed.hostname}).")

    def _download(self, file: ArtifactFile, folder: Path, progress: Callable[[int], None], canceled: CancelFn) -> None:
        part = folder / f"{file.name}.part"
        offset = part.stat().st_size if part.is_file() else 0
        if offset > file.size:
            part.unlink()
            offset = 0
        try:
            with self._client_factory() as client:
                response = self._open(client, file.url, offset)
                try:
                    if response.status_code == 200 and offset:
                        offset = 0  # server ignored the range request; start over
                    with part.open("ab" if offset else "wb") as handle:
                        received = offset
                        for chunk in response.iter_bytes(CHUNK):
                            if canceled():
                                raise JobCanceledError
                            received += len(chunk)
                            if received > file.size:
                                raise DownloadError("The download is larger than expected.")
                            handle.write(chunk)
                            progress(received)
                finally:
                    response.close()
        except httpx.HTTPError as exc:
            raise DownloadError(f"Network error while downloading {file.name}: {type(exc).__name__}.") from exc
        if part.stat().st_size != file.size:
            raise DownloadError(f"The download of {file.name} was incomplete.")
        if _sha256(part) != file.sha256:
            part.unlink()
            raise ChecksumError(f"{file.name} failed its checksum. It was deleted and nothing was installed.")
        part.replace(folder / file.name)

    def _open(self, client: httpx.Client, url: str, offset: int) -> httpx.Response:
        headers = {"Range": f"bytes={offset}-"} if offset else {}
        for _ in range(8):
            self._check_url(url)
            response = client.send(client.build_request("GET", url, headers=headers), stream=True)
            if response.is_redirect and "location" in response.headers:
                url = str(response.url.join(response.headers["location"]))
                response.close()
                continue
            if response.status_code not in (200, 206):
                response.close()
                raise DownloadError(f"The model host answered HTTP {response.status_code}.")
            return response
        raise DownloadError("Too many redirects.")
