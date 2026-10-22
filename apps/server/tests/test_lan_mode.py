# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for LAN mode: pairing phones and tablets, and what they may do.

Scope: Pairing codes (expiry, single use, wrong guesses, a per-address limit), device tokens (only a
hash stored, removal takes effect at once), the requests a device on the network may make before
and after pairing, the Origin and Host checks there, what stays on this computer, and the management
endpoints. A real listener is started and stopped on a loopback address (no firewall prompt).
Does NOT belong: Hardening against other devices on the network (test_lan_security.py) or the
speech API's own network permission (test_speech_api.py).
"""

from __future__ import annotations

import asyncio
import socket
import sqlite3
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient

from lan_support import ORIGIN, FakeListener, here, paired, phone
from ltts.container import Services
from ltts.errors import ConflictError, NotFoundError
from ltts.lan import listener as listener_module
from ltts.lan.devices import ALPHABET, MAX_DEVICES, TOKEN_PREFIX, PairingCodes, PairingFailedError, Recognised
from ltts.lan.listener import LanListener
from ltts.lan.policy import open_to_unpaired, refused_remotely


@pytest.fixture
def lan(services: Services) -> Services:
    services.lan.listener = FakeListener()  # type: ignore[assignment]
    return services


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
                         ("DELETE", "/api/documents/" + "a" * 32), ("POST", "/api/system/shutdown"),
                         ("POST", "/api/system/cache/clear"), ("POST", "/api/jobs/" + "a" * 32 + "/cancel"),
                         ("GET", "/api/voice-profiles/" + "a" * 32 + "/reference"), ("GET", "/api/openapi.json"),
                         ("POST", "/api/voice-profiles/blends"), ("PATCH", "/api/voice-profiles/" + "a" * 32),
                         ("DELETE", "/api/exports/" + "a" * 32), ("POST", "/api/exports/" + "a" * 32 + "/cancel"),
                         ("POST", "/api/exports/" + "a" * 32 + "/audiobookshelf"), ("DELETE", "/api/exports/x/"),
                         ("POST", "/api/pronunciation-preview"),
                         ("GET", "/api/something-new"), ("POST", "/"), ("GET", "/api")]:  # fmt: skip
        assert refused_remotely(method, path), (method, path)
    for method, path in [("GET", "/api/documents"), ("POST", "/api/documents/text"), ("GET", "/api/voices"),
                         ("PUT", "/api/preferences"), ("POST", "/api/exports"), ("GET", "/api/voice-profiles"),
                         ("PUT", "/api/documents/" + "a" * 32 + "/progress"), ("POST", "/api/lan/pair"),
                         ("GET", "/api/voice-profiles/blends"), ("POST", "/api/voices/kokoro:af_heart/preview"),
                         ("GET", "/api/system"), ("GET", "/library"), ("POST", "/api/exports/" + "a" * 32 + "/pause"),
                         ("POST", "/api/exports/" + "a" * 32 + "/resume"), ("GET", "/api/exports/" + "a" * 32),
                         ("PATCH", "/api/documents/" + "a" * 32 + "/sections/0"),
                         ("POST", "/api/documents/" + "a" * 32 + "/cleanup/apply")]:  # fmt: skip
        assert not refused_remotely(method, path), (method, path)


def test_a_device_must_pair_before_it_can_use_the_api(client: TestClient, lan: Services) -> None:
    device = phone(client)
    refused = device.get("/api/documents")
    assert refused.status_code == 401 and refused.json()["error"]["code"] == "device_not_paired"
    assert device.get("/api/lan/device").json() == {"paired": False, "name": None, "reason": None}
    wrong = device.post("/api/lan/pair", json={"code": "ZZZZ-ZZZZ"})
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "pairing_failed"
    paired_device = paired(client, lan)
    cookie = paired_device.cookies.get("ltts_device")
    assert cookie and cookie.startswith("ttsd_")
    assert paired_device.get("/api/lan/device").json() == {"paired": True, "name": "Kitchen tablet", "reason": None}
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
                 lambda: device.post("/api/voice-sessions"), lambda: device.delete(f"/api/exports/{'a' * 32}"),
                 lambda: device.post(f"/api/exports/{'a' * 32}/cancel"),
                 lambda: device.post(f"/api/exports/{'a' * 32}/audiobookshelf")):  # fmt: skip
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


def test_settings_say_other_devices_can_reach_the_app_while_lan_mode_is_on(client: TestClient, lan: Services) -> None:
    assert client.get("/api/system").json()["lanMode"] is True
    assert client.get("/api/speech-api").json()["networkMode"] is True  # /v1 is on the LAN address too
    lan.lan.listener.running = False  # type: ignore[misc]
    assert client.get("/api/system").json()["lanMode"] is False
    assert client.get("/api/speech-api").json()["networkMode"] is False
    off = client.post("/api/lan/pairing")  # a pairing code needs LAN mode on
    assert off.status_code == 409 and off.json()["error"]["code"] == "lan_off"


def test_the_device_store_holds_twenty_devices_and_knows_what_it_never_paired(
    client: TestClient, lan: Services
) -> None:
    store = lan.lan.devices
    for number in range(MAX_DEVICES):
        store.add(f"Device {number}", f"192.168.1.{number + 2}")
    with pytest.raises(PairingFailedError) as full:
        store.add("One too many", "192.168.1.99")
    assert full.value.code == "device_limit" and len(store.list_all()) == MAX_DEVICES
    assert store.identify("not-a-device-token", "192.168.1.2") == Recognised()
    assert store.identify(TOKEN_PREFIX + "x" * 100, "192.168.1.2") == Recognised()  # far longer than any token
    with pytest.raises(NotFoundError) as unknown:
        store.get("0" * 32)
    assert unknown.value.code == "device_not_found"
    assert client.delete(f"/api/lan/devices/{'0' * 32}").json()["error"]["code"] == "device_not_found"


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
    monkeypatch.setattr(listener_module, "network_addresses", here)

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
    monkeypatch.setattr(listener_module, "network_addresses", lambda: here("192.168.1.20"))
    lan = LanListener(lambda: None)
    with pytest.raises(Exception) as refused:
        asyncio.run(lan.start("0.0.0.0", 8765))  # noqa: S104 - checking that it's refused
    assert getattr(refused.value, "code", "") == "lan_address"


def test_the_listener_says_when_its_port_is_taken_or_its_server_never_starts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(listener_module, "network_addresses", here)
    monkeypatch.setattr(listener_module, "START_TIMEOUT_S", 0.2)
    taken = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    taken.bind(("127.0.0.1", 0))
    taken.listen(1)

    class NeverStarts(listener_module._QuietServer):
        async def serve(self, sockets: list[socket.socket] | None = None) -> None:
            await asyncio.Event().wait()  # never reports that it started

    async def scenario() -> None:
        lan = LanListener(lambda: None)
        with pytest.raises(ConflictError) as busy:
            await lan.start("127.0.0.1", taken.getsockname()[1])
        assert busy.value.code == "lan_port_busy" and not lan.running
        monkeypatch.setattr(listener_module, "_QuietServer", NeverStarts)
        with pytest.raises(ConflictError) as stuck:
            await lan.start("127.0.0.1", 0)
        assert stuck.value.code == "lan_not_started" and not lan.running and lan.port is None

    try:
        asyncio.run(scenario())
    finally:
        taken.close()
    # The main server owns Ctrl+C: the LAN server installs no signal handlers of its own.
    assert listener_module._QuietServer(uvicorn.Config(app=object())).install_signal_handlers() is None


def test_stopping_forces_a_server_that_ignores_the_first_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(listener_module, "network_addresses", here)
    monkeypatch.setattr(listener_module, "START_TIMEOUT_S", 0.2)
    aborted: list[str] = []

    class Connecting:
        """A connection that has no transport yet."""

    class Open:
        transport = SimpleNamespace(abort=lambda: aborted.append("aborted"))

    class Stubborn(listener_module._QuietServer):
        """Stops only when forced: ``should_exit`` alone is ignored."""

        def __init__(self, config: uvicorn.Config) -> None:
            self.forced = asyncio.Event()
            super().__init__(config)

        @property
        def force_exit(self) -> bool:
            return self.forced.is_set()

        @force_exit.setter
        def force_exit(self, value: bool) -> None:
            if value:
                self.forced.set()

        async def serve(self, sockets: list[socket.socket] | None = None) -> None:
            self.servers = []
            self.started = True
            self.server_state.connections.update({Connecting(), Open()})  # type: ignore[arg-type]
            try:
                await self.forced.wait()
            finally:
                for sock in sockets or []:
                    sock.close()

    monkeypatch.setattr(listener_module, "_QuietServer", Stubborn)

    async def scenario() -> None:
        lan = LanListener(lambda: None)
        await lan.start("127.0.0.1", 0)
        assert lan.running
        await lan.stop()
        assert not lan.running and aborted == ["aborted", "aborted"]  # dropped on the first and the forced stop

    asyncio.run(scenario())
