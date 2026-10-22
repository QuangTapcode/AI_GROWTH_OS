# Bàn giao QQ-01–09 — 17/10/2026

Đã triển khai đủ 6 role và vòng learning; có luồng PostgreSQL → worker HTTP → AI → ledger → owner approval → social → learning → research tiếp theo. Dữ liệu business chưa có được mock và gắn `synthetic=true`. Candidate phục vụ sandbox/review; **HOLD production**, chưa có chữ ký reviewer và chưa thay thế nguồn/ảnh/metrics thật.

## Deliverables

| Task | Đã triển khai | Nghiệm thu còn lại |
| --- | --- | --- |
| QQ-01 | Schema thực thi 6 role, mapping/policy, caps/concurrency, decision/estimate | Dương/Mỹ chốt scope/capacity/policy |
| QQ-02 | Backend cấp context từ profile/approved sources DB; HTTP worker; ledger hash/version | Mỹ/Thiệu kiểm dashboard và business data thật |
| QQ-03 | Research v2: keywords/user_need, fit/provenance/missing facts; guard câu dở | Dương/Thiệu semantic review |
| QQ-04 | Plan v2, factors ước tính/deadline; API + PgPlanRepository; atomic tasks/outbox | Thiệu Quang/Mỹ review migration/rollout |
| QQ-05 | SEO và Content dedicated; licensed asset refs; parent/version; owner mở social | Ảnh doanh nghiệp thật, DU-04/MY-04 và publish/FE |
| QQ-06 | Community reply/escalation/lead proposal; Performance snapshot/window; proposal only | Metrics/connector/lead owner+consent thật; MY-06/DU-05 |
| QQ-07 | Learning bounded; backend resolve refs, owner approve, unique dedup, outbox task mới | MY-07/TQ-07 kiểm vận hành staging |
| QQ-08 | Bộ 30 ca gốc + 30 ca 6 role; fake/live tách; freeze hash rubric/model/prompt | Thiệu chạy độc lập; DU-07/TH-06 ký rubric |
| QQ-09 | Demo có trace, test cases, runbook, release decision/backlog | TH-09/TQ-09/MY-09/TI-09, UAT và PO/reviewer signoff |

Code chính: `services/ai/src/agents/{research,growth_lead,seo,content,community,performance}`; `apps/api/src/modules/campaignPlans`; `apps/worker/src/workflow/PlanOutboxRunner.ts`; migrations `003/004`. [Decision/estimate](2026-10-17-QQ-BASELINE-DECISIONS.md), [test cases](2026-10-17-QQ-ALL-TEST-CASES.md), [evidence](../../../../qa/evidence/qq-all-2026-10-17/).

## Kết quả xác minh cuối

| Kiểm tra | Kết quả | Evidence |
| --- | --- | --- |
| AI unit/contract/regression | 183 passed, 0 failures/errors | `ai-unit.xml` |
| API unit | 67 passed | `api-unit.json` |
| Worker unit/recovery | 48 passed; 1 DB case skip trong unit, đã chạy riêng bên dưới | `worker-unit.json` |
| PostgreSQL + HTTP pipeline, fake | 41 passed + 1 worker DB passed; DB cleanup đạt | `fake-db-summary.json`, `fake-db-pipeline.json` |
| PostgreSQL + HTTP pipeline, live Ollama | 41 passed + 1 worker DB passed; DB cleanup đạt | `live-db-summary.json`, `live-db-pipeline.json` |
| Frozen RAG baseline | Fake 30/30, live 30/30; critical 23/23, facts 12/12 | `baseline-{fake,live}-eval.json` |
| Frozen six-role extension | Fake 30/30, live 30/30; dataset/prompt/contract hash khớp | `six-role-{fake,live}-eval.json` |
| API/worker TypeScript và build | Đạt; API readiness kiểm DB lúc runtime | `verification-summary.json` |
| Gate tự động | PASS cho sandbox review; production HOLD | `release-decision.json` |

Evidence live lưu cả nội dung output, provenance, approval audit và run metadata cho semantic review. Đây là dữ liệu synthetic chạy qua PostgreSQL/HTTP/model thật, không phải business data hoặc ảnh có quyền thật. Chưa commit/push; các dependency và chữ ký reviewer vẫn pending.

Lỗi đã sửa: thiếu keywords/user_need/câu hoàn chỉnh; hash điểm số `3.0` giữa Python/JavaScript; fake RAG chọn câu theo tên địa điểm thay vì nhu cầu; thiếu wiring persistence/outbox/approval/learning. Lượt test đầu từng timeout ở kill-process và startup service khi các kiểm tra chạy đồng thời; worker suite chạy tuần tự và E2E lượt cuối đạt. Startup harness có deadline/diagnostic rõ hơn; chưa kết luận đã loại bỏ mọi nguyên nhân timeout vận hành.

## Chạy và kiểm tra

