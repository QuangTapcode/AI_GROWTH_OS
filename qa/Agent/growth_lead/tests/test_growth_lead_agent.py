from __future__ import annotations

import hashlib
import json
import sys
import time
from collections.abc import Callable, Iterator
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError


SERVICE_AI_ROOT = Path(__file__).resolve().parents[4] / "services" / "ai"
if str(SERVICE_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_AI_ROOT))

from examples.growth_lead_request import growth_lead_request, mock_research_request  # noqa: E402
from src.app.config import Settings  # noqa: E402
from src.app.main import create_app  # noqa: E402
from src.app.schemas import BusinessProfile, Usage  # noqa: E402
from src.agents.growth_lead.scoring import derive_factors  # noqa: E402
from src.agents.performance.schemas import MetricsData  # noqa: E402
from src.agents.research.schemas import ResearchFinding, TrendCoverage, TrendSignal  # noqa: E402


@pytest.fixture
def ai_client_factory(
    tmp_path: Path,
) -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def create(provider: Any = None, **overrides: Any) -> TestClient:
        settings = replace(
            Settings(),
            run_store_path=str(tmp_path / f"runs-{len(clients)}.sqlite3"),
            **overrides,
        )
        client = TestClient(create_app(settings, provider=provider))
        client.__enter__()
        clients.append(client)
        return client

    yield create
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def ai_client(ai_client_factory: Callable[..., TestClient]) -> TestClient:
    return ai_client_factory()


def run_job(client: TestClient, job: dict[str, Any]) -> dict[str, Any]:
    accepted = client.post("/internal/v1/runs", json=job)
    assert accepted.status_code in {200, 202}, accepted.text
    run_id = accepted.json()["run_id"]
    expires_at = time.monotonic() + 10
    while time.monotonic() < expires_at:
        result = client.get(f"/internal/v1/runs/{run_id}").json()
        if result["status"] in {"completed", "failed"}:
            return result
        time.sleep(0.01)
    pytest.fail(f"AI run {run_id} did not finish in time.")


def growth_request(client: TestClient) -> dict[str, Any]:
    research_request = mock_research_request()
    research_result = run_job(client, research_request)
    assert research_result["status"] == "completed", research_result
    request = growth_lead_request(research_request, research_result["result"])
    request["job_id"] = str(uuid4())
    return request


