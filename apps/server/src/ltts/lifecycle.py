# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Let the program that started the server (the desktop app) stop it cleanly.

Scope: ``ltts serve --exit-with-stdin`` watches standard input; when it reaches end of file (the desktop
app closed the pipe, exited or crashed) the server is asked to stop the same way Ctrl+C would, so
running jobs are recorded and engines close before the process ends. Windows has no SIGTERM to send a
windowless child, which is why a pipe is used.
Does NOT belong: Starting the server (``cli.py``) or the desktop app's own process handling.
"""

from __future__ import annotations

import signal
import sys
import threading
from typing import TextIO


def stop_when_stdin_closes(stream: TextIO | None = None) -> threading.Thread:
    """Start a daemon thread that raises SIGINT in this process once ``stream`` (stdin) is closed."""

    def watch() -> None:
        source = stream or sys.stdin
        try:
            while source.read(1024):
                pass
        except (OSError, ValueError):
            pass  # a stdin that can't be read counts as closed
        signal.raise_signal(signal.SIGINT)

    thread = threading.Thread(target=watch, name="stdin-watch", daemon=True)
    thread.start()
    return thread
