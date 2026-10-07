# Mỹ — BE jobs, tích hợp và dữ liệu

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). Sở hữu `apps/worker/`, API modules `goals`, business-profile slice, `research`, `seo`, `publishing`, `leads`, `community`, `tracking`, `metrics`, `reports`, `experiments`, `learning`, `integrations`; `database/seed/`, `docs/runbooks/`. Task tại `apps/worker/tasks/` hoặc `apps/api/tasks/`, tên kèm `my`. Thiệu Quang review/merge API root/contracts/migrations; Tiến/Huyền/AI review consumers, Thiệu test jobs/data.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — my](../execution/W1.md#my) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Phần task gốc:** W1-BE-01 worker/seed; W1-BE-02 profile/goals/ingestion jobs; W1-BE-03 job/metric/event examples; W1-BE-04 leads/CMS/Google/tracking; W1-BE-05 worker smoke. Phụ thuộc: core auth/tenant/DB của Thiệu Quang, source/job schema và AI fake/live, Google/public URL do PM xử lý.

1. **Ngày 1–2:** bootstrap TypeScript worker package/lockfile/env/run/check; queue baseline pg-boss theo quyết định đã lập, worker auth/internal AI adapter. Chốt queued/running/succeeded/failed/retry/progress, timeout/idempotency và caps với AI/QA.
2. Seed hai tenants/ba product roles với Thiệu; implement business-profile slice M01 và goals/KPI/baseline/budget M03. Routing/policy/migration gửi Thiệu Quang review, không cùng sửa core file.
3. **Ngày 3–4:** source ingestion jobs nối knowledge record → AI extraction/index và revoke/delete propagation; restart/retry không bypass provider-call caps. Seed fixtures có label synthetic, không coi là business facts thật.
4. Lead form API: validate/consent theo BA, persist submission, idempotency/dedup, trả success chỉ sau lưu; lưu UTM/campaign/content refs theo schema. Public read chỉ published; approval/mutation dùng core permissions của Thiệu Quang.
5. Với PM/Tiến lập GA4/GSC support/access matrix và probe khi quyền có: property/site URL/timezone, real test event. Chưa có account/public URL giữ blocker, vẫn làm adapter stub/event schema; analytics payload không tên/email.
6. **Ngày 5:** cùng FE/AI/Thiệu ghép profile/goals/jobs/form và ghi DB/retry/connector evidence; worker health/CI smoke, runbook local.

**Bàn giao:** worker, `goals`/profile/`leads`/integrations baseline, seed/jobs/examples/runbooks. **Đạt khi:** dữ liệu persist, worker chạy/có failure states, retry không trùng, form fail không có conversion, boundaries tenant đúng; Google task chưa Done nếu chỉ stub. Review: Thiệu Quang, Tiến/AI, Thiệu.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — my](../execution/W2.md#my) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Phần task gốc:** W2-BE-01 research jobs/evidence; W2-BE-02 generation job adapter; W2-BE-03 queue/quota/recovery/metric ingestion. Thiệu Quang giữ opportunity/strategy/brief/content records. Phụ thuộc: SearXNG local, approved URLs/limits, AI schemas, core persistence.

1. **Ngày 6–7:** research API/job qua SearXNG/URL allowlist, lưu request/query/provider/timestamp/source/evidence, dedup và failure states. Crawl theo [caps](../PILOT_LIMITS.md), không dùng 10 URL probe làm corpus đã duyệt.
2. Nối result research → AI score → Thiệu Quang persist opportunity; giữ goal/workspace/run IDs. Nếu provider lỗi/thiếu demand thì lưu trạng thái thiếu hoặc failed có nguyên nhân, không bịa output.
3. **Ngày 8–9:** adapter chung strategy/brief/content generation jobs; kiểm input version/approval trước dispatch, progress/timeout/quota/retry/recovery. Cancel chỉ theo capability đã chốt; worker restart không reset call budget hay tạo result trùng.
4. Tiếp tục event/analytics collection từ tuần 1 khi có quyền, lưu raw provenance/range/timezone và sync status. Stub/fixture có nhãn rõ nếu chưa live.
5. **Ngày 10:** chạy provider failure/timeout/restart tests cùng Thiệu và demo journey cùng Thiệu Quang/AI/FE.

**Bàn giao:** `research` API, worker adapters/jobs/recovery và metric ingestion nền. **Đạt khi:** evidence truy nguồn, limits giữ đúng, jobs không treo im lặng, failure/retry không duplicate và staging tạo draft qua worker thật. Review: Thiệu Quang, Quang Quang, Huyền, Thiệu.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — my](../execution/W3.md#my) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Phần task gốc:** W3-BE-01 SEO; W3-BE-02 scheduler/CMS/publishing; W3-BE-03 community/tracking; W3-BE-04 metrics/snapshots/experiment schemas. Thiệu Quang sở hữu approval/hash/audit và review migrations. Phụ thuộc: approved version, public pilot, Google quyền, SEO/metric rules BA.

1. **Ngày 11:** small URL audit/keyword/cluster/link/local page/refresh records/jobs. Rule deterministic trước AI suggestions; refresh tạo version mới, metrics missing hiện thiếu. Đề xuất migrations qua Thiệu Quang.
2. **Ngày 12:** CMS Next.js publishing/scheduler adapter, public URL/status/calendar; check approved version/nguồn/quyền tại execution với Thiệu Quang. Idempotency/reconciliation cho timeout unknown outcome, cancel/retry không tạo bài trùng.
3. **Ngày 13:** community conversation/intent/response/approval/manual handoff/link; UTM builder và campaign/content/event mapping. Chỉ CMS auto publish, kênh khác lưu draft/export/manual labels.
4. **Ngày 14:** GA4/GSC auth/sync theo quyền đã có, date/property/timezone/range mapping, traffic/click/CTR/conversion và snapshots; zero khác missing/delay. Chuẩn bị assignment/exposure/outcome schema cho Tiến/Thiệu tuần 4; không đưa secret vào browser/log.
5. **Ngày 15:** đối chiếu dashboard với nguồn thật, publish failure/retry/connector tests với Thiệu; chốt support matrix/runbooks và freeze M01–M13. Missing Google vẫn là blocker, không đóng gate bằng synthetic snapshots.

**Bàn giao:** SEO/publishing/community/tracking/metrics/integrations APIs, worker jobs, snapshots/runbooks. **Đạt khi:** approved bài có URL thật, retry không trùng, events nối đúng content/campaign/form persisted, metrics đối chiếu nguồn được. Review: Thiệu Quang core, Tiến/Huyền FE, AI, Thiệu.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — my](../execution/W4.md#my) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Phần task gốc:** W4-BE-01 snapshots/report; W4-BE-02 assignment/events/results; W4-BE-03 learning records; W4-BE-04 jobs/runbooks/backup/restore. Thiệu Quang giữ approved action→task và approved learning→strategy mutation.

1. **Ngày 16:** versioned snapshots/report API cho hai kỳ, source/range/property/timezone/unit; số học xác định và baseline 0/missing xử lý trước AI narration. Approved recommendation gọi task domain của Thiệu Quang idempotently.
2. **Ngày 17:** experiment config/hypothesis/2 variants/primary metric/period; stable visitor assignment theo policy, exposure/outcome dedup/trace, visitor-scoped public endpoint. Outcome chỉ tính form persisted, kết quả tách variant và thiếu mẫu không winner.
3. **Ngày 18:** learning records/evidence/version từ content/channel/performance/experiment snapshots; proposal chờ duyệt, apply qua strategy boundary Thiệu Quang, giữ old/new version/audit. Freeze feature.
4. **Ngày 19:** fix jobs/sync/retry, thực hành backup→restore→smoke, migration/rollback với Thiệu Quang/Thiệu; performance theo tải/caps đã chốt, lưu observed results và limitations, không biến target thành SLA.
5. **Ngày 20:** bàn giao runbooks deploy/sync/recovery/restore/monitoring/support matrix, readiness verdict; release smoke và owner handoff sau PO go.

**Bàn giao:** modules reports/experiments/learning, worker cuối, runbooks/seed/evidence. **Đạt khi:** report numeric đúng, assignment ổn định và events không trùng, insight chỉ apply sau duyệt; restore/recovery đã chạy và QA/BE peer review đạt.
