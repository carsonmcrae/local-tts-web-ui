"""Purpose: User preferences shared by every browser that opens this local app.

Scope: A typed preferences document (default voice, playback rate, pace, export format, read-along
behaviour) persisted as one JSON row, with GET/PUT endpoints. Unknown keys are rejected.
Does NOT belong: Per-device UI state such as theme (kept in the browser).
"""

from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter
from pydantic import ConfigDict, Field

from ltts.common import ApiModel
from ltts.container import ServicesDep
from ltts.db import Database

_KEY = "user"


class Preferences(ApiModel):
    model_config = ConfigDict(extra="forbid")

    default_voice_id: str = Field(default="kokoro:af_heart", max_length=120)
    playback_rate: float = Field(default=1.0, ge=0.5, le=3.0)
    pace: float = Field(default=1.0, ge=0.5, le=2.0)
    export_format: Literal["wav", "mp3"] = "mp3"
    auto_scroll: bool = True
    skip_seconds: int = Field(default=15, ge=5, le=60)


class PreferenceStore:
    def __init__(self, db: Database):
        self._db = db

    def get(self) -> Preferences:
        with self._db.connect() as conn:
            row = conn.execute("SELECT value_json FROM preferences WHERE key = ?", (_KEY,)).fetchone()
        if row is None:
            return Preferences()
        stored = json.loads(row[0])
        known = {name: stored[name] for name in Preferences.model_fields if name in stored}
        return Preferences.model_validate(known)

    def put(self, prefs: Preferences) -> Preferences:
        with self._db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO preferences (key, value_json) VALUES (?, ?)",
                (_KEY, json.dumps(prefs.model_dump(by_alias=False))),
            )
        return prefs


router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("", response_model=Preferences)
def get_preferences(services: ServicesDep) -> Preferences:
    return services.preferences.get()


@router.put("", response_model=Preferences)
def put_preferences(body: Preferences, services: ServicesDep) -> Preferences:
    return services.preferences.put(body)
