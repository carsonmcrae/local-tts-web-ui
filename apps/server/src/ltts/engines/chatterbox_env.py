"""Purpose: Build and track the Chatterbox worker's isolated, locked Python environment.

Scope: Locates the pinned uv, runs ``uv sync --frozen`` for one extra (``cpu``/``cuda``) of the
worker project into the engine's venv with live job progress, fingerprints the worker's ``uv.lock``
with SHA-256, and reads/writes the ``installed.json`` marker recording which lock and extra the
environment was built from, so a changed lock (a security fix, a Dependabot bump) shows up as an
available update instead of being missed by existing installs.
Does NOT belong: Model weights (``modelstore``), the worker process (``worker_client.py``) or the
engine's install/update policy (``chatterbox.py``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from ltts.common import utc_now
from ltts.config import REPO_ROOT
from ltts.errors import EngineUnavailableError
from ltts.jobs import JobContext

log = logging.getLogger("ltts.engines.chatterbox")
PROJECT_DIR = REPO_ROOT / "apps" / "chatterbox-worker"
INSTALL_FAILED = "Installing the Chatterbox runtime failed. Check your connection and the server log, then retry."
UPDATE_FAILED = (
    "Updating the Chatterbox runtime failed. Your installation was not removed; check your connection and the "
    "server log, then retry the update."
)


def find_uv() -> str | None:
    explicit = os.environ.get("LTTS_UV_BIN")
    if explicit and Path(explicit).is_file():
        return explicit
    exe = "uv.exe" if sys.platform == "win32" else "uv"
    pinned = sorted((REPO_ROOT / ".tools" / "uv").glob(f"*/{exe}"))
    return str(pinned[-1]) if pinned else shutil.which("uv")


def lock_digest(project_dir: Path) -> str | None:
    """SHA-256 of the worker's ``uv.lock``, or ``None`` when it is missing (nothing to compare with)."""
    try:
        return hashlib.sha256((project_dir / "uv.lock").read_bytes()).hexdigest()
    except OSError:
        return None


def read_marker(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_marker(path: Path, extra: str, lock_sha256: str | None, venv: Path, installed_at: str | None = None) -> None:
    """Record a verified environment. Markers written before lock tracking lack ``lockSha256``."""
    now = utc_now()
    marker = {"option": extra, "extra": extra, "lockSha256": lock_sha256, "installedAt": installed_at or now,
              "syncedAt": now, "envBytes": tree_bytes(venv)}  # fmt: skip
    staging = path.with_suffix(".tmp")
    staging.write_text(json.dumps(marker), encoding="utf-8")
    staging.replace(path)  # atomic: a crash never leaves a half-written marker behind


def sync_environment(uv: str, project_dir: Path, venv: Path, extra: str, context: JobContext, *, update: bool) -> None:
    """Make ``venv`` match the committed lock exactly; uv only replaces the packages that differ.

    Nothing is deleted on failure: uv downloads and hash-checks every changed package before it modifies
    the environment, so a dropped connection or a full disk during download leaves the old packages in place.
    """
    env = {**os.environ, "UV_PROJECT_ENVIRONMENT": str(venv),
           "UV_PYTHON_INSTALL_DIR": str(REPO_ROOT / ".tools" / "python"), "UV_NO_PROGRESS": "1"}  # fmt: skip
    # Popen's encoding argument needs Python 3.6; the server requires 3.11.
    # nosemgrep: python.lang.compatibility.python36.python36-compatibility-Popen2
    proc = subprocess.Popen(  # noqa: S603 - fixed argv; uv verifies hashes from the committed lockfile
        [uv, "sync", "--frozen", "--no-dev", "--project", str(project_dir), "--extra", extra],
        cwd=project_dir, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
    )  # fmt: skip
    tail: list[str] = []
    for line in proc.stdout or ():
        tail = [*tail[-20:], line.rstrip()]
        if context.canceled:
            proc.kill()
            context.check()
        if line.strip():
            context.update(0.05, f"{'Updating' if update else 'Installing'} runtime: {line.strip()[:120]}")
    if proc.wait() != 0:
        log.error("chatterbox environment sync failed:\n%s", "\n".join(tail))
        if update:
            raise EngineUnavailableError(UPDATE_FAILED, code="update_failed")
        raise EngineUnavailableError(INSTALL_FAILED, code="install_failed")


def tree_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())
