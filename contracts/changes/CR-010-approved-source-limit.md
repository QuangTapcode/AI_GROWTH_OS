# CR-010 — Raise the approved-source limit of a JobRequest from 100 to 500

- Owner/consumer reviewers: AI service (provider) · worker PlanOutboxRunner, API community hub and campaign plans (consumers).
- Story/module and reason: incident of 2026-11-26. The current knowledge context reached 106 approved sources (knowledge-gap
  cycle keeps approving sources for questions the bot could not answer). Every `research.run` and `community.response`
  request was then refused with `422 INVALID_REQUEST — approved_source_versions: List should have at most 100 items`, so the
  daily six-agent cycle and all Community replies (Group, Fanpage, Telegram) stopped.
- Contract current → proposed: `maxItems: 100` → `maxItems: 500` on `JobRequest.approved_source_versions` and on
  `KnowledgeSnapshot.sources` (the snapshot carried by Research, Growth Lead and Community payloads), in
  `services/ai/src/app/schemas.py`; `contracts/schemas/ai-six-role-contracts.json` regenerated. The first retry after
  raising only the JobRequest bound failed on `payload.snapshot.sources` with the same 106. Request body cap (32 MB) unchanged.
- Endpoint/schema/error/state/authorization/metric changed: only that bound of `POST /internal/v1/runs`. No error code,
  state or authorization change.
- Breaking or additive: additive. Every request valid before stays valid; the bound only widens.
- Examples and validation: 106 sources accepted, 501 refused (`services/ai/tests/test_job_request_source_limit.py`);
  `test_QQ01_A01_bundle_matches_executable_contract` checks the regenerated bundle.
- FE/BE/AI/QA changes: AI image rebuild only. Consumers already send the full list. The regenerated bundle also picks up
  model changes merged earlier and never exported (`image_pending` status, `image_job_id`).
- Plan provider → consumer: provider first (AI service), consumers need nothing.
- Compatibility, migration, rollback: no migration. Rollback = restore 100, which brings the outage back while the context
  holds more than 100 sources. A context that will grow past 500 needs relevance-based selection instead of a bigger cap.
- Evidence/checks/decision: worker error now carries the field errors (commit 3f2ea26), which named the cause.
  Decision: raise the cap to restore service; revisit selection if contexts approach 500.
