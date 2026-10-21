# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP-layer defences for a server that must only ever be driven by its own UI.

Scope: Pure ASGI middleware that (1) rejects unexpected Host headers (DNS rebinding), (2) blocks
cross-site requests via Sec-Fetch-Site and a required custom header on state-changing methods
(CSRF; no CORS is ever enabled so browsers cannot satisfy the pre-flight), (3) requires an access
token for non-loopback clients when network mode is explicitly enabled (except on the speech API,
``/v1``, which checks its own token and network permission), (4) in LAN mode, accepts the network
address only on the LAN listener and there requires the page's own Origin for changes, a paired
device for the API and keeps this computer's own operations off it (``lan/policy.py``), (5) caps
request bodies, and (6) adds security headers including a strict Content-Security-Policy.
Does NOT belong: Upload content validation (documents/voices) or authentication of local users —
on loopback the machine's user is trusted.
"""

from __future__ import annotations

import hmac
import ipaddress
import json
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any
from urllib.parse import parse_qs

from ltts.config import LOOPBACK_HOSTS, Settings
from ltts.lan.policy import LOCAL_ONLY, open_to_unpaired, refused_remotely
from ltts.lan.service import COOKIE, LanService

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

CLIENT_HEADER = b"x-ltts-client"
SPEECH_API_PREFIX = "/v1/"  # speech_api/router.py: its own bearer token and network permission
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    "media-src 'self' blob: data:; connect-src 'self'; font-src 'self'; worker-src 'self' blob:; object-src 'none'; "
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)
SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-origin"),
    (b"permissions-policy", b"microphone=(self), camera=(), geolocation=(), payment=(), usb=()"),
    (b"content-security-policy", CSP.encode()),
]


def _is_loopback(host: str | None) -> bool:
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


def _local_addresses() -> set[str]:
    import socket

    import psutil

    addresses = {socket.gethostname(), f"{socket.gethostname()}.local"}
    for entries in psutil.net_if_addrs().values():
        addresses.update(entry.address.split("%", 1)[0] for entry in entries if entry.family in (2, 23, 10))
    return addresses


def _host_name(raw: str) -> str:
    if raw.startswith("["):
        return raw[1 : raw.find("]")]
    return raw.rsplit(":", 1)[0] if raw.count(":") == 1 else raw


def _cookie(headers: dict[bytes, bytes], wanted: str) -> str:
    for part in headers.get(b"cookie", b"").decode("latin-1").split(";"):
        name, _, value = part.strip().partition("=")
        if name == wanted:
            return value
    return ""


class SecurityMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings, lan: LanService | None = None):
        self.app = app
        self.settings = settings
        self.lan = lan
        self.allowed_hosts = {*LOOPBACK_HOSTS, *settings.extra_allowed_hosts}
        if settings.allow_network:
            # Network mode accepts this machine's own addresses but still rejects foreign names,
            # so DNS rebinding stays blocked for browsers on this machine.
            self.allowed_hosts |= _local_addresses()
            self.allowed_hosts.add(settings.host)
        self.max_body = settings.max_upload_bytes + 64 * 1024

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        problem = self._check(scope, headers)
        if problem:
            await _reject(send, *problem)
            return
        wrapped = _with_headers(send, scope["path"], self._login_cookie(scope))
        await self.app(scope, _limited(receive, self.max_body), wrapped)

    def _login_cookie(self, scope: Scope) -> bytes | None:
        """Turn a valid ``?token=`` on a network client's first visit into an HttpOnly cookie."""
        if not self.settings.allow_network or not self.settings.access_token:
            return None
        query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
        supplied = (query.get("token") or [""])[0]
        if supplied and hmac.compare_digest(supplied.encode(), self.settings.access_token.encode()):
            return f"ltts_token={supplied}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000".encode()
        return None

    def _check(self, scope: Scope, headers: dict[bytes, bytes]) -> tuple[int, str, str] | None:
        host = _host_name(headers.get(b"host", b"").decode("latin-1"))
        on_lan = self.lan is not None and self.lan.serving(scope)
        if host not in self.allowed_hosts and not (on_lan and self.lan is not None and host in self.lan.hosts()):
            return 421, "invalid_host", "Unexpected Host header."
        site = headers.get(b"sec-fetch-site", b"").decode()
        if site == "cross-site":
            return 403, "cross_site_blocked", "Cross-site requests are not allowed."
        path: str = scope["path"]
        if path.startswith("/api/") and scope["method"] not in SAFE_METHODS and CLIENT_HEADER not in headers:
            return 403, "missing_client_header", "Requests must come from the TTSNative app."
        if on_lan:
            return self._check_device(scope, headers)
        client = scope.get("client")
        remote = not _is_loopback(client[0] if client else None)
        if self.settings.allow_network and remote and not path.startswith(SPEECH_API_PREFIX):
            return self._check_token(headers, scope.get("query_string", b""))
        return None

    def _check_device(self, scope: Scope, headers: dict[bytes, bytes]) -> tuple[int, str, str] | None:
        """A request on the LAN listener: the page's own Origin for changes, then a paired device."""
        assert self.lan is not None  # noqa: S101 - only called for requests on the LAN listener
        method, path = scope["method"], scope["path"]
        if path.startswith(SPEECH_API_PREFIX):
            return None  # its own token and network permission (speech_api/guard.py)
        if method not in SAFE_METHODS and headers.get(b"origin", b"").decode("latin-1") != self.lan.origin():
            return 403, "origin_mismatch", "Changes must come from this app's own page."
        device = self.lan.device(_cookie(headers, COOKIE))
        scope.setdefault("state", {})["lan_device"] = device
        if device is None:
            if open_to_unpaired(method, path):
                return None
            return 401, "device_not_paired", "Pair this device first: open the pairing link shown on the computer."
        if refused_remotely(method, path):
            return 403, "not_allowed_remotely", LOCAL_ONLY
        return None

    def _check_token(self, headers: dict[bytes, bytes], query: bytes) -> tuple[int, str, str] | None:
        token = self.settings.access_token
        supplied = headers.get(b"authorization", b"").decode().removeprefix("Bearer ").strip()
        if not supplied:
            supplied = _cookie(headers, "ltts_token")
        if not supplied:
            supplied = (parse_qs(query.decode("latin-1")).get("token") or [""])[0]
        if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
            return 401, "access_token_required", "This server requires an access token for network clients."
        return None


async def _reject(send: Send, status: int, code: str, message: str) -> None:
    body = json.dumps({"error": {"code": code, "message": message, "details": {}}}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), *SECURITY_HEADERS],
        }
    )
    await send({"type": "http.response.body", "body": body})


def _limited(receive: Receive, max_body: int) -> Receive:
    received = 0

    async def wrapped() -> Message:
        nonlocal received
        message = await receive()
        if message["type"] == "http.request":
            received += len(message.get("body", b""))
            if received > max_body:
                return {"type": "http.disconnect"}
        return message

    return wrapped


def _with_headers(send: Send, path: str, cookie: bytes | None = None) -> Send:
    async def wrapped(message: Message) -> None:
        if message["type"] == "http.response.start":
            existing = list(message.get("headers", []))
            names = {name.lower() for name, _ in existing}
            extra = [(k, v) for k, v in SECURITY_HEADERS if k not in names]
            if path.startswith(("/api/", SPEECH_API_PREFIX)):
                extra.append((b"cache-control", b"no-store"))
            if cookie:
                extra.append((b"set-cookie", cookie))
            message["headers"] = existing + extra
        await send(message)

    return wrapped
