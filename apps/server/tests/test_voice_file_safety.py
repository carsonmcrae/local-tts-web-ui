# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for treating a .ttsvoice file as hostile until it is checked, and previewing one.

Scope: The preview describes a package (name, styles, size, versions, that it is a real person's
voice) after the same checks as an import, and saves nothing; files from a newer format version get a
clear message; entries that appear twice or are marked encrypted, damaged entries, manifests nested
absurdly deep or of another format, packages missing their recording or built voice, and text with
control or direction-reversing characters are handled; an import never replaces a voice.
Does NOT belong: The round trip and the per-file checks (test_voice_sharing.py).
"""

from __future__ import annotations

import io
import json
import struct
import warnings
import zipfile
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from ltts import __version__
from ltts.container import Services
from test_voice_sharing import code, export, import_package, repack, studio_profile


def manifest(package: bytes) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(zipfile.ZipFile(io.BytesIO(package)).read("manifest.json"))
    return loaded


def with_manifest(package: bytes, **changes: Any) -> bytes:
    return repack(package, {"manifest.json": json.dumps({**manifest(package), **changes}).encode()})


def preview(client: TestClient, package: bytes) -> Any:
    return client.post("/api/voice-profiles/import/preview", content=package)


def test_a_preview_describes_the_voice_and_saves_nothing(
    client: TestClient, services: Services, tmp_path: Path
) -> None:
    package = export(client, studio_profile(services, tmp_path))
    before = client.get("/api/voice-profiles").json()
    shown = preview(client, package).json()
    assert shown["name"] == "Studio me" and shown["kind"] == "studio" and shown["humanVoice"] is True
    assert shown["styles"] == ["question"] and shown["sizeBytes"] == len(package)
    assert shown["formatVersion"] == 1 and shown["appVersion"] == __version__
    assert shown["consentStatement"] and shown["createdAt"] and shown["exportedAt"]
    assert client.get("/api/voice-profiles").json() == before
    assert not any(services.settings.path("tmp").glob("voice-preview-*"))
    assert code(preview(client, b"not a zip")) == "invalid_voice_file"


def test_a_file_from_a_newer_version_says_so(client: TestClient, services: Services, tmp_path: Path) -> None:
    package = with_manifest(export(client, studio_profile(services, tmp_path)), version=2, newField={"a": 1})
    for response in (preview(client, package), import_package(client, package)):
        assert response.status_code == 415 and code(response) == "voice_file_too_new"
        assert "newer version of TTSNative (voice format 2)" in response.json()["error"]["message"]
    other = with_manifest(export(client, studio_profile(services, tmp_path / "b")), format="something-else")
    assert "isn't a .ttsvoice package" in preview(client, other).json()["error"]["message"]


def test_unknown_optional_fields_are_ignored_within_a_version(
    client: TestClient, services: Services, tmp_path: Path
) -> None:
    package = with_manifest(export(client, studio_profile(services, tmp_path)), futureHint="ignored", creator="Ana")
    assert preview(client, package).json()["creator"] == "Ana"


def test_files_twice_and_absurd_manifests_are_refused(client: TestClient, services: Services, tmp_path: Path) -> None:
    package = export(client, studio_profile(services, tmp_path))
    source = zipfile.ZipFile(io.BytesIO(package))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as target, warnings.catch_warnings():
        warnings.simplefilter("ignore")  # zipfile warns about the duplicate name it is asked to write
        for name in source.namelist():
            target.writestr(name, source.read(name))
        target.writestr("reference.wav", source.read("reference.wav"))
    assert "twice" in import_package(client, buffer.getvalue()).json()["error"]["message"]
    deep = repack(package, {"manifest.json": b"[" * 30_000 + b"]" * 30_000})
    response = import_package(client, deep)
    assert response.status_code == 415 and "manifest isn't valid" in response.json()["error"]["message"]


def test_text_is_shown_plainly_and_an_import_never_replaces_a_voice(
    client: TestClient, services: Services, tmp_path: Path
) -> None:
    reverse, bell = chr(0x202E), chr(7)
    package = with_manifest(
        export(client, studio_profile(services, tmp_path)),
        name=f"Studio me{reverse}{bell}",
        description=f"Warm{reverse} and calm",
    )
    shown = preview(client, package).json()
    assert (shown["name"], shown["description"]) == ("Studio me", "Warm and calm")
    first = import_package(client, package).json()
    second = import_package(client, package).json()
    assert (first["name"], second["name"]) == ("Studio me (2)", "Studio me (3)")  # the original keeps its name
    assert len({first["id"], second["id"]}) == 2
    named = import_package(client, package, name=f"Gift{reverse}").json()
    assert named["name"] == "Gift"


def flagged_encrypted(package: bytes) -> bytes:
    """The package with its first entry marked encrypted in the central directory, as a protected ZIP is."""
    flags = package.index(bytes.fromhex("504b0102")) + 8
    return package[:flags] + struct.pack("<H", 1) + package[flags + 2 :]


def damaged(package: bytes, name: str) -> bytes:
    """The package stored uncompressed, with one byte of ``name`` flipped so its checksum no longer matches."""
    stored = repack(package, {})
    info = zipfile.ZipFile(io.BytesIO(stored)).getinfo(name)
    name_len, extra_len = struct.unpack("<HH", stored[info.header_offset + 26 : info.header_offset + 30])
    at = info.header_offset + 30 + name_len + extra_len + 100
    return stored[:at] + bytes([stored[at] ^ 0xFF]) + stored[at + 1 :]


def refusal(client: TestClient, package: bytes) -> str:
    response = import_package(client, package)
    assert response.status_code == 415 and code(response) == "invalid_voice_file"
    message: str = response.json()["error"]["message"]
    return message


def test_encrypted_or_damaged_entries_are_refused(client: TestClient, services: Services, tmp_path: Path) -> None:
    package = export(client, studio_profile(services, tmp_path))
    assert "is encrypted" in refusal(client, flagged_encrypted(package))
    assert "is damaged" in refusal(client, damaged(package, "reference.wav"))


def test_a_package_must_hold_its_recording_and_built_voice(
    client: TestClient, services: Services, tmp_path: Path
) -> None:
    package = export(client, studio_profile(services, tmp_path))
    files = manifest(package)["files"]

    def without(name: str) -> bytes:
        return with_manifest(repack(package, {name: None}), files={k: v for k, v in files.items() if k != name})

    assert "no reference recording" in refusal(client, without("reference.wav"))
    assert "built voice is missing" in refusal(client, without("voice.safetensors"))
