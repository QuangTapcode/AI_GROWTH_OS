"""URL ingest fetch against a local server (no third-party site is contacted)."""

from __future__ import annotations

import asyncio
import threading
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterator

import httpx
import pytest

from conftest import run_job
from evals.fixtures import SOURCE_IDS, WS_A, job
from src.app.config import Settings
from src.app.runtime import OperationError
from src.rag.parsing import _robots_cache, check_robots_allowed, fetch_url


ROUTES = {
    "/page": (200, {"Content-Type": "text/html; charset=utf-8"}, b"<html><title>Guide</title><p>Coworking in Hai Chau.</p></html>"),
    "/in": (302, {"Location": "/page"}, b""),
    "/out": (302, {"Location": "https://evil.example.com/"}, b""),
    "/big": (200, {"Content-Type": "text/html"}, b"<p>" + b"x" * 5000 + b"</p>"),
    "/pdf": (200, {"Content-Type": "application/pdf"}, b"%PDF-1.4"),
    "/missing": (404, {"Content-Type": "text/html"}, b"no"),
    "/error": (500, {"Content-Type": "text/html"}, b"err"),
    "/robots.txt": (200, {"Content-Type": "text/plain"}, b"User-agent: *\nDisallow: /private\n"),
    "/private": (200, {"Content-Type": "text/html"}, b"<p>Members only.</p>"),
}
SEEN_USER_AGENTS: list[str] = []


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        SEEN_USER_AGENTS.append(self.headers.get("User-Agent", ""))
        status, headers, body = ROUTES.get(self.path, (404, {}, b""))
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture(scope="module")
def server() -> Iterator[str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def fetch(url: str) -> tuple[str, str]:
    settings = replace(Settings(), ingest_url_allowlist=("127.0.0.1",), max_source_bytes=1000)
    return asyncio.run(fetch_url(url, settings))


def fetch_error(url: str) -> OperationError:
    with pytest.raises(OperationError) as caught:
        fetch(url)
    return caught.value


def test_allowlisted_redirect_is_followed(server: str) -> None:
    final_url, html = fetch(f"{server}/in")
    assert final_url == f"{server}/page"
    assert "Hai Chau" in html


def test_redirect_leaving_allowlist_is_rejected(server: str) -> None:
    assert fetch_error(f"{server}/out").code == "URL_NOT_ALLOWED"


def test_size_and_content_type_limits(server: str) -> None:
    assert fetch_error(f"{server}/big").code == "SOURCE_TOO_LARGE"
    assert fetch_error(f"{server}/pdf").code == "UNSUPPORTED_CONTENT_TYPE"


def test_http_errors_are_classified(server: str) -> None:
    missing = fetch_error(f"{server}/missing")
    assert (missing.code, missing.retryable) == ("URL_FETCH_FAILED", False)
    failing = fetch_error(f"{server}/error")
    assert (failing.code, failing.retryable) == ("URL_FETCH_FAILED", True)


def test_ingest_fetches_url_when_html_not_supplied(make_client, server: str) -> None:
    client = make_client(ingest_url_allowlist=("127.0.0.1",))
    payload = {
        "source": {"source_id": SOURCE_IDS["SRC-COWORKING"], "version": 1, "workspace_id": WS_A, "kind": "url", "url": f"{server}/in"}
    }
    body = run_job(client, job("knowledge.ingest", payload, name="t-fetch-ingest"))
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert result["url"] == f"{server}/page"
    assert result["title"] == "Guide"
    assert result["chunks"][0]["url"] == f"{server}/page"


def test_robots_txt_disallow_is_respected(server: str) -> None:
    assert fetch_error(f"{server}/private").code == "ROBOTS_DISALLOWED"
    final_url, _ = fetch(f"{server}/page")
    assert final_url == f"{server}/page"
    # Publishers such as Wikimedia reject anonymous bots; the crawler names itself and a contact URL.
    assert SEEN_USER_AGENTS and all("AI-Growth-OS-ingest" in ua and "https://" in ua for ua in SEEN_USER_AGENTS)


@pytest.mark.parametrize("status,allowed", [(404, True), (403, True), (503, False)])
def test_robots_status_follows_rfc_9309(status: int, allowed: bool) -> None:
    _robots_cache.clear()
    transport = httpx.MockTransport(lambda request: httpx.Response(status, text="User-agent: *\nDisallow: /"))

    async def check() -> None:
        async with httpx.AsyncClient(transport=transport) as client:
            await check_robots_allowed(client, "https://robots.example/page", "test-agent")

    if allowed:
        asyncio.run(check())
    else:
        with pytest.raises(OperationError) as caught:
            asyncio.run(check())
        assert (caught.value.code, caught.value.retryable) == ("ROBOTS_UNAVAILABLE", True)