def refresh_research_hash(request: dict[str, Any]) -> None:
    research = request["payload"]["research"]
    evidence = [finding["evidence"] for finding in research["findings"]]
    canonical = json.dumps(
        {"result": research, "evidence": evidence},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    request["payload"]["research_artifact"]["content_hash"] = hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def assert_validation_error(client: TestClient, request: dict[str, Any], code: str) -> None:
    response = client.post("/internal/v1/runs", json=request)
    assert response.status_code == 422, response.text
    assert code in response.text


@pytest.mark.parametrize(
    ("factor", "expected_score"),
    [
        pytest.param(0, 0, id="BVA-score-factor-zero"),
        pytest.param(5, 1215, id="BVA-score-factor-five"),
        pytest.param(None, None, id="EP-score-factor-unknown"),
    ],
)
def test_operator_score_factor_boundaries(
    ai_client: TestClient, factor: float | None, expected_score: int | None
) -> None:
    # BVA/EP: zero and five are allowed endpoints; null means unknown, not zero.
    request = growth_request(ai_client)
    request["payload"]["score_factors"]["demand"] = factor
    result = run_job(ai_client, request)
    assert result["status"] == "completed", result
    score = result["result"]["result"]["opportunity_score"]["score"]
    assert score == expected_score
    if factor is None:
        assert result["result"]["result"]["opportunity_score"]["label"] == "insufficient_data"


@pytest.mark.parametrize(
    ("factor", "case_id"),
    [
        pytest.param(-0.01, "BVA-below-zero"),
        pytest.param(5.01, "BVA-above-five"),
    ],
    ids=["BVA-below-zero", "BVA-above-five"],
)
def test_invalid_operator_score_factor_is_rejected(
    ai_client: TestClient, factor: float, case_id: str
) -> None:
    # EP/Decision: non-finite or out-of-range estimates must not produce a plan.
    request = growth_request(ai_client)
    request["payload"]["score_factors"]["demand"] = factor
    assert_validation_error(ai_client, request, "INVALID_SCORE")


@pytest.mark.parametrize(
    ("finding_count", "expected_status", "expected_tasks"),
    [
        pytest.param(0, "blocked", 0, id="EP-no-findings"),
        pytest.param(1, "proposed", 2, id="EP-one-finding"),
        pytest.param(2, "proposed", 2, id="EP-two-findings"),
        pytest.param(3, "proposed", 2, id="BVA-at-three-finding-limit"),
    ],
)
def test_supported_research_finding_count_partitions(
    ai_client: TestClient,
    finding_count: int,
    expected_status: str,
    expected_tasks: int,
) -> None:
    # EP/BVA: Growth Lead accepts zero through three findings but only builds tasks
    # when it has a grounded finding; the fourth finding is rejected separately.
    request = growth_request(ai_client)
    first = request["payload"]["research"]["findings"][0]
    request["payload"]["research"]["findings"] = [
        {**deepcopy(first), "topic": f"Finding {index + 1}"}
        for index in range(finding_count)
    ]
    refresh_research_hash(request)

    result = run_job(ai_client, request)
    assert result["status"] == "completed", result
    plan = result["result"]["result"]
    assert plan["status"] == expected_status
    assert len(plan["tasks"]) == expected_tasks
    if finding_count == 0:
        assert "grounded_opportunities" in plan["missing_facts"]
    else:
        assert plan["selected_opportunity"]["topic"] == "Finding 1"


def test_fourth_research_finding_exceeds_supported_limit(ai_client: TestClient) -> None:
    # BVA: the first value above the three-finding maximum is rejected at validation.
    request = growth_request(ai_client)
    first = request["payload"]["research"]["findings"][0]
    request["payload"]["research"]["findings"] = [
        {**deepcopy(first), "topic": f"Finding {index + 1}"} for index in range(4)
    ]
    refresh_research_hash(request)
    assert_validation_error(ai_client, request, "INVALID_RESEARCH")


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        pytest.param("evidence_source", "UNGROUNDED_RESEARCH", id="DT-source-id-mismatch"),
        pytest.param("evidence_version", "UNGROUNDED_RESEARCH", id="DT-source-version-mismatch"),
        pytest.param("evidence_chunk", "UNGROUNDED_RESEARCH", id="DT-chunk-id-mismatch"),
        pytest.param("evidence_quote", "UNGROUNDED_RESEARCH", id="DT-quote-not-in-source"),
        pytest.param("workspace", "TENANT_SCOPE_VIOLATION", id="DT-foreign-workspace"),
        pytest.param("snapshot", "SNAPSHOT_MISMATCH", id="DT-foreign-snapshot"),
        pytest.param("profile_version", "RESEARCH_VERSION_MISMATCH", id="DT-stale-profile"),
        pytest.param("artifact_role", "RESEARCH_VERSION_MISMATCH", id="DT-wrong-artifact-role"),
        pytest.param("approval", "APPROVAL_REQUIRED", id="DT-human-approval-disabled"),
        pytest.param("revoked_source", "UNGROUNDED_RESEARCH", id="ST-revoked-evidence-source"),
    ],
)
def test_context_and_evidence_decision_table(
    ai_client: TestClient, mutation: str, expected_code: str
) -> None:
    # Decision Table: tenant, snapshot, version, approval, and quoted evidence must
    # all match the pinned approved research context before the agent can run.
    request = growth_request(ai_client)
    payload = request["payload"]
    if mutation.startswith("evidence_"):
        evidence = payload["research"]["findings"][0]["evidence"]
        if mutation == "evidence_source":
            evidence["source_id"] = str(uuid4())
        elif mutation == "evidence_version":
            evidence["source_version"] = 2
        elif mutation == "evidence_chunk":
            evidence["chunk_id"] = "missing-chunk"
        else:
            evidence["quote"] = "This exact quotation is not in the approved source."
        refresh_research_hash(request)
    elif mutation == "workspace":
        payload["workspace_id"] = str(uuid4())
    elif mutation == "snapshot":
        payload["research"]["context_snapshot_id"] = str(uuid4())
        refresh_research_hash(request)
    elif mutation == "profile_version":
        payload["business_profile"]["version"] = 2
    elif mutation == "artifact_role":
        payload["research_artifact"]["role"] = "seo"
    elif mutation == "approval":
        request["constraints"] = {"human_approval_required": False}
    else:
        payload["snapshot"]["sources"][0]["status"] = "revoked"

    assert_validation_error(ai_client, request, expected_code)


