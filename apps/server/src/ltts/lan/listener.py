# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Listen on this computer's address on the local network, only while LAN mode is on.

Scope: Serves the app on one of this computer's private addresses (``network.py`` lists them) with a
second server on the main server's event loop: same app, no lifespan of its own, no signal handling
(the main server owns Ctrl+C), and at most ``MAX_CONCURRENT`` requests at once, so devices on the
network can't take every worker thread from this computer's own window. The socket is bound here, so
a busy port is a clear error rather than an exit. Stopping closes it and drops every open connection
at once, including an answer still being sent. Nothing is ever opened on the router: no UPnP, no
port forwarding.
Does NOT belong: Who may connect (``security.py``, ``policy.py``), pairing (``devices.py``) or
which addresses there are (``network.py``).
"""

from __future__ import annotations

import asyncio
import logging
import socket
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import uvicorn

from ltts.errors import ConflictError
from ltts.lan.network import network_addresses

log = logging.getLogger("ltts.lan")
START_TIMEOUT_S = 5.0
MAX_CONCURRENT = 32  # requests at once from the network; the app has 40 worker threads in all


class _QuietServer(uvicorn.Server):
    """A uvicorn server that leaves signals to the main server."""

    @contextmanager
    def capture_signals(self) -> Iterator[None]:
        yield

    def install_signal_handlers(self) -> None:
        return None


class LanListener:
    def __init__(self, app: Callable[[], Any]):
        self._app = app  # the ASGI app, looked up when the listener starts
        self._server: _QuietServer | None = None
        self._task: asyncio.Task[None] | None = None
        self.address: str | None = None
        self.port: int | None = None

    @property
    def running(self) -> bool:
        return self._server is not None and self._task is not None and not self._task.done()

    async def start(self, address: str, port: int) -> None:
        # The socket is bound to the address as this computer reports it, chosen by the request but never
        # taken from it, so no client-sent string reaches bind() (and 0.0.0.0 is never among those addresses).
        choice = next((found for found in network_addresses() if found.address == address), None)
        if choice is None:
            raise ConflictError("That address isn't one of this computer's network addresses.", code="lan_address")
        await self.stop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind((choice.address, port))
            sock.listen(64)
        except OSError as exc:
            sock.close()
            raise ConflictError(
                f"Couldn't listen on {address}:{port}; another program may be using it.", code="lan_port_busy"
            ) from exc
        config = uvicorn.Config(
            self._app(), lifespan="off", log_level="warning", server_header=False, proxy_headers=False,
            log_config=None, access_log=False, limit_concurrency=MAX_CONCURRENT, timeout_graceful_shutdown=1,
        )  # fmt: skip
        server = _QuietServer(config)
        task = asyncio.get_running_loop().create_task(server.serve(sockets=[sock]))
        for _ in range(int(START_TIMEOUT_S / 0.05)):
            if server.started or task.done():
                break
            await asyncio.sleep(0.05)
        if not server.started:
            server.should_exit = True
            sock.close()
            raise ConflictError("The network listener didn't start.", code="lan_not_started")
        self._server, self._task, self.address, self.port = server, task, choice.address, sock.getsockname()[1]
        log.info("lan listener started", extra={"port": port})

    async def stop(self) -> None:
        server, task = self._server, self._task
        self._server, self._task, self.address, self.port = None, None, None, None
        if server is None or task is None:
            return
        server.should_exit = True
        _close_now(server)
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=START_TIMEOUT_S)
        except TimeoutError:
            server.force_exit = True
            _close_now(server)
            await asyncio.wait_for(task, timeout=START_TIMEOUT_S)
        log.info("lan listener stopped")


def _close_now(server: uvicorn.Server) -> None:
    """Stop accepting connections and drop the open ones, rather than wait for answers to finish."""
    for listening in server.servers:
        listening.close()
    for connection in server.server_state.connections.copy():  # a copy: each connection leaves the set as it closes
        transport = getattr(connection, "transport", None)
        if transport is not None:
            transport.abort()
