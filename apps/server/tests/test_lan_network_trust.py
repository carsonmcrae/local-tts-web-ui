# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the network check before and while LAN mode is on.

Scope: Reading Get-NetConnectionProfile's JSON (one profile or several, numbers or names, any letter
case) and matching it to the adapter; Private and DomainAuthenticated accepted; Public refused with how
to make a home network Private; unknown categories, no profile, a timeout, a failing or missing command
and malformed output all refused; the fixed, read-only command; macOS and Linux needing a confirmation
every time; the check through the API; and the watchdog turning LAN mode off when the network becomes
public or can't be read twice running. PowerShell is never run: its output is injected.
Does NOT belong: Listing adapters (test_lan_security.py) or pairing (test_lan_mode.py).
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from typing import Any

import pytest
from fastapi.testclient import TestClient

from lan_support import LAN_ADDRESS, FakeListener, here
from ltts.container import Services
from ltts.errors import ConflictError
from ltts.lan import network as network_module
from ltts.lan import service as service_module
from ltts.lan import trust as trust_module
from ltts.lan.trust import NetworkTrust, QueryError, parse_profiles, reading_for


def profile(alias: str = "Wi-Fi", category: object = 1, index: int = 12) -> dict[str, object]:
    return {"InterfaceAlias": alias, "InterfaceIndex": index, "NetworkCategory": category, "IPv4Connectivity": 4}


def windows(output: str | BaseException) -> NetworkTrust:
    """Windows, with the query printing ``output`` (or failing with it)."""

    def run(timeout: float) -> str:
        assert timeout > 0
        if isinstance(output, BaseException):
            raise output
        return output

    return NetworkTrust("win32", run)


@pytest.mark.parametrize(
    ("output", "reading"),
    [
        (json.dumps(profile(category=1)), "private"),
        (json.dumps(profile(category=2)), "domain"),
        (json.dumps(profile(category=0)), "public"),
        (json.dumps(profile(category="Private")), "private"),
        (json.dumps(profile(category="DomainAuthenticated")), "domain"),
        (json.dumps(profile(category="Public")), "public"),
        (json.dumps([profile("Ethernet 2", 0), profile("Wi-Fi", 1)]), "private"),  # the chosen adapter's own
        (json.dumps([profile("Wi-Fi", 1), profile("WI-FI", 0)]), "public"),  # listed twice: the stricter
        (json.dumps(profile("wi-fi", 1)), "private"),  # names match in any letter case
        ("\ufeff" + json.dumps(profile(category=1)) + "\r\n", "private"),
        (json.dumps(profile("Ethernet", 1)), "no_profile"),
        ("", "no_profile"),  # no profiles at all
        (json.dumps(profile(category=7)), "unreadable"),  # a category nobody knows
        (json.dumps(profile(category="Other")), "unreadable"),
        (json.dumps(profile(category=True)), "unreadable"),
        (json.dumps(profile(category=1.0)), "unreadable"),
        (json.dumps(profile(category=None)), "unreadable"),
        ("not json", "unreadable"),
        ('{"InterfaceAlias": "Wi-Fi", "NetworkCategory": 1', "unreadable"),  # cut off
        ("[1, 2]", "unreadable"),
        (json.dumps({"NetworkCategory": 1}), "unreadable"),  # no adapter name
        (json.dumps(profile(alias=12)), "unreadable"),  # type: ignore[arg-type]
    ],
)
def test_the_category_is_read_and_matched_to_the_adapter(output: str, reading: str) -> None:
    assert windows(output).read("Wi-Fi") == reading


@pytest.mark.parametrize(
    "failure",
    [subprocess.TimeoutExpired("powershell.exe", 8.0), FileNotFoundError("powershell.exe"), QueryError("exit code 1"),
     PermissionError("denied")],
)  # fmt: skip
def test_a_query_that_times_out_or_fails_reads_as_unknown(failure: BaseException) -> None:
    assert windows(failure).read("Wi-Fi") == "unreadable"
    with pytest.raises(ConflictError) as refused:
        windows(failure).require("Wi-Fi", confirmed=True)  # a confirmation doesn't stand in for Windows
    assert refused.value.code == "lan_network_unknown" and "stays off" in refused.value.message


def test_only_private_and_domain_networks_are_accepted_on_windows() -> None:
    assert windows(json.dumps(profile(category=1))).require("Wi-Fi", confirmed=False) == "private"
    assert windows(json.dumps(profile(category=2))).require("Wi-Fi", confirmed=False) == "domain"
    with pytest.raises(ConflictError) as public:
        windows(json.dumps(profile(category=0))).require("Wi-Fi", confirmed=True)
    assert public.value.code == "lan_public_network"
    for words in ("public network", "Settings → Network & internet", "Network profile type", "Private network"):
        assert words in public.value.message
    with pytest.raises(ConflictError) as missing:
        windows(json.dumps(profile("Ethernet", 1))).require("Wi-Fi", confirmed=False)
    assert missing.value.code == "lan_network_unknown" and missing.value.details == {"reason": "no_profile"}
    assert "doesn't list a network for Wi-Fi" in missing.value.message


