from uuid import uuid4

import pytest

from conftest import run_job
from examples.six_role_requests import (aggregate, artifact_input, growth_lead_request,
                                       image, metrics, mock_research_request, request)


def measured(base, previous=False, zero=False):
    value = metrics(base, zero=zero)["result"]
    value.update(window_start="2026-09-25T00:00:00Z" if previous else "2026-10-01T00:00:00Z",
                 window_end="2026-10-01T00:00:00Z" if previous else "2026-10-07T00:00:00Z",
                 captured_at="2026-10-08T00:00:00Z", timezone="UTC",
                 metric_definitions={key: {"definition": f"Measured {key}", "unit": "percent" if key == "ctr" else "count",
                                          "source": "gsc" if key in {"clicks", "impressions", "ctr"} else "first_party",
                                          "scope": f"workspace:{base['workspace_id']}:website"}
                                     for key in ("qualified_visits", "leads", "clicks", "impressions", "ctr")})
    return aggregate(base, value)


def report(client, base, current, baseline):
    output = run_job(client, request(base, "analytics.report", {"metrics": current, "baseline_metrics": baseline}))
    assert output["status"] == "completed", output
    return output["result"]["result"]


def test_compares_measured_snapshots_and_separates_target(client):
    base = mock_research_request()
    previous, current = measured(base, True), measured(base)
    previous["result"]["clicks"] = 1000
    previous["result"]["impressions"] = 20000
    current["result"]["clicks"] = 1200
    current["result"]["impressions"] = 24000
    # A search KPI must not require unrelated first-party lead/visit data.
    current["result"]["qualified_visits"] = None
    current["result"]["leads"] = None
    definition = current["result"]["metric_definitions"]["clicks"]
    base["payload"]["goal_context"] = {"kpis": [{"metric_name": "clicks", "target_value": 1500,
        "baseline_value": 999999, "baseline_status": "unverified", "measurement": definition}]}
    result = report(client, base, aggregate(base, current["result"]), aggregate(base, previous["result"]))
    clicks = next(c for c in result["kpi_comparisons"] if c["metric_name"] == "clicks")
    assert clicks["baseline_value"] == 1000  # Never use the unverified owner-entered baseline.
    assert clicks["current_value"] == 1200
    assert clicks["target_value"] == 1500
    assert clicks["absolute_change"] == 200
    assert clicks["relative_change_pct"] == 20
    assert result["status"] == "draft"
    assert result["spend_mutation_allowed"] is False
    assert result["attribution"] == "aggregate_observation_only_not_causal"
    assert len(result["input_artifact_refs"]) == 2

    base["payload"]["goal_context"]["kpis"] = [{"metric_name": "ctr", "target_value": 6,
        "measurement": current["result"]["metric_definitions"]["ctr"]}]
    ctr_result = report(client, base, aggregate(base, current["result"]), aggregate(base, previous["result"]))
    ctr = next(c for c in ctr_result["kpi_comparisons"] if c["metric_name"] == "ctr")
    assert ctr["baseline_value"] == 5 and ctr["current_value"] == 5
    assert ctr["absolute_change"] == 0 and ctr["relative_change_pct"] == 0


@pytest.mark.parametrize("change,expected", [
    ("scope", "measurement_mismatch"), ("unit", "measurement_mismatch"),
    ("source", "measurement_mismatch"), ("definition", "measurement_mismatch"),
    ("overlap", "window_mismatch"), ("duration", "window_mismatch"),
    ("unverified", "measurement_unverified"), ("missing", "baseline_metric_missing"),
])
def test_incomparable_baselines_never_produce_lift(client, change, expected):
    base = mock_research_request()
    previous, current = measured(base, True), measured(base)
    data = previous["result"]
    if change in {"scope", "unit", "source", "definition"}:
        data["metric_definitions"]["clicks"][change] = "ga4" if change == "source" else "different"
    elif change == "overlap":
        data.update(window_start="2026-09-26T00:00:00Z", window_end="2026-10-02T00:00:00Z")
    elif change == "duration":
        data["window_start"] = "2026-09-24T00:00:00Z"
    elif change == "unverified":
        data.pop("captured_at")
    else:
        data["clicks"] = None
    result = report(client, base, current, aggregate(base, data))
    comparison = next(c for c in result["kpi_comparisons"] if c["metric_name"] == "clicks")
    assert comparison["status"] == expected
    assert comparison["absolute_change"] is None
    assert comparison["relative_change_pct"] is None
    assert result["status"] == "insufficient_data"


def test_zero_baseline_is_measured_zero_and_has_no_relative_percentage(client):
    base = mock_research_request()
    result = report(client, base, measured(base), measured(base, True, zero=True))
    c = next(c for c in result["kpi_comparisons"] if c["metric_name"] == "clicks")
    assert c["baseline_value"] == 0 and c["absolute_change"] == 20
    assert c["status"] == "zero_baseline" and c["relative_change_pct"] is None


@pytest.mark.parametrize("change,code", [("hash", "ARTIFACT_HASH_MISMATCH"),
                                        ("tenant", "TENANT_SCOPE_VIOLATION"),
                                        ("context", "STALE_ARTIFACT_CONTEXT"),
                                        ("future", "FUTURE_METRICS"),
                                        ("future_capture", "INVALID_METRIC_TIMESTAMP")])
def test_baseline_artifact_security(client, change, code):
    base = mock_research_request()
    previous = measured(base, True)
    if change == "hash":
        previous["result"]["clicks"] += 1
    elif change == "tenant":
        previous["artifact"]["workspace_id"] = str(uuid4())
    elif change == "context":
        previous["artifact"]["context_snapshot_id"] = str(uuid4())
    elif change == "future":
        previous["result"]["window_end"] = "2099-01-01T00:00:00Z"
        previous = aggregate(base, previous["result"])
    else:
        previous["result"]["captured_at"] = "2099-01-01T00:00:00Z"
        previous = aggregate(base, previous["result"])
    response = client.post("/internal/v1/runs", json=request(base, "analytics.report", {
        "metrics": measured(base), "baseline_metrics": previous}))
    assert response.status_code == 422
    assert code in response.text


def test_all_six_agents_receive_and_keep_all_kpis(client):
    base = mock_research_request()
    kpis = [{"metric_name": "leads", "baseline_value": None, "target_value": 15},
            {"metric_name": "clicks", "baseline_value": 0, "target_value": 300, "baseline_status": "unverified"}]
    base["payload"]["goal_context"] = {"objective": "Grow qualified requests", "kpis": kpis}

    def run(job):
        output = run_job(client, job)
        assert output["status"] == "completed", output
        result = output["result"]
        assert [k["metric_name"] for k in result["result"]["kpis"]] == ["leads", "clicks"]
        return result

    research = run(base)
    run(growth_lead_request(base, research))
    seo = run(request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"}))
    run(request(base, "content.repurpose", {"source_article": artifact_input(seo), "cta": "Request the guide", "assets": [image(base)]}))
    run(request(base, "community.response", {"question": "Can you explain living areas?"}))
    result = run(request(base, "analytics.report", {"metrics": measured(base)}))
    assert result["result"]["status"] == "insufficient_data"  # Configured KPIs need measured baselines.
    assert all(c["relative_change_pct"] is None for c in result["result"]["kpi_comparisons"])
