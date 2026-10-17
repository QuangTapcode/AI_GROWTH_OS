# TODO — Mỹ / 3 tuần

Vai trò: **Backend worker + tích hợp**. Khu vực: `apps/worker/; apps/api/src/modules/integrations/; publishing/metrics/community slices; docs/runbooks/`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [x] MY-01 · D3 · L · Nối AI HTTP adapter và typed job routing

- **Làm / đầu ra / Done:** Thay wiring FakeAiAdapter theo config; map worker operation→AI operation; submit/poll/cancel, auth nội bộ, persist run/artifact. publish/lead/metrics không gọi LLM generic. Chia PR adapter và routing.
- **Phụ thuộc:** TQ-01, QQ-01.
- **Reviewer:** Thiệu Quang + Quang Quang.
- **Theo dõi:** `done` · PR/build: PR #3 merged vào thieuquang_be (3 commits: 427430e, 9c67d8f, d3b242d) · Evidence: `apps/worker/src/adapters/HttpAiAdapter.ts`, typed routing `src/jobs/operations.ts`, tests `npm test` 43/43 pass (14 test mới: submit/poll/idempotency/error envelope/cancel + routing) · Ghi nhận: cancel chỉ ngừng poll local vì CR-001 chưa có AI-side cancel endpoint; publish/lead/metrics fail `OPERATION_NOT_WIRED` chờ MY-04–06; reviewer xác nhận ngoài GitHub.

### [x] MY-02 · D3 · M · Spike quyền connector và nguồn ảnh

- **Làm / đầu ra / Done:** Capability matrix website/FB/IG/GA4/GSC/Meta read; verified hoặc missing với owner. Chốt social live/manual D3; dùng ảnh TripC hợp lệ nếu thiếu media provider.
- **Phụ thuộc:** DU-01; DU-03 bàn giao danh sách nguồn sơ bộ D2.
- **Reviewer:** Dương + Thiệu Quang.
- **Theo dõi:** `done` · PR/build: PR #3 merged vào thieuquang_be · Evidence: capability matrix `apps/api/src/modules/integrations/matrix.ts` (website/manual-pack verified; FB/IG/GA4/GSC/Meta Ads missing — chưa có credential thật, quyết định D3: social manual pack), stub read-only `stubs.ts`, runbook `docs/runbooks/MY-02-CONNECTOR-SPIKE.md` · Ghi nhận: reviewer xác nhận ngoài GitHub.

### [x] MY-03 · D5 · M · Workflow runner durable và human wait

- **Làm / đầu ra / Done:** Reuse queue/lease/retry; DB store nối migration; dependency dispatch, awaiting_approval/blocked, event dedup và resume; retry step lỗi, không chạy lại toàn campaign.
- **Phụ thuộc:** TQ-02, MY-01.
- **Reviewer:** Thiệu Quang + Thiệu.
- **Theo dõi:** `done` · PR/build: PR #3 merged vào thieuquang_be · Evidence: `apps/worker/src/workflow/` (WorkflowRunner dependency dispatch + human wait + dedup + resume + requeueFailed), `DbWorkflowStore` (pg Pool theo pattern API, nối migration 002: marker workflow/task/dependencies/events, dedup read-before-write), store `Memory/FileWorkflowStore`, `tests/workflow.test.ts` 5/5 pass, `tests/dbWorkflow.test.ts` (pass trên Postgres thật localhost:15432, migration 001+002 áp dụng) · Blocker đã gỡ: TQ-02 merged (42504f1). · Ghi nhận: reviewer xác nhận ngoài GitHub.

## Tuần 2 — 22–28/10/2026

### [ ] MY-04 · D7 · M · Publisher website và social pack

- **Làm / đầu ra / Done:** Executor gọi CMS thật, lưu immutable snapshot/publication; social live theo capability hoặc manual pack có nhãn; caption/ảnh/UTM đúng version.
- **Phụ thuộc:** TQ-04 (contract D6, tích hợp D7), MY-02.
- **Reviewer:** Thiệu Quang + Tiến.
- **Theo dõi:** `local_verified` (chờ Thiệu Quang + Tiến review) · PR/build: worker tsc sạch, vitest `src/publish 6+7 tests` pass, routing `operationsRouting 4/4` pass · Evidence: `apps/worker/src/publish/CmsPublisher.ts` (MockCmsPublisher + PublisherRegistry + defaultRegistry), `PublishJobProcessor.ts` (idempotency `publish:ws:content:channel:version`, timeout→reconcile trước retry, manual pack), `ManualPackGenerator.ts` (pack FB/IG label `manual-pack` + UTM), wiring `src/jobs/operations.ts createWiredHandler('publish')` · Blocker: CMS thật + immutable snapshot/publication BE (TQ-04) để đạt `integrated`.

