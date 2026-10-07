# Thiệu Quang — BE core, contracts và tích hợp

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). Sở hữu API root/router/common, `identity`, `workspaces`, `business` core, `knowledge`, `opportunities`, `strategies`, `tasks`, `briefs`, `contents`, `approval`; `contracts/`, migrations/policies, `.github/`, `infra/`, `docs/architecture/`. Mỹ làm profile nghiệp vụ, goals, jobs/integrations; không tự giao cả BE task chung cho một người. Task riêng lưu `apps/api/tasks/`. Mỹ peer-review; FE/AI review interface, Thiệu kiểm quyền/dữ liệu.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — thieu-quang](../execution/W1.md#thieu-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Phần task gốc:** W1-BE-01 core/API/DB/CI; W1-BE-02 auth/workspace/member/knowledge; W1-BE-03 đầu mối contract; W1-BE-04 auth/approval/public boundary; W1-BE-05 đầu mối Git/checks. Phụ thuộc: Dương role/field/source AC; Mỹ worker/profile/goals/form contract; FE/AI/Thiệu review consumers.

1. **Ngày 1–2:** bootstrap API Next.js/TypeScript, package/lockfile/env mẫu và lệnh run/check/build. Kết nối PostgreSQL/pgvector đã chạy; chốt storage, migrations thứ tự, app role và tenant policies, audit. Không dùng DB bootstrap admin làm quyền app production.
2. Chốt auth/session/membership Owner/Editor/Viewer và tenant context tin cậy. APIs workspace/member/business core; Mỹ thêm profile handler trong file riêng. Source record/upload/ingestion/review/version/revoke/delete; Mỹ xử lý queue, AI extraction/index.
3. Quản OpenAPI/JSON Schema/examples của **16 module**: public API, internal AI/job status/retry, source/version/approval, metric/assignment/event. Merge schema theo lô sau FE/AI/Thiệu review; Python dùng JSON contract, không phải import TS types.
4. **Ngày 3–4:** kiểm Viewer không mutate, tenant A không đọc B qua API/DB/storage/vector; revoke/delete cập nhật downstream. Ghép goals của Mỹ, knowledge của Huyền, workspace của Tiến và RAG của Quang Quang.
5. Với Mỹ chốt public-read chỉ published, lead form public boundary, mutation CMS có auth; chuẩn bị approval data model cho W3. Deploy app staging khi có bootstrap, cấu hình riêng không ảnh hưởng các container dự án khác.
6. **Trước ngày 5:** schema/examples validation, CI smoke/required checks và ownership; ánh xạ Git username khi có, ghi blocker nếu chưa có admin quyền branch protection. Git remote/nhánh đã tồn tại, không làm lại init. Demo W1 với logs/evidence thật.

**Bàn giao:** `apps/api/` core/knowledge, migrations/policies, schemas/examples, architecture/config/CI. **Đạt khi:** app chạy bằng lệnh README, seed hai tenant dùng được với Mỹ, các negative quyền đạt, consumers dùng cùng contract, staging persistence có evidence. Probe DB có sẵn không thay kiểm thử auth/tenant/app.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — thieu-quang](../execution/W2.md#thieu-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Phần task gốc:** W2-BE-01 opportunity/strategy/task; W2-BE-02 brief/content/version; W2-BE-03 lưu kết quả/idempotency phía API. Mỹ sở hữu research/queue. Phụ thuộc: AI output schema/rubric, research evidence của Mỹ, AC của Dương.

1. **Ngày 6–7:** opportunity list/filter/detail/select, lưu score từng thành phần/rationale/source từ research/AI; giữ workspace/goal lineage, thiếu demand lưu missing.
2. **Ngày 8:** strategy/version/action/task APIs; approve strategy trước áp dụng, owner/effort/deadline/KPI. Brief/source binding/CTA/destination/approval; không generation brief chưa được duyệt.
3. **Ngày 9:** content/variant/version APIs; optimistic concurrency trả conflict khi stale edit. Autosave/version/restore tạo version mới; regenerate tạo job qua worker Mỹ, result lưu đúng input version.
4. Reconcile AI output: validate schema, chống lưu trùng khi retry callback/result, kiểm quyền/tenant/source version. Registry routes/common do mình merge, Mỹ có modules và worker riêng.
5. **Ngày 10:** cùng FE/AI/Thiệu chạy journey thật research → opportunity → strategy/brief approved → draft; bổ sung migrations tương thích và consumer checks nếu schema thay đổi.

**Bàn giao:** modules `opportunities`, `strategies`, `tasks`, `briefs`, `contents`, contracts/migrations tương ứng. **Đạt khi:** lineage đúng, approval/version/conflict/restore đúng AC, job retry không tạo kết quả trùng, FE reload thấy dữ liệu thật. Review: Mỹ BE, Quang Quang output, Tiến/Huyền consumers, Thiệu tests.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — thieu-quang](../execution/W3.md#thieu-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Phần task gốc:** W3-BE-01 review SEO contracts/migrations; W3-BE-02 approval/version/hash/audit; W3-BE-03/04 review tenant/data/interfaces. Mỹ implement SEO/publish/community/tracking/metrics/worker. Phụ thuộc: Dương state rules, Huyền approval UI, Mỹ scheduler/CMS adapter.

1. **Ngày 11:** approval/reject/resubmit API với reviewer role, approved version/hash/source state và audit identity. Edit sau approve làm mất hiệu lực; không dùng role developer làm product role.
2. **Ngày 12:** cấp worker publish permission-check contract; recheck membership, nguồn và approved version lúc execution. Mỹ làm CMS job/reconcile; cùng Mỹ test revoke/edit sau schedule, unknown outcome và retry.
3. Review migrations/contracts SEO/community/tracking/metrics/experiment do Mỹ đề xuất, cấp thứ tự và merge; không cùng sửa migration/router root. Giữ schema backward compatible cho FE/AI đang ghép.
4. **Ngày 13–14:** kiểm public API không lộ draft/lead PII, tracking không có tên/email; kiểm tenant filters cho snapshots và APIs analytics. Chuẩn bị approved action/learning update boundary tuần 4.
5. **Ngày 15:** regression core/source/approval, chốt compatibility/schema và freeze M01–M13; ghi lỗi còn mở với commit/owner.

**Bàn giao:** module `approval`, policies/audit, execution checks và migration/schema review evidence. **Đạt khi:** stale/revoked approval bị chặn tại execution, publish chỉ dùng đúng version, tenant và public-read đúng; QA có negative evidence. Review: Mỹ peer, Huyền UI, Thiệu quyền/publish.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — thieu-quang](../execution/W4.md#thieu-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Phần task gốc:** W4-BE-01 approved recommendation → task; W4-BE-02 quyền/schema review experiment; W4-BE-03 approved learning → strategy version; W4-BE-04 infra/migrations/security/release. Mỹ sở hữu reports/experiments/learning records và runbooks/jobs.

1. **Ngày 16:** action approval tạo task liên kết goal/strategy, retry không tạo trùng; report records/API của Mỹ gọi shared task domain.
2. **Ngày 17:** review experiment APIs/policies, tách visitor-scoped assignment khỏi Owner credentials; rà schema event/dedup/migrations với Mỹ.
3. **Ngày 18:** áp dụng insight đã duyệt tạo strategy version mới có evidence/source insight/identity. Không cho AI/worker cập nhật strategy khi chưa human approval; freeze feature.
4. **Ngày 19:** fix tenant/auth/source/approval critical, chạy migrations trên bản sao DB, phối hợp Mỹ backup→restore→smoke và rollback. Lưu evidence, cấu hình secrets/network/health và monitoring, không chỉ viết runbook chưa chạy.
5. **Ngày 20:** cung cấp readiness verdict/commit/schema/migration versions, deploy/rollback steps và critical open issues cho PO. Thực hiện deploy sau quyết định go; release smoke với Thiệu, bàn giao infra/owner vận hành.

**Bàn giao:** action/strategy consistency code, schema/migrations, infra/CI/architecture và readiness evidence. **Đạt khi:** retry/approval/tenant đúng, migration/restore/rollback được kiểm chứng, secrets ngoài Git/log; PO có đủ thông tin go/no-go. Review: Mỹ peer/restore, Thiệu security/regression, PO release.
