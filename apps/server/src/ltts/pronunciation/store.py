# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The pronunciation dictionary: words the voices should say differently.

Scope: Rules that swap a word or phrase for how it should be spoken ("gnocchi" -> "NYOH-kee", "Dr." ->
"Doctor"), matched as whole words and, unless a rule says otherwise, in any letter case. A rule is
for the whole library or for one document (and is deleted with it); in that document its rule wins
over the library's for the same word. Rules change only what is spoken, never the text, and apply
before a sentence is spoken, previewed or exported; the spoken text is part of the audio cache key, so
a changed rule only regenerates the sentences it affects. A respelling is read as words: a syllable in
capitals marks stress and is never spelled out. Rules are plain text, never regular expressions, so no
rule can make matching slow. Storage with limits and duplicate checks, and the previews' rate limit.
Does NOT belong: HTTP parsing (``router.py``), hearing a word before saving it (``preview.py``) or
general text normalisation (``documents/normalize.py``).
"""

from __future__ import annotations

import re
import sqlite3
import threading
from collections import OrderedDict
from collections.abc import Callable, Sequence

from pydantic import ConfigDict, Field, field_validator

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import ConflictError, NotFoundError
from ltts.speech_api.guard import RateLimiter

MAX_RULES = 500  # for the library, and again for each document
MAX_WORD_CHARS = 100
MAX_SAY_AS_CHARS = 200
PREVIEWS_PER_MINUTE = 30
MATCHERS_KEPT = 32  # documents whose compiled rules stay in memory
DOCUMENT_ID = r"^[0-9a-f]{32}$"
_TOKEN = re.compile(r"[\w-]+")  # one character class: linear, so no respelling can make matching slow
_RULES = (
    "SELECT p.id, p.word, p.say_as, p.match_case, p.document_id, p.created_at, d.title "
    "FROM pronunciations AS p LEFT JOIN documents AS d ON d.id = p.document_id "
)
_LIST = _RULES + "ORDER BY p.word COLLATE NOCASE, p.document_id IS NOT NULL, d.title COLLATE NOCASE, p.created_at"
_ONE = _RULES + "WHERE p.id = ?"
_SCOPE = _RULES + "WHERE p.document_id IS ?"  # IS: a NULL document is the library


def tidy(value: str) -> str:
    """Whitespace collapsed; blank text is refused."""
    tidied = " ".join(value.split())
    if not tidied:
        raise ValueError("must not be blank")
    return tidied


class PronunciationIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    word: str = Field(min_length=1, max_length=MAX_WORD_CHARS)
    say_as: str = Field(min_length=1, max_length=MAX_SAY_AS_CHARS)
    match_case: bool = False
    # The one document the rule is for; None (or, when changing a rule, leaving it out keeps its scope)
    # is every document.
    document_id: str | None = Field(default=None, pattern=DOCUMENT_ID)

    @field_validator("word", "say_as")
    @classmethod
    def _tidy(cls, value: str) -> str:
        return tidy(value)


class PronunciationOut(PronunciationIn):
    id: str
    created_at: str
    document_title: str | None = None  # the document's title when the rule is for one document


def _rule(row: sqlite3.Row) -> PronunciationOut:
    return PronunciationOut(
        id=row["id"],
        word=row["word"],
        say_as=row["say_as"],
        match_case=bool(row["match_case"]),
        document_id=row["document_id"],
        created_at=row["created_at"],
        document_title=row["title"],
    )


def _syllable(piece: str) -> str:
    return piece.lower() if len(piece) > 1 and piece.isupper() else piece


def _hyphenated(token: str) -> str:
    """Lower the capitalised syllables of every run of two or more pieces joined by single hyphens."""
    out: list[str] = []
    run: list[str] = []
    for piece in [*token.split("-"), ""]:  # the sentinel ends the last run
        if piece:
            run.append(piece)
            continue
        out.extend([_syllable(part) for part in run] if len(run) > 1 else run)
        out.append(piece)
        run = []
    return "-".join(out[:-1])


def spoken_respelling(say_as: str) -> str:
    """What the voice is given for a respelling. In a hyphenated respelling ("NYOH-kee") the capitals mark
    the stressed syllable for the reader, so that syllable is given as part of the word; a voice would
    otherwise spell it out letter by letter. Anything else, such as "U S A", is given as written."""
    return _TOKEN.sub(lambda match: _hyphenated(match.group(0)), say_as)


def compile_rules(*layers: Sequence[PronunciationOut]) -> Callable[[str], str]:
    """One whole-word matcher for every rule. An earlier list of rules wins over a later one (a document's
    own rules come before the library's); within a list, a case-sensitive rule wins over one that ignores
    case."""
    words = sorted({rule.word for layer in layers for rule in layer}, key=len, reverse=True)  # longest first
    if not words:
        return lambda text: text
    lookups = [
        (
            {rule.word: spoken_respelling(rule.say_as) for rule in layer if rule.match_case},
            {rule.word.casefold(): spoken_respelling(rule.say_as) for rule in layer if not rule.match_case},
        )
        for layer in layers
    ]
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(word) for word in words) + r")(?!\w)", re.IGNORECASE)

    def say(match: re.Match[str]) -> str:
        found = match.group(0)
        for exact, loose in lookups:
            spoken = exact.get(found) or loose.get(found.casefold())
            if spoken:
                return spoken
        return found

    return lambda text: pattern.sub(say, text)


class PronunciationStore:
    def __init__(self, db: Database):
        self._db = db
        self._lock = threading.Lock()
        self._matchers: OrderedDict[str | None, Callable[[str], str]] = OrderedDict()  # by document (None: none)
        self.previews = RateLimiter(PREVIEWS_PER_MINUTE)  # hearing words before saving them synthesises audio

    def list_all(self) -> list[PronunciationOut]:
        """Every rule, the library's and each document's, by word (the library's first)."""
        with self._db.connect() as conn:
            rows = conn.execute(_LIST).fetchall()
        return [_rule(row) for row in rows]

    def get(self, rule_id: str) -> PronunciationOut:
        with self._db.connect() as conn:
            row = conn.execute(_ONE, (rule_id,)).fetchone()
        if row is None:
            raise NotFoundError("That pronunciation no longer exists.", code="pronunciation_not_found")
        return _rule(row)

    def create(self, rule: PronunciationIn) -> PronunciationOut:
        rule_id = new_id()
        with self._db.connect() as conn:
            self._ensure_room(conn, rule.document_id)
            self._ensure_unique(conn, rule, None)
            conn.execute(
                "INSERT INTO pronunciations (id, word, say_as, match_case, document_id, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (rule_id, rule.word, rule.say_as, int(rule.match_case), rule.document_id, utc_now()),
            )
        self._changed()
        return self.get(rule_id)

    def update(self, rule_id: str, rule: PronunciationIn) -> PronunciationOut:
        """Change a rule; it moves to another document or to the library only when ``document_id`` is sent."""
        current = self.get(rule_id)
        if "document_id" not in rule.model_fields_set:
            rule = rule.model_copy(update={"document_id": current.document_id})
        with self._db.connect() as conn:
            if rule.document_id != current.document_id:
                self._ensure_room(conn, rule.document_id)
            self._ensure_unique(conn, rule, rule_id)
            conn.execute(
                "UPDATE pronunciations SET word = ?, say_as = ?, match_case = ?, document_id = ? WHERE id = ?",
                (rule.word, rule.say_as, int(rule.match_case), rule.document_id, rule_id),
            )
        self._changed()
        return self.get(rule_id)

    def delete(self, rule_id: str) -> None:
        self.get(rule_id)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM pronunciations WHERE id = ?", (rule_id,))
        self._changed()

    def apply(self, text: str, document_id: str | None = None) -> str:
        """``text`` as it should be spoken: the library's rules and, for a document's sentence, that
        document's own (each document's matcher is rebuilt only after the rules change)."""
        with self._lock:
            apply = self._matchers.get(document_id)
            if apply is None:
                apply = self._compile(document_id)
                self._matchers[document_id] = apply
                while len(self._matchers) > MATCHERS_KEPT:
                    self._matchers.popitem(last=False)
            self._matchers.move_to_end(document_id)
        return apply(text)

    def _compile(self, document_id: str | None) -> Callable[[str], str]:
        with self._db.connect() as conn:
            library = [_rule(row) for row in conn.execute(_SCOPE, (None,))]
            own = [_rule(row) for row in conn.execute(_SCOPE, (document_id,))] if document_id else []
        return compile_rules(own, library)

    def _changed(self) -> None:
        with self._lock:
            self._matchers.clear()

    @staticmethod
    def _ensure_room(conn: sqlite3.Connection, document_id: str | None) -> None:
        if document_id and conn.execute("SELECT 1 FROM documents WHERE id = ?", (document_id,)).fetchone() is None:
            raise NotFoundError("That document no longer exists.", code="document_not_found")
        count = conn.execute("SELECT COUNT(*) FROM pronunciations WHERE document_id IS ?", (document_id,)).fetchone()[0]
        if count >= MAX_RULES:
            where = "This document's list" if document_id else "The dictionary"
            raise ConflictError(f"{where} is full ({MAX_RULES} words).", code="pronunciation_limit")

    @staticmethod
    def _ensure_unique(conn: sqlite3.Connection, rule: PronunciationIn, rule_id: str | None) -> None:
        rows = conn.execute(
            "SELECT id, word, match_case FROM pronunciations WHERE document_id IS ?", (rule.document_id,)
        ).fetchall()
        for row in rows:
            same = (
                row["word"] == rule.word
                if rule.match_case and row["match_case"]
                else (row["word"].casefold() == rule.word.casefold())
            )
            if same and row["id"] != rule_id:
                where = "this document's pronunciations" if rule.document_id else "the dictionary"
                raise ConflictError(f"“{rule.word}” is already in {where}.", code="pronunciation_exists")
