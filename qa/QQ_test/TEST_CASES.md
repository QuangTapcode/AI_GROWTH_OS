# Test case QQ — sau khi merge BE

Baseline source: `Quang-Quang` commit `ffef4bc`, tích hợp `thieuquang_be`/`my_be`. Cập nhật: 07/10/2026. Đây là kỳ vọng cần kiểm tra trên mỗi build, không phải bảng tự đánh dấu Passed.

## Dữ liệu và cách thực thi

Runner tạo database riêng, áp dụng SQL migration thật. Trước **mỗi** integration test, tạo tenant A/B, Owner A/B, Editor A, Viewer A và một source `imported`, version 1 thuộc A. Mọi user/email/slug dùng UUID mới; tên và nội dung có nhãn synthetic. Không có mock DB trong nhóm này.

Các ID dưới đây xuất hiện nguyên văn trong tên automation tại [be.integration.test.ts](tests/be.integration.test.ts). `QQ-DB-001` nằm trong [runner](scripts/run.mjs). Chạy `npm.cmd --prefix qa/QQ_test run test:db`; kết quả từng assertion nằm trong `be-integration.json`, migration/cleanup nằm trong `summary.json`.

## Migration, workspace và phân quyền

| ID | Điều kiện và bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-DB-001 | Database mới rỗng; áp dụng toàn bộ migration theo thứ tự trong transaction | Commit thành công; lỗi SQL rollback và runner exit 1 |
| QQ-DB-002 | Sau migration; đọc danh sách bảng và kiểu `source_chunks.embedding` | Có users/workspaces/memberships/profiles/sources/chunks/facts/goals/tasks; embedding `vector(768)` |
| QQ-DB-003 | INSERT membership với workspace UUID không tồn tại | PostgreSQL từ chối bằng foreign-key error `23503` |
| QQ-WS-001 | Owner A tạo workspace; đọc membership và business profile từ DB | Owner `active`; đúng một profile thuộc workspace đã tạo |
| QQ-WS-002 | Owner A gọi list workspaces | Có workspace A vừa tạo |
| QQ-WS-003 | Owner B gọi list workspaces | Có workspace B, không có workspace A |
| QQ-WS-004 | Owner B đọc detail workspace A | 403; không trả dữ liệu tenant A |
| QQ-WS-005 | Owner A thêm Editor; đọc membership từ DB | Đúng user/workspace; role `editor`, status `active` |
| QQ-WS-006 | Editor đã được thêm; đọc detail workspace A | Đọc được đúng workspace A |
| QQ-WS-007 | Editor A thêm email chưa tồn tại vào workspace | 403; không tạo user cho email bị từ chối |
| QQ-WS-008 | Viewer A đọc danh sách member A | Đúng 3 member, đủ owner/editor/viewer và cùng workspace A |
| QQ-WS-009 | Owner A revoke Viewer A; đọc lại membership | `success=true`; membership chuyển `suspended` |
| QQ-WS-010 | Sau revoke; Viewer đọc detail và list | Detail 403; workspace A biến mất khỏi list |
| QQ-WS-011 | Owner duy nhất revoke chính mình | 400 `CANNOT_REVOKE_LAST_OWNER`; Owner vẫn truy cập được |
| QQ-WS-012 | Tạo workspace mới dùng slug đã tồn tại | 409 `SLUG_ALREADY_EXISTS`; DB vẫn chỉ có một row với slug đó |

## Vòng đời source

| ID | Điều kiện và bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-SRC-001 | Editor tạo source, Owner đọc lại từ DB | Đúng input/hash/tenant; `imported`, version 1 |
| QQ-SRC-002 | Viewer tạo source mới | 403; số source active không tăng |
| QQ-SRC-003 | Owner B đọc source/list của A; list source B | Hai truy cập A bị 403; list B không chứa source A |
| QQ-SRC-004 | Editor duyệt source version 1 | 403; source vẫn `imported`, version 1 |
| QQ-SRC-005 | Owner duyệt với `expected_version=99` | 409 `VERSION_CONFLICT`; status/version không đổi |
| QQ-SRC-006 | Owner duyệt với version 1, đọc lại | `approved`, version 2; reviewer đúng Owner, có reviewed_at |
| QQ-SRC-007 | Duyệt source rồi revoke với version 2 | Persist `revoked`, version 3 |
| QQ-SRC-008 | Owner delete source; SELECT raw row | Row còn tồn tại; `deleted`, deleted_at có giá trị |
| QQ-SRC-009 | Sau delete; đọc list active và detail | Không còn trong list; detail 404 `NOT_FOUND` |
| QQ-SRC-010 | Viewer delete source | 403; source vẫn đọc được và deleted_at vẫn null |
| QQ-SRC-011 | Owner B dùng workspace B và source ID thuộc A | 404 `NOT_FOUND`; không lộ source A dù Owner B có quyền ở B |
| QQ-SRC-012 | Có source locations đã duyệt và policies chưa duyệt; lọc approved/locations | Chỉ trả đúng source locations đã duyệt |

## Contract route handler

