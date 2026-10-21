# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The shapes the local speech API accepts and returns.

Scope: The OpenAI-compatible ``/v1`` bodies (snake_case, as OpenAI clients send them): the speech
request, validated strictly (no type coercion, fixed formats and ranges, voice ids limited to
letters, digits, ``_``, ``-`` and ``:``; any other field is ignored), and the model and voice lists.
Also the Settings bodies (camelCase, like the rest of ``/api``): the switches, the allowed custom
voices, a new token (returned once), the status and the in-use activity.
Does NOT belong: Validation that needs state, such as the input length limit or allowed voices (``service.py``).
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from ltts.common import ApiModel

AudioFormat = Literal["mp3", "opus", "flac", "wav", "pcm"]
MAX_INPUT_CHARS = 20_000  # the highest LTTS_SPEECH_API_MAX_CHARS; the configured limit is checked separately


class SpeechRequest(BaseModel):
    """``POST /v1/audio/speech``. Fields OpenAI added later (such as ``instructions``) are ignored."""

    model_config = ConfigDict(extra="ignore", strict=True)

    model: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    input: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)
    voice: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_:-]+$")
    response_format: AudioFormat = "mp3"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class ModelOut(BaseModel):
    id: str
    object: Literal["model"] = "model"
    created: int = 0
    owned_by: str = "ttsnative"


class ModelList(BaseModel):
    object: Literal["list"] = "list"
    data: list[ModelOut]


class VoiceOut(BaseModel):
    id: str
    object: Literal["voice"] = "voice"
    name: str
    engine: str
    language: str
    language_code: str
    gender: str
    category: str


class VoiceList(BaseModel):
    object: Literal["list"] = "list"
    data: list[VoiceOut]


CustomVoiceId = Annotated[str, Field(pattern=r"^custom:[A-Za-z0-9_-]{1,64}$")]


class SpeechApiSettingsIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    allow_network: bool = False
    allowed_voices: list[CustomVoiceId] = Field(default_factory=list, max_length=100)


class SpeechApiUsage(ApiModel):
    requests: int  # served since the server started
    last_used_at: str | None
    last_voice_id: str | None
    in_progress: bool
    active: bool  # a request is being made, or one was served in the last few seconds


class SpeechApiStatus(ApiModel):
    enabled: bool
    allow_network: bool
    allowed_voices: list[str]
    has_token: bool
    token_created_at: str | None
    network_mode: bool  # whether this server accepts connections from other devices at all
    port: int | None
    max_input_chars: int
    requests_per_minute: int
    usage: SpeechApiUsage


class SpeechApiToken(ApiModel):
    """A new token: the only time it is ever sent."""

    token: str
    created_at: str


class SpeechApiActivity(ApiModel):
    enabled: bool
    active: bool