1. Apply migrations theo thứ tự `001` → `004`, loại `.down.sql`; không xóa DB hiện có. Cấu hình API và worker cùng PostgreSQL. `DATABASE_URL` cho API; `QUEUE_*` cho outbox worker và `PG_*`/`DATABASE_URL` cho workflow store; không commit secrets.
2. Chạy AI: `python -m uvicorn src.app.main:app --host 127.0.0.1 --port 5000` trong `services/ai`, cấu hình `LLM_PROVIDER_MODE=fake|live`, internal token và SQLite store riêng. Live cần Ollama/model khớp evidence.
3. Worker `AI_PROVIDER_MODE=live` nghĩa là dùng HTTP adapter (AI service vẫn có thể fake), `AI_SERVICE_BASE_URL`/token khớp AI. Worker poll outbox 1 giây; claim/lease 10 phút, tối đa 3 attempts; output lưu trước awaiting_approval.
4. Owner duyệt sources; ingest chunks/facts đúng version sau review; profile có audience/offer. `POST /v1/workspaces/{id}/knowledge-contexts` cấp current context.
5. `POST .../ai-tasks`: `{task_id?,context_snapshot_id,synthetic,input:{operation:'research.run'}}`. Đọc task result_ref và artifact qua API hiện có. Tiếp theo `strategy.generate` với research_artifact_id/cta/deadline/score_factors. Endpoint cũng nhận Community/Performance/learning draft; không nhận SEO/social tùy ý.
6. `POST .../campaign-plans` body là plan artifact ref. Backend production mặc định chặn synthetic; sandbox test bật `allowSynthetic` nội bộ, không cho request body tự vượt gate. Root SEO queued, social pending.
7. `POST .../tasks/{task_id}/approve` body `{expected_version,expected_hash}` từ owner mở social. Không publish ra ngoài. Social thiếu ảnh approved sẽ `needs_assets`.
8. Metrics/lead aggregates do backend/connector cấp vào ledger, không nhận số giả từ model. `learning.analyze` resolve artifact IDs; `POST .../learning-tasks` body learning artifact ref, owner duyệt → tối đa một research task/outbox; replay không trùng.

Public context endpoint không tự nhận asset approval từ client. Sandbox fixture cấp synthetic assets nội bộ; asset repository/capability thật cần lane Mỹ/Thiệu Quang nối sau.

## Reproduce evidence

Trong root: `python -m pytest services/ai/tests -q`. Trong `services/ai`: `python -m evals.run_eval --mode fake|live --out <report>` và `python -m evals.six_roles --mode fake|live --out <report>`. Không chạy nhiều lượt live đồng thời trên cùng Ollama.

Trong `qa/QQ_test`: đặt `QQ_PG_ADMIN_URL` trỏ PostgreSQL local, `QQ_PYTHON` đúng executable, `QQ_SIX_ROLE_MODE=fake|live`; `node scripts/run.mjs --db`. Runner tạo DB tên `qq_test_*`, migrate, chạy 41 BE/integration cases + một worker DB test, rồi cleanup. Nếu không đặt mode, E2E sáu role bị skip rõ ràng, không coi là đã test.

`npm test`/`npm run typecheck`/`npm run build` ở API và worker. Worker kill-process từng timeout ở lượt đầu; rerun tuần tự cả suite đạt, chưa kết luận nguyên nhân đã được khắc phục. Readiness API đánh giá DB lúc runtime, không prerender kết quả kết nối từ build.

Kết quả máy đọc được và điều kiện còn thiếu: [release decision](../../../../qa/evidence/qq-all-2026-10-17/release-decision.json). Evidence DB dùng DB tạm đã xóa, giữ trace ID/hash để audit; không phải URL artifact còn sống ở staging.

## Backlog / owner / hạn gate

| Còn thiếu | Owner | Hạn/gate |
| --- | --- | --- |
| Source/offer/CTA/profile thật và quyền sử dụng ảnh, semantic AC | Dương + PO | Trước D10/UAT |
| Asset repository + metrics/lead aggregates từ connector có quyền | Mỹ + Thiệu Quang | Trước D13/staging acceptance |
| Website publish, lead form → DB/owner/status, dashboard trace | Mỹ + Tiến + Thiệu Quang | D10, xác nhận lại trước D15 |
| FB/IG/GA4/GSC/Meta capability thật | Mỹ | Gate connector; social hiện manual pack |
| QA độc lập, UAT, backup/restore, điều tra timeout kill test nếu tái diễn | Thiệu | D14 |
| Review migration/API/schema compatibility và rollout | Thiệu Quang + Mỹ | Trước merge/release candidate |
| Human approvals tất cả QQ và dependencies liên quan | Reviewers từng task | D15 |

Không tự tick dependency của 6 người khác. Phần implementation có thể review ngay; production release chỉ mở khi evidence thật và chữ ký đủ.
