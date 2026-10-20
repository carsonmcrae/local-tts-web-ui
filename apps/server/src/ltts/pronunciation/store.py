# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: The pronunciation dictionary: words the voices should say differently.

Scope: Rules that swap a word or phrase for how it should be spoken ("Kael" -> "Kale", "Dr." ->
"Doctor"), matched as whole words and, unless a rule says otherwise, in any letter case. They apply
to every sentence before it is spoken, previewed or exported; the spoken text is part of the audio
cache key, so changing a rule only regenerates the sentences it affects. Rules are plain text, never
regular expressions, so no rule can make matching slow. Storage with limits and duplicate checks.
Does NOT belong: HTTP parsing (``router.py``) or general text normalisation (``documents/normalize.py``).
"""

from __future__ import annotations

import re
import sqlite3
import threading
from collections.abc import Callable

from pydantic import ConfigDict, Field, field_validator

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import ConflictError, NotFoundError

MAX_RULES = 500
MAX_WORD_CHARS = 100
MAX_SAY_AS_CHARS = 200


class PronunciationIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    word: str = Field(min_length=1, max_length=MAX_WORD_CHARS)
    say_as: str = Field(min_length=1, max_length=MAX_SAY_AS_CHARS)
    match_case: bool = False

    @field_validator("word", "say_as")
    @classmethod
    def _tidy(cls, value: str) -> str:
        tidy = " ".join(value.split())
        if not tidy:
            raise ValueError("must not be blank")
        return tidy


class PronunciationOut(PronunciationIn):
    id: str
    created_at: str


def _rule(row: sqlite3.Row) -> PronunciationOut:
    return PronunciationOut(
        id=row["id"],
        word=row["word"],
        say_as=row["say_as"],
        match_case=bool(row["match_case"]),
        created_at=row["created_at"],
    )


def compile_rules(rules: list[PronunciationOut]) -> Callable[[str], str]:
    """One whole-word matcher for every rule; a case-sensitive rule wins over one that ignores case."""
    if not rules:
        return lambda text: text
    exact = {rule.word: rule.say_as for rule in rules if rule.match_case}
    loose = {rule.word.casefold(): rule.say_as for rule in rules if not rule.match_case}
    words = sorted({rule.word for rule in rules}, key=len, reverse=True)  # longest phrase first
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(word) for word in words) + r")(?!\w)", re.IGNORECASE)

    def say(match: re.Match[str]) -> str:
        found = match.group(0)
        return exact.get(found) or loose.get(found.casefold(), found)

    return lambda text: pattern.sub(say, text)


class PronunciationStore:
    def __init__(self, db: Database):
        self._db = db
        self._lock = threading.Lock()
        self._apply: Callable[[str], str] | None = None

    def list_all(self) -> list[PronunciationOut]:
        with self._db.connect() as conn:
            rows = conn.execute("SELECT * FROM pronunciations ORDER BY word COLLATE NOCASE, created_at").fetchall()
        return [_rule(row) for row in rows]

    def get(self, rule_id: str) -> PronunciationOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM pronunciations WHERE id = ?", (rule_id,)).fetchone()
        if row is None:
            raise NotFoundError("That pronunciation no longer exists.", code="pronunciation_not_found")
        return _rule(row)

    def create(self, rule: PronunciationIn) -> PronunciationOut:
        rule_id = new_id()
        with self._db.connect() as conn:
            if conn.execute("SELECT COUNT(*) FROM pronunciations").fetchone()[0] >= MAX_RULES:
                raise ConflictError(f"The dictionary is full ({MAX_RULES} words).", code="pronunciation_limit")
            self._ensure_unique(conn, rule, None)
            conn.execute(
                "INSERT INTO pronunciations (id, word, say_as, match_case, created_at) VALUES (?, ?, ?, ?, ?)",
                (rule_id, rule.word, rule.say_as, int(rule.match_case), utc_now()),
            )
        self._changed()
        return self.get(rule_id)

    def update(self, rule_id: str, rule: PronunciationIn) -> PronunciationOut:
        self.get(rule_id)
        with self._db.connect() as conn:
            self._ensure_unique(conn, rule, rule_id)
            conn.execute(
                "UPDATE pronunciations SET word = ?, say_as = ?, match_case = ? WHERE id = ?",
                (rule.word, rule.say_as, int(rule.match_case), rule_id),
            )
        self._changed()
        return self.get(rule_id)

    def delete(self, rule_id: str) -> None:
        self.get(rule_id)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM pronunciations WHERE id = ?", (rule_id,))
        self._changed()

    def apply(self, text: str) -> str:
        """``text`` with every rule applied (the matcher is rebuilt only after the rules change)."""
        with self._lock:
            if self._apply is None:
                self._apply = compile_rules(self.list_all())
            apply = self._apply
        return apply(text)

    def _changed(self) -> None:
        with self._lock:
            self._apply = None

    @staticmethod
    def _ensure_unique(conn: sqlite3.Connection, rule: PronunciationIn, rule_id: str | None) -> None:
        rows = conn.execute("SELECT id, word, match_case FROM pronunciations").fetchall()
        for row in rows:
            same = (
                row["word"] == rule.word
                if rule.match_case and row["match_case"]
                else (row["word"].casefold() == rule.word.casefold())
            )
            if same and row["id"] != rule_id:
                raise ConflictError(f"“{rule.word}” is already in the dictionary.", code="pronunciation_exists")