Nhóm này dùng `Request` và handler BE thật trong process, PostgreSQL thật. Không cần server Next.js; không kiểm tra TCP, middleware hoặc browser UI. Mọi ca lỗi kiểm tra cả `request_id` không rỗng và không trả stack.

| ID | Điều kiện và bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-HTTP-001 | GET workspaces không Authorization | 401 `UNAUTHORIZED` trong error envelope |
| QQ-HTTP-002 | Owner POST workspace với JSON `{}` | 422 `VALIDATION_FAILED`; field_errors cho name và slug |
| QQ-HTTP-003 | Owner POST workspace hợp lệ, đọc qua service | 201; workspace thật đã persist và Owner có quyền |
| QQ-HTTP-004 | Owner B GET detail workspace A | 403 `FORBIDDEN`; không chứa tên workspace A |
| QQ-HTTP-005 | Viewer DELETE source A | 403 `PERMISSION_DENIED`; source không bị xóa |
| QQ-HTTP-006 | Owner POST review với stale version | 409 `VERSION_CONFLICT` |
| QQ-HTTP-007 | Owner GET source đã soft-delete | 404 `NOT_FOUND` |
| QQ-HTTP-008 | Owner revoke Viewer; Viewer gọi GET detail ngay sau đó | 403 `FORBIDDEN` ở request tiếp theo |

## Regression API/worker đã dùng khi merge

Chạy `npm.cmd --prefix qa/QQ_test run test:unit`. Automation giữ nguyên ở vùng BE, runner QQ gọi lại đúng suite và tạo JSON từng test. Các ID dưới đây ánh xạ theo thứ tự `it(...)` trong file tương ứng. Với store, 4 ca đầu chạy cho cả memory/file; tổng **62 test** (33 API + 29 worker), không chép lại test.

### Lead — `apps/api/tests/leads/submitLead.test.ts` (12)

| ID | Bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-LEAD-001 | Submit payload hợp lệ | 201, status persisted, có submission_id, deduplicated=false |
| QQ-LEAD-002 | Gửi cùng key và cùng payload hai lần | 200 cùng submission_id; deduplicated=true; chỉ một row |
| QQ-LEAD-003 | Gửi cùng key với payload khác | 409; không có record thêm |
| QQ-LEAD-004 | Submit email sai định dạng | 422 kèm field_errors |
| QQ-LEAD-005 | Submit khi consent.accepted=false | 422; không persist, không event |
| QQ-LEAD-006 | Submit thiếu Idempotency-Key | 422 |
| QQ-LEAD-007 | Submit cho site không tồn tại | 404 |
| QQ-LEAD-008 | Giả lập DB fail giữa transaction | 500; không row, không event success |
| QQ-LEAD-009 | Sau DB fail, retry cùng key | Key không bị giữ sau rollback; retry tạo record được |
| QQ-LEAD-010 | Submit thành công; kiểm tra tracking | Đúng một generate_lead sau persist; params allowlist không PII |
| QQ-LEAD-011 | Kiểm tra response success | Chỉ submission_id/status/deduplicated; không echo email/name |
| QQ-LEAD-012 | Kiểm tra envelope lỗi | Luôn có request_id |

### Public content — `apps/api/tests/publicContent/publicRead.test.ts` (9)

| ID | Bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-PUBLIC-001 | List posts theo site | Chỉ published, mới nhất trước, whitelist 5 field |
| QQ-PUBLIC-002 | Detail chứa metadata nội bộ | internal_ranking bị strip |
| QQ-PUBLIC-003 | Đọc published slug | 200, đúng whitelist/title |
| QQ-PUBLIC-004 | Đọc draft slug | 404; không draft body/preview |
| QQ-PUBLIC-005 | Đọc/list post tenant khác từ TripC | 404; slug tenant khác không trong list |
| QQ-PUBLIC-006 | Serialize list/detail | Không lộ member/lead/source/evidence/token/status/internal marker |
| QQ-PUBLIC-007 | List site không tồn tại | 404 `SITE_NOT_FOUND` |
| QQ-PUBLIC-008 | Đọc published landing | 200 whitelist; không lead/member |
| QQ-PUBLIC-009 | Đọc draft landing | 404; không draft body |

### GA4/GSC — `apps/api/tests/integrations/matrixStubs.test.ts` (12)

| ID | Bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-GOOGLE-001 | Lấy connection status khi chưa cấu hình | ga4/gsc not_connected, missing_reason, property_ref null |
| QQ-GOOGLE-002 | Serialize status | Không credential/env key/secret |
| QQ-GOOGLE-003 | Probe ownership khi chưa kết nối | checked=false; verified=null; không giả đã xác minh |
| QQ-GOOGLE-004 | Sync metric chưa kết nối | values=null + missing reason; không thay bằng số 0 |
| QQ-GOOGLE-005 | runSync chưa kết nối | skipped; không synced_at giả |
| QQ-GOOGLE-006 | Đọc support matrix | Đủ 2 provider, scope và permission |
| QQ-GOOGLE-007 | Tìm capability verify_site_ownership | Có trong GSC matrix, PROPERTY_NOT_VERIFIED |
| QQ-GOOGLE-008 | Validate generate_lead params hợp lệ | Được chấp nhận |
| QQ-GOOGLE-009 | Params chứa email | Bị từ chối; không gửi PII |
| QQ-GOOGLE-010 | Params chứa unknown key | Bị từ chối |
| QQ-GOOGLE-011 | Params thiếu event_id | Invalid; dedup key bắt buộc |
| QQ-GOOGLE-012 | Kiểm tra event names | generate_lead và page_view theo convention |

