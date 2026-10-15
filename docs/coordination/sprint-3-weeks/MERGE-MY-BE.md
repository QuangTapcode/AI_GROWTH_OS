# Merge my_be vào main — 16/10/2026

Nguồn đã fetch từ GitHub: `origin/my_be` tại `7005ab9`.
Target: `main`. QQ-04 được lưu trước merge bằng commit `e7d9690` để không mất working tree.
Chỉ có conflict `contracts/CHANGELOG.md`; đã giữ cả CR-003 và contract 1.1.0 của backend.

## Kết quả kiểm tra trên cây merge

| Check | Kết quả |
| --- | --- |
| AI unit/contract/guardrail | **120/120 passed** |
| Full API Vitest, gồm QQ-04/task/approval | **67/67 passed** |
| Full worker, HTTP adapter/routing/workflow/file store/kill-recovery | **48/48 passed** |
| PostgreSQL integration, migration 001 + 002 | **40/40 passed**, gồm 6 case mới workflow/ledger |
| Production API HTTP health + CORS/preflight | **3/3 passed**, Next start riêng trên port 4404, đã dừng |
| API typecheck + production build | **Passed**; build tái tạo `.next` types phù hợp Next 14 |
| Worker typecheck + build | **Passed** |
| QQ test suite + HTTP smoke script TypeScript | **Passed** |
| Worker → AI HTTP → backend QQ-04 | **Passed**, [8 checks và artifact](../../../qa/evidence/merge-my-be/worker-ai-http.json) |
| API standalone lint | **Blocked bởi config có sẵn**: ESLint 8.57.1 không export `eslint/config`, trong khi `eslint.config.mjs` import API đó |

Tổng **278 assertions/tests** ở năm nhóm test, không tính smoke HTTP. Không tính lại các case được runner gọi nhiều lần. [Summary](../../../qa/evidence/merge-my-be/validation.json), [DB evidence](../../../qa/evidence/merge-my-be/postgres-summary.json).

Production build thành công nhưng lúc prerender readiness có warning password của fallback DB user `postgres`; không thay credential local. DB integration dùng credential từ `infra/local/.env` trong bộ nhớ, không ghi secret vào evidence/git. Hai lần chạy integration cuối dùng database `qq_test_*` độc lập và cleanup passed; không migrate database ứng dụng.

## Các sửa cần thiết khi tích hợp

1. Worker cũ chép `context_snapshot_id`/`approved_source_versions` vào cả `JobRequest.payload`; strict Pydantic của Research/Growth Lead từ chối. Handler giờ tách envelope metadata, truyền prompt/model pin và synthetic flag đúng nơi. Regression routing và smoke HTTP thật xác nhận Research → Growth Lead chạy được; retry trả cùng artifact; foreign tenant trả permanent error.
2. Test integration stub cũ mong `PROPERTY_NOT_VERIFIED`, nhưng MY-02 trả `GOOGLE_CREDENTIALS_NOT_CONFIGURED` khi chưa có Google credentials. Cập nhật assertion theo capability matrix hiện hành; không làm lỏng kiểm tra `checked=false`, `verified=null`.
3. QQ migration runner phải bỏ `.down.sql` khỏi forward migrations sau khi nhánh BE thêm rollback script. Không chạy rollback khi dựng database test.
4. Thêm 6 integration PostgreSQL: persist campaign + SEO/social dependency; reject unknown role; reject foreign dependency không ghi row; scope artifact/task; approval owner/RBAC/hash conflict/audit; task HTTP handler viewer/editor.

Worker SIGKILL test và tsx smoke cần chạy ngoài sandbox do quyền Windows đối với subprocess/user info; rerun đã passed. Ban đầu `.next` types cũ gây typecheck lỗi; production build tái tạo cache, typecheck full API sau đó passed. Đây là cache, không phải sửa source để bỏ kiểm tra.

## Ranh giới chưa được nghiệm thu

QQ-04 vẫn `local_verified (mock)`. Sau merge đã có campaign/task/artifact/approval API và HTTP AI adapter + workflow runner. **Chưa có PostgreSQL `PlanRepository` nối QQ-04 validator với transaction/outbox và dependency artifact resolver.** Smoke dùng HTTP thật với fake model, SQLite tạm của AI và mock business repository; không phải live model hay broker delivery production. Không tick review thay Thiệu Quang/Thiệu.

Standalone lint cần task sửa đồng bộ ESLint config/dependencies. Không có thay đổi frontend, cloud provider hoặc publish. Merge và fix chỉ ở local, chưa push.

## Chạy lại smoke contract

Từ root repo:

```powershell
$env:QQ_PYTHON = 'C:/Users/ADMIN/AppData/Local/Python/pythoncore-3.14-64/python.exe'
node apps/api/node_modules/tsx/dist/cli.mjs qa/QQ_test/scripts/smoke-mybe-ai.ts
```

Smoke tự chọn port loopback, tạo token/SQLite tạm, dừng process AI và dọn đúng thư mục tạm sau khi chạy. PostgreSQL integration chạy qua `qa/QQ_test/scripts/run.mjs --db` với `QQ_PG_ADMIN_URL` local; runner chỉ tạo/drop database tên tự sinh `qq_test_*`.