### [ ] MY-05 · D9 · M · Scheduled publish/reconcile và invalidation

- **Làm / đầu ra / Done:** Lưu UTC + timezone; recheck approval/source/account tại execution; timeout đối soát trước retry; không tạo hai bài cùng idempotency key.
- **Phụ thuộc:** MY-04, TQ-04; gateway contract được TQ bàn giao D7 trong TQ-04.
- **Reviewer:** Thiệu Quang + Thiệu.
- **Theo dõi:** `local_verified` (chờ Thiệu Quang + Thiệu review) · PR/build: worker tsc sạch, `reconciliation.test.ts 7/7` pass · Evidence: `apps/worker/src/reconcile/ReconciliationService.ts` (duplicate_prevented/retry_allowed/still_unknown, UTC ISO, retry cap 2, recoverable filter), `PublishJobProcessor` reconcile path, gateway TQ-06 `tools/execute` đã merge · Blocker: recheck approval/version/hash tại execution qua gateway TQ-06 + schedule BE để đạt `integrated`.

### [ ] MY-06 · D10 · M · Community intake và metrics ingestion

- **Làm / đầu ra / Done:** Form/webhook supported có dedup; lead DB/owner handoff; GA4/GSC/Meta snapshots khi có quyền, nếu thiếu ghi missing; reply chỉ gửi sau duyệt và đúng quyền.
- **Phụ thuộc:** TQ-05, MY-02.
- **Reviewer:** Thiệu Quang + Thiệu.
- **Theo dõi:** `local_verified` (chờ Thiệu Quang + Thiệu review) · PR/build: worker tsc sạch, `leadIntake 9 tests + metricsStub 5 tests` pass, API `vitest 72/72` (TQ-05) · Evidence: `apps/worker/src/leads/LeadIntakeService.ts` (validate email/UTM/consent, key `lead:ws:hash`, dedup, status/owner), `src/metrics/MetricsIngestionStub.ts` (`insufficient_data`, hourly dedup event), wiring `operations.ts createWiredHandler('lead'/'metrics')`, TQ-05 `modules/leads/` PG + migration 003 đã merge · Blocker: nối worker intake → PG repository TQ-05 (thay in-memory) + reply approval flow để đạt `integrated`.

## Tuần 3 — 29/10–04/11/2026

### [ ] MY-07 · D11 · M · Lịch report và feedback event

- **Làm / đầu ra / Done:** metrics_synced/lead_created/approval_changed/publication_completed tạo đúng task; report theo lịch configurable; max iterations/cost và idempotency qua restart.
- **Phụ thuộc:** MY-06, QQ-06.
- **Reviewer:** Quang Quang + Thiệu.
- **Theo dõi:** `local_verified` phần worker (chờ Quang Quang review; chờ QQ-06 handler để `integrated`) · PR/build: worker `feedbackEventScheduler 7/7 + metricsStub 5/5` pass · Evidence: `apps/worker/src/events/FeedbackEventScheduler.ts` (6 event types, dedup `type:ws:hash`, maxIterations 5/costCap 0, `insufficient_data` flag), `MetricsIngestionStub.buildMetricsSyncedEvent`, TQ-07 outbox/reports đã merge · Blocker: QQ-06 Community/Performance handler (AI consumer cho event).

### [ ] MY-08 · D13 · M · Diễn tập recovery và lỗi tích hợp

- **Làm / đầu ra / Done:** Kill/restart, timeout publish, revoked connector/source, retry cap và queue backlog; lưu evidence một task chỉ tạo một side effect.
- **Phụ thuộc:** TH-07.
- **Reviewer:** Thiệu + Thiệu Quang.
- **Theo dõi:** `local_verified` mock (chờ TH-07 E2E env để `integrated`) · PR/build: worker `recoveryDrill 11/11` pass · Evidence: `apps/worker/src/recovery/RecoveryDrill.ts` (6 scenario + runAllDrills, evidence string) · Blocker: TH-07 E2E (kill thật, CMS timeout thật, revoked thật).

### [ ] MY-09 · D15 · M · Bàn giao runbooks và connector limits

- **Làm / đầu ra / Done:** Start/stop, backup/restore, rotate credential, retry/resume/manual fallback; artifact mẫu và support matrix thật; phối hợp demo.
- **Phụ thuộc:** MY-08, TH-08.
- **Reviewer:** Thiệu Quang + Quang Quang.
- **Theo dõi:** `local_verified` skeleton (chờ TH-08 verdict để done) · PR/build: chưa cần build · Evidence: `apps/worker/src/runbooks/MY-RUNBOOKS.md` (start/stop, pg_dump/psql, rollback, rotate token, retry max 2, manual fallback, support matrix thật, escalation) khớp TQ-09 release config (`.env.example`, openapi 1.1.0, migrations 001..004) · Blocker: TH-08 UAT/restore verdict.

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
