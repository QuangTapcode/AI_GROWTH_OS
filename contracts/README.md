# Hợp đồng tích hợp — đề xuất v0.2 / pilot 4 tuần

Owner merge: BE. Reviewer: FE, AI, Tester 2; BA review ý nghĩa nghiệp vụ. Trạng thái: **draft**, chưa freeze; catalog này chưa phải OpenAPI hoàn chỉnh và chưa có API chạy thật.

Baseline scope: 16 module theo [SCOPE](../docs/ba/SCOPE.md) và kế hoạch 4 tuần. Mục tiêu tuần 1: chốt interface đủ M01–M16, chuyển bản này thành OpenAPI 3.1 + JSON Schema, tạo examples hợp lệ, validate tự động, chốt baseline `1.0.0`. Không để FE, BE và AI tự định nghĩa ba phiên bản dữ liệu khác nhau.

## 1. Những gì cần thống nhất trước triển khai

- Public API `/v1`: FE ↔ BE, bearer token người dùng, workspace lấy từ route; BE xác minh membership từ token, không tin workspace_id gửi trong body.
- Internal AI API `/internal/v1`: worker ↔ AI, service authentication được triển khai riêng, mạng nội bộ; không cho FE gọi trực tiếp.
- JSON dùng `snake_case`; ID dạng UUID; thời gian ISO 8601 UTC; timezone workspace dạng IANA, ví dụ `Asia/Bangkok`.
- `schema_version` cho job/AI artifacts; `request_id` xuyên logs; `trace_id` xuyên pipeline; payload không chứa secrets.
- List response `{items, next_cursor}`; pagination/filter cụ thể cho mỗi endpoint. Lỗi thống nhất `{error: {code, message, request_id, details}}`.
- Success HTTP: GET/PATCH `200`, create `201`, async accepted `202`; auth `401`, quyền `403`, absent `404`, invalid state/stale version `409`, invalid data `422`, quota `429`, integration unavailable `503`.
- Không dùng AI confidence thay cho chứng minh facts. Evidence phải dẫn tới source/version/chunk hoặc metric snapshot có thể kiểm tra.

## 2. Catalog API public cần tạo OpenAPI

Routes dưới đây là đề xuất đủ để phân công; field validation, authorization, examples và error responses phải được BE/consumers bổ sung trước freeze.

