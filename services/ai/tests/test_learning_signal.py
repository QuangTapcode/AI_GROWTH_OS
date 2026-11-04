"""Learning opens a new Research round only from something measured: on real runs zero traffic still
opened three rounds in a row, each producing a near-copy of the same article."""
from conftest import run_job
from examples.six_role_requests import artifact_input, leads, metrics, mock_research_request, request


def learn(client, zero, lead_count):
    base = mock_research_request()
    performance = run_job(client, request(base, "analytics.report", {"metrics": metrics(base, zero=zero)}))["result"]
    body = run_job(client, request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base, count=lead_count)}))
    assert body["status"] == "completed", body
    return body["result"]["result"]


def test_no_traffic_and_no_leads_gives_nothing_to_learn_from(client):
    result = learn(client, zero=True, lead_count=0)
    assert result["next_tasks"] == [] and result["stopped_reason"] == "no_measured_signal"
    assert result["status"] == "draft" and result["missing_facts"] == []
    assert "nothing" in result["learning"][0].lower()


def test_measured_traffic_opens_the_next_round(client):
    result = learn(client, zero=False, lead_count=0)
    assert len(result["next_tasks"]) == 1 and result["stopped_reason"] is None


def test_a_measured_lead_opens_the_next_round(client):
    result = learn(client, zero=True, lead_count=1)
    assert len(result["next_tasks"]) == 1 and result["stopped_reason"] is None