@pytest.mark.parametrize(
    ("change", "expected_missing"),
    [
        pytest.param("audience", "target_audience", id="EP-no-target-audience"),
        pytest.param("offer", "confirmed_offer", id="EP-no-confirmed-offer"),
        pytest.param("cta", "confirmed_cta", id="EP-no-confirmed-cta"),
        pytest.param("deadline", "campaign_deadline", id="EP-no-campaign-deadline"),
    ],
)
def test_missing_business_requirements_block_campaign_plan(
    ai_client: TestClient, change: str, expected_missing: str
) -> None:
    # EP/Decision: required campaign inputs are not fabricated; their absence blocks
    # the proposed plan while preserving the explicit missing-fact reason.
    request = growth_request(ai_client)
    profile = request["payload"]["business_profile"]
    if change == "audience":
        profile["audiences"] = []
    elif change == "offer":
        profile["services"] = []
        profile["products"] = []
    elif change == "cta":
        request["payload"]["cta"] = None
    else:
        request["payload"]["deadline"] = None

    result = run_job(ai_client, request)
    assert result["status"] == "completed", result
    plan = result["result"]["result"]
    assert plan["status"] == "blocked"
    assert expected_missing in plan["missing_facts"]


@pytest.mark.parametrize(
    ("missing_data", "expected_block"),
    [
        pytest.param("official_source_required", True, id="DT-official-source-required"),
        pytest.param(
            "current_event_details_require_review",
            True,
            id="DT-current-event-review-required",
        ),
        pytest.param(
            "confirmed_service_capability_required",
            True,
            id="DT-service-capability-unconfirmed",
        ),
        pytest.param("unrecognized_advisory", False, id="EP-nonblocking-unknown-note"),
    ],
)
def test_selected_finding_missing_data_rules(
    ai_client: TestClient, missing_data: str, expected_block: bool
) -> None:
    # Decision Table: only the three selected-opportunity flags documented as
    # blocking prevent draft tasks; other advisory notes remain visible but nonblocking.
    request = growth_request(ai_client)
    request["payload"]["research"]["findings"][0]["missing_data"] = [missing_data]
    refresh_research_hash(request)
    result = run_job(ai_client, request)
    assert result["status"] == "completed", result
    plan = result["result"]["result"]
    if expected_block:
        assert plan["status"] == "blocked"
        assert missing_data in plan["missing_facts"]
    else:
        assert plan["status"] == "proposed"


@pytest.mark.parametrize(
    ("score_factors", "expected_source", "expected_score"),
    [
        pytest.param({}, "derived_from_research_signals_not_search_volume", True, id="EP-derived-score"),
        pytest.param(
            {"demand": None},
            "operator_estimate_not_search_volume",
            False,
            id="EP-partial-operator-score",
        ),
        pytest.param(
            {"demand": 3},
            "operator_estimate_not_search_volume",
            False,
            id="EP-partial-score-stays-unknown",
        ),
    ],
)
def test_score_estimation_source_and_unknown_factors(
    ai_client: TestClient,
    score_factors: dict[str, float | None],
    expected_source: str,
    expected_score: bool,
) -> None:
    # EP/Decision: no operator factors selects transparent derived scoring; a
    # partial operator estimate must not silently fill unknown values with zero.
    request = growth_request(ai_client)
    request["payload"]["score_factors"] = score_factors
    result = run_job(ai_client, request)
    assert result["status"] == "completed", result
    score = result["result"]["result"]["opportunity_score"]
    assert score["source"] == expected_source
    assert (score["score"] is not None) is expected_score
    assert set(score["factors"]) == {
        "demand",
        "business_relevance",
        "growth_potential",
        "content_gap",
        "freshness",
        "conversion_potential",
    }


@pytest.mark.parametrize(
    ("finding_index", "expected_status", "expected_error"),
    [
        pytest.param(0, "completed", None, id="BVA-first-finding-index"),
        pytest.param(1, "completed", None, id="EP-last-valid-finding-index"),
        pytest.param(2, "failed", "INVALID_OPPORTUNITY", id="BVA-first-invalid-index"),
    ],
)
def test_model_selection_index_boundary(
    ai_client_factory: Callable[..., TestClient],
    finding_index: int,
    expected_status: str,
    expected_error: str | None,
) -> None:
    # BVA/Decision: the model may select only an existing, zero-based finding index.
    research_client = ai_client_factory()
    request = growth_request(research_client)
    first = request["payload"]["research"]["findings"][0]
    request["payload"]["research"]["findings"] = [
        {**deepcopy(first), "topic": f"Finding {index + 1}"} for index in range(2)
    ]
    refresh_research_hash(request)
    plan_client = ai_client_factory(provider=FixedSelectionProvider(finding_index))

    result = run_job(plan_client, request)
    assert result["status"] == expected_status, result
    if expected_error:
        assert result["error_code"] == expected_error
    else:
        assert result["result"]["result"]["selected_opportunity"]["topic"] == (
            f"Finding {finding_index + 1}"
        )


