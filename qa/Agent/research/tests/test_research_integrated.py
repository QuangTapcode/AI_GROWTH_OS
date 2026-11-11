from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
from threading import Thread
from typing import Any
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest


CASES_PATH = Path(__file__).resolve().parents[1] / "search_accuracy_cases.json"
with CASES_PATH.open(encoding="utf-8") as cases_file:
    ACCURACY_CASES = json.load(cases_file)

LIVE_SEARCH_ENABLED = os.getenv("RESEARCH_LIVE_SEARCH", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
LIVE_SEARCH_URL = os.getenv("SEARXNG_URL", "http://127.0.0.1:18081")
LIVE_TOP_K = 5


class SearchStubHandler(BaseHTTPRequestHandler):
    results: list[dict[str, Any]] = []

    def do_GET(self) -> None:
        body = json.dumps({"results": self.results}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


@pytest.fixture
def search_stub() -> Any:
    server = ThreadingHTTPServer(("127.0.0.1", 0), SearchStubHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server.server_address[1]
    server.shutdown()
    thread.join(timeout=5)
    server.server_close()


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def normalize_url(value: str) -> tuple[str, str] | None:
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            return None
        path = unquote(parsed.path).rstrip("/").casefold()
        return parsed.hostname.casefold(), path
    except ValueError:
        return None


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._hidden_depth = 0

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._hidden_depth:
            self.parts.append(data)


def fetch_page_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "AI-GROWTH-OS-Research-QA/1.0"})
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise AssertionError(f"Reference page returned HTTP {response.status}: {url}")
        parser = VisibleTextParser()
        parser.feed(response.read().decode("utf-8", errors="replace"))
    return " ".join(parser.parts)


def signal_timestamp(age_hours: int | None, now: datetime) -> str | None:
    if age_hours is None:
        return None
    return (now - timedelta(hours=age_hours)).isoformat()


@pytest.mark.parametrize("case", ACCURACY_CASES, ids=lambda case: case["id"])
def test_search_accuracy_with_all_four_test_design_techniques(
    research_harness: Any, search_stub: int, case: dict[str, Any]
) -> None:
    """Each scenario combines EP, BVA, decision-table, and state-transition checks."""
    profile = case["profile"]

    # EP: classify the observed search result into its expected quality class.
    queries = research_harness.run(
        {"action": "queries", "profile": profile, "focus": case.get("focus", [])}
    )
    expected_query_count = min(len(profile["products"]), 3)
    assert len(queries) == expected_query_count, case["id"]
    expected_query_terms = profile["products"][:3]
    if any("expat" in audience.casefold() for audience in profile["audiences"]):
        assert all(query.endswith(" expats") for query in queries), case["id"]
    assert all(
        any(term.replace("_", " ").strip() in query for term in expected_query_terms)
        for query in queries
    ), case["id"]

    # BVA: exercise the configured query and result limits in the same scenario.
    assert len(queries) <= 3, case["id"]
    boundary_profile = {
        "locations": profile["locations"],
        "audiences": [],
        "products": [
            f"boundary-offer-{index}"
            for index in range(case["boundary_offer_count"])
        ],
    }
    boundary_queries = research_harness.run(
        {"action": "queries", "profile": boundary_profile}
    )
    assert len(boundary_queries) == min(case["boundary_offer_count"], 3), case["id"]
    raw_results = [
        {
            "url": (
                case["expected_url"]
                if index + 1 == case.get("expected_rank")
                else f"https://unrelated-{index}.example.invalid/article"
            ),
            "title": (
                case.get("result_title", case["expected_title"])
                if index + 1 == case.get("expected_rank")
                else f"Unrelated result {index}"
            ),
            "engine": "pytest-fixture",
        }
        for index in range(case["raw_result_count"])
    ]
    SearchStubHandler.results = raw_results
    results = research_harness.run(
        {
            "action": "search",
            "baseUrl": f"http://127.0.0.1:{search_stub}",
            "query": case["query"],
        }
    )
    expected_result_count = case.get(
        "expected_result_count", min(case["raw_result_count"], 10)
    )
    assert len(results) == expected_result_count, case["id"]

    # Decision table: accept only a relevant, top-five, allowed, fact-backed result.
    expected_url = normalize_url(case["expected_url"])
    matching_results = [
        (rank, result)
        for rank, result in enumerate(results, start=1)
        if normalize_url(result["url"]) == expected_url
    ]
    title_matches = bool(matching_results) and all(
        normalize_text(term) in normalize_text(matching_results[0][1]["title"])
        for term in case["expected_title_terms"]
    )
    policy = research_harness.run(
        {"action": "policy", "url": case["expected_url"]}
    )
    source_allowed = policy is not None
    excerpt = normalize_text(case["source_excerpt"])
    facts_supported = all(
        normalize_text(fact) in excerpt for fact in case["required_facts"]
    )
    rank_is_relevant = bool(matching_results) and matching_results[0][0] <= LIVE_TOP_K
    accepted = title_matches and source_allowed and facts_supported and rank_is_relevant
    assert accepted is case["expected_accepted"], case["id"]
    if not matching_results:
        observed_partition = "no-expected-result"
    elif not title_matches:
        observed_partition = "title-does-not-match"
    elif not source_allowed:
        observed_partition = "source-not-allowlisted"
    elif not facts_supported:
        observed_partition = "fact-not-supported"
    elif not rank_is_relevant:
        observed_partition = "relevant-but-outside-top-five"
    else:
        observed_partition = "relevant-and-supported"
    assert observed_partition == case["expected_partition"], case["id"]

    # State transition: the same search scenario is checked against signal freshness.
    fixed_now = datetime(2026, 11, 8, 8, 0, tzinfo=timezone.utc)
    latest_at = signal_timestamp(case["signal_age_hours"], fixed_now)
    refresh = research_harness.run(
        {
            "action": "refresh",
            "profile": profile,
            "latestAt": latest_at,
            "maxAgeHours": 24,
            "now": fixed_now.isoformat(),
        }
    )
    should_refresh = case["signal_age_hours"] is None or case["signal_age_hours"] >= 24
    if should_refresh:
        assert refresh["result"] is not None, case["id"]
        assert refresh["searchedQueries"] == refresh["result"]["queries"], case["id"]
    else:
        assert refresh["result"] is None, case["id"]
        assert refresh["searchedQueries"] == [], case["id"]

    if case.get("live_check") and LIVE_SEARCH_ENABLED:
        live_results = research_harness.run(
            {
                "action": "search",
                "baseUrl": LIVE_SEARCH_URL,
                "query": case["query"],
            }
        )
        live_matches = [
            rank
            for rank, result in enumerate(live_results, start=1)
            if normalize_url(result["url"]) == expected_url
            and all(
                normalize_text(term) in normalize_text(result["title"])
                for term in case["expected_title_terms"]
            )
        ]
        assert live_matches, (
            f"{case['id']}: expected source missing from live results: {live_results}"
        )
        assert live_matches[0] <= LIVE_TOP_K, (
            f"{case['id']}: expected source ranked {live_matches[0]}, "
            f"outside top {LIVE_TOP_K}"
        )
        page_text = normalize_text(fetch_page_text(case["expected_url"]))
        for fact in case["required_facts"]:
            assert normalize_text(fact) in page_text, (
                f"{case['id']}: source no longer supports {fact!r}; "
                "review the ground truth."
            )

    assert case["source_revision"], case["id"]
