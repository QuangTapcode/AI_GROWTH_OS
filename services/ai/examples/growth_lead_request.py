"""Synthetic QQ-04 input, shared by smoke and regression tests."""
from copy import deepcopy
from uuid import UUID


def fixture_id(value: int) -> str:
    return str(UUID(int=value, version=4))


def mock_research_request() -> dict:
    ws, source, snapshot = (fixture_id(i) for i in (1, 2, 3))
    return {
        "job_id": fixture_id(4), "workspace_id": ws, "operation": "research.run",
        "input_version": 1, "context_snapshot_id": snapshot, "trace_id": "qq04-mock-research",
        "synthetic": True, "approved_source_versions": [{"source_id": source, "version": 1}],
        "payload": {"workspace_id": ws,
            "business_profile": {"company": "TripC MOCK", "workspace_id": ws, "version": 1,
                "audiences": ["English-speaking newcomers"], "services": ["Local living information MOCK"],
                "topic_priority": ["Living areas guide"]},
            "goal_context": {"workspace_id": ws, "objective": "Prepare a newcomer guide and social drafts"},
            "snapshot": {"workspace_id": ws, "snapshot_id": snapshot, "sources": [{
                "source_id": source, "workspace_id": ws, "version": 1, "status": "approved",
                "provenance": {"license": "Synthetic fixture only", "attribution": "QQ-04 mock",
                    "source_url": "https://example.org/qq04-mock", "retrieved_at": "2026-01-01T00:00:00Z"},
                "chunks": [{"chunk_id": "mock-guide", "text": "The guide compares living areas for newcomers.",
                            "locator": "mock:paragraph:1"}]}]}}}


def growth_lead_request(research_request: dict, research_result: dict) -> dict:
    request = deepcopy(research_request)
    request.update(job_id=fixture_id(5), operation="strategy.generate", prompt_version="growth-lead-v1",
                   trace_id="qq04-mock-plan")
    request["payload"].pop("content_inventory", None)
    request["payload"].update(research=research_result["result"], research_artifact=research_result["artifact"],
                              cta="Request the newcomer guide (MOCK)")
    return request
