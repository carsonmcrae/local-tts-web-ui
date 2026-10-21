# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Let the program that started the server (the desktop app) stop it cleanly.

Scope: ``ltts serve --exit-with-stdin`` watches standard input, which must be a pipe; when the other end
closes (the desktop app closed it, exited or crashed) the server is asked to stop the same way Ctrl+C
would, so running jobs are recorded and engines close before the process ends. Windows has no SIGTERM
to send a windowless child, which is why a pipe is used. On Windows the pipe is polled rather than read:
a thread blocked reading a pipe there stalls every DLL load in the process (importing numpy or
onnxruntime would hang).
Does NOT belong: Starting the server (``cli.py``) or the desktop app's own process handling.
"""

from __future__ import annotations

import importlib
import signal
import sys
import threading
import time
from typing import TextIO

POLL_S = 0.5


def stop_when_stdin_closes(
    stream: TextIO | None = None, *, windows: bool = sys.platform == "win32"
) -> threading.Thread:
    """Start a daemon thread that raises SIGINT in this process once ``stream`` (stdin) is closed."""

    def watch() -> None:
        source = stream or sys.stdin
        try:
            if windows:
                while not pipe_closed(source):
                    time.sleep(POLL_S)
            else:
                while source.read(1024):
                    pass
        except (OSError, ValueError):
            pass  # a stdin that can't be read counts as closed
        signal.raise_signal(signal.SIGINT)

    thread = threading.Thread(target=watch, name="stdin-watch", daemon=True)
    thread.start()
    return thread


def pipe_closed(stream: TextIO) -> bool:
    """Whether the writing end of a Windows pipe has gone, checked without blocking."""
    winapi = importlib.import_module("_winapi")
    msvcrt = importlib.import_module("msvcrt")
    try:
        winapi.PeekNamedPipe(msvcrt.get_osfhandle(stream.fileno()), 0)
    except OSError:
        return True
    return False
