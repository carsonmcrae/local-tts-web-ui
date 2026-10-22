# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests that a reverse proxy, a tunnel or forged headers can't pass for this computer's own user.

Scope: Requests that say they were forwarded (Forwarded, X-Forwarded-*, Via, X-Real-IP, Tailscale's and
Cloudflare's headers, in any letter case) are refused on the main address and on the LAN listener, for
the app, the API and the speech API; a loopback address under a proxy's name is refused even when that
name is allowed; odd, malformed and repeated Host values are refused; changes need a page on this
computer; IPv6 and IPv4-mapped loopback, and the app's own browser, still work; a forwarded address never
changes who a device is, and network mode's token rules stay as they were. Requests are built as uvicorn
presents them (the client is the TCP peer, 127.0.0.1 for anything a proxy on this computer passes on).
Does NOT belong: Pairing and the LAN allow-list themselves (test_lan_mode.py, test_lan_security.py).
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi.testclient import TestClient

from lan_support import ORIGIN, FakeListener, paired
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.security import SecurityMiddleware, forwarded, host_name
from speech_api_support import auth, error_code, program, switch_on

PROXY = "box.tail1234.ts.net"  # what Tailscale Serve (or any reverse proxy) would pass on as the Host
SPOOFED = ["Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Forwarded-Port", "X-Real-IP",
           "Via", "X-Client-IP", "True-Client-IP", "CF-Connecting-IP", "Tailscale-User-Login", "x-FORWARDED-for"]  # fmt: skip


def at(client: TestClient, host: str = "127.0.0.1:8765", address: str = "127.0.0.1") -> TestClient:
    """A browser or program reaching the main address as ``host`` from ``address`` (uvicorn's client)."""
    return TestClient(client.app, base_url=f"http://{host}", client=(address, 50000), headers={"X-LTTS-Client": "web"})


def code(response: Any) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


@pytest.fixture
def proxied(settings: Settings, engines: dict[str, Any]) -> TestClient:
    """The app on a computer whose owner added a reverse proxy's name to the allowed hosts."""
    named = settings.model_copy(update={"extra_allowed_hosts": ["testserver", PROXY]})
    services = build_services(named, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    return TestClient(create_app(named, services=services), headers={"X-LTTS-Client": "web"})


def test_the_apps_own_browser_keeps_working(client: TestClient) -> None:
    for host, address in (("127.0.0.1:8765", "127.0.0.1"), ("localhost:5173", "127.0.0.1"), ("[::1]:8765", "::1"),
                          ("localhost:8765", "::ffff:127.0.0.1"), ("LocalHost:8765", "127.0.0.2")):  # fmt: skip
        browser = at(client, host, address)
        page = f"http://{host.lower()}"
        assert browser.get("/api/lan").status_code == 200, host
        added = browser.post("/api/documents/text", json={"text": "Mine."}, headers={"Origin": page})
        assert added.status_code == 201, host
        assert browser.delete(f"/api/documents/{added.json()['id']}", headers={"Origin": page}).status_code == 204
    assert at(client).post("/api/documents/text", json={"text": "A script."}).status_code == 201  # no Origin


@pytest.mark.parametrize("header", SPOOFED)
def test_a_request_that_says_it_was_forwarded_is_refused(client: TestClient, header: str) -> None:
    here, spoof = at(client), {header: "127.0.0.1"}
    for response in (here.get("/", headers=spoof), here.get("/api/documents", headers=spoof),
                     here.get("/api/lan", headers=spoof), here.put("/api/lan", json={"enabled": False}, headers=spoof),
                     here.post("/api/documents/text", json={"text": "x"}, headers=spoof)):  # fmt: skip
        assert code(response) == (403, "proxy_not_supported")
    assert here.get("/api/documents").status_code == 200  # the same request without it


def test_header_names_are_matched_in_any_case_and_only_proxies_headers_count() -> None:
    assert forwarded([b"x-forwarded-for"]) and forwarded([b"forwarded"]) and forwarded([b"via"])
    assert forwarded([b"x-forwarded-anything"]) and forwarded([b"cdn-loop"]) and forwarded([b"tailscale-user-name"])
    assert not forwarded([b"host", b"origin", b"sec-fetch-site", b"x-ltts-client", b"cookie", b"user-agent"])


def test_a_proxy_on_this_computer_is_never_its_user_even_when_its_name_is_allowed(proxied: TestClient) -> None:
    document = at(proxied).post("/api/documents/text", json={"text": "Keep me."}).json()["id"]
    through = at(proxied)  # from 127.0.0.1: what the proxy's own connection looks like
    for name in (PROXY, PROXY.upper(), f"{PROXY}:443", f"{PROXY.title()}:8765"):
        named = {"Host": name}
        for response in (through.get("/api/documents", headers=named), through.get("/api/lan", headers=named),
                         through.put("/api/lan", json={"enabled": True}, headers=named),
                         through.delete(f"/api/documents/{document}", headers=named),
                         through.get("/", headers=named)):  # fmt: skip
            assert code(response) == (403, "proxy_not_supported"), name
    # Tailscale Serve's own headers, on top: refused for those too.
    serve = {"X-Forwarded-For": "100.101.102.103", "X-Forwarded-Proto": "https", "Tailscale-User-Login": "a@b.c"}
    assert code(at(proxied, PROXY).get("/api/documents", headers=serve)) == (403, "proxy_not_supported")
    assert at(proxied).get(f"/api/documents/{document}").status_code == 200  # still there


@pytest.mark.parametrize(
    "host",
    ["localhost.", "localhost.:8765", "127.0.0.1.", "127.0.0.2", "0.0.0.0", "[::ffff:127.0.0.1]",  # noqa: S104
     "[0:0:0:0:0:0:0:1]", "::1", "[::1", "[::1]x", "[]", "localhost:", "localhost:80:80", "localhost:+80",
     "localhost@evil.example", "evil.example", "localhost localhost"],
)  # fmt: skip
def test_odd_host_values_are_refused(client: TestClient, host: str) -> None:
    assert code(at(client).get("/api/documents", headers={"Host": host})) == (421, "invalid_host")


def test_host_names_are_read_strictly() -> None:
    assert (
        host_name("LOCALHOST:8765") == "localhost" and host_name("[::1]:8765") == "::1" and host_name("[::1]") == "::1"
    )
    for raw in ("::1", "[::1", "[::1]:", "a:b", "localhost:", "localhost:²", "[]:80"):
        assert host_name(raw) == "", raw


def _status(settings: Settings, headers: list[tuple[bytes, bytes]], address: str = "127.0.0.1") -> int:
    """Drive the middleware with exactly these raw headers (TestClient would tidy them up)."""
    statuses: list[int] = []

    async def app(scope: Any, receive: Any, send: Any) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: Any) -> None:
        if message["type"] == "http.response.start":
            statuses.append(message["status"])

    scope = {"type": "http", "method": "GET", "path": "/api/documents", "headers": headers, "query_string": b"",
             "client": (address, 50000), "server": ("127.0.0.1", 8765)}  # fmt: skip
    asyncio.run(SecurityMiddleware(app, settings)(scope, receive, send))
    return statuses[0]


def test_raw_headers_in_any_case_or_repeated_are_caught(settings: Settings) -> None:
    assert _status(settings, [(b"host", b"127.0.0.1:8765")]) == 200
    assert _status(settings, [(b"Host", b"127.0.0.1:8765")]) == 200
    assert _status(settings, [(b"host", b"127.0.0.1:8765"), (b"X-Forwarded-For", b"8.8.8.8")]) == 403
    assert _status(settings, [(b"host", b"127.0.0.1:8765"), (b"VIA", b"1.1 caddy")]) == 403
    assert _status(settings, [(b"host", b"127.0.0.1:8765"), (b"host", b"127.0.0.1:8765")]) == 421
    assert _status(settings, [(b"host", b"evil.example"), (b"host", b"127.0.0.1:8765")]) == 421
    assert _status(settings, []) == 421  # no Host at all
    for odd in (b"", b"localhost:\xb2", "localhost:\uff18\uff10".encode(), "l\u043ecalhost".encode(), b"localhost\x00"):
        assert _status(settings, [(b"host", odd)]) == 421, odd


def test_changes_need_a_page_on_this_computer(client: TestClient) -> None:
    here = at(client)
    for origin in (f"http://{PROXY}", f"https://{PROXY}", "null", "http://localhost.:8765", "http://evil.example",
                   "http://127.0.0.1.evil.example", "http://localhost:8765/path", "file://", "HTTP://LOCALHOST"):  # fmt: skip
        refused = here.post("/api/documents/text", json={"text": "x"}, headers={"Origin": origin})
        assert code(refused) == (403, "origin_mismatch"), origin
    for origin in ("http://localhost:5173", "http://127.0.0.1:8765", "https://localhost", "http://[::1]:8765"):
        assert here.post("/api/documents/text", json={"text": "x"}, headers={"Origin": origin}).status_code == 201


def test_the_speech_api_refuses_proxies_and_keeps_its_own_token_rules(proxied: TestClient) -> None:
    token = switch_on(at(proxied))
    script = program(proxied)  # a program on this computer
    assert script.get("/v1/models", headers=auth(token)).status_code == 200
    assert script.get("/v1/models").status_code == 401  # its token is still required
    assert (
        error_code(script.get("/v1/models", headers=auth(token) | {"Origin": "http://localhost"}))
        == "browser_not_allowed"
    )
    for header in ("X-Forwarded-For", "Forwarded", "Via", "X-Real-IP"):
        assert code(script.get("/v1/models", headers=auth(token) | {header: "192.168.1.50"})) == (
            403,
            "proxy_not_supported",
        )
    through = TestClient(proxied.app, base_url=f"https://{PROXY}", client=("127.0.0.1", 50000))
    assert code(through.get("/v1/models", headers=auth(token))) == (403, "proxy_not_supported")


def test_a_forwarded_address_never_changes_who_a_device_is(client: TestClient, services: Services) -> None:
    services.lan.listener = FakeListener()  # type: ignore[assignment]
    device = paired(client, services)  # paired from 192.168.1.50
    assert device.get("/api/documents").status_code == 200
    for header in ("X-Forwarded-For", "X-Real-IP", "Forwarded"):
        assert code(device.get("/api/documents", headers={header: "127.0.0.1"})) == (403, "proxy_not_supported")
    copy = TestClient(client.app, base_url=ORIGIN, client=("192.168.1.77", 50000),
                      headers={"X-LTTS-Client": "web", "Origin": ORIGIN, "X-Forwarded-For": "192.168.1.50"})  # fmt: skip
    copy.cookies.update(device.cookies)
    assert code(copy.get("/api/documents")) == (403, "proxy_not_supported")
    assert code(copy.post("/api/lan/pair", json={"code": "ABCD-EFGH"})) == (403, "proxy_not_supported")
    for host in ("LOCALHOST", "192.168.1.20.", "[::1]:8765", PROXY):
        assert code(device.get("/api/documents", headers={"Host": host})) == (421, "invalid_host"), host


def test_network_mode_never_takes_a_proxy_for_this_computer(settings: Settings, engines: dict[str, Any]) -> None:
    token = "t" * 32
    network = settings.model_copy(update={"allow_network": True, "access_token": token, "host": "0.0.0.0",  # noqa: S104
                                          "extra_allowed_hosts": ["testserver", "mybox.local"]})  # fmt: skip
    services = build_services(network, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    app = TestClient(create_app(network, services=services))
    bearer = {"Authorization": f"Bearer {token}"}
    remote = at(app, "mybox.local:8765", "192.168.1.50")
    assert remote.get("/api/health").status_code == 401
    assert remote.get("/api/health", headers=bearer).status_code == 200
    assert code(remote.get("/api/health", headers={"X-Forwarded-For": "127.0.0.1"})) == (403, "proxy_not_supported")
    # The proxy's connection comes from 127.0.0.1: under another name it isn't this computer, token or not.
    assert code(at(app, "mybox.local:8765").get("/api/health", headers=bearer)) == (403, "proxy_not_supported")
    assert at(app, "localhost:8765").get("/api/lan").status_code == 200  # this computer's own browser
