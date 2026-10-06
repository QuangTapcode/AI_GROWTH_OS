# CR-001 — AI internal runs: error envelope, idempotency key, knowledge/growth-map operations

- **Owner/consumer reviewers:** Quang Quang (AI, provider) đề xuất; Thiệu Quang merge contract; Mỹ (worker) là consumer chính; Thanh (QA2) review assertions; Dương review nghĩa `missing_fact`/growth-map.
- **Story/module và lý do:** W1-QQ-01..05 / W1-AI-01..03, M01–M03. Worker cần mã lỗi ổn định, khóa idempotency đúng contract §3, ingest/retrieval có citation và Growth Map dạng đề xuất.
- **Trạng thái:** đề xuất; provider đã implement tại `services/ai/` (local_verified), **chưa** được BE/consumer review hoặc freeze.

## Contract hiện tại → đề xuất

| Hạng mục | Hiện tại (README §1, §3) | Đề xuất / đã implement phía AI |
| --- | --- | --- |
| Lỗi | `{error: {code, message, request_id, details}}` (chưa có service áp dụng) | AI áp dụng cho mọi non-2xx. Mã: `INVALID_REQUEST`, `INVALID_JSON`, `INVALID_PAYLOAD`, `UNSUPPORTED_SCHEMA_VERSION`, `UNSUPPORTED_OPERATION`, `TENANT_SCOPE_VIOLATION`, `SNAPSHOT_MISMATCH`, `URL_NOT_ALLOWED`, `SOURCE_TOO_LARGE`, `INVALID_SOURCE` (422); `PROMPT_VERSION_MISMATCH`, `MODEL_VERSION_MISMATCH`, `IDEMPOTENCY_CONFLICT` (409); `UNAUTHORIZED` (401); `RUN_NOT_FOUND` (404); `PAYLOAD_TOO_LARGE` (413); `PROVIDER_UNAVAILABLE`, `MODEL_NOT_AVAILABLE` (503, readyz). `X-Request-ID` được nhận/echo. Không echo giá trị đã gửi. |
| Idempotency | `job_id + input_version + operation` | Đúng khóa này. `run_id = uuid5(job_id:operation:input_version)`. Cùng khóa + cùng request (bỏ qua `trace_id`) → 200 run cũ; khác request → 409; `input_version` mới → run mới. |
| Run status | `queued/running/completed/failed` | Thêm `input_version`, `attempt`, `provider_calls`, `max_provider_calls`, `retryable`, `deadline_at`. `completed` chỉ sau khi result đã ghi store. |
| Recovery | Chưa chọn | SQLite trong AI service (`AI_RUN_STORE_PATH`), một process. Restart → run dở thành `failed` + `RUN_INTERRUPTED` + `retryable=true`; worker gửi lại **đúng request** → requeue cùng `run_id`, `attempt+1`. Không lưu payload. **Cần Mỹ chốt** (xem dưới). |
| Caps | PILOT_LIMITS | ≤2 LLM calls/job_id gồm repair, đếm bền vững, không reset khi retry/restart (`CALL_CAP_EXCEEDED`); ≤2 attempts/run; deadline tính từ lần accept đầu (`DEADLINE_EXCEEDED`). `constraints.max_provider_calls` tùy chọn chỉ được hạ cap. |
| Pins | Không có | `prompt_version`, `model_version` tùy chọn trong request; khác service → 409. |
| Operations | 15 mã trong §3 | Thêm `knowledge.answer`, `growth_map.suggest` (M01 `/growth-map-suggestions`). `knowledge.ingest` có pipeline thật; 13 mã còn lại vẫn đi đường bootstrap generic. |
| Evidence | `source_id/source_version/locator/quote` | Thêm `chunk_id`. |
| Usage | tokens/cost/latency | Thêm `llm_calls`, `embedding_calls`, `embedding_input_tokens`. |

## Payload theo operation (Pydantic tại `services/ai/src/app/schemas.py`)

