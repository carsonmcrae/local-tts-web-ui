# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Listen on this computer's address on the local network, only while LAN mode is on.

Scope: Lists this computer's private IPv4 addresses (home and office networks; never public,
loopback or link-local ones), then serves the app on one of them with a second server on the main
server's event loop: same app, no lifespan of its own, no signal handling (the main server owns
Ctrl+C). The socket is bound here, so a busy port is a clear error rather than an exit. Stopping
closes it at once. Nothing is ever opened on the router: no UPnP, no port forwarding.
Does NOT belong: Who may connect (``security.py``, ``policy.py``) or pairing (``devices.py``).
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import psutil
import uvicorn

from ltts.errors import ConflictError

log = logging.getLogger("ltts.lan")
START_TIMEOUT_S = 5.0


def network_addresses() -> list[str]:
    """This computer's addresses on private networks, the likeliest (192.168…) first."""
    found: set[str] = set()
    for entries in psutil.net_if_addrs().values():
        for entry in entries:
            if entry.family != socket.AF_INET:
                continue
            try:
                address = ipaddress.ip_address(entry.address)
            except ValueError:
                continue
            if address.is_private and not (address.is_loopback or address.is_link_local or address.is_unspecified):
                found.add(str(address))
    return sorted(found, key=lambda a: (not a.startswith("192.168."), not a.startswith("10."), a))


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
        if address not in network_addresses():
            raise ConflictError("That address isn't one of this computer's network addresses.", code="lan_address")
        await self.stop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind((address, port))
            sock.listen(64)
        except OSError as exc:
            sock.close()
            raise ConflictError(
                f"Couldn't listen on {address}:{port}; another program may be using it.", code="lan_port_busy"
            ) from exc
        config = uvicorn.Config(
            self._app(), lifespan="off", log_level="warning", server_header=False, proxy_headers=False,
            log_config=None, access_log=False,
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
        self._server, self._task, self.address, self.port = server, task, address, sock.getsockname()[1]
        log.info("lan listener started", extra={"port": port})

    async def stop(self) -> None:
        server, task = self._server, self._task
        self._server, self._task, self.address, self.port = None, None, None, None
        if server is None or task is None:
            return
        server.should_exit = True
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=START_TIMEOUT_S)
        except TimeoutError:
            server.force_exit = True
            await asyncio.wait_for(task, timeout=START_TIMEOUT_S)
        log.info("lan listener stopped")
