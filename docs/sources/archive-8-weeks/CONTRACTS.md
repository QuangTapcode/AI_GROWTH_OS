# Hợp đồng tích hợp — đề xuất v0.1

Owner merge: BE. Reviewer: FE, AI, Tester 2; BA review ý nghĩa nghiệp vụ. Trạng thái: **draft**, chưa freeze; catalog này chưa phải OpenAPI hoàn chỉnh và chưa có API chạy thật.

Mục tiêu tuần 1: chuyển bản này thành OpenAPI 3.1 + JSON Schema, tạo examples hợp lệ, validate tự động, chốt baseline `1.0.0`. Không để FE, BE và AI tự định nghĩa ba phiên bản dữ liệu khác nhau.

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
| M02 | `GET/PATCH /v1/workspaces/{workspace_id}/business-profile` | Profile, audience, brand rules, version |
| M04 | `GET/POST /v1/workspaces/{workspace_id}/goals` | KPI, baseline, target, period, conversion, budget |
| M03 | `GET/POST /v1/workspaces/{workspace_id}/sources` | Source metadata, allowed format/URL, lifecycle |
| M03 | `POST /v1/workspaces/{workspace_id}/sources/{source_id}/review` | expected_version, approve/reject, reason |
| M03 | `DELETE /v1/workspaces/{workspace_id}/sources/{source_id}` | Revoke/filter ngay; cleanup async job |
| M05/M25 | `POST /v1/workspaces/{workspace_id}/research-runs` | goal_id, context_version, budget; `202` job_id |
| M25 | `GET /v1/workspaces/{workspace_id}/jobs/{job_id}` | Status, progress, result_ref, failure code |
| M25 | `POST /v1/workspaces/{workspace_id}/jobs/{job_id}/cancel` | Cancellation requested; không hứa dừng ngay |
| M06 | `GET /v1/workspaces/{workspace_id}/opportunities` | Evidence, scores, rationale, priority, filters |
| M07 | `POST /v1/workspaces/{workspace_id}/plans` | Plan/task đơn giản từ selected opportunities |
| M08 | `GET/POST /v1/workspaces/{workspace_id}/briefs` | opportunity_id, intent, audience, facts, CTA, format |
| M09 | `POST /v1/workspaces/{workspace_id}/contents` | Tạo draft metadata, brief_id, version |
| M09 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/generate` | brief_version, expected_version; async job |
| M09 | `GET/PATCH /v1/workspaces/{workspace_id}/contents/{content_id}` | Body/meta/evidence, expected_version; `409` nếu stale |
| M09 | `GET /v1/workspaces/{workspace_id}/contents/{content_id}/versions` | Version history; restore tạo version mới |
| M10 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/variants` | source_version, channel=facebook, language; draft job |
| M11 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/submit-review` | expected_version, source references |
| M11 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/approve` | expected_version, reviewer, audit; BE lấy actor từ token |
| M11 | `POST /v1/workspaces/{workspace_id}/contents/{content_id}/reject` | expected_version, reason |
| M16 | `POST /v1/workspaces/{workspace_id}/publishing-jobs` | content_id, approved_version, channel_id, schedule, idempotency |
| M16 | `GET /v1/workspaces/{workspace_id}/calendar` | Scheduled/published items, window, workspace timezone |
| M19/M20 | `GET /v1/workspaces/{workspace_id}/metrics` | source/property/range/timezone, availability, values |
| M21 | `POST /v1/workspaces/{workspace_id}/reports` | metric_snapshot_ids, goal_id; async analyst job |
| M21 | `GET /v1/workspaces/{workspace_id}/reports/{report_id}` | Summary, metric/evidence references, recommendations |
| M28 | `GET /v1/workspaces/{workspace_id}/integrations` | Connected/revoked/error/delayed; không trả credentials |

BE phải bổ sung detail/update endpoints, OAuth connect/callback/disconnect, upload URL flow, task assignments, sync trigger và capability/support matrix cho CMS đã chọn. Browser upload dùng signed URL giới hạn tenant/type/size; service-role key không ra FE.

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

Đây là envelope minh họa, chưa đủ payload brief cho generation và không phải request đã được nghiệm thu. Không có approved facts thì output phải nêu thiếu dữ liệu, không tự tạo facts. Mỗi operation có schema riêng: `knowledge.ingest`, `research.run`, `opportunity.score`, `strategy.generate`, `brief.generate`, `content.generate`, `content.repurpose`, `content.quality_check`, `analytics.report`.

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
