# CR-004 — Six dedicated pipelines and durable pilot integration

Candidate 2026-10-17; independent BA/API/worker/QA approvals pending. Supersedes bootstrap status in CR-002/003; historical evidence remains unchanged.

`research-v2` requires keywords and user_need and drops incomplete explanations. Growth Lead outputs `growth-lead-plan-v2`, future task deadlines and transparent estimated factors; backend reads legacy v1 artifacts but new AI output is v2. SEO/Content/Community/Performance/learning have dedicated typed contracts and guards. Additional operations within each role reuse that role's minimal pipeline. HTTP run envelope remains 1.0.0; clients using generic marketing payloads must migrate to the exported schemas.

[Executable bundle](../schemas/ai-six-role-contracts.json) records exact input/output schemas, prompt versions and tools. [API candidate](../schemas/qq-pilot-api.json) describes new scoped endpoints; the previously frozen public spec is not silently replaced. Export with `services/ai/scripts/export_six_role_contracts.py`; the QQ-04 export command now forwards to the complete exporter.

Migrations 003/004 add immutable issued contexts, plan acceptances, task outbox and learning dedup. Workspace lock plus transaction commits campaigns/DAG/outbox atomically. Worker checks approved source/profile/snapshot, stable AI job identity, output hash/version, lease ownership and bounded retry before persisting results. Owner approval pins immutable output hash/version, checks current sources and opens dependencies exactly once. Learning accepts persisted aggregate refs, no PII, bounded iteration/quota and unique next-task key.

New routes: knowledge-contexts; ai-tasks; campaign-plans; tasks/{task_id}/approve; learning-tasks. Draft creation requires active owner/editor; approval requires active owner. Synthetic plans/learning are blocked by default on public routes; internal test-only allowance is not controlled by request input. No external publishing, messaging or spend connector is introduced.

Deploy migrations before starting the outbox worker; API and worker must share the database. Keep one AI process or enforce a shared concurrency cap at deployment. Context replacement/version changes require rebuilding queued proposals; never normalize stored raw artifact content before hash comparison.

Validation and rollout limitations: [handoff](../../docs/coordination/sprint-3-weeks/bao-cao/2026-10-17-QQ-ALL-HANDOFF.md), [test cases](../../docs/coordination/sprint-3-weeks/bao-cao/2026-10-17-QQ-ALL-TEST-CASES.md), [evidence](../../qa/evidence/qq-all-2026-10-17/). Production release remains on hold pending real data/rights, staging UAT and independent reviewer signatures.
