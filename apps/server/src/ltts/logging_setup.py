"""Purpose: Structured, privacy-preserving logging for the server.

Scope: A key=value formatter (``extra`` fields are appended), level selection per environment,
and quieting of noisy third-party loggers.
Does NOT belong: Error-to-response mapping (``errors``). Never log document text, recordings or
original filenames — log identifiers instead.
"""

from __future__ import annotations

import logging
import sys

_STANDARD_ATTRS = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}


class KeyValueFormatter(logging.Formatter):
    """``time level logger message key=value…`` — readable in a terminal, parseable by tools."""

    def format(self, record: logging.LogRecord) -> str:
        base = f"{self.formatTime(record, '%H:%M:%S')} {record.levelname:<7} {record.name}: {record.getMessage()}"
        extras = {k: v for k, v in record.__dict__.items() if k not in _STANDARD_ATTRS}
        if extras:
            base += " " + " ".join(f"{k}={v!r}" for k, v in sorted(extras.items()))
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


def configure_logging(env: str) -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(KeyValueFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.DEBUG if env == "development" else logging.INFO)
    for noisy in ("httpx", "httpcore", "multipart", "phonemizer", "python_multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
