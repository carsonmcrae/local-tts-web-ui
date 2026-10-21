# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for fine-tuning a saved studio voice and the owner's keep-or-discard decision.

Scope: Which takes are trained on and held out (known passages only, the last of each group held
out, enough of them), the job training until the held-out takes stop improving, its comparison
samples read with and without the adapter, keeping it (a new cache revision, synthesis sends it,
removing it restores the old revision), discarding it, giving up when it barely helped, refusing
voices without takes, the server's copy of the passages matching the web app's, and the comparison
sentences never coming from the recording script.
Does NOT belong: Training itself (the worker, needs the model) or the engine protocol
(test_chatterbox_studio.py).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import FakeEngine, speech_like, wait_job, wav_bytes
from ltts.config import REPO_ROOT, Settings
from ltts.container import Services
from ltts.errors import ConflictError
from ltts.voices import styles
from ltts.voices.styles import passage_text
from ltts.voices.tuning import SAMPLE_TEXTS, tuning_takes

PASSAGES = Path(styles.__file__).with_name("passages.json")

@pytest.fixture
def settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"min_studio_speech_s": 20})


def studio_voice(client: TestClient, numbers: range) -> str:
    """A saved studio voice that kept a take of each passage in ``numbers``."""
    session_id = client.post("/api/voice-sessions").json()["id"]
    for number in numbers:
        client.put(f"/api/voice-sessions/{session_id}/takes/{number}", content=wav_bytes(speech_like(12)))
    wait_job(client, client.post(f"/api/voice-sessions/{session_id}/build").json()["id"])
    best = client.get(f"/api/voice-sessions/{session_id}").json()["candidates"][0]["index"]
    profile = client.post(
        f"/api/voice-sessions/{session_id}/finish", json={"candidate": best, "name": "Me", "consent": True}
    ).json()
    return str(profile["id"])


def test_tuning_trains_on_known_passages_and_holds_out_the_last_of_each_group(tmp_path: Path) -> None:
    for number in [*range(1, 15), 101]:  # narration 1-8, storytelling 1-6, and an imported take
        sf.write(tmp_path / f"{number:03d}.flac", speech_like(12), 24_000, format="FLAC")
    takes = tuning_takes(tmp_path)
    assert [take.path.name for take in takes][-1] == "014.flac"  # the imported take has no words to learn
    assert [take.path.name for take in takes if take.held_out] == ["008.flac", "014.flac"]
    assert takes[0].text == passage_text("narration-1") and takes[0].text.startswith("The library opens")
    (tmp_path / "014.flac").unlink()
    (tmp_path / "013.flac").unlink()
    (tmp_path / "012.flac").unlink()
    with pytest.raises(ConflictError) as raised:
        tuning_takes(tmp_path)
    assert raised.value.code == "not_enough_takes"


