from __future__ import annotations

from typing import Any

import pytest


@pytest.mark.parametrize(
    ("scenario", "expected_status", "expected_code", "expected_records"),
    [
        # EP: fully grounded plan is the valid equivalence class and may be submitted.
        pytest.param("valid", 201, None, 1, id="EP-valid-grounded-plan"),
        # EP: a missing opportunity is a blocked-plan equivalence class.
        pytest.param(
            "no_selected_opportunity",
            422,
            "PLAN_BLOCKED",
            0,
            id="EP-no-selected-opportunity",
        ),
        # Decision table: an unresolved required fact makes the otherwise valid plan ineligible.
        pytest.param(
            "blocked_missing_fact",
            422,
            "PLAN_BLOCKED",
            0,
            id="DT-blocked-by-unresolved-fact",
        ),
        # Decision table: source approval is a required acceptance condition.
        pytest.param(
            "source_not_approved",
            422,
            "SOURCE_NOT_APPROVED",
            0,
            id="DT-source-not-approved",
        ),
        # State transition: a plan built against an old snapshot must not be accepted.
        pytest.param(
            "stale_context",
            422,
            "STALE_CONTEXT",
            0,
            id="ST-stale-context-rejected",
        ),
        # BVA/state: a deadline before the current time falls outside the valid interval.
        pytest.param(
            "expired_deadline",
            422,
            "INVALID_DEADLINE",
            0,
            id="BVA-expired-task-deadline",
        ),
        # Decision table: score metadata must agree with the product of its factors.
        pytest.param(
            "invalid_score",
            422,
            "INVALID_SCORE",
            0,
            id="DT-opportunity-score-mismatch",
        ),
        # EP: an unsupported tool is outside the plan schema's permitted input class.
        pytest.param(
            "invalid_tool",
            422,
            "INVALID_PLAN",
            0,
            id="EP-unsupported-task-tool",
        ),
        # Decision table: the social task must depend on the SEO task, never itself.
        pytest.param(
            "invalid_dependency",
            422,
            "INVALID_DEPENDENCIES",
            0,
            id="DT-invalid-task-dependency",
        ),
        # State transition: transient commit failure must leave retry able to recover.
        pytest.param(
            "commit_failure",
            500,
            "PLAN_COMMIT_FAILED",
            1,
            id="ST-commit-error-retry-recovers",
        ),
    ],
)
def test_growth_lead_decision_scenarios_with_combined_techniques(
    growth_lead_harness: Any,
    scenario: str,
    expected_status: int,
    expected_code: str | None,
    expected_records: int,
) -> None:
    """Combine EP, BVA, decision conditions, and error/retry transitions per scenario."""
    # BVA: on every scenario, verify values at and beyond actual schema maxima.
    boundaries = growth_lead_harness.run({"action": "boundaries"})
    assert boundaries == {
        "rankedThreeAccepted": True,
        "rankedFourAccepted": False,
        "acceptanceTenAccepted": True,
        "acceptanceElevenAccepted": False,
    }

    # EP + Decision Table: classify each grounded-plan condition through the real API route.
    outcome = growth_lead_harness.run(
        {"action": "scenario", "scenario": scenario}
    )
    assert outcome["status"] == expected_status
    assert outcome["code"] == expected_code
    assert outcome["recordCount"] == expected_records

    # State Transition: accepted plans deduplicate on retry; commit failures can recover.
    if scenario == "valid":
        assert outcome["retryStatus"] == 200
        assert outcome["retryDeduplicated"] is True
        assert outcome["recordCount"] == 1
    elif scenario == "commit_failure":
        assert outcome["retryStatus"] == 201
        assert outcome["recordCount"] == 1
    else:
        assert outcome["retryStatus"] is None
