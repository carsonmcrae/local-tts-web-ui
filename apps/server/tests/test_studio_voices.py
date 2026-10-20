"""Purpose: Tests for building studio voices and turning a session into a voice profile.

Scope: A build needs enough usable speech and an installed cloning engine; the build job measures
takes, uses the session identity, ranks and auditions candidates best first; samples are served; a
session can't change while it builds and a build can be canceled; finishing needs consent and a built
candidate, creates a studio profile that owns the takes and voice file, and removes the session; the
profile's delivery is part of its cache revision and changing it purges old audio; a tone correction is
built from corrected copies of the takes; profiles saved
before the brightness metric existed still load; ranking leaves out atypical, short and bright takes first.
Does NOT belong: Takes, imports and the microphone check (test_voice_sessions.py).
"""

from __future__ import annotations

import json
import threading
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine, speech_like, wait_job, wav_bytes
from ltts.config import Settings
from ltts.container import Services
from ltts.engines.base import Audition, TakeFeatures
from ltts.engines.registry import EngineRegistry
from ltts.errors import EngineUnavailableError
from ltts.voices.quality import QualityReport
from ltts.voices.sessions import TakeOut
from ltts.voices.studio import rank_prompts, session_identity


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        env="test",
        data_dir=tmp_path / "data",
        models_dir=tmp_path / "models",
        warm_up_engines=False,
        extra_allowed_hosts=["testserver"],
        min_studio_speech_s=20,
    )


def error(response: Any) -> str:
    code: str = response.json()["error"]["code"]
    return code


def record(client: TestClient, numbers: Sequence[int] = (1, 2, 3, 4)) -> str:
    session_id: str = client.post("/api/voice-sessions").json()["id"]
    for number in numbers:
        client.put(
            f"/api/voice-sessions/{session_id}/takes/{number}",
            params={"promptId": f"p-{number}"},
            content=wav_bytes(speech_like(12)),
        )
    return session_id


