# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Human-readable metadata for Kokoro's 54 built-in voices.

Scope: Display name, language, gender and the upstream overall quality grade, transcribed from
hexgrad/Kokoro-82M VOICES.md (Apache-2.0). Voice identifiers are the keys in voices-v1.0.bin.
Does NOT belong: Voice embedding data (shipped in the downloaded model files).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class LanguageInfo:
    name: str
    espeak: str


LANGUAGES: dict[str, LanguageInfo] = {
    "a": LanguageInfo("English (US)", "en-us"),
    "b": LanguageInfo("English (UK)", "en-gb"),
    "e": LanguageInfo("Spanish", "es"),
    "f": LanguageInfo("French", "fr-fr"),
    "h": LanguageInfo("Hindi", "hi"),
    "i": LanguageInfo("Italian", "it"),
    "j": LanguageInfo("Japanese", "ja"),
    "p": LanguageInfo("Portuguese (BR)", "pt-br"),
    "z": LanguageInfo("Mandarin Chinese", "cmn"),
}

# id -> upstream overall grade (None where upstream publishes no grade)
GRADES: dict[str, str | None] = {
    "af_heart": "A", "af_alloy": "C", "af_aoede": "C+", "af_bella": "A-", "af_jessica": "D",
    "af_kore": "C+", "af_nicole": "B-", "af_nova": "C", "af_river": "D", "af_sarah": "C+",
    "af_sky": "C-", "am_adam": "F+", "am_echo": "D", "am_eric": "D", "am_fenrir": "C+",
    "am_liam": "D", "am_michael": "C+", "am_onyx": "D", "am_puck": "C+", "am_santa": "D-",
    "bf_alice": "D", "bf_emma": "B-", "bf_isabella": "C", "bf_lily": "D", "bm_daniel": "D",
    "bm_fable": "C", "bm_george": "C", "bm_lewis": "D+", "jf_alpha": "C+", "jf_gongitsune": "C",
    "jf_nezumi": "C-", "jf_tebukuro": "C", "jm_kumo": "C-", "zf_xiaobei": "D", "zf_xiaoni": "D",
    "zf_xiaoxiao": "D", "zf_xiaoyi": "D", "zm_yunjian": "D", "zm_yunxi": "D", "zm_yunxia": "D",
    "zm_yunyang": "D", "ef_dora": None, "em_alex": None, "em_santa": None, "ff_siwis": "B-",
    "hf_alpha": "C", "hf_beta": "C", "hm_omega": "C", "hm_psi": "C", "if_sara": "C",
    "im_nicola": "C", "pf_dora": None, "pm_alex": None, "pm_santa": None,
}  # fmt: skip

DEFAULT_VOICE = "af_heart"
_EXPERIMENTAL = {"j", "z"}


def describe(voice_id: str) -> tuple[str, LanguageInfo, str, str]:
    """Return ``(display name, language, gender, note)`` for a Kokoro voice id like ``bf_emma``."""
    prefix, _, raw_name = voice_id.partition("_")
    language = LANGUAGES.get(prefix[:1], LanguageInfo("Other", "en-us"))
    gender = {"f": "female", "m": "male"}.get(prefix[1:2], "unspecified")
    note = "Pronunciation uses a generic phonemiser and may be rough." if prefix[:1] in _EXPERIMENTAL else ""
    return raw_name.replace("_", " ").title(), language, gender, note
