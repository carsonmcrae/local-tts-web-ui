# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for importing a web page by link, including every server-side request forgery defence.

Scope: The ``POST /api/documents/url`` endpoint (local clients only), link checks, address checks
for private, loopback, link-local and wrapped (IPv4-mapped, 6to4, Teredo, NAT64) addresses, the
pinned connection's Host header and TLS server name, redirects re-checked hop by hop, the byte cap
(including compressed bombs), content types, deadlines and network failures. A fake resolver and
``httpx.MockTransport`` stand in for the internet; the real resolver is made to fail loudly.
Does NOT belong: Reading HTML (test_book_formats.py) or file uploads (test_api.py).
"""

from __future__ import annotations

import gzip
import ipaddress
import itertools
import socket
from collections.abc import Callable, Iterator
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services
from ltts.documents import url_import
from ltts.documents.url_import import check_url, fetch_page, is_public_address
from ltts.errors import AppError

PAGE = (
    b"<!doctype html><html><head><title>An Article</title></head><body><nav>Menu</nav>"
    b"<main><h1>An Article</h1><p>The first paragraph of the article.</p></main></body></html>"
)
Route = Callable[[httpx.Request], httpx.Response]


def chunks(*parts: bytes) -> Iterator[bytes]:
    """A streamed body, as a real connection delivers it (a bytes body would arrive already read)."""
    yield from parts


def html(body: bytes = PAGE, content_type: str = "text/html; charset=utf-8", **headers: str) -> Route:
    return lambda _request: httpx.Response(200, headers={"content-type": content_type, **headers}, content=chunks(body))


def redirect(location: str, status: int = 302) -> Route:
    return lambda _request: httpx.Response(status, headers={"location": location})


class FakeWeb:
    """A pretend internet: DNS answers and responses by host and path, with every request recorded."""

    def __init__(self) -> None:
        self.dns: dict[str, list[str]] = {"example.com": ["93.184.216.34"], "v6.example": ["2606:4700::1111"]}
        self.routes: dict[str, Route] = {}
        self.requests: list[httpx.Request] = []

    def resolve(self, host: str, port: int) -> list[str]:
        assert port in (80, 443)
        if host in self.dns:
            return self.dns[host]
        try:
            return [str(ipaddress.ip_address(host))]
        except ValueError:
            raise socket.gaierror(socket.EAI_NONAME, "unknown host") from None

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = self.routes.get(request.headers["host"] + request.url.path)
        return route(request) if route else httpx.Response(404)


def _no_real_network(*_args: Any, **_kwargs: Any) -> Any:
    raise AssertionError("tests must never touch the real network")


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> FakeWeb:
    fake = FakeWeb()
    monkeypatch.setattr(url_import, "resolve_host", fake.resolve)
    monkeypatch.setattr(url_import, "make_transport", lambda: httpx.MockTransport(fake.handle))
    monkeypatch.setattr(socket, "getaddrinfo", _no_real_network)
    monkeypatch.setattr(socket, "create_connection", _no_real_network)
    return fake


def local_client(settings: Settings, services: Services, host: str = "127.0.0.1") -> TestClient:
    return TestClient(create_app(settings, services=services), headers={"X-LTTS-Client": "web"}, client=(host, 50000))


@pytest.fixture
def local(settings: Settings, services: Services) -> Iterator[TestClient]:
    with local_client(settings, services) as test_client:
        yield test_client


def failure(url: str, *, max_bytes: int = 100_000, **options: Any) -> AppError:
    with pytest.raises(AppError) as error:
        fetch_page(url, max_bytes=max_bytes, **options)
    return error.value


# -- the endpoint -----------------------------------------------------------------
def test_imports_a_page_through_the_api(local: TestClient, web: FakeWeb, settings: Settings) -> None:
    web.routes["example.com/article"] = html()
    response = local.post("/api/documents/url", json={"url": " https://example.com/article?utm=x#top "})
    assert response.status_code == 201, response.text
    detail = response.json()
    assert (detail["title"], detail["fileType"], detail["filename"]) == (
        "An Article",
        "html",
        "https://example.com/article",
    )
    assert [section["title"] for section in detail["sections"]] == ["An Article"]
    request = web.requests[0]
    assert (request.url.host, request.url.query) == ("93.184.216.34", b"utm=x")
    assert request.headers["host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"
    assert request.headers["accept-encoding"] == "identity"
    assert list(settings.path("tmp").iterdir()) == []


def test_the_charset_the_site_sends_is_used(local: TestClient, web: FakeWeb) -> None:
    title = "\N{CYRILLIC CAPITAL LETTER PE}\N{CYRILLIC SMALL LETTER ER}\N{CYRILLIC SMALL LETTER IE}"
    body = f"<html><head><title>{title}</title></head><body><p>{title}.</p></body></html>".encode("cp1251")
    web.routes["example.com/ru"] = html(body, "text/html; charset=windows-1251")
    assert local.post("/api/documents/url", json={"url": "http://example.com/ru"}).json()["title"] == title


def test_a_page_without_text_is_refused_and_cleaned_up(local: TestClient, web: FakeWeb, settings: Settings) -> None:
    web.routes["example.com/empty"] = html(b"<html><body><script>app()</script></body></html>")
    response = local.post("/api/documents/url", json={"url": "https://example.com/empty"})
    assert (response.status_code, response.json()["error"]["code"]) == (422, "empty_document")
    assert list(settings.path("tmp").iterdir()) == []


@pytest.mark.parametrize(("host", "allowed"), [("::ffff:127.0.0.1", True), ("::1", True), ("192.168.1.20", False)])
def test_only_this_computer_may_import(
    settings: Settings, services: Services, web: FakeWeb, host: str, allowed: bool
) -> None:
    web.routes["example.com/article"] = html()
    with local_client(settings, services, host) as test_client:
        response = test_client.post("/api/documents/url", json={"url": "https://example.com/article"})
    assert response.status_code == (201 if allowed else 403)
    assert allowed or response.json()["error"]["code"] == "local_only"


def test_a_client_without_an_address_is_refused(client: TestClient, web: FakeWeb) -> None:
    response = client.post("/api/documents/url", json={"url": "https://example.com/article"})
    assert (response.status_code, response.json()["error"]["code"]) == (403, "local_only")
    assert web.requests == []


def test_blocked_addresses_are_explained(local: TestClient, web: FakeWeb) -> None:
    response = local.post("/api/documents/url", json={"url": "http://127.0.0.1/admin"})
    assert (response.status_code, response.json()["error"]["code"]) == (400, "blocked_address")
    assert web.requests == []


# -- links and addresses --------------------------------------------------------------
@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com/",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "http:///no-host",
        "",
        "http://[::1",
        "https://user:secret@example.com/",
        "https://user@example.com/",
        "http://example.com:8080/",
        "https://example.com:22/",
    ],
)
def test_links_that_are_not_plain_web_addresses_are_refused(url: str) -> None:
    with pytest.raises(AppError) as error:
        check_url(url)
    assert error.value.code == "invalid_url"


def test_standard_ports_on_either_scheme_are_allowed() -> None:
    assert str(check_url("HTTPS://Example.com:443/a#frag")) == "https://example.com/a"
    assert check_url("http://example.com:443/").port == 443


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "127.8.9.10",
        "10.0.0.5",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",  # noqa: S104 - an address to refuse, never one to bind
        "224.0.0.1",
        "240.0.0.1",
        "255.255.255.255",
        "::1",
        "::",
        "fe80::1",
        "fd00:ec2::254",
        "ff02::1",
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "::7f00:1",
        "64:ff9b::a00:1",
        "64:ff9b:1::1",
        "2002:a00:1::",
        "2001:0:4136:e378:8000:63bf:3fff:fdd2",
        "2001:db8::1",
        "not-an-address",
    ],
)
def test_non_public_addresses(address: str) -> None:
    assert not is_public_address(address)


@pytest.mark.parametrize(
    "address", ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "::ffff:93.184.216.34", "64:ff9b::5db8:d822"]
)
def test_public_addresses(address: str) -> None:
    assert is_public_address(address)


@pytest.mark.parametrize(
    "addresses", [["10.0.0.1"], ["93.184.216.34", "10.0.0.1"], ["::ffff:192.168.0.1"], ["fe80::1%eth0"], []]
)
def test_a_host_with_any_private_address_is_refused(web: FakeWeb, addresses: list[str]) -> None:
    web.dns["evil.example"] = addresses
    assert failure("https://evil.example/").code == "blocked_address"
    assert web.requests == []


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "http://[::1]/", "http://[::ffff:7f00:1]/", "http://localhost/"])
def test_local_targets_are_refused(web: FakeWeb, url: str) -> None:
    web.dns["localhost"] = ["127.0.0.1", "::1"]
    assert failure(url).code == "blocked_address"


def test_an_unknown_host_is_reported(web: FakeWeb) -> None:
    error = failure("https://no-such-host.example/")
    assert (error.code, error.status_code) == ("host_not_found", 502)


def test_the_real_resolver_lists_each_address_once(monkeypatch: pytest.MonkeyPatch) -> None:
    infos = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))] * 2
    infos.append((socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2606:4700::1111", 443, 0, 0)))
    monkeypatch.setattr(url_import.socket, "getaddrinfo", lambda *_args, **_kwargs: infos)
    assert url_import.resolve_host("example.com", 443) == ["93.184.216.34", "2606:4700::1111"]
    assert isinstance(url_import.make_transport(), httpx.HTTPTransport)


def test_ip_literal_and_plain_http_links_send_no_server_name(web: FakeWeb) -> None:
    web.routes["93.184.216.34/"] = html()
    web.routes["[2606:4700::1111]/"] = html()
    web.routes["v6.example/"] = html()
    for url in ("https://93.184.216.34/", "https://[2606:4700::1111]/", "http://v6.example/"):
        assert fetch_page(url, max_bytes=100_000).host
    assert [request.extensions.get("sni_hostname") for request in web.requests] == [None, None, None]
    assert web.requests[2].url.host == "2606:4700::1111"


# -- redirects --------------------------------------------------------------------
def test_redirects_are_followed_and_rechecked(web: FakeWeb) -> None:
    web.dns["cdn.example"] = ["93.184.216.35"]
    web.routes["example.com/old"] = redirect("https://cdn.example/new", 301)
    web.routes["cdn.example/new"] = redirect("/final", 308)
    web.routes["cdn.example/final"] = html()
    page = fetch_page("http://example.com/old", max_bytes=100_000)
    assert (page.address, page.host) == ("https://cdn.example/final", "cdn.example")
    assert [request.url.host for request in web.requests] == ["93.184.216.34", "93.184.216.35", "93.184.216.35"]


@pytest.mark.parametrize(
    ("location", "code"),
    [
        ("http://169.254.169.254/latest/meta-data/", "blocked_address"),
        ("http://internal.example/admin", "blocked_address"),
        ("http://[::ffff:10.0.0.1]/", "blocked_address"),
        ("ftp://example.com/file", "invalid_url"),
        ("http://example.com:8080/", "invalid_url"),
        ("http://[::1", "bad_response"),
    ],
)
def test_a_redirect_to_a_forbidden_address_is_refused(web: FakeWeb, location: str, code: str) -> None:
    web.dns["internal.example"] = ["10.0.0.1"]
    web.routes["example.com/go"] = redirect(location)
    assert failure("https://example.com/go").code == code
    assert len(web.requests) == 1


def test_redirect_chains_are_limited(web: FakeWeb) -> None:
    for hop in range(7):
        web.routes[f"example.com/{hop}"] = redirect(f"/{hop + 1}")
    web.routes["example.com/5"] = html()
    assert fetch_page("https://example.com/0", max_bytes=100_000).address == "https://example.com/5"
    web.routes["example.com/5"] = redirect("/6")
    web.requests.clear()
    assert failure("https://example.com/0").code == "too_many_redirects"
    assert len(web.requests) == url_import.MAX_REDIRECTS + 1


# -- what comes back --------------------------------------------------------------
@pytest.mark.parametrize(
    ("route", "code"),
    [
        (html(b"x" * 10, **{"content-length": "200000"}), "page_too_large"),
        (
            lambda _r: httpx.Response(
                200, headers={"content-type": "text/html"}, content=chunks(b"<p>", b"x" * 150_000)
            ),
            "page_too_large",
        ),
        (html(gzip.compress(b"<html>" + b" " * 5_000_000), **{"content-encoding": "gzip"}), "page_too_large"),
        (html(gzip.compress(PAGE) + b"\0" * 150_000, **{"content-encoding": "gzip"}), "page_too_large"),
        (html(b"not deflate data", **{"content-encoding": "deflate"}), "page_damaged"),
        (html(PAGE, **{"content-encoding": "br"}), "unsupported_encoding"),
        (html(PAGE, "application/pdf"), "not_a_web_page"),
        (lambda _r: httpx.Response(200, content=chunks(PAGE)), "not_a_web_page"),
        (html(b"\x89PNG\r\n\x1a\n\x00\x00\x00binary"), "not_a_web_page"),
        (html(b"Just some words, not markup."), "not_a_web_page"),
        (
            lambda _r: httpx.Response(404, headers={"content-type": "text/html"}, content=chunks(PAGE)),
            "page_unavailable",
        ),
    ],
)
def test_unusable_responses_are_refused(web: FakeWeb, route: Route, code: str) -> None:
    web.routes["example.com/page"] = route
    assert failure("https://example.com/page").code == code


def test_compressed_and_xhtml_pages_are_accepted(web: FakeWeb) -> None:
    web.routes["example.com/gz"] = html(gzip.compress(PAGE), "application/xhtml+xml", **{"content-encoding": "gzip"})
    page = fetch_page("https://example.com/gz", max_bytes=100_000)
    assert (page.body, page.charset) == (PAGE, None)


@pytest.mark.parametrize(
    ("error", "code"),
    [(httpx.ConnectTimeout("slow"), "page_timeout"), (httpx.ConnectError("refused"), "page_unreachable")],
)
def test_network_failures_are_reported(web: FakeWeb, error: Exception, code: str) -> None:
    def fail(_request: httpx.Request) -> httpx.Response:
        raise error

    web.routes["example.com/page"] = fail
    assert failure("https://example.com/page").code == code


def test_the_overall_deadline_applies_before_and_during_the_download(
    web: FakeWeb, monkeypatch: pytest.MonkeyPatch
) -> None:
    web.routes["example.com/page"] = lambda _r: httpx.Response(
        200, headers={"content-type": "text/html"}, content=chunks(b"<p>one", b"two</p>", b"three")
    )
    assert failure("https://example.com/page", deadline_s=0).code == "page_timeout"
    clock = itertools.count(step=10)  # every look at the clock is ten seconds later
    monkeypatch.setattr(url_import, "time", SimpleNamespace(monotonic=lambda: next(clock)))
    assert failure("https://example.com/page", deadline_s=30).code == "page_timeout"


def test_old_python_releases_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(url_import, "sys", SimpleNamespace(version_info=(3, 12, 3)))
    assert failure("https://example.com/").code == "python_too_old"
