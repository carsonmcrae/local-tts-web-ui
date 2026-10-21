# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: LAN mode as a whole: turning it on and off, pairing devices, and recognising them.

Scope: LAN mode is off until turned on from this computer, and off again after every restart (paired
devices stay paired). While it is on, the app is also served on one private address of this computer,
the pairing code and its QR code (a link with the code after ``#``, so it never reaches a log) can
be shown, and requests that arrive on that address are recognised by their device cookie and the
address they come from. Turning it off stops listening at once. It also turns itself off, and says
why, when its address leaves this computer or moves to another adapter, or after the computer slept
(a laptop may wake on another network that hands out the same address), rather than appear on a
network nobody chose.
Does NOT belong: The request checks themselves (``security.py``, ``policy.py``) or HTTP (``router.py``).
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import logging
import time
from collections.abc import MutableMapping
from typing import Any, Literal

import segno

from ltts.common import ApiModel
from ltts.db import Database
from ltts.errors import ConflictError
from ltts.lan import network
from ltts.lan.devices import DEVICE_TTL, DeviceOut, DeviceStore, PairingCodes, PairingOut, Recognised
from ltts.lan.listener import LanListener
from ltts.lan.network import NetworkAddress
from ltts.lan.policy import WorkBudget

COOKIE = "ltts_device"
COOKIE_MAX_AGE_S = int(DEVICE_TTL.total_seconds())
WATCH_EVERY_S = 2.0  # how often the address is checked while LAN mode is on
SLEPT_AFTER_S = 30.0  # a check this much later than due means the computer was asleep (or suspended)
log = logging.getLogger("ltts.lan")


class LanStatus(ApiModel):
    enabled: bool
    address: str | None
    interface: str | None  # the adapter it listens on, such as "Wi-Fi"
    port: int | None
    url: str | None  # what to open on the device, without the pairing code
    addresses: list[NetworkAddress]  # this computer's private network addresses to choose from
    devices: list[DeviceOut]
    pairing: PairingOut | None
    turned_off: Literal["network_changed"] | None = None  # why it turned itself off, until switched again


class LanService:
    def __init__(self, db: Database):
        self.devices = DeviceStore(db)
        self.codes = PairingCodes()
        self.budget = WorkBudget()
        self._app: Any = None
        self.listener = LanListener(lambda: self._app)
        self.interface: str | None = None
        self.turned_off: Literal["network_changed"] | None = None
        self._watch: asyncio.Task[None] | None = None
        self.wall = time.time  # the wall clock, which keeps counting while the computer sleeps

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
            interface=self.interface if running else None,
            port=self.listener.port,
            url=self.origin(),
            addresses=network.network_addresses(),
            devices=self.devices.list_all(),
            pairing=self.codes.current() if running else None,
            turned_off=None if running else self.turned_off,
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
        """Listen on ``address``, or on the first ordinary network (never a VPN unless it is chosen)."""
        choices = network.network_addresses()
        if address is None:
            chosen = next((choice for choice in choices if choice.kind != "vpn"), None)
            if chosen is None:
                raise ConflictError("This computer isn't connected to a local network.", code="lan_no_network")
        else:
            chosen = next((choice for choice in choices if choice.address == address), None)
        await self._stop_watching()
        await self.listener.start(chosen.address if chosen else str(address), port)  # refuses unknown addresses
        self.interface = chosen.interface if chosen else None
        self.turned_off = None
        self.codes.new()
        self._watch = asyncio.get_running_loop().create_task(self._watch_network(self.wall()))
        log.warning("LAN mode is on: devices on %s can reach %s", self.interface, self.origin())
        return self.status()

    async def disable(self) -> LanStatus:
        await self._stop_watching()
        self.turned_off = None
        await self._turn_off()
        return self.status()

    async def _turn_off(self) -> None:
        self.codes.cancel()
        was_on = self.listener.running
        await self.listener.stop()
        if was_on:
            log.warning("LAN mode is off")

    async def _stop_watching(self) -> None:
        task, self._watch = self._watch, None
        if task is not None and task is not asyncio.current_task():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    def _still_here(self) -> bool:
        return any(
            choice.address == self.listener.address and choice.interface == self.interface
            for choice in network.network_addresses()
        )

    async def _watch_network(self, last: float) -> None:
        """Turn LAN mode off when its address goes or moves, or after the computer slept."""
        while self.listener.running:
            await asyncio.sleep(WATCH_EVERY_S)
            now = self.wall()
            slept, last = now - last > WATCH_EVERY_S + SLEPT_AFTER_S, now
            if slept or not await asyncio.to_thread(self._still_here):
                self.turned_off = "network_changed"
                self._watch = None
                log.warning("LAN mode turned itself off: the network changed or the computer was asleep")
                await self._turn_off()
                return

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

    def pair(self, code: str, name: str, address: str, previous: str | None = None) -> tuple[DeviceOut, str]:
        """Pair the device at ``address``; ``previous`` is the cookie it still has from an earlier pairing."""
        self.codes.use(code, address)
        return self.devices.add(name, address, replaces=previous)

    def recognise(self, token: str | None, address: str) -> Recognised:
        return self.devices.identify(token, address) if token else Recognised()
