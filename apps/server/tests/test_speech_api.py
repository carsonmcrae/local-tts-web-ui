# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for who may use the local speech API and how it is set up.

Scope: Off by default (every /v1 path answers like an unknown one and does no work), the bearer token
(401 without details, revoked or replaced at once, stored only as a hash), browser pages refused
with no CORS headers, other devices refused unless allowed (also in network mode, where /v1 checks
its own token), the rate limit, wrong methods, model and voice discovery, custom voices refused until
allowed and forgotten when deleted, the Settings validation, the usage status, and the port: the one
the server socket listens on (not the page's), and the one programs last used, kept across restarts.
Does NOT belong: Making audio (test_speech_api_audio.py).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.engines.base import VoiceSpec
from ltts.engines.registry import ResolvedVoice
from ltts.speech_api.guard import RateLimiter, Usage, bearer, is_local, server_port
from ltts.speech_api.store import SpeechApiConfig
from speech_api_support import auth, custom_voice, error_code, program, speak, switch_on

NOT_FOUND = {"error": {"code": "http_error", "message": "Not Found", "details": {}}}


def test_off_by_default_every_v1_path_answers_like_an_unknown_one(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    status = client.get("/api/speech-api").json()
    assert status["enabled"] is False and status["hasToken"] is False and status["allowNetwork"] is False
    assert status["allowedVoices"] == [] and status["usage"]["requests"] == 0
    token = client.post("/api/speech-api/token").json()["token"]  # even with a token, off means off
    caller = program(client)
    responses = [
        caller.get("/v1/models", headers=auth(token)),
        caller.get("/v1/voices"),
        speak(caller, token),
        caller.options("/v1/audio/speech", headers={"Origin": "https://evil.example"}),
        caller.get("/v1/audio/speech"),
        caller.delete("/v1/anything/else"),
    ]
    for response in responses:
        assert response.status_code == 404 and response.json() == NOT_FOUND
        assert not any(name.startswith("access-control") for name in response.headers)
    assert client.get("/no-such-page").json() == NOT_FOUND  # exactly what any unknown path gets
    assert engines["kokoro"].calls == []
    assert client.get("/api/speech-api/activity").json() == {"enabled": False, "active": False}


def test_a_missing_or_wrong_token_gets_401_without_details(client: TestClient) -> None:
    token = switch_on(client)
    caller = program(client)
    attempts = [
        {},
        auth("ttsn_" + "x" * 43),
        auth(token + "x"),
        {"Authorization": f"Basic {token}"},
        {"Authorization": "Bearer"},
        {"Authorization": "Bearer    "},
    ]
    bodies = []
    for headers in attempts:
        response = caller.post("/v1/audio/speech", json={"model": "ttsnative"}, headers=headers)
        assert response.status_code == 401 and response.headers["www-authenticate"] == "Bearer"
        bodies.append(response.json())
    assert all(body == bodies[0] for body in bodies) and bodies[0]["error"]["code"] == "invalid_token"
    assert token not in json.dumps(bodies)
    assert caller.get("/v1/models", headers=auth(token)).status_code == 200
    assert bearer("bearer  abc ") == "abc" and bearer(None) is None


def test_revoking_or_replacing_the_token_takes_effect_at_once(client: TestClient) -> None:
    first = switch_on(client)
    caller = program(client)
    assert caller.get("/v1/models", headers=auth(first)).status_code == 200
    assert client.delete("/api/speech-api/token").status_code == 204
    assert client.get("/api/speech-api").json()["hasToken"] is False
    assert caller.get("/v1/models", headers=auth(first)).status_code == 401
    second = client.post("/api/speech-api/token")
    assert second.status_code == 201 and second.json()["createdAt"]
    replaced = client.post("/api/speech-api/token").json()["token"]
    assert caller.get("/v1/models", headers=auth(second.json()["token"])).status_code == 401
    assert caller.get("/v1/models", headers=auth(replaced)).status_code == 200
    assert replaced.startswith("ttsn_") and len(replaced) > 40


def test_the_token_is_stored_only_as_a_hash(client: TestClient, services: Services, settings: Settings) -> None:
    token = switch_on(client)
    with services.db.connect() as conn:
        stored = json.loads(
            conn.execute("SELECT config_json FROM integrations WHERE name = 'speech-api'").fetchone()[0]
        )
    assert stored["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert token not in json.dumps(stored)
    status = client.get("/api/speech-api")
    assert token not in status.text and status.json()["hasToken"] is True and status.json()["tokenCreatedAt"]
    files = [path for path in Path(settings.data_dir).rglob("*") if path.is_file()]
    assert files and not any(token.encode() in path.read_bytes() for path in files)


def test_browser_pages_are_refused_and_never_get_cors_headers(client: TestClient) -> None:
    token = switch_on(client)
    caller = program(client)
    for headers in ({"Origin": "http://localhost:3000"}, {"Origin": "null"}, {"Sec-Fetch-Site": "same-origin"}):
        response = caller.post("/v1/audio/speech", json={}, headers=auth(token) | headers)
        assert response.status_code == 403 and error_code(response) == "browser_not_allowed"
        assert not any(name.startswith("access-control") for name in response.headers)
    preflight = caller.options(
        "/v1/audio/speech",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST",
                 "Access-Control-Request-Headers": "authorization"},
    )  # fmt: skip
    assert preflight.status_code == 405 and preflight.headers["allow"] == "POST"
    assert not any(name.startswith("access-control") for name in preflight.headers)
    assert caller.get("/v1/models", headers=auth(token)).headers["cache-control"] == "no-store"


def test_other_devices_are_refused_unless_the_owner_allows_them(client: TestClient) -> None:
    token = switch_on(client)
    remote = program(client, "192.168.1.5")
    refused = remote.get("/v1/models", headers=auth(token))
    assert refused.status_code == 403 and error_code(refused) == "network_not_allowed"
    assert remote.get("/v1/models").status_code == 403  # refused before the token is even looked at
    token = switch_on(client, allowNetwork=True)
    status = client.get("/api/speech-api").json()
    assert status["allowNetwork"] is True and status["networkMode"] is False
    assert remote.get("/v1/models", headers=auth(token)).status_code == 200
    for host in ("::1", "::ffff:127.0.0.1", "127.0.0.2"):
        assert is_local(host)
    for host in (None, "", "testclient", "192.168.1.5", "::ffff:10.0.0.1", "fe80::1"):
        assert not is_local(host)


def test_in_network_mode_the_speech_api_checks_its_own_token(
    settings: Settings, engines: dict[str, FakeEngine]
) -> None:
    access = "a" * 32
    network = settings.model_copy(update={"allow_network": True, "access_token": access, "host": "0.0.0.0"})  # noqa: S104
    services = build_services(network, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    web = TestClient(
        create_app(network, services=services), client=("127.0.0.1", 50000), headers={"X-LTTS-Client": "web"}
    )
    token = switch_on(web)
    remote = program(web, "192.168.1.50")
    assert remote.get("/api/health").status_code == 401  # the app itself still needs the access token
    assert error_code(remote.get("/v1/models", headers=auth(token))) == "network_not_allowed"
    token = switch_on(web, allowNetwork=True)
    assert remote.get("/v1/models", headers=auth(token)).status_code == 200
    assert remote.get("/v1/models", headers=auth(access)).status_code == 401  # the access token isn't a speech token
    assert web.get("/api/speech-api").json()["networkMode"] is True


def test_the_rate_limit_answers_429_with_retry_after(client: TestClient, services: Services) -> None:
    token = switch_on(client)
    services.speech_api.limiter = RateLimiter(2)
    caller = program(client)
    assert [caller.get("/v1/models", headers=auth(token)).status_code for _ in range(2)] == [200, 200]
    limited = caller.get("/v1/models", headers=auth(token))
    assert limited.status_code == 429 and error_code(limited) == "rate_limited"
    assert 1 <= int(limited.headers["retry-after"]) <= 60

    now = [0.0]
    limiter = RateLimiter(2, clock=lambda: now[0])
    assert limiter.hit("a") is None and limiter.hit("a") is None
    now[0] = 59.5
    assert limiter.hit("a") == 1
    now[0] = 60.0
    assert limiter.hit("a") is None and limiter.hit("a") is None  # the first two left the window
    assert limiter.hit("a") == 60
    assert limiter.hit("b") is None  # a new token starts afresh


def test_wrong_methods_and_unknown_paths_when_on(client: TestClient) -> None:
    switch_on(client)
    caller = program(client)
    wrong = caller.get("/v1/audio/speech")
    assert wrong.status_code == 405 and wrong.headers["allow"] == "POST" and error_code(wrong) == "method_not_allowed"
    assert caller.post("/v1/models").headers["allow"] == "GET"
    assert caller.get("/v1/files/report.txt").status_code == 404
    assert caller.get("/v1/unknown").json() == NOT_FOUND


def test_models_and_voices_can_be_discovered(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    caller = program(client)
    models = caller.get("/v1/models", headers=auth(token)).json()
    assert models["object"] == "list"
    assert [model["id"] for model in models["data"]] == ["ttsnative", "tts-1", "tts-1-hd", "gpt-4o-mini-tts", "kokoro", "chatterbox"]  # fmt: skip
    assert models["data"][0] == {"id": "ttsnative", "object": "model", "created": 0, "owned_by": "ttsnative"}
    voices = caller.get("/v1/voices", headers=auth(token)).json()
    assert [voice["id"] for voice in voices["data"]] == ["kokoro:alpha", "chatterbox:alpha"]
    assert voices["data"][0] == {
        "id": "kokoro:alpha", "object": "voice", "name": "Alpha", "engine": "kokoro", "language": "English (US)",
        "language_code": "en-us", "gender": "female", "category": "built-in", "openai_name": None,
    }  # fmt: skip
    assert caller.get("/v1/audio/voices", headers=auth(token)).json() == voices
    engines["chatterbox"].ready = False  # voices of an engine that isn't installed are not offered
    assert [voice["id"] for voice in caller.get("/v1/voices", headers=auth(token)).json()["data"]] == ["kokoro:alpha"]
    assert "chatterbox" not in [model["id"] for model in caller.get("/v1/models", headers=auth(token)).json()["data"]]


def test_voices_that_are_neither_built_in_nor_allowed_are_refused(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    token = switch_on(client)
    resolve = services.engines.resolve
    mixed = ResolvedVoice("mix:abc", engines["kokoro"], VoiceSpec(key="mix"), "1")  # another kind of voice
    monkeypatch.setattr(services.engines, "resolve", lambda voice: mixed if voice == "mix:abc" else resolve(voice))
    refused = speak(program(client), token, voice="mix:abc")
    assert refused.status_code == 403 and error_code(refused) == "voice_not_allowed"
    assert engines["kokoro"].calls == []


def test_custom_voices_need_permission_and_lose_it_when_deleted(client: TestClient, services: Services) -> None:
    voice = custom_voice(client)
    token = switch_on(client)
    caller = program(client)
    refused = speak(caller, token, voice=voice)
    assert refused.status_code == 403 and error_code(refused) == "voice_not_allowed"
    assert voice not in [item["id"] for item in caller.get("/v1/voices", headers=auth(token)).json()["data"]]
    token = switch_on(client, allowedVoices=[voice, voice])
    assert client.get("/api/speech-api").json()["allowedVoices"] == [voice]
    assert speak(caller, token, voice=voice).status_code == 200
    assert voice in [item["id"] for item in caller.get("/v1/voices", headers=auth(token)).json()["data"]]

    client.patch(f"/api/voice-profiles/{voice.removeprefix('custom:')}", json={"delivery": "steady"})
    assert services.speech_api.store.config().allowed_voices == (voice,)  # a changed voice keeps it
    assert client.delete(f"/api/voice-profiles/{voice.removeprefix('custom:')}").status_code == 204
    assert services.speech_api.store.config().allowed_voices == ()
    assert error_code(speak(caller, token, voice=voice)) == "voice_not_allowed"


def test_settings_are_validated(client: TestClient, services: Services) -> None:
    gone = client.put("/api/speech-api", json={"enabled": True, "allowedVoices": ["custom:" + "0" * 32]})
    assert gone.status_code == 404 and error_code(gone) == "voice_not_found"
    for body in (
        {"enabled": True, "extra": 1},
        {"enabled": "yes please"},
        {"enabled": True, "allowedVoices": ["kokoro:alpha"]},
        {"enabled": True, "allowedVoices": ["custom:../../x"]},
        {},
    ):
        assert client.put("/api/speech-api", json=body).status_code == 422
    assert services.speech_api.store.config().enabled is False
    saved = client.put("/api/speech-api", json={"enabled": True}).json()
    assert saved["enabled"] is True and saved["maxInputChars"] == 4000 and saved["requestsPerMinute"] == 60
    assert services.speech_api.store.prune_voices().allowed_voices == ()


def test_usage_status_and_activity(client: TestClient) -> None:
    token = switch_on(client)
    assert client.get("/api/speech-api/activity").json() == {"enabled": True, "active": False}
    assert speak(program(client), token).status_code == 200
    usage = client.get("/api/speech-api").json()["usage"]
    assert usage["requests"] == 1 and usage["lastVoiceId"] == "kokoro:alpha" and usage["lastUsedAt"]
    assert usage["active"] is True and usage["inProgress"] is False
    assert client.get("/api/speech-api/activity").json() == {"enabled": True, "active": True}

    now = [100.0]
    tracker = Usage(clock=lambda: now[0])
    tracker.started()
    assert tracker.snapshot().in_progress and tracker.snapshot().active
    tracker.finished(None)  # a failed request isn't counted
    assert tracker.snapshot().requests == 0 and not tracker.snapshot().active
    tracker.started()
    tracker.finished("kokoro:alpha")
    now[0] += 11
    snapshot = tracker.snapshot()
    assert snapshot.requests == 1 and snapshot.last_voice_id == "kokoro:alpha" and not snapshot.active

    assert client.get("/api/speech-api").json()["port"] == 80  # the port this server answered on


def test_the_port_is_the_servers_own_not_the_pages(client: TestClient) -> None:
    # Under npm run dev the page comes from the web dev server, whose proxy passes its own Host on.
    assert client.get("/api/speech-api", headers={"Host": "127.0.0.1:5173"}).json()["port"] == 80
    assert TestClient(client.app, base_url="http://127.0.0.1:8766").get("/api/speech-api").json()["port"] == 8766
    assert server_port({"server": ("127.0.0.1", 8765)}) == 8765
    assert server_port({"server": ("ltts.sock", None)}) is None and server_port({}) is None


def test_settings_remember_the_port_programs_last_used(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = services.speech_api.store
    writes: list[int | None] = []
    write = store._write

    def counted(config: SpeechApiConfig) -> SpeechApiConfig:
        writes.append(config.last_port)
        return write(config)

    monkeypatch.setattr(store, "_write", counted)
    token = switch_on(client)
    assert client.get("/api/speech-api").json()["lastUsedPort"] is None  # no program has used it yet
    assert program(client, port=8765).get("/v1/models").status_code == 401  # a refused request isn't use
    assert store.config().last_port is None
    for _ in range(3):
        assert program(client, port=8765).get("/v1/models", headers=auth(token)).status_code == 200
    assert writes.count(8765) == 1  # written once, not on every request
    status = client.get("/api/speech-api").json()
    assert status["lastUsedPort"] == 8765 and status["port"] == 80  # Settings warns: they differ

    # TTSNative restarted on the next port because 8765 was busy: the old port is still remembered...
    moved = TestClient(client.app, base_url="http://127.0.0.1:8766", headers={"X-LTTS-Client": "web"})
    status = moved.get("/api/speech-api").json()
    assert status["port"] == 8766 and status["lastUsedPort"] == 8765
    # ...until a program reaches it on the new one.
    assert program(client, port=8766).post("/v1/audio/speech", json={}, headers=auth(token)).status_code == 422
    assert moved.get("/api/speech-api").json()["lastUsedPort"] == 8766

    client.put("/api/speech-api", json={"enabled": False})
    assert program(client, port=8767).get("/v1/models", headers=auth(token)).status_code == 404
    assert store.config().last_port == 8766  # nothing is recorded while the API is off
    assert client.put("/api/speech-api", json={"enabled": True}).json()["lastUsedPort"] == 8766