| Module | Endpoint dự kiến | Request/response chủ yếu |
| --- | --- | --- |
| M01 | `GET/POST /v1/workspaces` | Workspace list/create; membership theo token |
| M01 | `GET/POST /v1/workspaces/{workspace_id}/members` | Role/invite; revoke qua endpoint riêng cần chốt |
| M01 | `GET/PATCH /v1/workspaces/{workspace_id}/business-profile` | Profile, audience, brand rules, version |
| M03 | `GET/POST /v1/workspaces/{workspace_id}/goals` | KPI, baseline, target, period, conversion, budget |
| M02 | `GET/POST /v1/workspaces/{workspace_id}/sources` | Source metadata, allowed format/URL, lifecycle |
| M02 | `POST /v1/workspaces/{workspace_id}/sources/{source_id}/review` | expected_version, approve/reject, reason |
| M02 | `DELETE /v1/workspaces/{workspace_id}/sources/{source_id}` | Revoke/filter ngay; cleanup async job |
| M04 / Nền tảng | `POST /v1/workspaces/{workspace_id}/research-runs` | goal_id, context_version, budget; `202` job_id |
| Nền tảng | `GET /v1/workspaces/{workspace_id}/jobs/{job_id}` | Status, progress, result_ref, failure code |
| Nền tảng | `POST /v1/workspaces/{workspace_id}/jobs/{job_id}/cancel` | Cancellation requested; không hứa dừng ngay |
| M05 | `GET /v1/workspaces/{workspace_id}/opportunities` | Evidence, scores, rationale, priority, filters |
| M06 | `POST /v1/workspaces/{workspace_id}/plans` | Plan/task đơn giản từ selected opportunities |
| M07 | `GET/POST /v1/workspaces/{workspace_id}/briefs` | opportunity_id, intent, audience, facts, CTA, format |
| M08 | `POST /v1/workspaces/{workspace_id}/contents` | Tạo draft metadata, brief_id, version |
| M08 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/generate` | brief_version, expected_version; async job |
| M08 | `GET/PATCH /v1/workspaces/{workspace_id}/contents/{content_id}` | Body/meta/evidence, expected_version; `409` nếu stale |
| M08 | `GET /v1/workspaces/{workspace_id}/contents/{content_id}/versions` | Version history; restore tạo version mới |
| M08 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/variants` | source_version, channel=facebook, language; draft job |
| M10 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/submit-review` | expected_version, source references |
| M10 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/approve` | expected_version, reviewer, audit; BE lấy actor từ token |
| M10 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/reject` | expected_version, reason |
| M10 | `POST /v1/workspaces/{workspace_id}/publishing-jobs` | content_id, approved_version, channel_id, schedule, idempotency |
| M10 | `GET /v1/workspaces/{workspace_id}/calendar` | Scheduled/published items, window, workspace timezone |
| M12/M13 | `GET /v1/workspaces/{workspace_id}/metrics` | source/property/range/timezone, availability, values |
| M14 | `POST /v1/workspaces/{workspace_id}/reports` | metric_snapshot_ids, goal_id; async analyst job |
| M14 | `GET /v1/workspaces/{workspace_id}/reports/{report_id}` | Summary, metric/evidence references, recommendations |
| M13 / Nền tảng | `GET /v1/workspaces/{workspace_id}/integrations` | Connected/revoked/error/delayed; không trả credentials |

BE phải bổ sung detail/update endpoints, OAuth connect/callback/disconnect, upload URL flow, task assignments, sync trigger và capability/support matrix cho CMS đã chọn. Browser upload dùng signed URL giới hạn tenant/type/size; service-role key không ra FE.


### 2.1. Interface bổ sung theo danh mục 16 module mới

Đây là endpoints đề xuất cần chốt tuần 1; không phải service đã triển khai. Routes dưới đây cùng prefix `/v1/workspaces/{workspace_id}` trừ visitor ingestion được chốt riêng.

| Module | Suffix endpoint dự kiến | Hành vi phải có trong contract |
| --- | --- | --- |
| M01 | `GET/POST /growth-map-suggestions` | Gợi ý từ business context, review trước áp dụng |
| M06 | `PATCH /plans/{plan_id}` và `POST /plans/{plan_id}/approve` | expected_version, approved plan mới tạo action/tasks; strategy versions |
| M07 | `PATCH /briefs/{brief_id}` và `POST /briefs/{brief_id}/approve` | Brief approved version trước generation; giữ source/CTA |
| M09 | `GET/POST /seo/keywords`, `POST /seo/audits` | Basic keyword/cluster, small URL audit, evidence và URL limits |
| M09 | `POST /seo/local-drafts`, `POST /contents/{content_id}/refresh` | Một local template có unique facts; refresh theo metric/source, tạo version mới |
| M11 | `GET/POST /community/conversations`, `POST /community/conversations/{id}/responses` | Input URL/content/source, intent/evidence, AI response draft |
| M11 | `POST /community/responses/{id}/approve`, `POST /community/responses/{id}/handoff` | expected_version, shared approval policy; manual posted URL, không auto publish |
| M12 | `GET/POST /campaign-links`, `GET /traffic-sources` | UTM mapping campaign/content/channel, click/conversion aggregation |
| M13 | `POST /integrations/{integration_id}/sync`, `GET /metric-snapshots` | Authorized properties/range/timezone, sync/delay/missing/zero |
| M14 | `POST /reports/{report_id}/actions/{action_id}/approve` | Report recommendation approval→task, source snapshot/goal links |
| M15 | `GET/POST /experiments`, `GET /experiments/{id}/results` | Hypothesis, hai title/CTA variants, primary metric, period/grouping, sample limitations |
| M15 | Visitor assignment/event ingestion — chốt route riêng | Website pilot scope; visitor ID/experiment binding, stable assignment; event_id dedup, exposure/outcome trace; không cấp token Owner cho visitor |
| M16 | `GET /learning/insights`, `POST /learning/runs` | Rules, content/channel/performance/experiment snapshot IDs, evidence/version |
| M16 | `POST /learning/insights/{insight_id}/approve` | expected_strategy_version; approved insight mới tạo strategy version/task |

Metric snapshot schema phải lưu property/source/range/timezone/sync status và số liệu đã tính, thay vì để LLM tính tùy ý. Experiment schema cần visitor/assignment/exposure/outcome IDs, variant, event time và primary metric để QA2 kiểm tra stable assignment/dedup. Learning không tự thay đổi strategy khi chưa duyệt.

Trong pilot role người dùng chỉ Owner/Editor/Viewer. BA/BE chốt role-action matrix cho publish/review/experiment/learning; contract authorization không dựa vào role của thành viên đội phát triển. Tracking/event ingestion phải được tách khỏi private management API, có binding/rate limits/consent theo website pilot.

## 3. Boundary BE ↔ AI

AI cung cấp `POST /internal/v1/runs` và `GET /internal/v1/runs/{run_id}`, kèm cancel endpoint cần chốt. Create trả `202` với run_id sau khi chấp nhận. Worker sở hữu job bền vững, gọi AI, poll trạng thái, validate output rồi persist; AI không trực tiếp sửa bảng nghiệp vụ.

Một job có thể retry, nên create AI run phải idempotent theo `job_id + input_version + operation`. Worker restart phải nối lại run cũ thay vì tạo nhiều run vô hạn. Nếu service AI chưa có lưu run bền vững, đội phải chọn cơ chế recover ở tuần 1; không chỉ lưu trạng thái trong RAM rồi coi đã đáp ứng retry.

Input tối thiểu:

```json
{
  "schema_version": "1.0.0",
  "job_id": "00000000-0000-4000-8000-000000000009",
  "workspace_id": "00000000-0000-4000-8000-000000000001",
  "operation": "content.generate",
  "input_version": 3,
  "context_snapshot_id": "00000000-0000-4000-8000-000000000003",
  "approved_source_versions": [],
  "constraints": {
    "language": "vi",
    "max_cost_usd": 1,
    "timeout_seconds": 120,
    "human_approval_required": true
  },
  "trace_id": "synthetic-trace-001",
  "synthetic": true
}
```

Đây là envelope minh họa, chưa đủ payload brief cho generation và không phải request đã được nghiệm thu. Không có approved facts thì output phải nêu thiếu dữ liệu, không tự tạo facts. Mỗi operation có schema riêng: `knowledge.ingest`, `research.run`, `opportunity.score`, `strategy.generate`, `brief.generate`, `content.generate`, `content.repurpose`, `content.quality_check`, `analytics.report`, `seo.audit`, `seo.local_draft`, `content.refresh`, `community.response`, `experiment.hypothesis`, `learning.analyze`.

Output cần có: `run_id`, `schema_version`, `status`, `result` theo operation, `evidence`, `warnings`, `usage`, `model_version`, `prompt_version`, `input_version`, `trace_id`. Usage chứa token counts, cost, latency có đơn vị rõ. Confidence nếu có là chỉ báo ước lượng, không tự coi là xác suất đã hiệu chuẩn.

AI retrieval dùng adapter query tenant-scoped do BE xác minh, hoặc snapshot nguồn đã được BE cấp đúng workspace. Không đưa broad service-role key cho AI rồi chỉ dựa vào prompt để lọc tenant. Sources untrusted không được biến thành system instructions.

## 4. State machines đề xuất

Job thực thi (tách khỏi trạng thái duyệt nội dung):

```text
queued → running → completed
            ├── failed → retry_wait → queued
            └── cancel_requested → cancelled
