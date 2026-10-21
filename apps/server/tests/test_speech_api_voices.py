# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for who may use which voices through the local speech API.

Scope: The token and voice checks around cloned voices: tokens that are altered, misplaced or
revoked; custom voices that aren't allowed, with any model and in any spelling; odd ids and path
tricks; blends; any voice that copies a recording; and permissions left behind by deleted voices.
Does NOT belong: Switching the API on, the rate limit and settings (test_speech_api.py), or the audio
and the limits (test_speech_api_audio.py, test_speech_api_load.py).
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.config import Settings
from ltts.container import Services
from ltts.engines.base import VoiceSpec
from ltts.engines.registry import ResolvedVoice
from speech_api_support import KokoroVoices, app_with, auth, custom_voice, error_code, program, speak, switch_on

BLENDS = "/api/voice-profiles/blends"
Kokoro = tuple[TestClient, KokoroVoices, Services]


@pytest.fixture
def kokoro(settings: Settings) -> Kokoro:
    """An app with a fake Kokoro that has the real voice ids, and a cloning engine for custom voices."""
    engine = KokoroVoices()
    web, services = app_with(settings, engine, FakeEngine("chatterbox", cloning=True))
    return web, engine, services


def test_only_the_exact_current_token_is_accepted(client: TestClient) -> None:
    token = switch_on(client)
    caller = program(client)
    for headers in (
        auth(token.upper()),
        auth(token.swapcase()),
        auth(token[:-1]),
        auth(f"{token} {token}"),
        {"Authorization": f"Token {token}"},
        {"Authorization": token},
        {"X-Api-Key": token},
    ):
        assert caller.get("/v1/voices", headers=headers).status_code == 401, headers
    assert caller.get(f"/v1/voices?api_key={token}&token={token}").status_code == 401  # never from the address
    assert caller.get("/v1/voices", headers={"Authorization": f"BEARER {token}"}).status_code == 200

    client.put("/api/speech-api", json={"enabled": False})
    client.put("/api/speech-api", json={"enabled": True})
    assert caller.get("/v1/voices", headers=auth(token)).status_code == 200  # off and on again keeps the token
    client.delete("/api/speech-api/token")
    for response in (caller.get("/v1/voices", headers=auth(token)), caller.get("/v1/models", headers=auth(token)),
                     speak(caller, token)):  # fmt: skip
        assert response.status_code == 401 and error_code(response) == "invalid_token"


