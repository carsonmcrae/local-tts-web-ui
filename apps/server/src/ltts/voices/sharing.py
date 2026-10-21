# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Share a custom voice as a ``.ttsvoice`` file, and import a voice someone shared with you.

Scope: Export packs a profile's built voice, its speaking styles and its short playable reference
with a manifest (name, delivery, the creator's consent statement and a SHA-256 per file) into a ZIP;
session takes and other recordings never leave the computer. Import reads only the exact files a
voice package may hold, each within a strict size limit, verifies every checksum, the reference
audio and each safetensors header (``safetensors_check``) without loading a tensor or running any
code, requires the importer's own consent, and saves it as a new profile marked as shared.
Does NOT belong: HTTP parsing (``router.py``), profile storage (``profiles.py``) or synthesis.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import shutil
import zipfile
from pathlib import Path
from typing import Literal

from pydantic import Field, ValidationError

from ltts.common import MB, ApiModel, new_id, utc_now
from ltts.config import Settings
from ltts.engines.base import Delivery
from ltts.errors import ConflictError, UnsupportedDocumentError
from ltts.voices.profiles import (
    MAX_STORED_S,
    SharedVoice,
    VoiceKind,
    VoiceProfileOut,
    VoiceProfileService,
    decode_recording,
)
from ltts.voices.safetensors_check import CONDITIONING, STYLE, check_safetensors
from ltts.voices.styles import STYLE_SOURCES

log = logging.getLogger("ltts.voices.sharing")
EXTENSION = ".ttsvoice"
MAX_PACKAGE_BYTES = 40 * MB
_MANIFEST = "manifest.json"
_REFERENCE = "reference.wav"
_VOICE = "voice.safetensors"
_LIMITS: dict[str, int] = {
    _MANIFEST: 64 * 1024,
    _REFERENCE: 12 * MB,  # 30 s of 48 kHz audio
    _VOICE: 16 * MB,
    **{f"styles/{style}.safetensors": 2 * MB for style in STYLE_SOURCES},
}
_SHA256 = re.compile("^[0-9a-f]{64}$")
_UNSAFE_NAME = re.compile("[^A-Za-z0-9 _-]+")


class SharedVoiceManifest(ApiModel):
    format: Literal["ttsnative-voice"]
    version: Literal[1]
    name: str = Field(min_length=1, max_length=60)
    kind: VoiceKind
    engine_id: Literal["chatterbox"]
    delivery: Delivery
    duration_s: float = Field(ge=0, le=100_000)
    sample_rate: int = Field(ge=8_000, le=48_000)
    consent_statement: str = Field(max_length=2_000)
    consented_at: str = Field(max_length=40)
    exported_at: str = Field(max_length=40)
    files: dict[str, str]  # file name -> SHA-256


def _invalid(why: str) -> UnsupportedDocumentError:
    return UnsupportedDocumentError(f"That isn't a voice file this app can import: {why}.", code="invalid_voice_file")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(MB), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_name(name: str) -> str:
    """A safe download name for a voice's package."""
    return f"{_UNSAFE_NAME.sub('', name).strip()[:60] or 'voice'}{EXTENSION}"


class VoiceSharing:
    def __init__(self, settings: Settings, profiles: VoiceProfileService):
        self._settings = settings
        self._profiles = profiles

    def export(self, profile_id: str) -> tuple[bytes, VoiceProfileOut]:
        """The profile as a ``.ttsvoice`` package (a ZIP), and the profile it came from."""
        profile, statement, files = self._profiles.shareable_files(profile_id)
        manifest = SharedVoiceManifest(
            format="ttsnative-voice",
            version=1,
            name=profile.name,
            kind=profile.kind,
            engine_id="chatterbox",
            delivery=profile.delivery,
            duration_s=profile.duration_s,
            sample_rate=profile.sample_rate,
            consent_statement=statement,
            consented_at=profile.consented_at,
            exported_at=utc_now(),
            files={name: _sha256(path) for name, path in files.items()},
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as package:
            package.writestr(_MANIFEST, manifest.model_dump_json(by_alias=True, indent=2))
            for name, path in files.items():
                package.write(path, name)
        log.info("voice exported", extra={"profile_id": profile_id, "files": len(files)})
        return buffer.getvalue(), profile

    def import_package(self, upload: Path, consent: bool, name: str | None = None) -> VoiceProfileOut:
        """Check a package completely, then save it as a new shared profile (with the importer's consent)."""
        if not consent:
            raise ConflictError(
                "Confirm you have the voice owner's permission before importing their voice.", code="consent_required"
            )
        staging = self._settings.path("tmp") / f"voice-import-{new_id()}"
        staging.mkdir(parents=True)
        try:
            manifest = self._unpack(upload, staging)
            self._check_files(manifest, staging)
            styles = staging / "styles"
            return self._profiles.create_shared(
                SharedVoice(
                    name=(name or manifest.name).strip()[:60] or manifest.name,
                    kind=manifest.kind,
                    delivery=manifest.delivery,
                    duration_s=manifest.duration_s,
                    reference=staging / _REFERENCE,
                    voice=staging / _VOICE if (staging / _VOICE).is_file() else None,
                    styles=styles if styles.is_dir() else None,
                    origin=manifest.model_dump(by_alias=True, exclude={"files"}),
                ),
                consent,
            )
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _unpack(self, upload: Path, staging: Path) -> SharedVoiceManifest:
        """Read the package's allowed files into ``staging`` (never by their own paths), checking their sizes."""
        try:
            package = zipfile.ZipFile(upload)
        except (zipfile.BadZipFile, OSError) as exc:
            raise _invalid("it isn't a .ttsvoice package") from exc
        with package:
            infos = [info for info in package.infolist() if not info.is_dir()]
            for info in infos:
                if info.filename not in _LIMITS:
                    raise _invalid(f"it contains an unexpected file ({info.filename[:80]})")
                if info.flag_bits & 0x1:
                    raise _invalid("it is encrypted")
                if info.file_size > _LIMITS[info.filename]:
                    raise _invalid(f"{info.filename} is too large")
            try:
                for info in infos:
                    target = staging / info.filename  # a name from the allow-list, never a path from the archive
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.open(info) as member:
                        target.write_bytes(member.read(_LIMITS[info.filename] + 1))
            except (zipfile.BadZipFile, OSError, EOFError) as exc:
                raise _invalid("it is damaged") from exc
        manifest_path = staging / _MANIFEST
        if not manifest_path.is_file():
            raise _invalid("it has no manifest")
        try:
            return SharedVoiceManifest.model_validate(json.loads(manifest_path.read_text(encoding="utf-8")))
        except (ValueError, ValidationError) as exc:
            raise _invalid("its manifest isn't valid") from exc

    def _check_files(self, manifest: SharedVoiceManifest, staging: Path) -> None:
        present = {str(path.relative_to(staging).as_posix()) for path in staging.rglob("*") if path.is_file()}
        present.discard(_MANIFEST)
        if set(manifest.files) != present:
            raise _invalid("its files don't match its manifest")
        for name, digest in manifest.files.items():
            if not _SHA256.match(digest) or _sha256(staging / name) != digest:
                raise _invalid(f"{name} is damaged or was changed")
        if _REFERENCE not in present:
            raise _invalid("it has no reference recording")
        decode_recording(staging / _REFERENCE, MAX_STORED_S + 1)
        if manifest.kind == "studio" and _VOICE not in present:
            raise _invalid("its built voice is missing")
        if _VOICE in present:
            check_safetensors(staging / _VOICE, CONDITIONING)
        for name in present - {_REFERENCE, _VOICE}:
            check_safetensors(staging / name, STYLE)