def test_a_fine_tune_is_compared_kept_used_and_removed(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    profile_id = studio_voice(client, range(1, 15))
    profile = client.get("/api/voice-profiles").json()[0]
    assert profile["canTune"] and not profile["fineTuned"] and profile["tuning"] is None
    _, _, untuned = services.voices.resolve(profile_id)

    started = client.post(f"/api/voice-profiles/{profile_id}/tuning")
    assert started.status_code == 202
    job = wait_job(client, started.json()["id"])
    assert job["status"] == "succeeded", job
    run = engines["chatterbox"].tunings[-1]
    assert run["epochs"] == 4 and run["stopped"]  # epoch 2 was best; two epochs without gain stop it
    assert [take.path.name for take in run["takes"] if take.held_out] == ["008.flac", "014.flac"]
    assert job["result"] == {"epochs": 4, "bestEpoch": 2, "gain": 0.0375}

    tuning = client.get("/api/voice-profiles").json()[0]["tuning"]
    assert tuning["lossBefore"] == 4.0 and tuning["lossAfter"] == 3.85 and tuning["texts"] == list(SAMPLE_TEXTS)
    assert tuning["similarityAfter"] == pytest.approx(1.0)
    compared = engines["chatterbox"].specs[-2 * len(SAMPLE_TEXTS) :]
    assert [spec.adapter_path is not None for spec in compared] == [False, True] * len(SAMPLE_TEXTS)
    for arm in ("current", "tuned"):
        sample = client.get(f"/api/voice-profiles/{profile_id}/tuning/samples/{arm}/2")
        assert sample.status_code == 200 and sample.headers["content-type"] == "audio/wav"
    assert client.get(f"/api/voice-profiles/{profile_id}/tuning/samples/tuned/3").status_code == 422
    assert client.get(f"/api/voice-profiles/{profile_id}/tuning/samples/other/0").status_code == 422
    assert services.voices.resolve(profile_id)[2] == untuned  # nothing changes until it's kept

    kept = client.post(f"/api/voice-profiles/{profile_id}/tuning/keep").json()
    assert kept["fineTuned"] and kept["tuning"] is None and "fine-tune" in kept["stores"]
    assert not services.voices.tuning_dir(profile_id).exists()
    _, spec, tuned = services.voices.resolve(profile_id)
    assert spec.adapter_path is not None and spec.adapter_path.name.startswith("adapter-") and tuned != untuned
    client.post(f"/api/voices/{kept['voiceId']}/preview", json={"text": "A brand new sentence."})
    assert engines["chatterbox"].specs[-1].adapter_path == spec.adapter_path
    assert client.post(f"/api/voice-profiles/{profile_id}/tuning/keep").json()["error"]["code"] == "tuning_not_found"

    removed = client.delete(f"/api/voice-profiles/{profile_id}/adapter").json()
    assert not removed["fineTuned"] and services.voices.adapter_path(profile_id) is None
    assert services.voices.resolve(profile_id)[2] == untuned  # back to the audio it made before
    assert client.delete(f"/api/voice-profiles/{profile_id}/adapter").json()["error"]["code"] == "tuning_not_found"


def test_a_waiting_fine_tune_can_be_discarded(client: TestClient, services: Services) -> None:
    profile_id = studio_voice(client, range(1, 15))
    wait_job(client, client.post(f"/api/voice-profiles/{profile_id}/tuning").json()["id"])
    discarded = client.delete(f"/api/voice-profiles/{profile_id}/tuning").json()
    assert discarded["tuning"] is None and not discarded["fineTuned"]
    assert not services.voices.tuning_dir(profile_id).exists()
    assert client.get(f"/api/voice-profiles/{profile_id}/tuning/samples/current/0").status_code == 404


def test_a_fine_tune_that_barely_helps_is_not_offered(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    profile_id = studio_voice(client, range(1, 15))
    engines["chatterbox"].tuning_losses = [4.0, 3.99, 3.98, 3.99, 4.0, 4.0, 4.0, 4.0, 4.0]
    job = wait_job(client, client.post(f"/api/voice-profiles/{profile_id}/tuning").json()["id"])
    assert job["status"] == "failed" and job["errorCode"] == "no_gain"
    assert engines["chatterbox"].tunings[-1]["stopped"]
    assert client.get("/api/voice-profiles").json()[0]["tuning"] is None
    assert not services.voices.tuning_dir(profile_id).with_name("tuning.new").exists()


def test_only_a_studio_voice_with_enough_takes_can_be_fine_tuned(client: TestClient) -> None:
    quick = client.post(
        "/api/voice-profiles", params={"name": "Quick", "consent": "true"}, content=wav_bytes(speech_like(12))
    ).json()
    assert not quick["canTune"]
    assert client.post(f"/api/voice-profiles/{quick['id']}/tuning").json()["error"]["code"] == "not_studio"
    few = studio_voice(client, range(1, 5))
    job = wait_job(client, client.post(f"/api/voice-profiles/{few}/tuning").json()["id"])
    assert job["status"] == "failed" and job["errorCode"] == "not_enough_takes"


def test_the_server_reads_the_same_passages_the_web_app_shows() -> None:
    web = REPO_ROOT / "apps" / "web" / "src" / "features" / "studio" / "session" / "passages.json"
    if not web.is_file():
        pytest.skip("The web app isn't in this checkout")
    passages = json.loads(web.read_text(encoding="utf-8"))
    assert {p["id"]: passage_text(p["id"]) for p in passages} == {p["id"]: p["text"] for p in passages}


def test_the_comparison_sentences_are_not_in_the_recording_script() -> None:
    """A fine-tuned voice must be compared on text it has never been trained on."""

    def words(text: str) -> list[str]:
        return re.sub(r"[^a-z ]", " ", text.lower().replace("'", "").replace("’", "")).split()

    script = " ".join(" ".join(words(text)) for text in json.loads(PASSAGES.read_text("utf-8")).values())
    for sentence in SAMPLE_TEXTS:
        found = words(sentence)
        assert not any(" ".join(found[i : i + 5]) in script for i in range(len(found) - 4)), sentence
