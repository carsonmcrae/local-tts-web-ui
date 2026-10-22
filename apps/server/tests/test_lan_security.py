# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for LAN mode against other devices on the network, which can read its plain HTTP.

Scope: A copied device cookie (tied to the paired address, expiring, the refused attempt shown on
the computer, pairing again replacing the entry), the Host and same-site checks, the small body limit
before pairing (an unreadable length counts as none), the speech API answering for itself on the LAN
listener, the per-device limit on costly work, every API route a paired device can reach, no pairing
code or token in logs or responses, which network adapters are offered, turning itself off when the
network changes, and stopping with an answer still being sent. Real sockets are only ever opened on a
loopback address.
Does NOT belong: Pairing and the basic rules (test_lan_mode.py).
"""

from __future__ import annotations

import asyncio
import logging
import re
import sqlite3
import time
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from lan_support import LAN_ADDRESS, ORIGIN, FakeListener, here, paired, phone
from ltts.container import Services
from ltts.lan import listener as listener_module
from ltts.lan import network as network_module
from ltts.lan import service as service_module
from ltts.lan.listener import LanListener
from ltts.lan.network import NetworkAddress, adapter_kind
from ltts.lan.policy import COSTLY_PER_WINDOW, WorkBudget, refused_remotely
from ltts.lan.trust import NetworkTrust

# Every API route a paired phone or tablet may use. A new route stays on this computer until it is
# added to lan/policy.py; if it is, add it here too, deliberately.
REACHABLE = {
    "GET /api/health", "GET /api/system", "GET /api/engines", "GET /api/jobs", "GET /api/jobs/{job_id}",
    "GET /api/voices", "POST /api/voices/{voice_id}/preview", "GET /api/audio/{key}",
    "GET /api/voice-profiles", "GET /api/voice-profiles/blends", "GET /api/voice-profiles/consent",
    "GET /api/preferences", "PUT /api/preferences", "GET /api/lan/device", "POST /api/lan/pair",
    "GET /api/pronunciations", "POST /api/pronunciations", "PUT /api/pronunciations/{rule_id}",
    "DELETE /api/pronunciations/{rule_id}", "GET /api/cast-presets",
    "GET /api/exports", "POST /api/exports", "GET /api/exports/queue", "GET /api/exports/{job_id}",
    "GET /api/exports/{job_id}/download",
    "POST /api/exports/{job_id}/pause", "POST /api/exports/{job_id}/resume",
    "GET /api/documents", "POST /api/documents/text", "POST /api/documents/upload", "GET /api/documents/{document_id}",
    "GET /api/documents/{document_id}/bookmarks", "POST /api/documents/{document_id}/bookmarks",
    "PATCH /api/documents/{document_id}/bookmarks/{bookmark_id}",
    "DELETE /api/documents/{document_id}/bookmarks/{bookmark_id}",
    "POST /api/documents/{document_id}/cast-presets", "POST /api/documents/{document_id}/cast-presets/{preset_id}/apply",
    "PUT /api/documents/{document_id}/cast", "GET /api/documents/{document_id}/characters",
    "PUT /api/documents/{document_id}/characters", "GET /api/documents/{document_id}/cleanup",
    "POST /api/documents/{document_id}/cleanup/apply", "POST /api/documents/{document_id}/cleanup/undo",
    "GET /api/documents/{document_id}/cover", "PUT /api/documents/{document_id}/cover",
    "DELETE /api/documents/{document_id}/cover", "GET /api/documents/{document_id}/details",
    "PUT /api/documents/{document_id}/details", "PUT /api/documents/{document_id}/progress",
    "GET /api/documents/{document_id}/search", "GET /api/documents/{document_id}/sections/{section_index}",
    "PATCH /api/documents/{document_id}/sections/{section_index}",
    "GET /api/documents/{document_id}/segments/{index}/audio", "POST /api/documents/{document_id}/segments/{index}/takes",
    "GET /api/documents/{document_id}/styles", "PUT /api/documents/{document_id}/styles",
    "PUT /api/documents/{document_id}/shelf", "POST /api/library/organize", "GET /api/library/tags",
    "GET /api/library/folders", "POST /api/library/folders", "PATCH /api/library/folders/{folder_id}",
    "DELETE /api/library/folders/{folder_id}", "GET /api/library/collections", "POST /api/library/collections",
    "PATCH /api/library/collections/{collection_id}", "DELETE /api/library/collections/{collection_id}",
    "POST /api/library/collections/{collection_id}/documents",
    "GET /api/library/works", "POST /api/library/works/{work_id}/open", "GET /api/library/works/{work_id}/cover",
    "PUT /api/library/works/{work_id}/hidden", "GET /api/library/works/credits",
    "GET /api/documents/{document_id}/preset", "POST /api/documents/{document_id}/preset/apply",
    "DELETE /api/documents/{document_id}/preset",
    "GET /api/sound-effects/library", "GET /api/documents/{document_id}/sound-effects",
    "POST /api/documents/{document_id}/sound-effects", "POST /api/documents/{document_id}/sound-effects/analyse",
    "POST /api/documents/{document_id}/sound-effects/review",
    "PATCH /api/documents/{document_id}/sound-effects/{effect_id}",
    "DELETE /api/documents/{document_id}/sound-effects/{effect_id}",
}  # fmt: skip
SAMPLES = {"voice_id": "kokoro:af_heart", "engine_id": "kokoro", "key": "a" * 64}


@pytest.fixture
def lan(services: Services) -> Services:
    services.lan.listener = FakeListener()  # type: ignore[assignment]
    return services


def _sample(path: str) -> str:
    def one(match: re.Match[str]) -> str:
        name = match.group(1).split(":")[0]
        return SAMPLES.get(name, "1" if name in ("index", "number", "sample", "section_index") else "a" * 32)

    return re.sub(r"\{([^}]+)\}", one, path)


def _age(services: Services, **ago: timedelta) -> None:
    """Make every paired device older: ``created_at`` and/or ``last_seen_at`` this long ago."""
    with sqlite3.connect(services.settings.database_path) as conn:
        for column, delta in ago.items():
            stamp = (datetime.now(UTC) - delta).isoformat(timespec="seconds")
            conn.execute(f"UPDATE lan_devices SET {column} = ?", (stamp,))  # noqa: S608 - fixed column names


def test_every_api_route_a_paired_device_can_reach_is_listed(client: TestClient) -> None:
    routes = client.app.openapi()["paths"]  # type: ignore[attr-defined]
    reachable = {
        f"{method.upper()} {path}"
        for path, operations in routes.items()
        for method in operations
        if path.startswith("/api/") and not refused_remotely(method.upper(), _sample(path))
    }
    assert reachable == REACHABLE


def test_a_copied_cookie_only_works_from_the_address_that_paired(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    assert client.get("/api/lan").json()["devices"][0]["address"] == "192.168.1.50"
    copy = TestClient(client.app, base_url=ORIGIN, client=("192.168.1.77", 50000),
                      headers={"X-LTTS-Client": "web", "Origin": ORIGIN})  # fmt: skip
    copy.cookies.update(device.cookies)
    refused = copy.get("/api/documents")
    assert refused.status_code == 401 and refused.json()["error"]["code"] == "device_not_paired"
    assert "address changed" in refused.json()["error"]["message"]
    assert copy.get("/api/lan/device").json() == {"paired": False, "name": None, "reason": "address_changed"}
    assert device.get("/api/documents").status_code == 200  # the paired device itself carries on
    shown = client.get("/api/lan").json()["devices"][0]
    assert shown["refusedAddress"] == "192.168.1.77" and shown["refusedAt"]

    # The same phone with a new address pairs again: its old entry is replaced, not duplicated.
    again = copy.post("/api/lan/pair", json={"code": lan.lan.codes.new().code, "name": "Kitchen tablet"})
    assert again.status_code == 201
    devices = client.get("/api/lan").json()["devices"]
    assert len(devices) == 1 and devices[0]["address"] == "192.168.1.77" and devices[0]["refusedAddress"] is None
    assert copy.get("/api/documents").status_code == 200
    assert device.get("/api/documents").status_code == 401  # the old cookie is gone with its entry


def test_a_device_paired_before_addresses_were_kept_is_tied_to_the_first_one(lan: Services) -> None:
    store = lan.lan.devices
    device, token = store.add("Old phone", "192.168.1.50")
    with sqlite3.connect(lan.settings.database_path) as conn:
        conn.execute("UPDATE lan_devices SET address = NULL")
    assert store.identify(token, "192.168.1.60").device == store.get(device.id)
    assert store.get(device.id).address == "192.168.1.60"
    assert store.identify(token, "192.168.1.50").refusal == "address_changed"
    assert store.identify("ttsd_not-a-token", "192.168.1.60").device is None


def test_pairings_expire_after_30_days_or_14_days_unused(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    assert device.get("/api/documents").status_code == 200
    listed = client.get("/api/lan").json()["devices"][0]
    assert not listed["expired"] and listed["expiresAt"] > listed["createdAt"]
    _age(lan, last_seen_at=timedelta(days=15))
    assert device.get("/api/documents").json()["error"]["message"].startswith("This device's pairing has expired")
    assert device.get("/api/lan/device").json()["reason"] == "expired"
    _age(lan, created_at=timedelta(days=31), last_seen_at=timedelta(hours=1))
    assert device.get("/api/documents").status_code == 401
    assert client.get("/api/lan").json()["devices"][0]["expired"] is True
    other = paired(client, lan)  # pairing another device forgets expired ones
    assert [d["name"] for d in client.get("/api/lan").json()["devices"]] == ["Kitchen tablet"]
    assert other.get("/api/documents").status_code == 200
    response = phone(client).post("/api/lan/pair", json={"code": lan.lan.codes.new().code})
    assert "Max-Age=2592000" in response.headers["set-cookie"] and "HttpOnly" in response.headers["set-cookie"]


def test_the_lan_listener_accepts_only_its_own_address_and_page(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    for host in ("localhost", "127.0.0.1", "testserver", "evil.example"):
        named = device.get("/api/documents", headers={"Host": f"{host}:8765"})
        assert named.status_code == 421, host
    sibling = device.get("/api/documents", headers={"Sec-Fetch-Site": "same-site"})  # another port, same address
    assert sibling.status_code == 403 and sibling.json()["error"]["code"] == "cross_site_blocked"
    assert device.get("/api/documents", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200


def test_an_unpaired_device_can_only_send_a_few_kilobytes(client: TestClient, lan: Services) -> None:
    stranger = phone(client)
    big = stranger.post("/api/lan/pair", content=b"{" + b" " * 10_000 + b"}",
                        headers={"Content-Type": "application/json"})  # fmt: skip
    assert big.status_code == 413
    unreadable = stranger.get("/api/lan/device", headers={"Content-Length": "a few"})
    assert unreadable.status_code == 200  # a length that isn't a number counts as none
    device = paired(client, lan)  # once paired, ordinary uploads are allowed again
    assert device.post("/api/documents/text", json={"text": "x" * 20_000}).status_code == 201


def test_the_speech_api_answers_for_itself_on_the_lan_listener(client: TestClient, lan: Services) -> None:
    stranger = phone(client)
    assert stranger.get("/v1/models").status_code == 404  # switched off, it hides; never "pair this device first"
    assert stranger.get("/api/voices").json()["error"]["code"] == "device_not_paired"


def test_costly_work_from_one_device_is_limited(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    for number in range(COSTLY_PER_WINDOW):
        assert device.post("/api/documents/text", json={"text": f"Note {number}."}).status_code == 201
    busy = device.post("/api/documents/text", json={"text": "One too many."})
    assert busy.status_code == 429 and busy.json()["error"]["code"] == "lan_busy"
    assert device.get("/api/documents").status_code == 200  # reading carries on
    assert client.post("/api/documents/text", json={"text": "On the computer."}).status_code == 201


def test_previews_from_one_device_are_limited_on_their_own(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    lan.lan.previews = WorkBudget(2)  # the real limit is BRIEF_PER_WINDOW; two keep the test quick
    preview = {"text": "Short preview."}
    for _ in range(2):
        assert device.post("/api/voices/kokoro:alpha/preview", json=preview).status_code == 200
    busy = device.post("/api/voices/kokoro:alpha/preview", json=preview)
    assert busy.status_code == 429 and busy.json()["error"]["code"] == "lan_busy"
    assert "previews" in busy.json()["error"]["message"]  # the phone can say why
    assert device.post("/api/documents/text", json={"text": "Still allowed."}).status_code == 201  # its own budget
    assert client.post("/api/voices/kokoro:alpha/preview", json=preview).status_code == 200  # the computer


def test_other_devices_are_not_told_where_the_data_is_kept(client: TestClient, lan: Services) -> None:
    device = paired(client, lan)
    assert device.get("/api/system").json()["storage"]["dataDir"] == "hidden on other devices"
    assert client.get("/api/system").json()["storage"]["dataDir"] == str(lan.settings.resolved_data_dir)


def test_no_pairing_code_or_device_token_reaches_a_log_or_a_response(
    client: TestClient, lan: Services, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    code = client.post("/api/lan/pairing").json()["code"]
    assert client.get("/api/lan/pairing/qr.svg").status_code == 200
    device = phone(client)
    device.post("/api/lan/pair", json={"code": "WRONG-CODE"})
    answer = device.post("/api/lan/pair", json={"code": code, "name": "Phone"})
    token = device.cookies.get("ltts_device")
    assert token and answer.status_code == 201
    assert token not in answer.text and code not in answer.text and code.replace("-", "") not in answer.text
    assert device.get("/api/lan/device").json()["paired"] is True
    logged = "\n".join(record.getMessage() + repr(record.__dict__) for record in caplog.records)
    for secret in (code, code.replace("-", ""), token):
        assert secret not in logged


def test_virtual_and_vpn_adapters_are_hidden_or_labelled(monkeypatch: pytest.MonkeyPatch) -> None:
    assert adapter_kind("Wi-Fi") == adapter_kind("Ethernet 2") == adapter_kind("en0") == "network"
    for internal in ("vEthernet (WSL)", "vEthernet (WSL (Hyper-V firewall))", "vEthernet (Default Switch)",
                     "VirtualBox Host-Only Network", "VMware Network Adapter VMnet8", "docker0", "virbr0",
                     "br-0123456789ab", "vboxnet0"):  # fmt: skip
        assert adapter_kind(internal) is None, internal
    for virtual in ("vEthernet (External Switch)", "Local Area Connection* 10", "bridge100"):
        assert adapter_kind(virtual) == "virtual", virtual
    for vpn in ("Tailscale", "ZeroTier One [abc]", "wg0", "NordLynx", "OpenVPN TAP-Windows6", "utun3", "Corp VPN"):
        assert adapter_kind(vpn) == "vpn", vpn
    assert adapter_kind("Ethernet 3", "255.255.255.255") == "vpn"  # a tunnel's single address

    def entry(address: str, netmask: str = "255.255.255.0") -> Any:
        return SimpleNamespace(family=2, address=address, netmask=netmask)

    adapters = {
        "Wi-Fi": [entry("192.168.1.20"), entry("169.254.3.4")], "Ethernet": [entry("10.0.0.5")],
        "Unplugged": [entry("192.168.9.9")], "vEthernet (WSL)": [entry("172.20.16.1")],
        "VirtualBox Host-Only Network": [entry("192.168.56.1")], "vEthernet (External)": [entry("192.168.2.4")],
        "WireGuard": [entry("10.8.0.2", "255.255.255.255")], "Public": [entry("8.8.4.4")],
        "Odd": [entry("not an address")],
    }  # fmt: skip
    stats = {name: SimpleNamespace(isup=name != "Unplugged") for name in adapters}
    monkeypatch.setattr(network_module.psutil, "net_if_addrs", lambda: adapters)
    monkeypatch.setattr(network_module.psutil, "net_if_stats", lambda: stats)
    found = [(a.address, a.interface, a.kind) for a in network_module.network_addresses()]
    assert found == [("192.168.1.20", "Wi-Fi", "network"), ("10.0.0.5", "Ethernet", "network"),
                     ("192.168.2.4", "vEthernet (External)", "virtual"), ("10.8.0.2", "WireGuard", "vpn")]  # fmt: skip


def test_lan_mode_turns_itself_off_when_the_network_changes(
    services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = [NetworkAddress(address="10.8.0.2", interface="WireGuard", kind="vpn"), *here(LAN_ADDRESS)]
    monkeypatch.setattr(network_module, "network_addresses", lambda: list(current))
    monkeypatch.setattr(service_module, "WATCH_EVERY_S", 0.01)
    lan = services.lan
    lan.listener = FakeListener()  # type: ignore[assignment]
    lan.trust = NetworkTrust("linux")  # confirmed each time it is turned on (test_lan_network_trust.py: Windows)
    clock = [time.time()]
    lan.wall = lambda: clock[0]

    async def off_soon() -> None:
        for _ in range(300):
            if not lan.enabled:
                return
            await asyncio.sleep(0.01)

    async def scenario() -> None:
        on = await lan.enable(None, 8765, trusted=True)  # never a VPN unless chosen
        assert (on.address, on.interface, on.turned_off) == (LAN_ADDRESS, "Wi-Fi", None)
        current[1] = NetworkAddress(address=LAN_ADDRESS, interface="Ethernet", kind="network")  # moved adapter
        await off_soon()
        status = lan.status()
        assert not status.enabled and status.turned_off == "network_changed" and status.pairing is None
        current[1] = here(LAN_ADDRESS)[0]
        assert (await lan.enable(LAN_ADDRESS, 8765, trusted=True)).turned_off is None
        clock[0] += 3600  # an hour passed between two checks: the computer slept
        await off_soon()
        assert lan.status().turned_off == "network_changed"
        await lan.enable(LAN_ADDRESS, 8765, trusted=True)
        current.pop()  # the address left this computer
        await off_soon()
        assert not lan.enabled
        assert (await lan.disable()).turned_off is None  # switching it off by hand clears the notice
        current.append(here(LAN_ADDRESS)[0])
        with pytest.raises(Exception) as elsewhere:
            await lan.enable("10.9.9.9", 8765, trusted=True)  # not one of this computer's addresses
        assert getattr(elsewhere.value, "code", "") == "lan_address"
        await lan.enable(LAN_ADDRESS, 8765, trusted=True)
        watch = lan._watch
        await asyncio.sleep(0.08)  # several checks pass with nothing changed (and no category to read here)
        assert lan.enabled and watch is not None and not watch.done()
        lan.listener.running = False  # the listener went away on its own: the watch ends without a reason
        await asyncio.wait_for(watch, 2)
        assert lan.status().turned_off is None
        current.pop()
        with pytest.raises(Exception) as only_vpn:
            await lan.enable(None, 8765, trusted=True)
        assert getattr(only_vpn.value, "code", "") == "lan_no_network"

    asyncio.run(scenario())


def test_stopping_drops_an_answer_still_being_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(listener_module, "network_addresses", here)

    async def slow(scope: dict[str, Any], receive: Any, send: Any) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"text/plain")]})
        for _ in range(100):
            await send({"type": "http.response.body", "body": b"x" * 1024, "more_body": True})
            await asyncio.sleep(0.05)
        await send({"type": "http.response.body", "body": b""})

    async def scenario() -> None:
        lan = LanListener(lambda: slow)
        await lan.start("127.0.0.1", 0)
        received: list[int] = []

        async def download() -> None:
            async with httpx.AsyncClient(timeout=10) as http, http.stream("GET", f"http://127.0.0.1:{lan.port}/") as r:
                async for chunk in r.aiter_bytes():
                    received.append(len(chunk))

        task = asyncio.create_task(download())
        await asyncio.sleep(0.3)
        started = time.monotonic()
        await lan.stop()
        assert time.monotonic() - started < 3
        with pytest.raises(httpx.HTTPError):
            await asyncio.wait_for(task, timeout=3)
        assert sum(received) < 100 * 1024  # the rest never came

    asyncio.run(scenario())