@pytest.mark.parametrize("platform", ["darwin", "linux"])
def test_macos_and_linux_need_a_confirmation_every_time(platform: str) -> None:
    trust = NetworkTrust(platform, runner=lambda _t: pytest.fail("there is no category to read here"))
    assert trust.check == "confirm"
    with pytest.raises(ConflictError) as unconfirmed:
        trust.require("en0", confirmed=False)
    assert unconfirmed.value.code == "lan_confirm_network" and "home network you trust" in unconfirmed.value.message
    assert trust.require("en0", confirmed=True) is None


def test_the_query_is_one_fixed_read_only_command(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[list[str], dict[str, Any]]] = []
    answers = iter([subprocess.CompletedProcess([], 0, json.dumps(profile()).encode(), b""),
                    subprocess.CompletedProcess([], 1, b"", b"Access denied")])  # fmt: skip

    def run(args: list[str], **options: Any) -> subprocess.CompletedProcess[bytes]:
        calls.append((args, options))
        return next(answers)

    monkeypatch.setattr(trust_module.subprocess, "run", run)
    monkeypatch.setenv("SYSTEMROOT", r"C:\Windows")
    assert parse_profiles(trust_module.run_query(8.0)) == parse_profiles(json.dumps(profile()))
    with pytest.raises(QueryError):
        trust_module.run_query(8.0)
    args, options = calls[0]
    assert args[0].endswith("powershell.exe") and args[0].startswith("C:")  # never looked up on PATH
    assert args[1:4] == ["-NoProfile", "-NonInteractive", "-Command"] and "Get-NetConnectionProfile" in args[4]
    assert not any(verb in args[4] for verb in ("Set-", "New-Net", "Remove-", "Enable-", "Disable-", "netsh"))
    assert options["timeout"] == 8.0 and options["stdin"] == subprocess.DEVNULL and options.get("shell") is not True


def test_profiles_match_by_name_only_for_the_chosen_adapter() -> None:
    profiles = parse_profiles(json.dumps([profile("Wi-Fi", 1), profile("Ethernet 2", 0)]))
    assert reading_for("Ethernet 2", profiles) == "public" and reading_for("Wi-Fi 2", profiles) == "no_profile"


@pytest.fixture
def lan(services: Services, monkeypatch: pytest.MonkeyPatch) -> Services:
    listener = FakeListener()
    listener.running = False
    services.lan.listener = listener  # type: ignore[assignment]
    monkeypatch.setattr(network_module, "network_addresses", lambda: here(LAN_ADDRESS))
    return services


def test_lan_mode_stays_off_on_a_public_network(client: TestClient, lan: Services) -> None:
    lan.lan.trust = windows(json.dumps(profile(category=0)))
    refused = client.put("/api/lan", json={"enabled": True})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "lan_public_network"
    status = client.get("/api/lan").json()
    assert status["enabled"] is False and status["networkCheck"] == "category" and status["category"] is None
    lan.lan.trust = windows(json.dumps(profile(category=1)))
    on = client.put("/api/lan", json={"enabled": True}).json()
    assert on["enabled"] is True and on["category"] == "private" and on["interface"] == "Wi-Fi"
    assert client.put("/api/lan", json={"enabled": False}).json()["category"] is None


def test_elsewhere_the_api_needs_the_confirmation(client: TestClient, lan: Services) -> None:
    lan.lan.trust = NetworkTrust("linux")
    assert client.get("/api/lan").json()["networkCheck"] == "confirm"
    refused = client.put("/api/lan", json={"enabled": True})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "lan_confirm_network"
    assert client.get("/api/lan").json()["enabled"] is False
    on = client.put("/api/lan", json={"enabled": True, "trustedNetwork": True}).json()
    assert on["enabled"] is True and on["category"] is None
    client.put("/api/lan", json={"enabled": False})
    assert client.put("/api/lan", json={"enabled": True}).status_code == 409  # asked again each time


def test_the_watchdog_turns_lan_mode_off_when_the_network_turns_public(
    lan: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(service_module, "WATCH_EVERY_S", 0.01)
    monkeypatch.setattr(service_module, "CATEGORY_EVERY", 1)
    outputs: list[str | BaseException] = [json.dumps(profile(category=1))]

    def run(timeout: float) -> str:
        output = outputs[0] if len(outputs) == 1 else outputs.pop(0)
        if isinstance(output, BaseException):
            raise output
        return output

    service = lan.lan
    service.trust = NetworkTrust("win32", run)

    async def off_soon() -> None:
        for _ in range(300):
            if not service.enabled:
                return
            await asyncio.sleep(0.01)

    async def scenario() -> None:
        assert (await service.enable(None, 8765)).category == "private"
        outputs[:] = [json.dumps(profile(category=0))]  # someone made the network public in Windows
        await off_soon()
        assert service.status().turned_off == "network_public" and service.status().pairing is None
        outputs[:] = [json.dumps(profile(category=1))]
        await service.enable(None, 8765)
        timeout = subprocess.TimeoutExpired("powershell.exe", 8.0)
        outputs[:] = [timeout, json.dumps(profile(category=1)), timeout, "garbled"]  # one miss is forgiven
        await off_soon()
        assert service.status().turned_off == "network_unknown"
        assert outputs == ["garbled"]  # it took two misses in a row

    asyncio.run(scenario())
