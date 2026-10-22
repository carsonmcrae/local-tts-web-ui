# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Shared helpers for the LAN mode tests.

Scope: A stand-in for the network listener (no socket), this computer's network addresses as
``network.py`` lists them, a browser on a phone reaching the app on the LAN address, and pairing it.
Does NOT belong: Assertions (test_lan_mode.py, test_lan_security.py) or the shared fixtures (conftest.py).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from ltts.container import Services
from ltts.lan.network import NetworkAddress

LAN_ADDRESS = "192.168.1.20"
ORIGIN = f"http://{LAN_ADDRESS}:8765"


class FakeListener:
    """Stands in for the network listener: 'running' on the LAN address without a socket."""

    running = True
    address: str | None = LAN_ADDRESS
    port: int | None = 8765

    async def start(self, address: str, port: int) -> None:
        self.running, self.address, self.port = True, address, port

    async def stop(self) -> None:
        self.running = False


def here(address: str = "127.0.0.1") -> list[NetworkAddress]:
    """This computer's only network address, on its Wi-Fi."""
    return [NetworkAddress(address=address, interface="Wi-Fi", kind="network")]


def phone(client: TestClient, address: str = "192.168.1.50") -> TestClient:
    """A browser on a phone, reaching the app on the LAN address."""
    return TestClient(client.app, base_url=ORIGIN, client=(address, 50000),
                      headers={"X-LTTS-Client": "web", "Origin": ORIGIN})  # fmt: skip


def paired(client: TestClient, services: Services) -> TestClient:
    device = phone(client)
    code = services.lan.codes.new().code
    response = device.post("/api/lan/pair", json={"code": code, "name": "Kitchen tablet"})
    assert response.status_code == 201, response.text
    return device
