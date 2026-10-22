# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP-layer defences for a server that must only ever be driven by its own UI.

Scope: Pure ASGI middleware that refuses any request a proxy, tunnel or CDN says it forwarded, and
unexpected or repeated Host headers (DNS rebinding); treats a request as this computer's own user only
from a loopback address under a loopback name (and with a loopback ``Origin`` for changes); blocks
cross-site requests and changes without the app's header (CSRF; no CORS ever); requires the access
token from other addresses in network mode (``/v1`` checks its own token and network permission);
in LAN mode, applies the LAN listener's Host, Origin and pairing rules, ``lan/policy.py`` and the
per-device limits; caps request bodies (a few kilobytes before pairing; a route's own larger cap only
where it takes recordings or voice files); and adds security headers
with a strict Content-Security-Policy. Proxies are unsupported (docs/guides/lan-access.md).
Does NOT belong: Upload content validation (documents/voices) or authentication of local users —
on loopback the machine's user is trusted.
"""

from __future__ import annotations

import hmac
import json
import re
from collections.abc import Awaitable, Callable, Iterable, MutableMapping
from typing import Any
from urllib.parse import parse_qs

from ltts.common import MAX_RECORDING_IMPORT_BYTES, MAX_VOICE_PACKAGE_BYTES
from ltts.config import LOOPBACK_HOSTS, Settings
from ltts.errors import BODY_TOO_LARGE
from ltts.lan.devices import Recognised
from ltts.lan.policy import LOCAL_ONLY, brief, costly, open_to_unpaired, refused_remotely
from ltts.lan.service import COOKIE, LanService
from ltts.speech_api.guard import is_local

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]
Problem = tuple[int, str, str]

CLIENT_HEADER = b"x-ltts-client"
API_PREFIX = "/api/"  # the app's own API, which only its pages call
SPEECH_API_PREFIX = "/v1/"  # speech_api/router.py: its own bearer token and network permission
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
UNPAIRED_MAX_BODY = 4096  # a pairing request is a few dozen bytes
# Routes that take bigger bodies than the general upload limit (each also enforces its own cap).
ROUTE_BODY_CAPS: tuple[tuple[str, int], ...] = (
    ("/api/voice-sessions/", MAX_RECORDING_IMPORT_BYTES),
    ("/api/voice-profiles/", MAX_VOICE_PACKAGE_BYTES),
)
TEST_HOST = "testserver"  # Starlette's TestClient: stands for this computer only when LTTS_ENV=test
TEST_CLIENT = "testclient"  # its client address, likewise
# What proxies, tunnels and CDNs add to a request they pass on. Browsers never send these themselves.
FORWARDING_HEADERS = frozenset(
    {b"forwarded", b"via", b"x-real-ip", b"x-client-ip", b"true-client-ip", b"x-cluster-client-ip",
     b"x-original-forwarded-for", b"x-originating-ip", b"x-proxyuser-ip", b"fastly-client-ip", b"cdn-loop"}
)  # fmt: skip
FORWARDING_PREFIXES = (b"x-forwarded-", b"cf-", b"tailscale-", b"x-envoy-", b"x-amzn-")
_ORIGIN = re.compile(r"https?://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?", re.ASCII)
PROXIED = (
    "TTSNative doesn't accept requests through a proxy, tunnel or port forward. On this computer, open it at "
    "http://localhost; for a phone or tablet, use LAN mode."
)
OWN_NAME = (
    "Open TTSNative on this computer as localhost or 127.0.0.1. A request under another name through this "
    "computer's own address is what a proxy or tunnel looks like, and TTSNative doesn't accept those."
)
UNPAIRED = {
    None: "Pair this device first: open the pairing link shown on the computer.",
    "expired": "This device's pairing has expired. Pair it again with a new code from the computer.",
    "address_changed": "This device's network address changed, so it needs to pair again with a new code.",
}
BUSY = "This device has started a lot of work recently. Wait a few minutes, then try again."
PREVIEWS_BUSY = "This device has asked for a lot of previews recently. Wait a few minutes, then try again."
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


def _local_addresses() -> set[str]:
    import socket

    import psutil

    addresses = {socket.gethostname(), f"{socket.gethostname()}.local"}
    for entries in psutil.net_if_addrs().values():
        addresses.update(entry.address.split("%", 1)[0] for entry in entries if entry.family in (2, 23, 10))
    return addresses


def _is_loopback(host: str | None) -> bool:
    """Whether a client address is this computer: IPv4 or IPv6 loopback, also IPv4 mapped into IPv6."""
    return host == "localhost" or is_local(host)


def forwarded(names: Iterable[bytes]) -> bool:
    """Whether any of these (lower-case) header names says a proxy, tunnel or CDN passed the request on."""
    return any(name in FORWARDING_HEADERS or name.startswith(FORWARDING_PREFIXES) for name in names)


def host_name(raw: str) -> str:
    """The name in a Host header, lower-cased and without its port; "" when it isn't one name and a port."""
    value = raw.lower()
    if value.startswith("["):
        end = value.find("]")
        name, rest = (value[1:end], value[end + 1 :]) if end > 1 else ("", "")
    elif ":" in value[value.find(":") + 1 :]:
        return ""  # an IPv6 address without brackets, or more than one port
    else:
        name, colon, port = value.partition(":")
        rest = colon + port
    port = rest.removeprefix(":")
    if rest and (rest == port or not (port.isascii() and port.isdigit())):
        return ""
    return name


