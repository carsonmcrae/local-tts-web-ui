"""Purpose: A real ``ChatterboxEngine`` wired to ``fake_worker.py`` instead of an installed runtime.

Scope: Builds the engine with an installed-looking model store, no GPU, no disk checks, ``find_uv``
pointing at this Python, and an empty stand-in venv interpreter, so tests drive the real engine code
over the real stdio protocol without PyTorch.
Does NOT belong: Test cases (test_chatterbox_update.py, test_chatterbox_studio.py).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from ltts.config import Settings
from ltts.engines import chatterbox as chatterbox_module
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.modelstore.store import ModelStore

FAKE_WORKER = Path(__file__).with_name("fake_worker.py")


def fake_chatterbox(settings: Settings, project: Path, monkeypatch: pytest.MonkeyPatch) -> ChatterboxEngine:
    store = ModelStore(settings.resolved_models_dir, reserve_mb=0)
    monkeypatch.setattr(store, "is_installed", lambda _artifact: True)
    monkeypatch.setattr(store, "install", lambda *_args: None)
    monkeypatch.setattr(chatterbox_module, "find_uv", lambda: sys.executable)
    monkeypatch.setattr(chatterbox_module, "detect_gpus", lambda: ())
    monkeypatch.setattr(chatterbox_module, "ensure_free_space", lambda *_args: None)
    engine = ChatterboxEngine(settings, store, project_dir=project)
    monkeypatch.setattr(engine, "_worker_argv", lambda: [sys.executable, "-I", str(FAKE_WORKER)])
    python = engine._python
    python.parent.mkdir(parents=True)
    python.write_bytes(b"")  # the venv's interpreter only has to exist; the fake worker runs instead
    return engine
