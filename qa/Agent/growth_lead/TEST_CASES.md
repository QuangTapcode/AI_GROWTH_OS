# Growth Lead — detailed testcase catalog

“All possible” cannot mean every value combination: user text, findings, metrics,
and provider responses have unbounded combinations. This catalog covers the
implemented Growth Lead branches, schema limits, decisions, state changes, and
error paths found in the AI agent and API backend.

The pytest suite combines EP, BVA, decision-table conditions, and
state-transition/error checks in the same scenarios where they apply. These
are deterministic tests using the repository-owned synthetic QQ-04 fixture;
they do not call a live LLM, PostgreSQL, or task queue.

## A. Growth Lead AI: plan generation and scoring (49 cases)

Implemented in
[`test_growth_lead_agent.py`](tests/test_growth_lead_agent.py).

| ID | Input / condition | Expected result |
|---|---|---|
| BVA-score-factor-zero | Operator demand score `0` | Valid endpoint; product score is `0` |
| BVA-score-factor-five | Operator demand score `5` | Valid endpoint; product score is `1215` |
| EP-score-factor-unknown | Operator demand score `null` | Accepted as unknown; overall score is null, not zero |
| BVA-below-zero | Score `-0.01` | Reject as `INVALID_SCORE` |
| BVA-above-five | Score `5.01` | Reject as `INVALID_SCORE` |
| EP-no-findings | Ready brief has no findings | Completed blocked plan; no tasks; `grounded_opportunities` reported |
| EP-one-finding | One grounded finding | Proposed plan with SEO and content tasks |
| EP-two-findings | Two grounded findings | Existing finding selected; two draft tasks |
| BVA-at-three-finding-limit | Exactly three findings | Accepted; bounded plan with two tasks |
| BVA-fourth-finding | Four findings | Reject as `INVALID_RESEARCH` |
| DT-source-id-mismatch | Evidence source ID is not in approved snapshot | Reject as `UNGROUNDED_RESEARCH` |
| DT-source-version-mismatch | Evidence source version differs from approved version | Reject as `UNGROUNDED_RESEARCH` |
| DT-chunk-id-mismatch | Evidence references a missing chunk | Reject as `UNGROUNDED_RESEARCH` |
| DT-quote-not-in-source | Evidence quote is absent from source text | Reject as `UNGROUNDED_RESEARCH` |
| DT-foreign-workspace | Payload workspace differs from job workspace | Reject as `TENANT_SCOPE_VIOLATION` |
| DT-foreign-snapshot | Research snapshot differs from the job-pinned snapshot | Reject as `SNAPSHOT_MISMATCH` |
| DT-stale-profile | Research profile version differs from current profile | Reject as `RESEARCH_VERSION_MISMATCH` |
| DT-wrong-artifact-role | Research artifact has a non-research role | Reject as `RESEARCH_VERSION_MISMATCH` |
| DT-human-approval-disabled | Request disables required human approval | Reject as `APPROVAL_REQUIRED` |
| ST-revoked-evidence-source | Evidence source has been revoked | Reject as `UNGROUNDED_RESEARCH` |
| EP-no-target-audience | Business profile has no audience | Completed blocked plan; `target_audience` reported |
| EP-no-confirmed-offer | No products and no services | Completed blocked plan; `confirmed_offer` reported |
| EP-no-confirmed-CTA | CTA is absent | Completed blocked plan; `confirmed_cta` reported |
| EP-no-campaign-deadline | Campaign deadline is absent | Completed blocked plan; `campaign_deadline` reported |
| DT-official-source-required | Selected finding requires an official source | Blocked; reason retained in `missing_facts` |
| DT-current-event-review-required | Selected finding contains current event details requiring review | Blocked; reason retained |
| DT-service-capability-unconfirmed | Selected finding needs confirmed service capability | Blocked; reason retained |
| EP-nonblocking-unknown-note | Selected finding contains a non-blocking advisory note | Proposed plan; advisory does not block |
| EP-derived-score | No operator factors supplied | Score derived from research signals, with source and basis |
| EP-partial-operator-score | Partial factors include an unknown value | Operator score source retained; total remains unknown |
| EP-partial-score-stays-unknown | Only demand factor supplied | Missing factors are not fabricated; total remains unknown |
| BVA-first-finding-index | Model selects index `0` | Existing finding accepted |
| EP-last-valid-finding-index | Model selects last available index `1` | Existing finding accepted |
| BVA-first-invalid-index | Model selects index `2` from two findings | Run fails with `INVALID_OPPORTUNITY` |
| BVA-zero-traffic-reach | Measured visits/leads are zero; KPI below target | KPI behind; priority is `reach` |
| EP-traffic-conversion | Traffic exists, target leads not reached | KPI behind; priority is `conversion` |
| BVA-target-exactly-reached | Current KPI equals target | KPI reached; priority is `maintain` |
| EP-target-exceeded | Current KPI exceeds target | KPI reached; priority is `maintain` |
| EP-metric-not-measured | KPI value is null and no traffic is measured | `not_measured`; priority is `reach` |
| BVA-no-search-signal | No trend signals | Demand floor and no-signal growth branch |
| BVA-rank-outside-top-three | One result at rank 4 | Demand does not receive top-three boost |
| BVA-rank-at-three-and-rising | Three results; best rank 3 improves from rank 5 | Capped demand and rising growth branch |
| EP-rank-one-with-crowded-market | Best rank 1 with 12 competing domains | Visibility boost; content-gap floor for crowded market |
| EP-falling-search-rank | Previous rank 1 moves to rank 2 | Falling growth branch |
| EP-new-search-signal | New signal appears | Rising/new growth branch |
| DT-foreign-goal | Goal context belongs to another workspace | Reject at API validation |
| DT-foreign-metrics | Metrics result belongs to another workspace | Reject at API validation |
| ST-stale-metrics-snapshot | Measurement artifact references another context | Reject stale artifact context |
| BVA-invalid-metrics-window | Equal endpoints or timezone-naive measurement window | Pydantic validation rejects the measurement |