### Worker — `apps/worker/tests/` (29)

| ID | File và bước kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| QQ-RETRY-001 | retryPolicy: tăng attempt liên tiếp | Exponential backoff có cap |
| QQ-RETRY-002 | retryPolicy: chạm max_attempts | Không retry |
| QQ-RETRY-003 | retryPolicy: deadline quá hạn | Không retry, deadline_exceeded |
| QQ-RETRY-004 | retryPolicy: permanent error | Không retry |
| QQ-RETRY-005 | retryPolicy: policy custom | Đúng baseDelay/backoff/cap |
| QQ-STORE-001-M/F | jobStore: insert/get ở memory và file | Giữ fields và Date (2 tests) |
| QQ-STORE-002-M/F | jobStore: update patch và missing job | Merge đúng; missing job throw (2 tests) |
| QQ-STORE-003-M/F | jobStore: listByStatus | Chỉ đúng status (2 tests) |
| QQ-STORE-004-M/F | jobStore: duplicate insert | Bị chặn (2 tests) |
| QQ-STORE-005 | jobStore: tạo lại FileJobStore | Đọc lại durable state sau restart |
| QQ-JOB-001 | jobRunner: chạy happy path | completed chỉ sau persist; result_ref có giá trị |
| QQ-JOB-002 | jobRunner: đọc giữa lúc chạy | Progress đã persist |
| QQ-JOB-003 | jobRunner: handler fail rồi retry | Backoff; chưa đến hạn không chạy; retry completed |
| QQ-JOB-004 | jobRunner: permanent error | failed ngay, không retry |
| QQ-JOB-005 | jobRunner: hết attempt budget | failed; không vượt max_attempts |
| QQ-JOB-006 | jobRunner: provider call budget qua retry | Không reset; call thứ 3 bị chặn |
| QQ-JOB-007 | jobRunner: handler quá execution timeout | retry với JOB_TIMEOUT |
| QQ-JOB-008 | jobRunner: redelivery job completed | Không thực thi lại |
| QQ-JOB-009 | jobRunner: deadline quá hạn trước execution | DEADLINE_EXCEEDED; handler không được gọi |
| QQ-JOB-010 | jobRunner: lease còn thuộc worker khác | Không double-run |
| QQ-JOB-011 | jobRunner: persist result fail | Không completed; retrying; result_ref null |
| QQ-JOB-012 | jobRunner: timeout/provider limit errors | Outcome có đúng error code |
| QQ-RECOVERY-001 | killRecovery: durable running job có lease hết hạn | Requeue, tăng attempt rồi completed |
| QQ-RECOVERY-002 | killRecovery: chết khi attempt hết | failed WORKER_INTERRUPTED, không chạy lại |
| QQ-RECOVERY-003 | killRecovery: SIGKILL tiến trình thật giữa job | State/progress còn trên đĩa; recover và attempt sau completed |

Các ca lead/public content/Google dùng repository in-memory/stub, không chứng minh DB nghiệp vụ hoặc Google account thật. Worker dùng fake AI và file/memory storage, không kiểm pg-boss qua PostgreSQL.

## Gate build/type và AI

| ID | Automation / bước | Kết quả mong đợi |
| --- | --- | --- |
| QQ-CHECK-001 | `test:checks`: eslint apps/api | Exit 0; cấu hình và rule tương thích dependencies |
| QQ-CHECK-002 | `test:checks`: tsc apps/api | Exit 0, không type error kể cả generated types hiện có |
| QQ-CHECK-003 | `test:checks`: next build apps/api | Production build thành công |
| QQ-CHECK-004 | `test:checks`: tsc worker gồm test | Exit 0 |
| QQ-CHECK-005 | `test:checks`: worker build | Emit thành công |
| QQ-AI-001 | `test:ai`: `services/ai/tests` | 85 unit/contract/guardrail tests đạt ở fake mode; JUnit ghi từng case |
| QQ-AI-002 | `test:ai:live`: frozen dataset 30 ca | 100% critical, facts/retrieval ≥90%; run/model/prompt/evidence có trong JSON |

AI suite kiểm tra run persistence/idempotency, auth, source/chunk snapshot theo DB BE, ingestion text/PDF/URL, tenant filter, missing/expired facts, revoke và prompt injection. Danh sách case cụ thể nằm trong các file `services/ai/tests/test_*.py` và `services/ai/evals/datasets/w1-ai-eval-0.1.0.jsonl`; runner dùng nguyên suite/dataset đó.

Không xem assertion bị comment, test bị skip hoặc 404 từ endpoint không tồn tại là bằng chứng luồng nghiệp vụ đạt. Các gate cấu hình đang đỏ vẫn được ghi nhận ở [BASELINE.md](BASELINE.md).
