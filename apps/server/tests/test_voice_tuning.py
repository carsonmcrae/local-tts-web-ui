# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for fine-tuning a saved studio voice and the owner's keep-or-discard decision.

Scope: Which takes are trained on and held out (known passages only, the last of each group held
out, enough of them, nothing unusable), the job training until the held-out takes stop improving (or
to the last round while they keep improving), its comparison samples read with and without the
adapter, keeping it (a new cache revision, synthesis sends it, removing it restores the old revision),
discarding it, giving up when it barely helped, one fine-tune at a time with no decision while it runs,
a sample or summary that is gone or damaged, a voice losing its built voice meanwhile, refusing voices
without takes, the server's copy of the passages matching the web app's, and the comparison sentences
never coming from the recording script.
Does NOT belong: Training itself (the worker, needs the model) or the engine protocol
(test_chatterbox_studio.py).
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import FakeEngine, saved_studio_voice, speech_like, wait_job, wav_bytes
from ltts.config import REPO_ROOT, Settings
from ltts.container import Services
from ltts.engines.base import TuningTake
from ltts.errors import ConflictError
from ltts.voices import styles
from ltts.voices import tuning as tuning_module
from ltts.voices.styles import passage_text
from ltts.voices.tuning import SAMPLE_TEXTS, tuning_takes

PASSAGES = Path(styles.__file__).with_name("passages.json")


@pytest.fixture
def settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"min_studio_speech_s": 20})


def studio_voice(client: TestClient, numbers: range) -> str:
    """The id of a saved studio voice that kept a take of each passage in ``numbers``."""
    return str(saved_studio_voice(client, numbers)["id"])


def test_tuning_trains_on_known_passages_and_holds_out_the_last_of_each_group(tmp_path: Path) -> None:
    for number in [*range(1, 15), 101]:  # narration 1-8, storytelling 1-6, and an imported take
        sf.write(tmp_path / f"{number:03d}.flac", speech_like(12), 24_000, format="FLAC")
    sf.write(tmp_path / "015.flac", speech_like(1), 24_000, format="FLAC")  # too little speech to be usable
    takes = tuning_takes(tmp_path)
    assert [take.path.name for take in takes][-1] == "014.flac"  # the imported take has no words to learn
    assert "015.flac" not in [take.path.name for take in takes]
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


def test_only_a_studio_voice_with_enough_takes_can_be_fine_tuned(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    quick = client.post(
        "/api/voice-profiles", params={"name": "Quick", "consent": "true"}, content=wav_bytes(speech_like(12))
    ).json()
    assert not quick["canTune"]
    assert client.post(f"/api/voice-profiles/{quick['id']}/tuning").json()["error"]["code"] == "not_studio"
    few = studio_voice(client, range(1, 5))
    engines["chatterbox"].ready = False  # the cloning engine was removed since the voice was built
    missing = client.post(f"/api/voice-profiles/{few}/tuning")
    assert missing.status_code == 503 and missing.json()["error"]["code"] == "engine_not_installed"
    engines["chatterbox"].ready = True
    job = wait_job(client, client.post(f"/api/voice-profiles/{few}/tuning").json()["id"])
    assert job["status"] == "failed" and job["errorCode"] == "not_enough_takes"


def test_training_runs_every_round_while_the_takes_keep_improving(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    profile_id = studio_voice(client, range(1, 15))
    engines["chatterbox"].tuning_losses = [4.0, 3.9, 3.8, 3.7, 3.6, 3.5, 3.4, 3.3, 3.2]
    job = wait_job(client, client.post(f"/api/voice-profiles/{profile_id}/tuning").json()["id"])
    assert job["status"] == "succeeded" and job["result"] == {"epochs": 8, "bestEpoch": 8, "gain": 0.2}


def test_a_voice_being_fine_tuned_waits_and_its_samples_or_summary_can_go_missing(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    profile_id = studio_voice(client, range(1, 15))
    base = f"/api/voice-profiles/{profile_id}"
    gate = threading.Event()
    tune_epoch = engines["chatterbox"].tune_epoch
    monkeypatch.setattr(engines["chatterbox"], "tune_epoch", lambda: (gate.wait(5), tune_epoch())[1])
    started = client.post(f"{base}/tuning").json()
    assert client.post(f"{base}/tuning").json()["id"] == started["id"]  # one fine-tune at a time
    for busy in (client.post(f"{base}/tuning/keep"), client.delete(f"{base}/tuning"), client.delete(f"{base}/adapter")):
        assert busy.status_code == 409 and busy.json()["error"]["code"] == "voice_busy"
    gate.set()
    assert wait_job(client, started["id"])["status"] == "succeeded"
    (services.voices.tuning_dir(profile_id) / "current-0.wav").unlink()
    gone = client.get(f"{base}/tuning/samples/current/0")
    assert gone.status_code == 404 and gone.json()["error"]["code"] == "sample_not_found"
    (services.voices.tuning_dir(profile_id) / "candidate.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/voice-profiles").json()[0]["tuning"] is None  # a damaged summary: nothing is waiting
    assert client.post(f"{base}/tuning/keep").json()["error"]["code"] == "tuning_not_found"


def test_a_voice_that_loses_its_built_voice_meanwhile_is_not_fine_tuned(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    profile_id = studio_voice(client, range(1, 15))

    def takes_of_a_voice_without_its_file(folder: Path) -> list[TuningTake]:
        with services.db.connect() as conn:  # the built voice went away after the job was accepted
            conn.execute("UPDATE voice_profiles SET voice_file = '' WHERE id = ?", (profile_id,))
        return tuning_takes(folder)

    monkeypatch.setattr(tuning_module, "tuning_takes", takes_of_a_voice_without_its_file)
    job = wait_job(client, client.post(f"/api/voice-profiles/{profile_id}/tuning").json()["id"])
    assert job["status"] == "failed" and job["errorCode"] == "not_studio"
    assert not services.voices.tuning_dir(profile_id).with_name("tuning.new").exists()


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
