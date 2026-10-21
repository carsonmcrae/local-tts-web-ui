# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for sharing a voice as a .ttsvoice package and importing one.

Scope: Exporting needs an explicit confirmation and never includes the session takes; a studio and
a quick voice survive the round trip (as shared profiles, with their styles and where they came
from); importing needs consent and rejects anything that isn't exactly a voice package: not a ZIP,
unexpected or oversized files, a manifest that doesn't match, changed files, and safetensors files
with the wrong format, parts, types, shapes or byte ranges.
Does NOT belong: Building voices (test_studio_voices.py) or their styles (test_voice_styles.py).
"""

from __future__ import annotations

import io
import json
import struct
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import SAMPLE_RATE, speech_like
from ltts.container import Services
from ltts.errors import UnsupportedDocumentError
from ltts.voices.profiles import StudioVoice
from ltts.voices.quality import analyze
from ltts.voices.safetensors_check import CONDITIONING, STYLE, check_safetensors

CONDITIONING_TENSORS = {
    "t3.speaker_emb": ("F32", [1, 256]),
    "t3.cond_prompt_speech_tokens": ("I64", [1, 375]),
    "gen.prompt_token": ("I64", [1, 250]),
    "gen.prompt_token_len": ("I64", [1]),
    "gen.prompt_feat": ("F32", [1, 500, 80]),
    "gen.embedding": ("F32", [1, 192]),
}
_SIZES = {"F32": 4, "I64": 8}


def safetensors_bytes(tensors: dict[str, tuple[str, list[int]]], meta: dict[str, str]) -> bytes:
    """A valid safetensors file (zero-filled tensors), written by hand as the format specifies."""
    header: dict[str, Any] = {"__metadata__": meta}
    offset = 0
    for name, (dtype, shape) in tensors.items():
        size = int(np.prod(shape)) * _SIZES[dtype]
        header[name] = {"dtype": dtype, "shape": shape, "data_offsets": [offset, offset + size]}
        offset += size
    encoded = json.dumps(header).encode()
    return struct.pack("<Q", len(encoded)) + encoded + bytes(offset)


CONDITIONING_FILE = safetensors_bytes(CONDITIONING_TENSORS, {"format": "ltts-chatterbox-conditioning", "version": "1"})
STYLE_FILE = safetensors_bytes(
    {"t3.cond_prompt_speech_tokens": ("I64", [1, 375])}, {"format": "ltts-chatterbox-style", "version": "1"}
)


def studio_profile(services: Services, tmp_path: Path) -> str:
    """A studio voice with a built voice, one style and its takes, made straight through the service."""
    session = tmp_path / "session"
    (session / "takes").mkdir(parents=True)
    (session / "styles").mkdir()
    sf.write(session / "takes" / "001.flac", speech_like(12), SAMPLE_RATE, subtype="PCM_24")
    sf.write(session / "reference.wav", speech_like(12), SAMPLE_RATE, subtype="PCM_16")
    (session / "voice.safetensors").write_bytes(CONDITIONING_FILE)
    (session / "styles" / "question.safetensors").write_bytes(STYLE_FILE)
    profile = services.voices.create_studio(
        StudioVoice(
            name="Studio me",
            reference=session / "reference.wav",
            voice=session / "voice.safetensors",
            takes=session / "takes",
            quality=analyze(speech_like(12), SAMPLE_RATE),
            speech_s=600,
            delivery="expressive",
            styles=session / "styles",
        ),
        consent=True,
    )
    return profile.id


def export(client: TestClient, profile_id: str) -> bytes:
    response = client.get(f"/api/voice-profiles/{profile_id}/export", params={"confirm": "true"})
    assert response.status_code == 200 and response.headers["content-type"] == "application/zip"
    return response.content


def import_package(client: TestClient, package: bytes, consent: str = "true", **params: str) -> Any:
    return client.post("/api/voice-profiles/import", params={"consent": consent, **params}, content=package)


def repack(package: bytes, change: dict[str, bytes | None]) -> bytes:
    """The package with files replaced, added or (None) removed."""
    source = zipfile.ZipFile(io.BytesIO(package))
    files = {name: source.read(name) for name in source.namelist()}
    for name, data in change.items():
        if data is None:
            files.pop(name, None)
        else:
            files[name] = data
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as target:
        for name, data in files.items():
            target.writestr(name, data)
    return buffer.getvalue()


def code(response: Any) -> str:
    value: str = response.json()["error"]["code"]
    return value


def test_a_studio_voice_round_trips_without_its_takes(client: TestClient, services: Services, tmp_path: Path) -> None:
    profile_id = studio_profile(services, tmp_path)
    assert code(client.get(f"/api/voice-profiles/{profile_id}/export")) == "confirm_required"
    response = client.get(f"/api/voice-profiles/{profile_id}/export", params={"confirm": "true"})
    assert 'filename="Studio me.ttsvoice"' in response.headers["content-disposition"]
    package = zipfile.ZipFile(io.BytesIO(response.content))
    assert sorted(package.namelist()) == [
        "manifest.json",
        "reference.wav",
        "styles/question.safetensors",
        "voice.safetensors",
    ]
    manifest = json.loads(package.read("manifest.json"))
    assert manifest["format"] == "ttsnative-voice" and manifest["kind"] == "studio"
    assert "explicit permission" in manifest["consentStatement"]

    assert code(import_package(client, response.content, consent="false")) == "consent_required"
    imported = import_package(client, response.content, name="From Sam")
    assert imported.status_code == 201
    shared = imported.json()
    assert (shared["name"], shared["kind"], shared["source"], shared["delivery"]) == (
        "From Sam",
        "studio",
        "shared",
        "expressive",
    )
    assert shared["styles"] == ["question"] and not shared["canRefine"] and "shared with you" in shared["stores"]
    folder = services.voices.root / shared["id"]
    assert json.loads((folder / "origin.json").read_text("utf-8"))["name"] == "Studio me"
    assert not (folder / "takes").exists()
    _, spec, _ = services.voices.resolve(shared["id"])
    assert spec.conditioning_path is not None and dict(spec.styles)["question"].is_file()
    listed = next(v for v in client.get("/api/voices").json() if v["id"] == shared["voiceId"])
    assert listed["description"].startswith("Shared studio voice")


def test_a_quick_voice_round_trips_as_its_reference(client: TestClient) -> None:
    buffer = io.BytesIO()
    sf.write(buffer, speech_like(12), SAMPLE_RATE, format="WAV", subtype="PCM_16")
    quick = client.post("/api/voice-profiles", params={"name": "Quick", "consent": "true"}, content=buffer.getvalue())
    package = export(client, quick.json()["id"])
    assert zipfile.ZipFile(io.BytesIO(package)).namelist() == ["manifest.json", "reference.wav"]
    shared = import_package(client, package).json()
    assert (shared["kind"], shared["source"], shared["styles"]) == ("quick", "shared", [])


@pytest.mark.parametrize(
    ("change", "why"),
    [
        ({"takes/001.flac": b"x"}, "unexpected file"),
        ({"../evil.txt": b"x"}, "unexpected file"),
        ({"reference.wav": None}, "match its manifest"),
        ({"styles/question.safetensors": STYLE_FILE + b"x"}, "damaged or was changed"),
        ({"manifest.json": b"{not json"}, "manifest isn't valid"),
        ({"voice.safetensors": b"x" * (17 * 1024 * 1024)}, "too large"),
    ],
)
def test_import_rejects_anything_but_an_intact_voice_package(
    client: TestClient, services: Services, tmp_path: Path, change: dict[str, bytes | None], why: str
) -> None:
    package = export(client, studio_profile(services, tmp_path))
    response = import_package(client, repack(package, change))
    assert response.status_code == 415 and code(response) == "invalid_voice_file"
    assert why in response.json()["error"]["message"]


def test_import_rejects_a_file_that_is_not_a_zip(client: TestClient) -> None:
    assert code(import_package(client, b"not a zip at all")) == "invalid_voice_file"


def test_safetensors_files_must_match_exactly_what_the_app_writes(tmp_path: Path) -> None:
    path = tmp_path / "voice.safetensors"

    def rejected(data: bytes, kind: Any = CONDITIONING) -> str:
        path.write_bytes(data)
        with pytest.raises(UnsupportedDocumentError) as caught:
            check_safetensors(path, kind)
        return caught.value.message

    path.write_bytes(CONDITIONING_FILE)
    check_safetensors(path, CONDITIONING)
    path.write_bytes(STYLE_FILE)
    check_safetensors(path, STYLE)
    meta = {"format": "ltts-chatterbox-conditioning", "version": "1"}
    assert "another program" in rejected(safetensors_bytes(CONDITIONING_TENSORS, {"format": "other", "version": "1"}))
    assert "unexpected or missing" in rejected(safetensors_bytes({**CONDITIONING_TENSORS, "extra": ("F32", [1])}, meta))
    assert "wrong type" in rejected(
        safetensors_bytes({**CONDITIONING_TENSORS, "gen.embedding": ("I64", [1, 192])}, meta)
    )
    assert "doesn't match its header" in rejected(CONDITIONING_FILE + b"\x00" * 8)
    assert "empty" in rejected(b"")
    assert "header has the wrong size" in rejected(struct.pack("<Q", 10**9) + b"{}")
    assert "can't be read" in rejected(struct.pack("<Q", 4) + b"\xff\xfe{}")
    huge = {"t3.cond_prompt_speech_tokens": ("I64", [1, 9000])}
    assert "wrong shape" in rejected(
        safetensors_bytes(huge, {"format": "ltts-chatterbox-style", "version": "1"}), STYLE
    )
