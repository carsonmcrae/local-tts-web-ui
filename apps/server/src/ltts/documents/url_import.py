# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Fetch one public web page for import, defending against server-side request forgery.

Scope: Only http and https links on ports 80 and 443 without a user name or password. Every address
the host name resolves to must be globally routable (IPv4 inside IPv6 forms is unwrapped first), and
the connection is pinned to a checked address while sending the real Host header and TLS server name.
Redirects are followed by hand, re-checking each hop (at most five). Proxies and other environment
settings are ignored, the body is streamed under a byte cap (compressed bodies are inflated under the
same cap) and an overall deadline, and only HTML that also looks like HTML is accepted.
Does NOT belong: Reading the page (``extract_html.py``) or storing it (``service.py``).
"""

from __future__ import annotations

import ipaddress
import re
import socket
import sys
import time
import zlib
from dataclasses import dataclass

import httpx

from ltts.common import MB
from ltts.documents.sniff import looks_like_html
from ltts.errors import AppError, PayloadTooLargeError, UnsupportedDocumentError

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
DEFAULT_PORTS = {"http": 80, "https": 443}
MAX_REDIRECTS = 5
MIN_PYTHON = (3, 12, 4)  # earlier releases misclassify some private ranges (CVE-2024-4032)
DEADLINE_S = 30.0
HTML_TYPES = {"text/html", "application/xhtml+xml"}
_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_CHARSET = re.compile(r"charset\s*=\s*[\"']?([\w.:-]{1,40})", re.IGNORECASE)
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TTSNative page import)",
    "Accept": "text/html,application/xhtml+xml;q=0.9",
    "Accept-Encoding": "identity",
}


class PageFetchError(AppError):
    """The site could not be reached or did not send a usable page."""

    status_code = 502
    code = "page_fetch_failed"


@dataclass(frozen=True, slots=True)
class FetchedPage:
    address: str  # the final address after redirects, without its query (which can hold private tokens)
    host: str
    body: bytes
    charset: str | None


def _invalid(message: str) -> AppError:
    return AppError(message, code="invalid_url")


def check_url(raw: str) -> httpx.URL:
    """Parse a link and refuse anything other than a plain http(s) address on a standard port."""
    try:
        url = httpx.URL(raw.strip())
    except httpx.InvalidURL as exc:
        raise _invalid("That doesn't look like a web address.") from exc
    if url.scheme not in DEFAULT_PORTS or not url.host:
        raise _invalid("Only web addresses starting with http:// or https:// can be imported.")
    if url.userinfo:
        raise _invalid("Links that include a user name or password can't be imported.")
    if (url.port or DEFAULT_PORTS[url.scheme]) not in DEFAULT_PORTS.values():
        raise _invalid("Only links on the standard web ports (80 and 443) can be imported.")
    return url.copy_with(fragment=None)


def _embedded(address: IPAddress) -> list[IPAddress]:
    """The addresses a connection to ``address`` really reaches (IPv4 inside IPv6 forms unwrapped)."""
    if isinstance(address, ipaddress.IPv4Address):
        return [address]
    if address.ipv4_mapped:
        return [address.ipv4_mapped]
    if address in _NAT64:
        return [ipaddress.IPv4Address(int(address) & 0xFFFFFFFF)]
    tunnelled = [address.sixtofour] if address.sixtofour else []
    return [address, *tunnelled, *(address.teredo or ())]


def is_public_address(text: str) -> bool:
    """Whether an address, and every address it wraps, is globally routable unicast."""
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        return False
    return all(
        ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_private or ip.is_loopback or ip.is_link_local)
        for ip in _embedded(address)
    )


def resolve_host(host: str, port: int) -> list[str]:
    """Every address the host name resolves to (replaced in tests so they never touch the network)."""
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(str(info[4][0]) for info in infos))


def make_transport() -> httpx.BaseTransport:
    """The real network transport (replaced in tests by ``httpx.MockTransport``).

    Connections are never kept for reuse: one checked for one host name must not carry a request
    for another name that happens to share its address.
    """
    return httpx.HTTPTransport(retries=0, limits=httpx.Limits(max_keepalive_connections=0))


def _checked_address(url: httpx.URL) -> str:
    host = url.raw_host.decode("ascii")
    try:
        addresses = resolve_host(host, url.port or DEFAULT_PORTS[url.scheme])
    except (OSError, UnicodeError) as exc:
        raise PageFetchError("Couldn't find that website. Check the address.", code="host_not_found") from exc
    if not addresses or not all(is_public_address(address) for address in addresses):
        raise AppError(
            "That address points to this computer or a private network, which can't be imported.",
            code="blocked_address",
        )
    return addresses[0]


def _remaining(deadline: float) -> float:
    left = deadline - time.monotonic()
    if left <= 0:
        raise PageFetchError("The website took too long to answer.", code="page_timeout")
    return left


def _send(client: httpx.Client, url: httpx.URL, deadline: float) -> httpx.Response:
    """Request ``url`` from its checked address, keeping the real host name for Host and TLS."""
    address = _checked_address(url)
    extensions: dict[str, str] = {}
    if url.scheme == "https" and not _is_ip_literal(url.host):
        extensions["sni_hostname"] = url.raw_host.decode("ascii")
    request = client.build_request(
        "GET",
        url.copy_with(host=address),
        headers={**_HEADERS, "Host": url.netloc.decode("ascii")},
        extensions=extensions,
        timeout=httpx.Timeout(min(_remaining(deadline), 15.0)),
    )
    return client.send(request, stream=True)


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


class _Inflater:
    """Undo a Content-Encoding the site used despite being asked for none, never past ``limit`` bytes."""

    def __init__(self, encoding: str | None) -> None:
        name = (encoding or "identity").strip().lower()
        if name not in ("identity", "gzip", "x-gzip", "deflate"):
            raise UnsupportedDocumentError(
                "The website sent the page in a compressed format that can't be read.", code="unsupported_encoding"
            )
        self._zlib = None if name == "identity" else zlib.decompressobj(32 + zlib.MAX_WBITS)

    def feed(self, chunk: bytes, limit: int) -> bytes:
        if self._zlib is None:
            return chunk
        try:
            return self._zlib.decompress(chunk, limit)
        except zlib.error as exc:
            raise PageFetchError("The page arrived damaged.", code="page_damaged") from exc


def _too_large(max_bytes: int) -> PayloadTooLargeError:
    return PayloadTooLargeError(
        f"The page is larger than the {max_bytes // MB} MB limit.",
        code="page_too_large",
        details={"limitBytes": max_bytes},
    )


def _media_type(response: httpx.Response) -> tuple[str, str | None]:
    media, _, params = response.headers.get("content-type", "").partition(";")
    match = _CHARSET.search(params)
    return media.strip().lower(), match.group(1) if match else None


def _read_body(response: httpx.Response, max_bytes: int, deadline: float) -> bytes:
    declared = response.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        raise _too_large(max_bytes)
    inflater = _Inflater(response.headers.get("content-encoding"))
    body = bytearray()
    received = 0
    for chunk in response.iter_raw():
        _remaining(deadline)
        received += len(chunk)
        body += inflater.feed(chunk, max_bytes + 1 - len(body))
        if len(body) > max_bytes or received > max_bytes:
            raise _too_large(max_bytes)
    return bytes(body)


def _page(response: httpx.Response, url: httpx.URL, max_bytes: int, deadline: float) -> FetchedPage:
    if response.status_code != 200:
        raise PageFetchError(
            f"The website couldn't send that page (error {response.status_code}). Check the address.",
            code="page_unavailable",
        )
    media, charset = _media_type(response)
    if media not in HTML_TYPES:
        raise UnsupportedDocumentError(
            "That link doesn't lead to a web page. Download the file and upload it instead.", code="not_a_web_page"
        )
    body = _read_body(response, max_bytes, deadline)
    if not looks_like_html(body):
        raise UnsupportedDocumentError("That link didn't return a readable web page.", code="not_a_web_page")
    return FetchedPage(str(url.copy_with(query=None)), url.host, body, charset)


def fetch_page(raw_url: str, *, max_bytes: int, deadline_s: float = DEADLINE_S) -> FetchedPage:
    """Download one HTML page, following at most ``MAX_REDIRECTS`` redirects, each one re-checked."""
    if sys.version_info < MIN_PYTHON:
        raise AppError("Importing web pages needs Python 3.12.4 or newer.", code="python_too_old")
    deadline = time.monotonic() + deadline_s
    url = check_url(raw_url)
    with httpx.Client(transport=make_transport(), trust_env=False, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                response = _send(client, url, deadline)
                try:
                    if not response.is_redirect:
                        return _page(response, url, max_bytes, deadline)
                    # Joined to the real host name: httpx's own redirect target points at the pinned address.
                    url = check_url(str(url.join(response.headers["location"])))
                finally:
                    response.close()
            except httpx.TimeoutException as exc:
                raise PageFetchError("The website took too long to answer.", code="page_timeout") from exc
            except (httpx.RemoteProtocolError, httpx.InvalidURL) as exc:  # includes a malformed redirect address
                raise PageFetchError("The website sent an answer that couldn't be read.", code="bad_response") from exc
            except httpx.HTTPError as exc:
                raise PageFetchError("Couldn't connect to that website.", code="page_unreachable") from exc
    raise PageFetchError("The page redirected too many times.", code="too_many_redirects")
