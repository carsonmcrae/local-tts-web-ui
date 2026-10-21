# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for LAN mode: pairing phones and tablets, and what they may do.

Scope: Pairing codes (expiry, single use, wrong guesses, a per-address limit), device tokens (only a
hash stored, removal takes effect at once), the requests a device on the network may make before
and after pairing, the Origin and Host checks there, what stays on this computer, and the management
endpoints. A real listener is started and stopped on a loopback address (no firewall prompt).
Does NOT belong: The speech API's own network permission (test_speech_api.py).
"""

from __future__ import annotations

import asyncio
import sqlite3
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from ltts.container import Services
from ltts.lan import listener as listener_module
from ltts.lan.devices import ALPHABET, PairingCodes, PairingFailedError
from ltts.lan.listener import LanListener
from ltts.lan.policy import open_to_unpaired, refused_remotely

LAN_ADDRESS = "192.168.1.20"
ORIGIN = f"http://{LAN_ADDRESS}:8765"


class FakeListener:
    """Stands in for the network listener: 'running' on the LAN address without a socket."""

    running = True
    address = LAN_ADDRESS
    port = 8765

    async def stop(self) -> None:
        self.running = False


@pytest.fixture
def lan(services: Services) -> Services:
    services.lan.listener = FakeListener()  # type: ignore[assignment]
    return services


def phone(client: TestClient) -> TestClient:
    """A browser on a phone, reaching the app on the LAN address."""
    return TestClient(client.app, base_url=ORIGIN, client=("192.168.1.50", 50000),
                      headers={"X-LTTS-Client": "web", "Origin": ORIGIN})  # fmt: skip


def paired(client: TestClient, services: Services) -> TestClient:
    device = phone(client)
    code = services.lan.codes.new().code
    response = device.post("/api/lan/pair", json={"code": code, "name": "Kitchen tablet"})
    assert response.status_code == 201, response.text
    return device


def test_pairing_codes_expire_work_once_and_resist_guessing() -> None:
    now = [0.0]
    codes = PairingCodes(clock=lambda: now[0])
    shown = codes.new()
    assert len(shown.code) == 9 and shown.code[4] == "-" and all(c in ALPHABET for c in shown.code.replace("-", ""))
    codes.use(shown.code.lower(), "a")  # case and the dash don't matter
    with pytest.raises(PairingFailedError):
        codes.use(shown.code, "a")  # used once
    shown = codes.new()
    now[0] = 301
    with pytest.raises(PairingFailedError, match="expired"):
        codes.use(shown.code, "b")
    shown = codes.new()
    for attempt in range(10):
        now[0] += 61 if attempt % 4 == 0 else 1  # stay under the per-address limit
        with pytest.raises(PairingFailedError):
            codes.use("WRONGCOD", "c")
    now[0] += 61
    with pytest.raises(PairingFailedError, match="expired"):
        codes.use(shown.code, "c")  # ten wrong guesses dropped the code
    shown = codes.new()
    for _ in range(5):
        with pytest.raises(PairingFailedError):
            codes.use("WRONGCOD", "d")
    with pytest.raises(PairingFailedError) as limited:
        codes.use(shown.code, "d")
    assert limited.value.code == "pairing_rate_limited"


def test_policy_keeps_this_computers_own_operations_off_the_network() -> None:
    assert open_to_unpaired("GET", "/") and open_to_unpaired("GET", "/assets/app.js")
    assert open_to_unpaired("POST", "/api/lan/pair") and open_to_unpaired("GET", "/api/lan/device")
    assert not open_to_unpaired("GET", "/api/documents") and not open_to_unpaired("POST", "/pair")
    assert not any(open_to_unpaired("GET", path) for path in ("/openapi.json", "/docs", "/redoc", "/v1/models"))
    for method, path in [("GET", "/api/lan"), ("PUT", "/api/lan"), ("DELETE", "/api/lan/devices"),
                         ("PUT", "/api/speech-api"), ("GET", "/api/integrations/audiobookshelf"),
                         ("PUT", "/api/voice-sessions/" + "a" * 32 + "/takes/1"), ("POST", "/api/documents/url"),
                         ("POST", "/api/engines/kokoro/install"), ("DELETE", "/api/voice-profiles/" + "a" * 32),
                         ("POST", "/api/voice-profiles/import"), ("GET", "/api/voice-profiles/" + "a" * 32 + "/export"),
                         ("DELETE", "/api/documents/" + "a" * 32), ("POST", "/api/system/shutdown")]:  # fmt: skip
        assert refused_remotely(method, path), (method, path)
    for method, path in [("GET", "/api/documents"), ("POST", "/api/documents/text"), ("GET", "/api/voices"),
                         ("PUT", "/api/preferences"), ("POST", "/api/exports"), ("GET", "/api/voice-profiles"),
                         ("PUT", "/api/documents/" + "a" * 32 + "/progress"), ("POST", "/api/lan/pair")]:  # fmt: skip
        assert not refused_remotely(method, path), (method, path)


def test_a_device_must_pair_before_it_can_use_the_api(client: TestClient, lan: Services) -> None:
    device = phone(client)
    refused = device.get("/api/documents")
    assert refused.status_code == 401 and refused.json()["error"]["code"] == "device_not_paired"
    assert device.get("/api/lan/device").json() == {"paired": False, "name": None}
    wrong = device.post("/api/lan/pair", json={"code": "ZZZZ-ZZZZ"})
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "pairing_failed"
    paired_device = paired(client, lan)
    cookie = paired_device.cookies.get("ltts_device")
    assert cookie and cookie.startswith("ttsd_")
    assert paired_device.get("/api/lan/device").json() == {"paired": True, "name": "Kitchen tablet"}
    assert paired_device.get("/api/documents").status_code == 200
    with sqlite3.connect(lan.settings.database_path) as conn:
        stored = conn.execute("SELECT token_hash FROM lan_devices").fetchone()[0]
    assert cookie not in stored and len(stored) == 64  # only a hash is kept


def test_a_paired_device_can_read_but_not_run_this_computer(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    added = device.post("/api/documents/text", json={"text": "Hello from the phone."})
    assert added.status_code == 201
    for call in (lambda: device.get("/api/lan"), lambda: device.put("/api/lan", json={"enabled": False}),
                 lambda: device.put("/api/speech-api", json={"enabled": True}),
                 lambda: device.delete(f"/api/documents/{added.json()['id']}"),
                 lambda: device.post("/api/voice-sessions")):  # fmt: skip
        response = call()
        assert response.status_code == 403 and response.json()["error"]["code"] == "not_allowed_remotely"
    assert client.get(f"/api/documents/{added.json()['id']}").status_code == 200  # still there


def test_changes_from_the_network_need_the_apps_own_origin_and_host(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    foreign = device.post("/api/documents/text", json={"text": "x"}, headers={"Origin": "http://evil.example"})
    assert foreign.status_code == 403 and foreign.json()["error"]["code"] == "origin_mismatch"
    missing = TestClient(client.app, base_url=ORIGIN, client=("192.168.1.50", 1), headers={"X-LTTS-Client": "web"})
    missing.cookies.update(device.cookies)
    assert missing.post("/api/documents/text", json={"text": "x"}).json()["error"]["code"] == "origin_mismatch"
    rebound = TestClient(client.app, base_url="http://evil.example:8765", client=("192.168.1.50", 1))
    assert rebound.get("/api/documents").status_code == 421


def test_removing_a_device_or_turning_lan_mode_off_takes_effect_at_once(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    devices = client.get("/api/lan").json()["devices"]
    assert [d["name"] for d in devices] == ["Kitchen tablet"]
    assert client.delete(f"/api/lan/devices/{devices[0]['id']}").status_code == 204
    assert device.get("/api/documents").status_code == 401
    again = paired(client, lan)
    assert client.delete("/api/lan/devices").status_code == 204
    assert again.get("/api/documents").status_code == 401
    assert client.put("/api/lan", json={"enabled": False}).json()["enabled"] is False
    assert client.get("/api/lan").json()["pairing"] is None


def test_pairing_is_only_done_from_the_network_and_shows_a_qr_code(client: TestClient, lan: Services) -> None:
    code = lan.lan.codes.new().code
    here = client.post("/api/lan/pair", json={"code": code})
    assert here.status_code == 409 and here.json()["error"]["code"] == "not_lan"
    shown = client.post("/api/lan/pairing").json()
    status = client.get("/api/lan").json()
    assert status["pairing"]["code"] == shown["code"] and status["url"] == ORIGIN
    qr = client.get("/api/lan/pairing/qr.svg")
    assert qr.status_code == 200 and qr.headers["content-type"] == "image/svg+xml" and b"<svg" in qr.content
    assert client.delete("/api/lan/pairing").status_code == 204
    assert client.get("/api/lan/pairing/qr.svg").json()["error"]["code"] == "no_pairing_code"


def test_the_listener_serves_and_stops_at_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(listener_module, "network_addresses", lambda: ["127.0.0.1"])

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"text/plain")]})
        await send({"type": "http.response.body", "body": b"served on the network"})

    async def scenario() -> None:
        lan = LanListener(lambda: app)
        await lan.start("127.0.0.1", 0)
        assert lan.running and lan.port
        async with httpx.AsyncClient() as http:
            assert (await http.get(f"http://127.0.0.1:{lan.port}/")).text == "served on the network"
        port = lan.port
        await lan.stop()
        assert not lan.running
        async with httpx.AsyncClient() as http:
            with pytest.raises(httpx.ConnectError):
                await http.get(f"http://127.0.0.1:{port}/")

    asyncio.run(scenario())


def test_the_listener_only_uses_this_computers_private_addresses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(listener_module, "network_addresses", lambda: ["192.168.1.20"])
    lan = LanListener(lambda: None)
    with pytest.raises(Exception) as refused:
        asyncio.run(lan.start("0.0.0.0", 8765))  # noqa: S104 - checking that it's refused
    assert getattr(refused.value, "code", "") == "lan_address"