- `knowledge.ingest`: `payload.source{source_id, version, workspace_id, kind: text|pdf|url, title?, label?, text? | content_base64? | url (+ html?)}`. Result: `chunks[{chunk_index, text, locator, page, url, paragraph_start/end, token_estimate, content_hash, embedding[768]}]`, `content_hash`, `parser_version`, `embedding_model`, `embedding_input_format=embeddinggemma-prefix-v1`, `searchable=false`. PDF không text → run `failed` `UNSUPPORTED_PDF_NO_TEXT` (không OCR). URL phải thuộc allowlist (`AI_INGEST_URL_ALLOWLIST`, mặc định 5 seed domains), redirect cũng kiểm lại.
- `knowledge.answer`: `payload{question, snapshot{snapshot_id?, workspace_id, sources[{source_id, version, workspace_id, status, deleted_at?, title?, facts[{key, value, unit?, verification?, locator?}], chunks[{chunk_id, text, locator?, page?, url?, embedding?}]}]}}`. Source khác workspace → 422 cả request. Chỉ dùng source `approved`, không `deleted_at`, có trong `approved_source_versions` đúng version. Câu hỏi rent/deposit/price/address/availability chỉ trả từ fact `verification=verified`, ngược lại `missing_fact_keys` + `MISSING_VERIFIED_*`. Câu trả lời từ chunk: mọi số phải có trong chunk được cite (`UNSUPPORTED_NUMERIC_CLAIM`) và không được nêu giá, kể cả giá có sẵn trong chunk vì có thể bị inject (`UNVERIFIED_PRICE_CLAIM`); khi vi phạm, câu trả lời thành “không đủ thông tin”, không evidence.
- `growth_map.suggest`: `payload{workspace_id, business_profile{...}, approved_facts[{key, value, unit?, source_id, source_version, locator?}], goal_context?{objective?, primary_metric?, baseline?, period_days?}}`. Result `proposal_status=pending_human_review`, `applied=false`, audiences/topics/channels (allowlist `website_blog/seo/facebook/community`)/KPIs; `target` luôn null, baseline null → `MISSING_BASELINE`, 0 → `ZERO_BASELINE`.

Ví dụ request: `services/ai/examples/*.json` (sinh bằng `scripts/smoke_http.py --write-examples`).

## Breaking hay additive

Additive cho envelope request; **breaking** cho bootstrap cũ ở hai điểm: `run_id` không còn bằng `job_id`, và lỗi không còn dạng `{detail}` của FastAPI. Chưa có consumer thật nên không cần giai đoạn chuyển tiếp; worker phải đọc `run_id` từ response create.

## Cần quyết định

1. **Mỹ:** chấp nhận SQLite trong AI service + "resend để resume" làm cơ chế recovery W1, hay chuyển run store vào PostgreSQL/pg-boss của worker. Interface `RunStore` tách riêng để thay được.
2. **Thiệu Quang:** thêm `knowledge.answer`, `growth_map.suggest` vào danh sách operation và JSON Schema khi tạo OpenAPI.
3. **Thanh:** dùng `evals/datasets/w1-ai-eval-0.1.0.jsonl` làm baseline, bổ sung case qua BE adapter thật.

## Evidence

`pytest services/ai/tests` (fake), `scripts/smoke_http.py` qua uvicorn thật, eval report fake/live tại `services/ai/evals/reports/w1-ai-eval-0.1.0-*.json`. Rollback: revert `services/ai/` về bootstrap; không có migration DB nghiệp vụ.

## Bổ sung 06/10 — provenance, giờ mở cửa, hạn fact, tên phường 2025

Additive, không phá request cũ:

- `SourceProvenance {license, attribution, source_url?, upstream_version?, retrieved_at?}`: tùy chọn trên `knowledge.ingest` `payload.source.provenance` và trên snapshot source của `knowledge.answer`. Ingest trả lại `result.provenance`; thiếu thì warning `PROVENANCE_MISSING`. Evidence của câu trả lời mang `source_url`, `license`, `attribution` để UI hiển thị ghi nguồn bắt buộc (OSM/ODbL, CC BY-SA, OGL).
- `SourceFact.valid_until` (tùy chọn): quá hạn thì fact coi như chưa xác minh.
- Câu hỏi giờ mở cửa (`opening_hours`) chỉ trả từ fact `verified`, ngược lại `MISSING_VERIFIED_HOURS` (PRD M02: không tự bịa opening hours).
- `knowledge.answer` trả `result.place_notes`: gợi ý tên quận/phường cũ ↔ phường mới sau 1/7/2025, chỉ dùng để tìm kiếm, không phải evidence.

BE cần: cột provenance trên `sources`, `valid_until` trên `source_facts` (W1-TQ-08); worker gửi provenance khi ingest và khi dựng snapshot (W1-MY-07).