class FixedSelectionProvider:
    """Return one deterministic model selection without contacting an external provider."""

    model_version = "test/growth-lead-selection"
    embedding_model_version = "test/embedding"

    def __init__(self, finding_index: int) -> None:
        self.finding_index = finding_index

    async def chat_json(self, **_kwargs: Any) -> tuple[str, Usage]:
        return json.dumps({"finding_index": self.finding_index}), Usage(llm_calls=1)

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        return [[0.0] for _ in texts], Usage(embedding_calls=1)


@pytest.mark.parametrize(
    ("current_visits", "current_leads", "target", "expected_status", "expected_mode"),
    [
        pytest.param(0, 0, 1, "behind", "reach", id="BVA-zero-traffic-reach"),
        pytest.param(10, 0, 1, "behind", "conversion", id="EP-traffic-conversion"),
        pytest.param(10, 1, 1, "reached", "maintain", id="BVA-target-exactly-reached"),
        pytest.param(10, 2, 1, "reached", "maintain", id="EP-target-exceeded"),
        pytest.param(None, None, 1, "not_measured", "reach", id="EP-metric-not-measured"),
    ],
)
def test_measured_kpi_state_transitions(
    ai_client: TestClient,
    current_visits: int | None,
    current_leads: int | None,
    target: int,
    expected_status: str,
    expected_mode: str,
) -> None:
    # State Transition/BVA: only measured values decide behind/reached/not_measured
    # and reach/conversion/maintain; an exact target counts as reached.
    from examples.six_role_requests import aggregate

    request = growth_request(ai_client)
    request["payload"]["goal_context"]["kpis"] = [
        {
            "metric_name": "leads",
            "baseline_value": None,
            "target_value": target,
            "measurement": {
                "definition": "Qualified lead count",
                "unit": "count",
                "source": "first_party",
                "scope": "workspace",
            },
        }
    ]
    metrics = {
        "workspace_id": request["workspace_id"],
        "snapshot_id": str(uuid4()),
        "version": 1,
        "window_start": "2026-10-01T00:00:00Z",
        "window_end": "2026-10-07T00:00:00Z",
        "qualified_visits": current_visits,
        "leads": current_leads,
        "impressions": 0,
        "clicks": 0,
        "synthetic": True,
    }
    request["payload"]["latest_metrics"] = aggregate(
        request, metrics, role="performance"
    )

    result = run_job(ai_client, request)
    assert result["status"] == "completed", result
    plan = result["result"]["result"]
    assert plan["kpi_progress"][0]["status"] == expected_status
    assert plan["priority"]["mode"] == expected_mode