def _content_length(headers: dict[bytes, bytes]) -> int:
    try:
        return int(headers.get(b"content-length", b"0"))
    except ValueError:
        return 0


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
        # This computer's own names: a loopback address under any other name is a proxy or tunnel.
        self.own_names = {*LOOPBACK_HOSTS, *([TEST_HOST] if settings.env == "test" else [])}
        allowed = {*LOOPBACK_HOSTS, *settings.extra_allowed_hosts}
        if settings.allow_network:
            # Network mode accepts this machine's own addresses but still rejects foreign names,
            # so DNS rebinding stays blocked for browsers on this machine.
            allowed |= {*_local_addresses(), settings.host}
        self.allowed_hosts = {name.lower() for name in allowed}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        problem = self._check(scope, headers)
        if problem:
            await _reject(send, *problem)
            return
        state = scope.setdefault("state", {})
        max_body = self._body_cap(scope["path"])
        if "lan_device" in state and state["lan_device"] is None:  # on the LAN listener, not paired
            max_body = UNPAIRED_MAX_BODY
            if _content_length(headers) > max_body:
                await _reject(send, 413, "payload_too_large", "Pair this device first.")
                return
        wrapped = _with_headers(send, scope["path"], self._login_cookie(scope))
        await self.app(scope, _limited(receive, max_body, state), wrapped)

    def _body_cap(self, path: str) -> int:
        """The general upload limit, or a route's own larger one, with room for headers and framing."""
        caps = [cap for prefix, cap in ROUTE_BODY_CAPS if path.startswith(prefix)]
        return max([self.settings.max_upload_bytes, *caps]) + 64 * 1024

    def _login_cookie(self, scope: Scope) -> bytes | None:
        """Turn a valid ``?token=`` on a network client's first visit into an HttpOnly cookie."""
        if not self.settings.allow_network or not self.settings.access_token:
            return None
        query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
        supplied = (query.get("token") or [""])[0]
        if supplied and hmac.compare_digest(supplied.encode(), self.settings.access_token.encode()):
            return f"ltts_token={supplied}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000".encode()
        return None

    def _check(self, scope: Scope, headers: dict[bytes, bytes]) -> Problem | None:
        if forwarded(headers):
            return 403, "proxy_not_supported", PROXIED
        on_lan = self.lan is not None and self.lan.serving(scope)
        hosts = [value for name, value in scope.get("headers", []) if name.lower() == b"host"]
        host = host_name(hosts[0].decode("latin-1")) if len(hosts) == 1 else ""
        problem = self._check_request(scope, headers, host, on_lan)
        if problem or on_lan:
            return problem or self._check_device(scope, headers)
        return self._check_here(scope, headers, host)

    def _check_request(self, scope: Scope, headers: dict[bytes, bytes], host: str, on_lan: bool) -> Problem | None:
        """What every request must pass, on either listener: its one Host, and the CSRF checks."""
        if host not in (self.lan.hosts() if on_lan and self.lan is not None else self.allowed_hosts):
            return 421, "invalid_host", "Unexpected Host header."
        if headers.get(b"sec-fetch-site") == b"cross-site":
            return 403, "cross_site_blocked", "Cross-site requests are not allowed."
        if (
            scope["path"].startswith(API_PREFIX)
            and scope["method"] not in SAFE_METHODS
            and CLIENT_HEADER not in headers
        ):
            return 403, "missing_client_header", "Requests must come from the TTSNative app."
        return None

    def _check_here(self, scope: Scope, headers: dict[bytes, bytes], host: str) -> Problem | None:
        """A request on the main address: this computer's own user, a device in network mode, or refused."""
        path: str = scope["path"]
        client = scope.get("client")
        address = client[0] if client else None
        local = _is_loopback(address) or (address == TEST_CLIENT and self.settings.env == "test")
        if not local and not self.settings.allow_network and not path.startswith(SPEECH_API_PREFIX):
            # Other devices come in through the LAN listener (``/v1`` applies its own network permission).
            return 403, "not_local", "Only this computer may use its own address; a phone or tablet uses LAN mode."
        if local and host not in self.own_names:
            return 403, "proxy_not_supported", OWN_NAME
        if self.settings.allow_network and not local:
            return None if path.startswith(SPEECH_API_PREFIX) else self._check_token(headers, scope)
        if scope["method"] in SAFE_METHODS or path.startswith(SPEECH_API_PREFIX):
            return None  # the speech API refuses every browser page itself
        if not self._own_origin(headers.get(b"origin")):
            return 403, "origin_mismatch", "Changes must come from this app's own page."
        return None

    def _own_origin(self, origin: bytes | None) -> bool:
        """No Origin (a program on this computer), or a page on one of this computer's own names."""
        if origin is None:
            return True
        match = _ORIGIN.fullmatch(origin.decode("latin-1"))
        return match is not None and host_name(match.group(1)) in self.own_names

    def _check_device(self, scope: Scope, headers: dict[bytes, bytes]) -> Problem | None:
        """A request on the LAN listener: from the app's own page, then a paired device that may do it."""
        assert self.lan is not None  # noqa: S101 - only called for requests on the LAN listener
        method, path = scope["method"], scope["path"]
        if path.startswith(SPEECH_API_PREFIX):
            return None  # its own token and network permission (speech_api/guard.py)
        if path.startswith(API_PREFIX) and headers.get(b"sec-fetch-site") == b"same-site":
            # another port on the same address: its requests would carry the device cookie too
            return 403, "cross_site_blocked", "Requests must come from this app's own page."
        if method not in SAFE_METHODS and headers.get(b"origin", b"").decode("latin-1") != self.lan.origin():
            return 403, "origin_mismatch", "Changes must come from this app's own page."
        client = scope.get("client")
        seen = self.lan.recognise(_cookie(headers, COOKIE), client[0] if client else "")
        state = scope.setdefault("state", {})
        state["lan_device"], state["lan_refusal"] = seen.device, seen.refusal
        return self._check_permission(seen, method, path)

    def _check_permission(self, seen: Recognised, method: str, path: str) -> Problem | None:
        assert self.lan is not None  # noqa: S101 - only called for requests on the LAN listener
        if seen.device is None:
            if open_to_unpaired(method, path):
                return None
            return 401, "device_not_paired", UNPAIRED[seen.refusal]
        if refused_remotely(method, path):
            return 403, "not_allowed_remotely", LOCAL_ONLY
        if costly(method, path) and not self.lan.budget.allow(seen.device.id):
            return 429, "lan_busy", BUSY
        if brief(method, path) and not self.lan.previews.allow(seen.device.id):
            return 429, "lan_busy", PREVIEWS_BUSY
        return None

    def _check_token(self, headers: dict[bytes, bytes], scope: Scope) -> Problem | None:
        token = self.settings.access_token
        supplied = headers.get(b"authorization", b"").decode("latin-1").removeprefix("Bearer ").strip()
        if not supplied:
            supplied = _cookie(headers, "ltts_token")
        if not supplied:
            supplied = (parse_qs(scope.get("query_string", b"").decode("latin-1")).get("token") or [""])[0]
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


def _limited(receive: Receive, max_body: int, state: MutableMapping[str, Any]) -> Receive:
    """Stop reading past ``max_body``: the app sees a disconnect, and the flag turns it into a 413."""
    received = 0

    async def wrapped() -> Message:
        nonlocal received
        message = await receive()
        if message["type"] == "http.request":
            received += len(message.get("body", b""))
            if received > max_body:
                state[BODY_TOO_LARGE] = max_body
                return {"type": "http.disconnect"}
        return message

    return wrapped


def _with_headers(send: Send, path: str, cookie: bytes | None = None) -> Send:
    async def wrapped(message: Message) -> None:
        if message["type"] == "http.response.start":
            existing = list(message.get("headers", []))
            names = {name.lower() for name, _ in existing}
            extra = [(k, v) for k, v in SECURITY_HEADERS if k not in names]
            if path.startswith((API_PREFIX, SPEECH_API_PREFIX)):
                extra.append((b"cache-control", b"no-store"))
            if cookie:
                extra.append((b"set-cookie", cookie))
            message["headers"] = existing + extra
        await send(message)

    return wrapped