def test_build_needs_enough_speech_and_the_cloning_engine(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    session_id = record(client, (1,))
    assert error(client.post(f"/api/voice-sessions/{session_id}/build")) == "not_enough_speech"
    record_more = [
        client.put(f"/api/voice-sessions/{session_id}/takes/{n}", content=wav_bytes(speech_like(12))) for n in (2, 3)
    ]
    assert all(response.status_code == 200 for response in record_more)
    engines["chatterbox"].ready = False
    response = client.post(f"/api/voice-sessions/{session_id}/build")
    assert response.status_code == 503 and error(response) == "engine_not_installed"


def test_build_choose_and_finish_a_studio_voice(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    session_id = record(client)
    base = f"/api/voice-sessions/{session_id}"
    started = client.post(f"{base}/build")
    assert started.status_code == 202
    job = wait_job(client, started.json()["id"])
    assert job["status"] == "succeeded" and job["result"] == {"candidates": 4}
    candidates = client.get(base).json()["candidates"]
    scores = [candidate["similarity"] for candidate in candidates]
    assert scores == sorted(scores, reverse=True)
    best = candidates[0]
    assert best["takeNumber"] == 4 and best["promptId"] == "p-4" and best["samples"] == 2
    assert all(identity is not None for _, identity in engines["chatterbox"].built)
    sample = client.get(f"{base}/candidates/{best['index']}/samples/1")
    assert sample.status_code == 200 and sample.headers["content-type"] == "audio/wav"
    assert error(client.get(f"{base}/candidates/{best['index']}/samples/5")) == "sample_not_found"
    assert error(client.get(f"{base}/candidates/9/samples/0")) == "candidate_not_found"

    choice = {"candidate": best["index"], "name": " Studio me ", "consent": False, "delivery": "expressive"}
    assert error(client.post(f"{base}/finish", json=choice)) == "consent_required"
    created = client.post(f"{base}/finish", json={**choice, "consent": True})
    assert created.status_code == 201
    profile = created.json()
    assert (profile["name"], profile["kind"], profile["delivery"], profile["source"]) == (
        "Studio me",
        "studio",
        "expressive",
        "studio",
    )
    assert "session recordings" in profile["stores"]
    folder = services.voices.root / profile["id"]
    assert (folder / "takes" / "004.flac").is_file() and len(list(folder.glob("voice-*.safetensors"))) == 1
    assert error(client.get(base)) == "session_not_found" and not services.voice_sessions.folder(session_id).exists()
    listed = next(v for v in client.get("/api/voices").json() if v["id"] == profile["voiceId"])
    assert listed["description"].startswith("Studio voice built from 1 min")

    assert client.post(f"/api/voices/{profile['voiceId']}/preview", json={"text": "Hi."}).status_code == 200
    spec = engines["chatterbox"].specs[-1]
    assert spec.conditioning_path is not None and spec.conditioning_path.name.startswith("voice-")
    assert spec.delivery == "expressive"
    _, _, expressive = services.voices.resolve(profile["id"])
    assert services.audio_cache.stats()["entries"] == 1
    natural = client.patch(f"/api/voice-profiles/{profile['id']}", json={"delivery": "natural"}).json()
    assert natural["delivery"] == "natural" and services.audio_cache.stats()["entries"] == 0
    _, _, revision = services.voices.resolve(profile["id"])
    assert expressive.endswith("|expressive") and revision != expressive
    renamed = client.patch(f"/api/voice-profiles/{profile['id']}", json={"name": " Renamed "}).json()
    assert (renamed["name"], renamed["delivery"]) == ("Renamed", "natural")

    for voice_file in folder.glob("voice-*.safetensors"):
        voice_file.unlink()
    assert error(client.post(f"/api/voices/{profile['voiceId']}/preview", json={"text": "Hi."})) == "voice_not_found"


def test_quick_voices_keep_their_original_cache_revision(client: TestClient, services: Services) -> None:
    params = {"name": "Quick", "consent": "true"}
    profile = client.post("/api/voice-profiles", params=params, content=wav_bytes(speech_like(12))).json()
    assert profile["kind"] == "quick" and profile["delivery"] == "natural"
    _, spec, revision = services.voices.resolve(profile["id"])
    assert revision == profile["createdAt"] and spec.conditioning_path is None
    steady = client.patch(f"/api/voice-profiles/{profile['id']}", json={"delivery": "steady"}).json()
    assert steady["delivery"] == "steady" and services.voices.resolve(profile["id"])[2].endswith("|steady")


def test_a_tone_correction_is_built_from_corrected_copies_of_the_takes(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    created = client.post("/api/voice-sessions", json={"tone": {"trebleDb": -4.5, "bassDb": 0}})
    session_id = created.json()["id"]
    assert created.json()["tone"] == {"trebleDb": -4.5, "bassDb": 0.0}
    for number in (1, 2, 3):
        client.put(f"/api/voice-sessions/{session_id}/takes/{number}", content=wav_bytes(speech_like(12)))
    corrected = services.voice_sessions.corrected_path(session_id, 1)
    job = client.post(f"/api/voice-sessions/{session_id}/build").json()
    assert wait_job(client, job["id"])["status"] == "succeeded"
    assert corrected.is_file() and services.voice_sessions.take_path(session_id, 1).is_file()  # originals kept
    assert services.voice_sessions.build_audio(session_id, 1) == corrected
    again = client.post(f"/api/voice-sessions/{session_id}/build").json()
    assert wait_job(client, again["id"])["status"] == "succeeded"  # reuses the corrected copies
    client.put(f"/api/voice-sessions/{session_id}/takes/4", content=wav_bytes(speech_like(12)))
    assert not corrected.exists()  # new takes: the corrected copies are made again at the next build
    assert services.voice_sessions.build_audio(session_id, 1) == services.voice_sessions.take_path(session_id, 1)


def test_profiles_saved_before_the_brightness_metric_still_load(client: TestClient, services: Services) -> None:
    params = {"name": "Older", "consent": "true"}
    profile = client.post("/api/voice-profiles", params=params, content=wav_bytes(speech_like(12))).json()
    with services.db.connect() as conn:
        stored = json.loads(conn.execute("SELECT quality_json FROM voice_profiles").fetchone()[0])
        older = json.dumps({key: value for key, value in stored.items() if key != "brightnessDb"})
        conn.execute("UPDATE voice_profiles SET quality_json = ? WHERE id = ?", (older, profile["id"]))
    assert client.get("/api/voice-profiles").json()[0]["quality"]["brightnessDb"] is None
    assert client.get("/api/voices").status_code == 200


def test_finish_needs_a_built_candidate(client: TestClient) -> None:
    session_id = record(client, (1,))
    choice = {"candidate": 0, "name": "Me", "consent": True}
    assert error(client.post(f"/api/voice-sessions/{session_id}/finish", json=choice)) == "candidate_not_found"


def test_a_session_is_locked_while_its_voice_builds(
    client: TestClient, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = threading.Event()
    audition = engines["chatterbox"].audition

    def slow(request: Audition) -> list[float]:
        gate.wait(5)
        return audition(request)

    monkeypatch.setattr(engines["chatterbox"], "audition", slow)
    session_id = record(client)
    base = f"/api/voice-sessions/{session_id}"
    first = client.post(f"{base}/build").json()
    assert client.post(f"{base}/build").json()["id"] == first["id"]  # one build at a time
    assert client.get(base).json()["buildJobId"] == first["id"]
    take = wav_bytes(speech_like(12))
    assert error(client.put(f"{base}/takes/5", content=take)) == "session_busy"
    assert error(client.delete(f"{base}/takes/1")) == "session_busy"
    assert error(client.post(f"{base}/import", content=take)) == "session_busy"
    assert error(client.delete(base)) == "session_busy"
    assert error(client.post(f"{base}/finish", json={"candidate": 0, "name": "Me", "consent": True})) == "session_busy"
    gate.set()
    assert wait_job(client, first["id"])["status"] == "succeeded"


def test_a_build_can_be_canceled(
    client: TestClient, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = threading.Event()
    measure = engines["chatterbox"].measure_takes

    def slow(paths: Sequence[Path]) -> list[TakeFeatures]:
        gate.wait(5)
        return measure(paths)

    monkeypatch.setattr(engines["chatterbox"], "measure_takes", slow)
    session_id = record(client, range(1, 11))
    job = client.post(f"/api/voice-sessions/{session_id}/build").json()
    client.post(f"/api/jobs/{job['id']}/cancel")
    gate.set()
    assert wait_job(client, job["id"])["status"] == "canceled"
    assert client.get(f"/api/voice-sessions/{session_id}").json()["candidates"] == []


class NotABuilder(FakeEngine):
    measure_takes = None  # type: ignore[assignment]


def test_only_an_installed_voice_builder_can_build(services: Services) -> None:
    registry = EngineRegistry([NotABuilder("chatterbox", cloning=True)], services.jobs)
    with pytest.raises(EngineUnavailableError):
        registry.voice_builder("chatterbox")
    with pytest.raises(EngineUnavailableError):
        registry.voice_builder("missing")
    assert services.engines.voice_builder("chatterbox") is not None


def take(number: int, speech_s: float = 10.0, brightness_db: float = 0.0) -> TakeOut:
    quality = QualityReport(duration_s=speech_s, speech_s=speech_s, rms_dbfs=-20, peak_dbfs=-3, clipping_ratio=0,
                            pause_ratio=0.1, snr_db=40, brightness_db=brightness_db, ok=True, issues=[])  # fmt: skip
    return TakeOut(
        number=number, prompt_id=None, source="recording", duration_s=speech_s, quality=quality, created_at=""
    )


def features(number: int, speaker: tuple[float, ...]) -> TakeFeatures:
    return TakeFeatures(Path(f"{number:03d}.flac"), speaker, (0.0, 1.0), 2.0, 0.6)


def test_identity_and_ranking_prefer_typical_long_clean_takes() -> None:
    measured = [features(1, (1.0, 0.0, 0.0)), features(2, (1.0, 0.1, 0.0)), features(3, (0.0, 1.0, 0.0))]
    identity, similarity = session_identity(measured)
    assert similarity[2] < 0.75 < similarity[0] and len(identity.xvector) == 2  # take 3 is another speaker
    assert rank_prompts([take(1, 4), take(2), take(3)], measured, similarity) == [1]  # short and atypical left out
    assert sorted(rank_prompts([take(1, 4), take(2, 4), take(3, 4)], measured, similarity)) == [0, 1]
    assert rank_prompts([take(1, brightness_db=9), take(2)], measured[:2], similarity[:2]) == [1, 0]
    opposite = [features(1, (1.0, 0.0)), features(2, (-1.0, 0.0))]
    _, none_typical = session_identity(opposite)
    assert np.allclose(none_typical, 0) and len(rank_prompts([take(1), take(2)], opposite, none_typical)) == 2
