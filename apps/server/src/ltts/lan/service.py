# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: LAN mode as a whole: turning it on and off, pairing devices, and recognising them.

Scope: LAN mode is off until turned on from this computer, and off again after every restart (paired
devices stay paired). While it is on, the app is also served on one private address of this computer,
the pairing code and its QR code (a link with the code after ``#``, so it never reaches a log) can
be shown, and requests that arrive on that address are recognised by their device cookie. Turning it
off stops listening at once.
Does NOT belong: The request checks themselves (``security.py``, ``policy.py``) or HTTP (``router.py``).
"""

from __future__ import annotations

import io
from collections.abc import MutableMapping
from typing import Any

import segno

from ltts.common import ApiModel
from ltts.db import Database
from ltts.errors import ConflictError
from ltts.lan.devices import DeviceOut, DeviceStore, PairingCodes, PairingOut
from ltts.lan.listener import LanListener, network_addresses

COOKIE = "ltts_device"
COOKIE_MAX_AGE_S = 30 * 24 * 3600


class LanStatus(ApiModel):
    enabled: bool
    address: str | None
    port: int | None
    url: str | None  # what to open on the device, without the pairing code
    addresses: list[str]  # this computer's private network addresses to choose from
    devices: list[DeviceOut]
    pairing: PairingOut | None


class LanService:
    def __init__(self, db: Database):
        self.devices = DeviceStore(db)
        self.codes = PairingCodes()
        self._app: Any = None
        self.listener = LanListener(lambda: self._app)

    def attach(self, app: Any) -> None:
        """The ASGI app to serve on the network (the same one, with all its checks)."""
        self._app = app

    # -- state ---------------------------------------------------------------
    @property
    def enabled(self) -> bool:
        return self.listener.running

    def status(self) -> LanStatus:
        running = self.listener.running
        return LanStatus(
            enabled=running,
            address=self.listener.address,
            port=self.listener.port,
            url=self.origin(),
            addresses=network_addresses(),
            devices=self.devices.list_all(),
            pairing=self.codes.current() if running else None,
        )

    def origin(self) -> str | None:
        if not self.listener.running:
            return None
        return f"http://{self.listener.address}:{self.listener.port}"

    def hosts(self) -> set[str]:
        return {self.listener.address} if self.listener.running and self.listener.address else set()

    def serving(self, scope: MutableMapping[str, Any]) -> bool:
        """Whether a request arrived on the network listener (rather than this computer's own address)."""
        server = scope.get("server")
        return bool(self.listener.running and server and (server[0], server[1]) == (self.listener.address,
                                                                                    self.listener.port))  # fmt: skip

    # -- turning it on and off -----------------------------------------------
    async def enable(self, address: str | None, port: int) -> LanStatus:
        choices = network_addresses()
        chosen = address or (choices[0] if choices else None)
        if chosen is None:
            raise ConflictError("This computer isn't connected to a local network.", code="lan_no_network")
        await self.listener.start(chosen, port)
        self.codes.new()
        return self.status()

    async def disable(self) -> LanStatus:
        self.codes.cancel()
        await self.listener.stop()
        return self.status()

    # -- pairing -------------------------------------------------------------
    def new_code(self) -> PairingOut:
        if not self.listener.running:
            raise ConflictError("Turn on LAN mode first.", code="lan_off")
        return self.codes.new()

    def qr_svg(self) -> bytes:
        """The QR code for the current pairing link (the code after ``#``)."""
        pairing = self.codes.current()
        origin = self.origin()
        if pairing is None or origin is None:
            raise ConflictError("Show a new pairing code first.", code="no_pairing_code")
        buffer = io.BytesIO()
        link = f"{origin}/pair#{pairing.code.replace('-', '')}"
        segno.make(link, error="m").save(buffer, kind="svg", scale=6, border=2, dark="#000", light="#fff")
        return buffer.getvalue()

    def pair(self, code: str, name: str, address: str) -> tuple[DeviceOut, str]:
        self.codes.use(code, address)
        return self.devices.add(name)

    def device(self, token: str | None) -> DeviceOut | None:
        return self.devices.identify(token) if token else None
