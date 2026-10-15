# QQ_test — kiểm thử sau khi merge BE

Bộ này chạy lại các kịch bản đã kiểm tra khi tích hợp `thieuquang_be`/`my_be` vào `Quang-Quang`: database, workspace/member, phân quyền tenant, vòng đời source, lead, public content, integration stub và worker recovery. Mã test case nằm trong [TEST_CASES.md](TEST_CASES.md); kết quả baseline và lỗi cấu hình hiện tại ở [BASELINE.md](BASELINE.md).

## Chạy nhanh

Yêu cầu Node.js 24.14.1 (major 24), PostgreSQL với pgvector, và tài khoản local có quyền tạo database. Từ root repo:

```powershell
npm.cmd --prefix apps/api ci
npm.cmd --prefix apps/worker ci
npm.cmd --prefix qa/QQ_test ci
Copy-Item qa/QQ_test/.env.example qa/QQ_test/.env
# Sửa QQ_PG_ADMIN_URL trong qa/QQ_test/.env thành connection string local của bạn.
npm.cmd --prefix qa/QQ_test run typecheck
npm.cmd --prefix qa/QQ_test test
```

Không cần khởi động Next.js API, frontend hoặc AI cho lệnh `test`. Runner tạo database `qq_test_<timestamp>_<random>`, áp dụng migration đã commit, chạy integration rồi drop đúng database vừa tạo trong `finally`. Mỗi test có tenant/user/source synthetic riêng; không dùng fixture ID/token mẫu của lane khác. Thiếu cấu hình, migration lỗi hoặc assertion lỗi đều trả exit code khác 0, không tự skip.

## Các lệnh

| Lệnh, dùng với `npm.cmd --prefix qa/QQ_test run ...` | Phạm vi |
| --- | --- |
| `test` | 33 API unit + 29 worker regression + 34 integration PostgreSQL; kiểm tra migration trước integration |
| `test:db` | Migration và 34 integration test mới trong `tests/be.integration.test.ts` |
| `test:unit` | 33 API unit và 29 worker test hiện có; không cần database |
| `typecheck` | TypeScript của suite và các source BE được import; không đọc cache `.next` |
| `test:checks` | API lint/typecheck/build và worker typecheck/build theo package hiện tại; ghi nhận cả gate lỗi |
| `test:ai` | 85 test AI unit/contract/guardrail hiện có, fake provider |
| `test:ai:live` | Frozen eval 30 ca với Ollama local/model đã cài; exit 1 nếu không đạt threshold |

AI là phần tùy chọn, chạy riêng để không yêu cầu Python/model cho mọi test BE:

```powershell
$env:QQ_PYTHON = 'C:\Users\ADMIN\AppData\Local\Python\bin\python.exe'
& $env:QQ_PYTHON -m pip install -r services/ai/requirements.lock
npm.cmd --prefix qa/QQ_test run test:ai
# Ollama phải có qwen3:4b-instruct và embeddinggemma:latest từ trước.
npm.cmd --prefix qa/QQ_test run test:ai:live
```

`QQ_PG_ADMIN_URL` và `QQ_PYTHON` cũng có thể đặt trong môi trường shell hoặc `.env`. Không đưa credentials vào git; `.env` đã được ignore.

## Evidence và cách đọc kết quả

Mỗi lần chạy tạo `results/<UTC timestamp>-<random>/` gồm `summary.json`, log từng stage và JSON/JUnit của test runner. Summary ghi commit, branch, dirty state, thời gian, exit code từng stage và cleanup. `results/` được ignore vì là artifact phát sinh. Dùng log/report của lần chạy đó khi review merge; không suy ra đạt từ baseline cũ.

`test:unit` gọi đúng các suite nghiệp vụ đã có, không chép lại source test. API `bootstrap.test.mjs` dùng `node:test` và cần server nên không bị nạp nhầm vào Vitest. File store/recovery của worker được kiểm tra bằng cả memory/file adapter và tiến trình bị kill thật; AI/CMS trong worker vẫn là fake.

34 integration test gọi service và route handler thật với PostgreSQL thật. Nhóm `QQ-HTTP-*` kiểm tra request/response trong process, không mở socket HTTP và không thay thế production build, middleware/router hoặc browser E2E. Token `dev_user_<uuid>` là cơ chế local hiện tại của BE, không chứng minh auth production. Lead/public content/GA4/GSC regression dùng repository in-memory/stub hiện có, không chứng minh persistence hay kết nối Google thật.

## Khi runner không chạy

- `QQ_PG_ADMIN_URL` thiếu: cấu hình `.env` hoặc biến môi trường; không có default tự trỏ vào business database.
- PostgreSQL chưa bật/sai password: kiểm tra local container và port (baseline dùng `127.0.0.1:15432`).
- `permission denied to create database` hoặc extension lỗi: dùng tài khoản test local có CREATEDB và pgvector/uuid-ossp.
- Không tìm thấy Vitest hoặc source dependency: chạy lại ba lệnh `npm ci` ở trên.
- `test:checks` thất bại: đọc log từng gate và [BASELINE.md](BASELINE.md); suite không sửa product source để làm kết quả xanh.
- Process bị dừng cưỡng bức ở cấp hệ điều hành có thể bỏ qua `finally`; khi đó kiểm tra database `qq_test_*` do lần chạy đó tạo. Không drop database ứng dụng.
