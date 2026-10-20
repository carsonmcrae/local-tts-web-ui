# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the HTTP security middleware.

Scope: Host-header allow-list (DNS rebinding), CSRF client header on unsafe methods, Sec-Fetch-Site
cross-site blocking, security headers/CSP on every response, no CORS headers, network mode token
enforcement for non-loopback clients, and CLI refusal to bind non-loopback without opt-in.
Does NOT belong: Document content security (test_document_security.py).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from ltts.app import create_app
from ltts.cli import main as cli_main
from ltts.config import Settings
from ltts.container import Services


def test_foreign_host_header_is_rejected(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Host": "attacker.example"})
    assert response.status_code == 421
    assert response.json()["error"]["code"] == "invalid_host"


def test_loopback_hosts_are_allowed(client: TestClient) -> None:
    for host in ("127.0.0.1:8765", "localhost:5173", "[::1]:8765"):
        assert client.get("/api/health", headers={"Host": host}).status_code == 200


def test_state_changing_requests_need_the_client_header(settings: Settings, services: Services) -> None:
    with TestClient(create_app(settings, services=services)) as bare:
        response = bare.post("/api/documents/text", json={"text": "hi"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "missing_client_header"
        assert bare.get("/api/health").status_code == 200  # safe methods are fine


def test_cross_site_requests_are_blocked(client: TestClient) -> None:
    response = client.get("/api/documents", headers={"Sec-Fetch-Site": "cross-site"})
    assert response.status_code == 403
    assert client.get("/api/documents", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200


def test_security_headers_and_no_cors(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
    assert "access-control-allow-origin" not in response.headers
    preflight = client.options(
        "/api/documents/text", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in preflight.headers


def test_network_mode_requires_token_for_remote_clients(settings: Settings, services: Services) -> None:
    token = "t" * 32
    network = settings.model_copy(update={"allow_network": True, "access_token": token, "host": "0.0.0.0"})  # noqa: S104
    app = create_app(network, services=services)
    remote = TestClient(app, client=("192.168.1.50", 50000), headers={"X-LTTS-Client": "web"})
    assert remote.get("/api/health").status_code == 401
    assert remote.get("/api/health", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert remote.get("/api/health", cookies={"ltts_token": token}).status_code == 200
    local = TestClient(app, client=("127.0.0.1", 50000))
    assert local.get("/api/health").status_code == 200
    first_visit = TestClient(app, client=("192.168.1.51", 50000))
    landing = first_visit.get(f"/api/health?token={token}")
    assert landing.status_code == 200 and "HttpOnly" in landing.headers["set-cookie"]
    assert first_visit.get("/api/health").status_code == 200  # the cookie now authenticates


def test_cli_refuses_public_bind_without_opt_in() -> None:
    # Binding every interface is exactly what this test expects the CLI to refuse.
    assert cli_main(["serve", "--host", "0.0.0.0"]) == 2  # noqa: S104