def test_a_custom_voice_that_isnt_allowed_is_refused_before_it_is_looked_up(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    voice, other = custom_voice(client), custom_voice(client)
    token = switch_on(client, allowedVoices=[other])  # one voice's permission doesn't stretch to another
    looked_up: list[str] = []
    resolve = services.engines.resolve

    def recorded(voice_id: str) -> ResolvedVoice:
        looked_up.append(voice_id)
        return resolve(voice_id)

    monkeypatch.setattr(services.engines, "resolve", recorded)
    caller = program(client)
    key = voice.removeprefix("custom:")
    spellings = (voice, f"CUSTOM:{key}", f"Custom:{key}", f"custom:{key.upper()}", f"{other}:x", f"custom:{key}-",
                 "custom", "custom:", "custom::")  # fmt: skip
    for model in ("ttsnative", "tts-1", "chatterbox", "kokoro"):
        for spelling in spellings:
            refused = speak(caller, token, model=model, voice=spelling)
            assert refused.status_code == 403 and error_code(refused) == "voice_not_allowed", (model, spelling)
    assert not [voice_id for voice_id in looked_up if voice_id.lower().startswith("custom")]
    assert engines["chatterbox"].calls == []
    assert speak(caller, token, voice=other).status_code == 200


def test_odd_voice_ids_are_refused_without_reaching_a_voice(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    caller = program(client)
    backslash = chr(92)
    for voice in ("../../etc/passwd", "custom:../x", "custom:..%2Fx", "custom:a/b", f"custom:a{backslash}b",
                  "kokoro:alpha/../x", "kokoro:alpha.wav", "kokoro:alpha\x00", "kokoro:alpha\n", "kokoro: alpha",
                  f"kokoro:{chr(0xFF41)}lpha", f"{chr(0xFF43)}ustom:x", "~/voice", "%2e%2e", "kokoro:" + "a" * 120, ""):  # fmt: skip
        response = speak(caller, token, voice=voice)
        assert response.status_code == 422 and response.json()["error"]["details"]["fields"] == ["voice"], voice
    for voice in (":", "::", ":alpha", "kokoro", "kokoro:", "kokoro::alpha", "kokoro:alpha:x", "KOKORO:alpha",
                  "kokoro:ALPHA", "blend", "blend:", "blend:-", "blend:" + "0" * 32, "chatterbox:default"):  # fmt: skip
        response = speak(caller, token, voice=voice)
        assert response.status_code == 404 and error_code(response) == "voice_not_found", voice
    assert engines["kokoro"].calls == [] and engines["chatterbox"].calls == []


def test_blends_mix_built_in_voices_and_a_deleted_one_is_unknown(kokoro: Kokoro) -> None:
    web, engine, _services = kokoro
    parts = [{"voiceId": "kokoro:af_heart", "weight": 1}, {"voiceId": "kokoro:am_adam", "weight": 1}]
    made = web.post(BLENDS, json={"name": "Mix", "parts": parts})
    assert made.status_code == 201
    voice = made.json()["voiceId"]
    cloned = [{"voiceId": custom_voice(web), "weight": 1}, parts[0]]
    assert web.post(BLENDS, json={"name": "Copy", "parts": cloned}).status_code == 422  # can't carry a clone in
    token = switch_on(web)
    caller = program(web)
    assert speak(caller, token, voice=voice).status_code == 200  # needs no permission: it copies no one
    assert engine.specs[-1].blend and engine.specs[-1].reference_path is None
    assert web.delete(f"{BLENDS}/{made.json()['id']}").status_code == 204
    gone = speak(caller, token, voice=voice, input="Once more.")
    assert gone.status_code == 404 and error_code(gone) == "voice_not_found"


def test_any_voice_that_copies_a_recording_needs_permission(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:  # fmt: skip
    token = switch_on(client)
    resolve = services.engines.resolve

    def copying(voice_id: str) -> ResolvedVoice:
        found = resolve(voice_id)
        spec = VoiceSpec(key="alpha", reference_path=tmp_path / "someone.wav")
        return ResolvedVoice(found.voice_id, found.engine, spec, "1") if voice_id == "kokoro:alpha" else found

    monkeypatch.setattr(services.engines, "resolve", copying)  # a voice listed as built-in, but made from a recording
    refused = speak(program(client), token)
    assert refused.status_code == 403 and error_code(refused) == "voice_not_allowed"
    assert engines["kokoro"].calls == []


def test_permissions_end_with_the_voice(client: TestClient, services: Services, engines: dict[str, FakeEngine]) -> None:
    voice = custom_voice(client)
    token = switch_on(client, allowedVoices=[voice])
    caller = program(client)
    assert speak(caller, token, voice=voice).status_code == 200
    synthesised = len(engines["chatterbox"].calls)
    services.voices.reference_path(voice.removeprefix("custom:")).unlink()  # its recording went missing
    missing = speak(caller, token, voice=voice, input="Still there?")
    assert missing.status_code == 404 and error_code(missing) == "voice_not_found"

    store = services.speech_api.store
    stale = "custom:" + "f" * 32  # a permission whose voice was removed without it being pruned
    store._write(replace(store.config(), allowed_voices=(voice, stale)))
    assert error_code(speak(caller, token, voice=stale)) == "voice_not_found"
    assert client.get("/api/speech-api").json()["allowedVoices"] == [voice]  # Settings drops it
    assert error_code(speak(caller, token, voice=stale)) == "voice_not_allowed"
    client.put("/api/speech-api", json={"enabled": True, "allowedVoices": []})  # unticked: refused at once
    assert error_code(speak(caller, token, voice=voice)) == "voice_not_allowed"
    assert len(engines["chatterbox"].calls) == synthesised