```

Worker giữ attempts, max_attempts, deadline, retry backoff, lease/heartbeat và result_ref. Retry chỉ lỗi recoverable; bad schema, thiếu quyền hoặc thiếu fact cần review/fix input. Progress là thông tin tham khảo, không được nhảy thành completed trước khi result đã lưu thành công.

Nội dung:

```text
draft → quality_check → needs_review → approved → scheduled → published
             └── draft       └── rejected → draft
approved hoặc scheduled + edit → draft, approval vô hiệu, job cũ bị hủy
scheduled + cancel → approved nếu version/approval còn hợp lệ
```

Publish failure ở publishing job; content không được gắn published khi CMS chưa xác nhận. `measured` là metadata/performance liên kết, không cần đổi content status để hiển thị metrics. V1 state machine và ngoại lệ phải được BA/QA review trước freeze.

## 5. Idempotency, concurrency và approval

- API tạo publish job nhận `Idempotency-Key`; scope theo workspace/action. Cùng key+payload trả kết quả cũ; cùng key khác payload trả conflict.
- Persist mapping job ↔ CMS post trước/qua reconciliation khi timeout không rõ đã publish hay chưa. Không retry bằng cách tạo bài mới ngay; phải tra idempotency marker/external ID.
- PATCH content yêu cầu `expected_version` hoặc ETag thống nhất; stale trả `409 VERSION_CONFLICT`.
- Approval gắn version/hash và reviewer có quyền; publisher kiểm tra lại version, source validity, integration health và quyền ở execution.
- Scheduled timestamp UTC + workspace timezone; không dùng timezone máy chạy để giải thích lịch.

## 6. Fixtures/mocks và schema version

Canonical examples ở `contracts/examples/` do BE đầu mối quản. FE viết mock handlers riêng, BE viết AI stub riêng, AI viết fake provider riêng; tất cả validate qua cùng schema sau bootstrap. `qa/fixtures/` giữ test data tập trung do Tester 2 + BE review; không sao chép dataset thật vào source.

Bắt buộc fixtures: tenant A/B, owner/editor/viewer, valid/expired token, no-data/zero/delayed metrics, draft/approved/stale version, provider timeout/bad JSON/no evidence, CMS duplicate/unknown outcome/revoked credential, deleted/outdated source.

Generated SDK nếu cần được sinh trong từng consumer và không sửa tay. Mỗi app giữ contract snapshot/version đã pin; CI kiểm tra không lệch baseline. Quy tắc version/migration xem [CONTRIBUTING](../CONTRIBUTING.md).


## Pilot Next.js và contract liên ngôn ngữ — W1-PM-01

FE/BE dùng TypeScript, AI dùng Python; OpenAPI/JSON Schema HTTP/JSON là contract chung, không yêu cầu Python import TypeScript types. CMS/website pilot đã chọn Next.js/TypeScript; app quản trị apps/web, public apps/pilot, CMS/API apps/api. Framework versions và schema freeze ở W1-BE-01/W1-BE-03.

W1-BE-03 bổ sung public published-content read và form submission contract: submission_id/idempotency key, validation/error, server-confirmed persisted result, UTM/campaign/content/experiment context và consent theo story BA. Public visitor không có quyền workspace hoặc draft read/CMS mutation. Conversion là form thành công, không phải account Signup; GA4 generate_lead chỉ sau thành công, không đưa tên/email vào analytics. Admin publish kiểm tra human approval của đúng version tại execution. Đây là yêu cầu contract cần xây, chưa phải endpoint/schema đã triển khai. Xem [PILOT](../docs/coordination/PILOT.md).
