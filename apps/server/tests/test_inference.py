"""Purpose: Real-inference tests — no fakes — for the default and the optional cloning engine.

Scope: Uses the installed models (``data/models`` and ``data/engines``) with a temporary library:
uploads a PDF, synthesises its first sentences with Kokoro and checks the result is real speech
(duration, loudness, not silence); synthesises with every English Kokoro voice family; and, when the
optional Chatterbox engine is installed, clones a synthetic reference voice and checks that the
clone is closer to the reference speaker than an unrelated voice is, and builds a studio voice from
several takes: a saved voice reproduces identical audio with the same seed and resembles the speaker.
Run with ``npm run test:inference``. Skips cleanly when models are not installed.
Does NOT belong: Fast unit tests (they use FakeEngine).
"""

from __future__ import annotations

import io
import time
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from builders import make_pdf
from ltts.app import create_app
from ltts.config import REPO_ROOT, Settings
from ltts.container import Services, build_services
from ltts.engines.base import Audition, SpeakerIdentity
from ltts.engines.chatterbox import ChatterboxEngine

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


def test_chatterbox_clone_resembles_reference(real: TestClient, tmp_path: Path) -> None:
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
    unrelated = real.post("/api/voices/kokoro:af_heart/preview", json={"text": passage})
    paths = [
        save(tmp_path / "reference.wav", reference),
        tmp_path / "clone.wav",
        save(tmp_path / "other.wav", unrelated),
    ]
    sf.write(paths[1], clone, rate)
    ref, cloned, other = (unit(take.speaker_emb) for take in chatterbox(real).measure_takes(paths))
    print(f"chatterbox: clone similarity {ref @ cloned:.3f}, unrelated voice {ref @ other:.3f}")
    assert ref @ cloned > ref @ other + 0.05
    assert real.delete(f"/api/voice-profiles/{profile.json()['id']}").status_code == 204


def test_chatterbox_studio_voice_is_reproducible_and_resembles_the_speaker(real: TestClient, tmp_path: Path) -> None:
    if not (ENGINES / "chatterbox" / "installed.json").is_file():
        pytest.skip("Optional Chatterbox engine not installed")
    passages = [
        "The library opens at nine, but most mornings the first visitors arrive a little early, coffee in hand.",
        "Wait, you're telling me the whole thing was planned from the start? I can't believe nobody said a thing!",
        "Take a slow breath in, and let it out gently. Notice the steady rhythm of your own breathing.",
    ]
    takes = [
        save(tmp_path / f"take-{i}.wav", real.post("/api/voices/kokoro:bm_george/preview", json={"text": text}))
        for i, text in enumerate(passages)
    ]
    engine = chatterbox(real)
    features = engine.measure_takes(takes)
    assert all(len(f.speaker_emb) == 256 and len(f.xvector) == 192 and f.pitch_spread > 0 for f in features)
    identity = SpeakerIdentity(
        tuple(unit(np.mean([f.speaker_emb for f in features], axis=0)).tolist()),
        tuple(unit(np.mean([f.xvector for f in features], axis=0)).tolist()),
    )
    voice = tmp_path / "voice.safetensors"
    engine.build_voice(takes[0], voice, identity)
    text = ["This sentence never appeared in any of the takes."]
    first, second = tmp_path / "first.wav", tmp_path / "second.wav"
    scores = engine.audition(Audition(voice, text, [first], identity.speaker_emb, seed=7))
    engine.audition(Audition(voice, text, [second], identity.speaker_emb, seed=7))
    a, rate = sf.read(first, dtype="float32")
    b, _ = sf.read(second, dtype="float32")
    assert_speech(a, rate)
    assert a.shape == b.shape and float(np.max(np.abs(a - b))) < 1e-3  # saved voice + seed = same audio
    print(f"\nchatterbox: studio voice similarity {scores[0]:.3f}")
    assert scores[0] > 0.8


def chatterbox(client: TestClient) -> ChatterboxEngine:
    services = cast(Services, client.app.state.services)  # type: ignore[attr-defined]
    return cast(ChatterboxEngine, services.engines.get("chatterbox"))


def save(path: Path, response) -> Path:  # type: ignore[no-untyped-def]
    assert response.status_code == 200, response.text
    path.write_bytes(response.content)
    return path


def unit(vector: tuple[float, ...]) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float64)
    return array / np.linalg.norm(array)