@pytest.mark.parametrize(
    ("signal_count", "best_rank", "previous_rank", "is_new", "crowded_domains"),
    [
        pytest.param(0, None, None, False, None, id="BVA-no-search-signal"),
        pytest.param(1, 4, None, False, 0, id="BVA-rank-outside-top-three"),
        pytest.param(3, 3, 5, False, 3, id="BVA-rank-at-three-and-rising"),
        pytest.param(3, 1, 1, False, 12, id="EP-rank-one-with-crowded-market"),
        pytest.param(2, 2, 1, False, 6, id="EP-falling-search-rank"),
        pytest.param(2, 2, None, True, 9, id="EP-new-search-signal"),
    ],
)
def test_signal_scoring_equivalence_and_boundaries(
    ai_client: TestClient,
    signal_count: int,
    best_rank: int | None,
    previous_rank: int | None,
    is_new: bool,
    crowded_domains: int | None,
) -> None:
    # EP/BVA: verify derived score factors against signal count, ranking movement,
    # competing-domain count and confirmed offer match at their branch boundaries.
    request = growth_request(ai_client)
    raw_finding = request["payload"]["research"]["findings"][0]
    raw_finding["topic"] = "Coworking for remote workers"
    raw_finding["keywords"] = ["coworking"]
    raw_finding["offer_fit"] = "TripC lists coworking options."
    finding = ResearchFinding.model_validate(raw_finding)
    profile = BusinessProfile.model_validate(
        {
            **request["payload"]["business_profile"],
            "products": ["coworking"],
        }
    )
    now = finding.fetched_at.isoformat()
    signals = [
        {
            "signal_id": str(uuid4()),
            "query": "Da Nang coworking expats",
            "rank": best_rank if index == 0 and best_rank is not None else 10,
            "title": f"Coworking signal {index}",
            "url": f"https://results.example/{index}",
            "domain": f"domain-{index}.example",
            "observed_at": now,
            "previous_rank": previous_rank if index == 0 else None,
            "is_new": is_new if index == 0 else False,
        }
        for index in range(signal_count)
    ]
    finding = finding.model_copy(
        update={
            "trend_signals": [TrendSignal.model_validate(signal) for signal in signals]
        }
    )
    coverage = (
        [
            TrendCoverage(
                query="Da Nang coworking expats",
                topic="coworking",
                signal_count=signal_count,
                covered_chunks=1,
                distinct_domains=crowded_domains,
            )
        ]
        if crowded_domains is not None
        else []
    )

    factors, basis = derive_factors(finding, coverage, profile, "Explore coworking")
    assert factors["demand"] == (
        1
        if signal_count == 0
        else min(4, 2 + (signal_count >= 3) + (best_rank is not None and best_rank <= 3))
    )
    if signal_count == 0:
        assert factors["growth_potential"] == 2
    elif is_new or (previous_rank is not None and previous_rank > (best_rank or 50)):
        assert factors["growth_potential"] == 4
    elif previous_rank is not None and previous_rank < (best_rank or 50):
        assert factors["growth_potential"] == 2
    else:
        assert factors["growth_potential"] == 3
    expected_gap = (
        3
        if crowded_domains is None
        else max(1, 5 - min(4, crowded_domains // 3))
    )
    assert factors["content_gap"] == expected_gap
    assert factors["business_relevance"] in {3, 4}
    assert factors["conversion_potential"] == 3
    assert set(basis) == set(factors)
    if signal_count:
        assert "not search volume" in basis["demand"]
    else:
        assert basis["demand"] == "no matching search titles"


@pytest.mark.parametrize(
    ("field", "mutation"),
    [
        pytest.param("goal", "wrong_workspace", id="DT-foreign-goal"),
        pytest.param("metrics", "wrong_workspace", id="DT-foreign-metrics"),
        pytest.param("metrics", "wrong_snapshot", id="ST-stale-metrics-snapshot"),
    ],
)
def test_goal_and_measurement_artifact_scope(
    ai_client: TestClient, field: str, mutation: str
) -> None:
    # Decision Table: growth goals and KPI measurements must belong to this
    # workspace and the same pinned context before influencing plan priority.
    request = growth_request(ai_client)
    if field == "goal":
        request["payload"]["goal_context"]["workspace_id"] = str(uuid4())
    else:
        from examples.six_role_requests import aggregate

        measured = {
            "workspace_id": (
                str(uuid4()) if mutation == "wrong_workspace" else request["workspace_id"]
            ),
            "snapshot_id": str(uuid4()),
            "version": 1,
            "window_start": "2026-10-01T00:00:00Z",
            "window_end": "2026-10-07T00:00:00Z",
            "qualified_visits": 1,
            "leads": 0,
            "impressions": 0,
            "clicks": 0,
        }
        request["payload"]["latest_metrics"] = aggregate(
            request, measured, role="performance"
        )
        if mutation == "wrong_snapshot":
            request["payload"]["latest_metrics"]["artifact"][
                "context_snapshot_id"
            ] = str(uuid4())

    response = ai_client.post("/internal/v1/runs", json=request)
    assert response.status_code == 422, response.text


def test_metrics_window_must_be_ordered_and_timezone_aware() -> None:
    # BVA/Exception: metric measurements at or before their start are invalid;
    # naive timestamps cannot be used to transition KPI status.
    base = {
        "workspace_id": str(uuid4()),
        "snapshot_id": str(uuid4()),
        "version": 1,
        "window_start": "2026-10-07T00:00:00Z",
        "window_end": "2026-10-07T00:00:00Z",
    }
    with pytest.raises(ValidationError):
        MetricsData.model_validate(base)
    base["window_end"] = "2026-10-08T00:00:00"
    with pytest.raises(ValidationError):
        MetricsData.model_validate(base)
