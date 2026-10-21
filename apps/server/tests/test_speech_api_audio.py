# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the audio the local speech API makes.

Scope: Every response format with its content type (decoded back), long input split into sentences
and joined, cached sentences reused, the pronunciation dictionary applied and private-use characters
removed, strict validation (types, ranges, formats, voice and model names, JSON only, input and body
limits, extra fields ignored), clear errors for unknown voices and models, one synthesis at a time,
the time limit, a client that disconnects, and logs that never hold the token or the text.
Does NOT belong: Access, tokens and settings (test_speech_api.py).
"""

from __future__ import annotations

import asyncio
import io
import logging
import threading

import httpx
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.speech_api.schemas import SpeechRequest
from ltts.speech_api.service import encode_clips
from ltts.synthesis.service import ClientGoneError
from speech_api_support import GatedEngine, auth, error_code, program, speak, switch_on

FORMATS = [("mp3", "audio/mpeg"), ("opus", "audio/ogg"), ("flac", "audio/flac"), ("wav", "audio/wav")]


def gated(settings: Settings) -> tuple[TestClient, GatedEngine, Services]:
    """An app whose only engine holds every synthesis until the test releases it."""
    engine = GatedEngine()
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: [engine])
    web = TestClient(create_app(settings, services=services), headers={"X-LTTS-Client": "web"})
    return web, engine, services


def raw(
    caller: TestClient, token: str, content: bytes, content_type: str | None = "application/json"
) -> httpx.Response:
    headers = auth(token) | ({"Content-Type": content_type} if content_type else {})
    return caller.post("/v1/audio/speech", content=content, headers=headers)


def test_each_format_has_its_content_type_and_decodes(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    caller = program(client)
    for audio_format, content_type in FORMATS:
        response = speak(caller, token, response_format=audio_format)
        assert response.status_code == 200 and response.headers["content-type"] == content_type
        samples, rate = sf.read(io.BytesIO(response.content))
        assert rate == 24_000 and len(samples) > rate // 2
        assert float(response.headers["x-audio-duration"]) > 0.5 and response.headers["x-sample-rate"] == "24000"
    pcm = speak(caller, token, response_format="pcm")
    assert pcm.headers["content-type"] == "audio/pcm" and len(pcm.content) % 2 == 0
    assert len(pcm.content) // 2 == round(float(pcm.headers["x-audio-duration"]) * 24_000)
    assert speak(caller, token).headers["content-type"] == "audio/mpeg"  # MP3 unless asked otherwise, as OpenAI
    assert [call[0] for call in engines["kokoro"].calls] == ["Hello there.", "How are you?"]  # then from the cache


def test_long_input_is_read_sentence_by_sentence_and_joined(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    text = "First sentence here. Second one follows!\n\nA new paragraph starts. Then " + "a clause, " * 60 + "the end."
    response = speak(program(client), token, input=text, response_format="wav", speed=1.25)
    assert response.status_code == 200
    spoken = [call[0] for call in engines["kokoro"].calls]
    assert spoken[:3] == ["First sentence here.", "Second one follows!", "A new paragraph starts."]
    assert len(spoken) >= 5 and all(len(part) <= 360 for part in spoken)
    assert all(call[2] == 1.25 for call in engines["kokoro"].calls)
    least = sum(max(0.2, len(part) / 30) / 1.25 for part in spoken)
    assert sf.info(io.BytesIO(response.content)).duration > least


def test_input_is_cleaned_and_read_with_the_pronunciation_dictionary(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    client.post("/api/pronunciations", json={"word": "Kael", "sayAs": "Kale"})
    token = switch_on(client)
    marked = f"Kael{chr(0x100000)} waved{chr(0xF0001)}. Goodbye."
    assert speak(program(client), token, input=marked).status_code == 200
    assert [call[0] for call in engines["kokoro"].calls] == ["Kale waved.", "Goodbye."]


def test_requests_are_validated_strictly(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    caller = program(client)
    invalid = [
        ({"speed": "1"}, "speed"),
        ({"speed": 3}, "speed"),
        ({"speed": 0.25}, "speed"),
        ({"input": 5}, "input"),
        ({"input": ""}, "input"),
        ({"response_format": "aac"}, "response_format"),
        ({"voice": "../../etc/passwd"}, "voice"),
        ({"voice": "C:/voices/me.wav"}, "voice"),
        ({"model": "http://example.com/model"}, "model"),
        ({"model": None}, "model"),
    ]
    for fields, name in invalid:
        response = speak(caller, token, **fields)
        assert response.status_code == 422 and response.json()["error"]["details"]["fields"] == [name], fields
    assert speak(caller, token, speed=1, instructions="Whisper.", stream_format="audio").status_code == 200
    assert engines["kokoro"].calls[-1][2] == 1.0

    assert raw(caller, token, b"{not json").status_code == 422
    assert raw(caller, token, b'{"input": "\\udcff"}').status_code == 422  # a lone surrogate
    for content_type in ("text/plain", "application/x-www-form-urlencoded", None):
        refused = raw(caller, token, b"{}", content_type)
        assert refused.status_code == 415 and error_code(refused) == "unsupported_media_type"
    assert raw(caller, token, b'{"model": "ttsnative"}', "Application/JSON; charset=utf-8").status_code == 422


def test_input_and_body_limits(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    caller = program(client)
    too_long = speak(caller, token, input="a " * 2_001)
    assert too_long.status_code == 422 and error_code(too_long) == "input_too_long"
    assert too_long.json()["error"]["details"] == {"limitChars": 4_000}
    huge = b'{"model": "ttsnative", "voice": "kokoro:alpha", "input": "' + b"x" * 70_000 + b'"}'
    declared = raw(caller, token, huge)
    assert declared.status_code == 413 and error_code(declared) == "payload_too_large"
    streamed = caller.post(
        "/v1/audio/speech", content=iter([huge]), headers=auth(token) | {"Content-Type": "application/json"}
    )  # sent without a Content-Length, so the limit applies while reading
    assert streamed.status_code == 413
    assert error_code(speak(caller, token, input="Go now. " * 201)) == "too_many_sentences"
    for empty in (f"{chr(0x100000)} {chr(0xF0001)}", "   ", "\n\n"):
        assert error_code(speak(caller, token, input=empty)) == "empty_input"
    assert engines["kokoro"].calls == []


def test_unknown_voices_and_models_get_clear_errors(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    token = switch_on(client)
    caller = program(client)
    for voice in ("alloy", "kokoro:nope", "nope:alpha"):
        unknown = speak(caller, token, voice=voice)
        assert unknown.status_code == 404 and error_code(unknown) == "voice_not_found"
        assert "/v1/voices" in unknown.json()["error"]["message"]
    model = speak(caller, token, model="whisper-1")
    assert model.status_code == 404 and error_code(model) == "model_not_found"
    mismatch = speak(caller, token, model="kokoro", voice="chatterbox:alpha")
    assert mismatch.status_code == 422 and error_code(mismatch) == "model_voice_mismatch"
    for name in ("kokoro", "tts-1", "tts-1-hd", "gpt-4o-mini-tts"):
        assert speak(caller, token, model=name).status_code == 200
    engines["kokoro"].ready = False
    missing = speak(caller, token)
    assert missing.status_code == 503 and error_code(missing) == "engine_not_installed"


def test_only_one_request_is_synthesised_at_a_time(settings: Settings) -> None:
    web, engine, _services = gated(settings)
    token = switch_on(web)
    results: dict[str, httpx.Response] = {}
    worker = threading.Thread(target=lambda: results.update(first=speak(program(web), token, input="Hold on.")))
    worker.start()
    assert engine.entered.wait(10)
    busy = speak(program(web), token, input="Me too.")
    assert busy.status_code == 429 and error_code(busy) == "speech_busy" and busy.headers["retry-after"] == "2"
    assert web.get("/api/speech-api").json()["usage"]["inProgress"] is True
    engine.release.set()
    worker.join(10)
    assert results["first"].status_code == 200
    assert [call[0] for call in engine.calls] == ["Hold on."]
    assert speak(program(web), token, input="Me too.").status_code == 200


def test_a_request_that_takes_too_long_answers_504(settings: Settings) -> None:
    web, engine, services = gated(settings)
    token = switch_on(web)
    services.speech_api.settings = settings.model_copy(update={"speech_api_timeout_s": 0.3})
    slow = speak(program(web), token, input="This takes a while.")
    assert slow.status_code == 504 and error_code(slow) == "timeout"
    engine.release.set()
    assert speak(program(web), token, input="This takes a while.").status_code == 200
    assert services.speech_api.usage.snapshot().requests == 1


def test_a_client_that_disconnects_releases_its_work(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    web, engine, services = gated(settings)
    api = services.speech_api
    request = SpeechRequest(model="ttsnative", voice="kokoro:alpha", input="Bye now.")

    async def gone() -> bool:
        return True

    with pytest.raises(ClientGoneError):
        asyncio.run(api.speak(request, api.sentences(request.input), gone))
    engine.release.set()
    assert api.usage.snapshot().requests == 0 and not api.usage.snapshot().in_progress

    async def vanish(*_args: object) -> None:
        raise ClientGoneError

    token = switch_on(web)
    monkeypatch.setattr(api, "speak", vanish)
    assert speak(program(web), token).status_code == 499


def test_clips_are_joined_at_one_rate() -> None:
    tone = np.full(2_205, 0.1, dtype=np.float32)
    assert encode_clips([(tone, 22_050)], "opus").sample_rate == 24_000  # Opus can't use 22.05 kHz
    assert encode_clips([(tone, 22_050)], "pcm").sample_rate == 24_000  # raw PCM is always 24 kHz
    wav = encode_clips([(tone, 22_050), (tone, 44_100)], "wav")
    assert wav.sample_rate == 22_050 and wav.duration_s == pytest.approx(0.15, abs=0.001)
    assert sf.info(io.BytesIO(wav.body)).samplerate == 22_050


def test_logs_never_hold_the_token_or_the_text(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    token = switch_on(client)
    secret = "My bank PIN is 4321."
    assert speak(program(client), token, input=secret).status_code == 200
    assert speak(program(client), token + "x", input=secret).status_code == 401
    assert speak(program(client), token, input=secret, speed="fast").status_code == 422
    logged = " ".join(f"{record.getMessage()} {record.__dict__}" for record in caplog.records)
    assert "speech api request served" in logged and "'chars': 20" in logged
    assert token not in logged and "4321" not in logged and "PIN" not in logged
