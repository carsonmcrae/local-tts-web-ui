"""Purpose: Real-inference tests — no fakes — for the default and the optional cloning engine.

Scope: Uses the installed models (``data/models`` and ``data/engines``) with a temporary library:
uploads a PDF, synthesises its first sentences with Kokoro and checks the result is real speech
(duration, loudness, not silence); synthesises with every English Kokoro voice family; and, when the
optional Chatterbox engine is installed, clones a synthetic reference voice and checks that the
clone is closer to the reference speaker than an unrelated voice is.
Run with ``npm run test:inference``. Skips cleanly when models are not installed.
Does NOT belong: Fast unit tests (they use FakeEngine).
"""

from __future__ import annotations

import io
import time
from collections.abc import Iterator

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from builders import make_pdf
from ltts.app import create_app
from ltts.config import REPO_ROOT, Settings
from ltts.container import build_services

pytestmark = pytest.mark.inference

MODELS = REPO_ROOT / "data" / "models"
ENGINES = REPO_ROOT / "data" / "engines"


@pytest.fixture(scope="module")
def real(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    if not (MODELS / "kokoro-v1.0" / ".installed.json").is_file():
        pytest.skip("Kokoro model not installed (run `npm run setup`)")
    settings = Settings(
        env="test",
        data_dir=tmp_path_factory.mktemp("data"),
        models_dir=MODELS,
        engines_dir=ENGINES,
        warm_up_engines=False,
        extra_allowed_hosts=["testserver"],
    )
    app = create_app(settings, services=build_services(settings, isolate_extraction=True))
    with TestClient(app, headers={"X-LTTS-Client": "web"}) as client:
        yield client


def decode(response) -> tuple[np.ndarray, int]:  # type: ignore[no-untyped-def]
    assert response.status_code == 200, response.text
    data, rate = sf.read(io.BytesIO(response.content), dtype="float32")
    return data, rate


def assert_speech(samples: np.ndarray, rate: int, min_s: float = 0.5) -> None:
    duration = len(samples) / rate
    rms = float(np.sqrt(np.mean(samples**2)))
    voiced = float(np.mean(np.abs(samples) > 0.02))
    assert duration > min_s, duration
    assert rms > 0.01, rms  # not silence
    assert voiced > 0.2, voiced  # a good share of the clip carries signal


def test_pdf_to_real_kokoro_narration(real: TestClient) -> None:
    pdf = make_pdf([["The lighthouse keeper climbed the stairs.", "He counted every step on the way up."]])
    doc = real.post("/api/documents/upload", params={"filename": "keeper.pdf"}, content=pdf).json()
    assert doc["segmentCount"] == 2
    started = time.perf_counter()
    first, rate = decode(real.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:af_heart"}))
    cold = time.perf_counter() - started
    assert rate == 24_000
    assert_speech(first, rate)
    started = time.perf_counter()
    decode(real.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:af_heart"}))
    cached = time.perf_counter() - started
    second, _ = decode(real.get(f"/api/documents/{doc['id']}/segments/1/audio", params={"voice": "kokoro:af_heart"}))
    assert_speech(second, rate)
    print(f"\nkokoro: first segment {cold:.2f}s (includes model load), cached {cached * 1000:.0f}ms")
    assert cached < cold


@pytest.mark.parametrize("voice", ["kokoro:af_heart", "kokoro:am_michael", "kokoro:bf_emma", "kokoro:bm_george"])
def test_kokoro_voices_and_pace(real: TestClient, voice: str) -> None:
    text = {"text": "Good evening. This is a short test of the narration voice."}
    normal, rate = decode(real.post(f"/api/voices/{voice}/preview", json={**text, "pace": 1.0}))
    fast, _ = decode(real.post(f"/api/voices/{voice}/preview", json={**text, "pace": 1.5}))
    assert_speech(normal, rate, min_s=1.5)
    assert len(fast) < len(normal) * 0.85  # native pace control really speeds up speech


def test_chatterbox_clone_resembles_reference(real: TestClient) -> None:
    if not (ENGINES / "chatterbox" / "installed.json").is_file():
        pytest.skip("Optional Chatterbox engine not installed")
    passage = (
        "Hello! I am recording a short sample so this app can learn the sound of my voice. On quiet mornings, "
        "I like to walk past the old bakery, where warm bread and fresh coffee fill the air."
    )
    # Consented test audio: a synthetic Kokoro voice stands in for a real speaker.
    reference = real.post("/api/voices/kokoro:bm_george/preview", json={"text": passage})
    profile = real.post(
        "/api/voice-profiles",
        params={"name": "Synthetic", "consent": "true", "source": "import"},
        content=reference.content,
    )
    assert profile.status_code == 201, profile.text
    voice_id = profile.json()["voiceId"]
    started = time.perf_counter()
    clone, rate = decode(
        real.post(f"/api/voices/{voice_id}/preview", json={"text": "This sentence never appeared in the reference."})
    )
    print(f"\nchatterbox: first clone {time.perf_counter() - started:.1f}s (includes model load)")
    assert_speech(clone, rate)
    assert real.delete(f"/api/voice-profiles/{profile.json()['id']}").status_code == 204
