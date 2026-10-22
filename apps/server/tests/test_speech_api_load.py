# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests that the local speech API holds up under repeated, concurrent and unusual requests.

Scope: Many requests at once (one is made, the rest get 429 and make nothing), the rate limit (exact
under threads, not used up by wrong tokens, a limited request's body never read), body and input
limits at their edges (bytes, characters, nesting, huge numbers), a body that arrives too slowly
(408), clients that disconnect while sending or while their audio is made (no further sentence is
started), a slow reader not holding up the next request, a request that times out in the queue
(its work is dropped), and refusals of every kind making no audio. Synthesis is faked throughout.
Does NOT belong: The audio itself and strict validation (test_speech_api_audio.py), or tokens and
voices (test_speech_api.py, test_speech_api_voices.py).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.config import Settings
from ltts.container import Services
from ltts.speech_api import router as speech_router
from ltts.speech_api.guard import RateLimiter
from ltts.synthesis.scheduler import PRIORITY_EXPORT, PRIORITY_PLAYBACK
from speech_api_support import RawCall, auth, custom_voice, error_code, gated, program, raw, speak, switch_on

HEAD = b'{"model": "ttsnative", "voice": "kokoro:alpha", "response_format": "wav", "input": "'
TAIL = b'"}'


def sentences(engine: FakeEngine) -> list[str]:
    return [call[0] for call in engine.calls]


def test_of_many_requests_at_once_one_is_made_and_the_rest_get_429(settings: Settings) -> None:
    web, engine, _services = gated(settings)
    token = switch_on(web)
    count = 8
    start = threading.Barrier(count)
    results: dict[int, httpx.Response] = {}

    def send(number: int) -> None:
        caller = program(web)
        start.wait(10)
        results[number] = speak(caller, token, input=f"Request number {number}.")

    threads = [threading.Thread(target=send, args=(number,)) for number in range(count)]
    for thread in threads:
        thread.start()
    assert engine.entered.wait(10)
    deadline = time.monotonic() + 10
    while len(results) < count - 1 and time.monotonic() < deadline:
        time.sleep(0.02)  # the one being made is held until the others have their answers
    engine.release.set()
    for thread in threads:
        thread.join(10)
    served = [number for number, response in results.items() if response.status_code == 200]
    refused = [response for response in results.values() if response.status_code == 429]
    assert len(served) == 1 and len(refused) == count - 1
    assert all(error_code(response) == "speech_busy" and response.headers["retry-after"] == "2" for response in refused)
    assert sentences(engine) == [f"Request number {served[0]}."]


def test_the_rate_limit_is_exact_and_only_valid_tokens_use_it(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    limiter = RateLimiter(5)
    start = threading.Barrier(20)
    waits: list[int | None] = []

    def hit() -> None:
        start.wait(10)
        waits.append(limiter.hit("token"))

    threads = [threading.Thread(target=hit) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
    assert waits.count(None) == 5 and all(wait is None or 1 <= wait <= 60 for wait in waits)

    token = switch_on(client)
    services.speech_api.limiter = RateLimiter(2)
    caller = program(client)
    for _ in range(5):  # a program guessing tokens...
        assert caller.get("/v1/models", headers=auth("ttsn_guess")).status_code == 401
    assert [speak(caller, token, input=f"Number {n}.").status_code for n in range(2)] == [200, 200]  # ...uses none
    limited = RawCall(token, [HEAD + b"One too many." + TAIL]).run(client.app)
    assert limited.status == 429 and limited.asked == 0  # refused before its body is read
    assert sentences(engines["kokoro"]) == ["Number 0.", "Number 1."]


def test_body_and_input_limits_at_their_edges(
    client: TestClient, services: Services, settings: Settings, engines: dict[str, FakeEngine]
) -> None:
    services.speech_api.settings = settings.model_copy(update={"speech_api_max_chars": 100})
    token = switch_on(client)
    caller = program(client)
    limit = speech_router.BODY_OVERHEAD + speech_router.BYTES_PER_CHAR * 100

    def sized(size: int) -> bytes:
        return HEAD + b"a" * (size - len(HEAD) - len(TAIL)) + TAIL

    at_limit = raw(caller, token, sized(limit))
    assert at_limit.status_code == 422 and error_code(at_limit) == "input_too_long"  # read, then measured
    assert error_code(raw(caller, token, sized(limit + 1))) == "payload_too_large"
    declared = RawCall(token, [b"{}"])
    declared.headers.append((b"content-length", str(limit + 1).encode()))
    assert declared.run(client.app).status == 413 and declared.asked == 0  # not read at all

    exact = ("word " * 20).strip() + "."
    assert len(exact) == 100 and speak(caller, token, input=exact, response_format="wav").status_code == 200
    assert error_code(speak(caller, token, input=exact + "s")) == "input_too_long"
    faces = "Hi " + chr(0x1F600) * 97  # 100 characters, sent as 12 escaped bytes each
    escaped = json.dumps({"model": "ttsnative", "voice": "kokoro:alpha", "input": faces, "response_format": "wav"})
    assert len(escaped) > 1_000 and raw(caller, token, escaped.encode()).status_code == 200

    deep = HEAD + b'Hi.", "extra": ' + b"[" * 8_000 + b"]" * 8_000 + b"}"  # inside the byte limit
    huge = HEAD + b'Hi.", "speed": 1' + b"0" * 4_000 + b"}"
    for body in (deep, huge):
        refused = raw(caller, token, body)
        assert refused.status_code == 422 and error_code(refused) == "invalid_request"
    assert len(engines["kokoro"].calls) == 2


def test_a_body_that_arrives_too_slowly_gets_408(
    client: TestClient, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    token = switch_on(client)
    monkeypatch.setattr(speech_router, "BODY_TIMEOUT_S", 0.2)
    slow = RawCall(token, [HEAD, b"Slowly.", TAIL], delay=0.15).run(client.app)
    assert slow.status == 408 and json.loads(slow.body)["error"]["code"] == "request_timeout"
    assert engines["kokoro"].calls == []
    assert RawCall(token, [HEAD, b"In time.", TAIL], delay=0.01).run(client.app).status == 200


def test_a_client_that_disconnects_while_sending_gets_nothing(
    client: TestClient, engines: dict[str, FakeEngine], caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    token = switch_on(client)
    cut = RawCall(token, [HEAD, b"Never finished.", TAIL], cut_after=1).run(client.app)
    assert cut.status == 499 and cut.asked == 1
    assert engines["kokoro"].calls == []
    assert not [record for record in caplog.records if record.levelno >= logging.WARNING]  # not an error


def test_a_client_that_disconnects_mid_way_starts_no_further_sentence(settings: Settings) -> None:
    web, engine, services = gated(settings)
    token = switch_on(web)
    call = RawCall(token, [HEAD + b"One. Two. Three." + TAIL])
    worker = threading.Thread(target=call.run, args=(web.app,))
    worker.start()
    assert engine.entered.wait(10)
    call.gone.set()  # the client hangs up while the first sentence is being made...
    engine.release.set()
    worker.join(10)
    assert call.status == 499
    assert sentences(engine) == ["One."]  # ...so the other two are never started
    usage = services.speech_api.usage.snapshot()
    assert usage.requests == 0 and not usage.in_progress
    assert speak(program(web), token, input="Next, please.").status_code == 200  # nothing is left holding the API


def test_a_slow_reader_doesnt_hold_up_the_next_request(client: TestClient) -> None:
    token = switch_on(client)
    call = RawCall(token, [HEAD + b"Take your time." + TAIL])
    call.reading.clear()
    worker = threading.Thread(target=call.run, args=(client.app,))
    worker.start()
    assert call.started.wait(10)  # the audio is made, and the client isn't reading it yet
    assert speak(program(client), token, input="Me next.").status_code == 200
    call.reading.set()
    worker.join(10)
    assert call.status == 200 and len(call.body) > 1_000


def test_a_request_that_times_out_in_the_queue_leaves_no_work_behind(settings: Settings) -> None:
    web, engine, services = gated(settings)
    token = switch_on(web)
    services.speech_api.settings = settings.model_copy(update={"speech_api_timeout_s": 0.3})
    synthesis = services.synthesis
    reading = ("kokoro:alpha", "The reader's sentence.", "sentence", 1.0, PRIORITY_PLAYBACK, lambda: False)
    reader = threading.Thread(target=synthesis.render_blocking, args=reading)
    reader.start()
    assert engine.entered.wait(10)  # the sentence being read in the app holds the engine
    late = speak(program(web), token, input="Queued behind it. And another.")
    assert late.status_code == 504 and error_code(late) == "timeout"
    engine.release.set()
    reader.join(10)
    synthesis.render_blocking("kokoro:alpha", "Last in line.", "sentence", 1.0, PRIORITY_EXPORT, lambda: False)
    assert sentences(engine) == ["The reader's sentence.", "Last in line."]  # the API's sentence was dropped
    assert speak(program(web), token, input="Fresh start.").status_code == 200


def test_no_refused_request_makes_any_audio(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    voice = custom_voice(client)
    token = switch_on(client)
    caller = program(client)
    refusals: list[tuple[int, Callable[[], httpx.Response]]] = [
        (401, lambda: speak(caller, "ttsn_wrong")),
        (403, lambda: caller.post("/v1/audio/speech", json={}, headers=auth(token) | {"Origin": "https://a.example"})),
        (403, lambda: speak(program(client, "192.168.1.9"), token)),
        (403, lambda: speak(caller, token, voice=voice)),
        (404, lambda: speak(caller, token, model="whisper-1")),
        (404, lambda: speak(caller, token, voice="kokoro:nobody")),
        (413, lambda: raw(caller, token, HEAD + b"x" * 70_000 + TAIL)),
        (415, lambda: raw(caller, token, b"{}", "text/plain")),
        (422, lambda: speak(caller, token, speed=9)),
        (422, lambda: speak(caller, token, input="a " * 2_001)),
        (422, lambda: speak(caller, token, input="Go. " * 201)),
    ]
    for status, send in refusals:
        assert send().status_code == status
    services.speech_api.limiter = RateLimiter(1)
    assert speak(caller, token, model="whisper-1").status_code == 404  # uses up the one request
    assert speak(caller, token).status_code == 429
    assert engines["kokoro"].calls == [] and engines["chatterbox"].calls == []
    assert services.audio_cache.stats()["entries"] == 0 and services.speech_api.usage.snapshot().requests == 0