## B. Growth Lead API: plan submission (10 cases)

Implemented in
[`test_growth_lead_integrated.py`](tests/test_growth_lead_integrated.py).
Each scenario also checks the schema boundary of 3/4 ranked opportunities and
10/11 task acceptance conditions.

| ID | Input / decision | Expected result |
|---|---|---|
| EP-valid-grounded-plan | Complete plan, approved research and valid score | Accept `201`; identical retry returns `200` and is deduplicated |
| EP-no-selected-opportunity | Selected opportunity is null | Reject `422 PLAN_BLOCKED`; no writes |
| DT-blocked-by-unresolved-fact | Blocking missing fact exists | Reject `422 PLAN_BLOCKED`; no writes |
| DT-source-not-approved | Selected evidence source is revoked | Reject `422 SOURCE_NOT_APPROVED`; no writes |
| ST-stale-context-rejected | Plan uses an old context snapshot | Reject `422 STALE_CONTEXT`; no writes |
| BVA-expired-task-deadline | Task deadline is in the past | Reject `422 INVALID_DEADLINE`; no writes |
| DT-opportunity-score-mismatch | Score differs from the six-factor product | Reject `422 INVALID_SCORE`; no writes |
| EP-unsupported-task-tool | Plan requests a tool outside the allowlist | Reject `422 INVALID_PLAN`; no writes |
| DT-invalid-task-dependency | Social task depends on itself | Reject `422 INVALID_DEPENDENCIES`; no writes |
| ST-commit-error-retry-recovers | First commit fails; same plan is retried | First `500`; retry `201`; exactly one plan stored |

## C. Existing AI Growth Lead regression suite (29 cases)

Trong bộ test AI hiện có tại
[`services/ai/tests/test_growth_lead.py`](../../../services/ai/tests/test_growth_lead.py):

- Dedicated handoff and idempotent retry for `opportunity.score`,
  `strategy.generate`, and `brief.generate`.
- Workspace, snapshot, profile, artifact hash, revoked source, and approval
  rejection.
- Missing audience, offer, CTA, and profile version handling.
- Invalid model-selected opportunity; no-research blocked plan without a model
  call; context budget rejection; persisted result after restart.
- Past/naive deadline and score-factor bounds; unknown factors remain null.
- Advisory research gaps versus stale selected evidence.
- Derived signal scoring, ranking without a model call, and owner-requested
  offer taking precedence.
- KPI priorities for reach, conversion, maintain, and no measurement.

These are separate regressions in the service's own test folder; run them with
the second command in the README.

## Run

Run the new QA suite (59 tests):

```powershell
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\growth_lead\pyproject.toml qa\Agent\growth_lead\tests -v
```

Run the existing AI-agent regressions (29 tests):

```powershell
.\.venv\Scripts\python.exe -m pytest -c services\ai\pyproject.toml services\ai\tests\test_growth_lead.py -v
```

The API implementation also has Vitest coverage in
`apps/api/tests/campaignPlans/submit.test.ts`,
`growthLeadEndToEnd.test.ts`, and `planPriority.test.ts`.
