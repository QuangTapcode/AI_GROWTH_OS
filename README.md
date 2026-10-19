# AI Growth OS

Nền tảng điều phối 6 agent Marketing cho TripC: Research → Growth Lead → SEO/Content → human approval → xuất bản → Community/lead → Performance → learning/task tiếp.

**Baseline hiện hành: 7 người, 3 tuần (15/10–04/11/2026 dự kiến), Level 2.** AI xử lý/bàn giao nội bộ, con người duyệt trước nội dung ra ngoài. Sáu pipeline còn đang triển khai; registry và scaffold chưa phải hệ thống chạy hoàn chỉnh.

## Bắt đầu

1. Mở [TODO tổng](TODO.md) và [kế hoạch 3 tuần + TODO từng người](docs/coordination/sprint-3-weeks/README.md).
2. Đọc [roster/quyền sửa](docs/coordination/TEAM.md), [cấu trúc và data flow](docs/architecture/SIX-AGENT-RESTRUCTURE.md).
3. Tra [bản đồ tái sử dụng](docs/coordination/sprint-3-weeks/bao-cao/2026-10-14-REUSE-MAP.md), chọn task rồi chốt contract/AC với consumer trước code.
4. Handoff có task ID, PR/build, schema/version và evidence. Mock/local khác tích hợp/live; Done cần reviewer xác nhận.

## Các package

| Đường dẫn | Trách nhiệm | Owner | Hướng dẫn chạy |
| --- | --- | --- | --- |
| `apps/api` | Auth/tenant, dữ liệu, contracts, approval và public API | Thiệu Quang; Mỹ phụ trách integration slices | [API](apps/api/README.md) |
| `apps/worker` | Jobs/workflow, AI HTTP, publisher, sync/recovery | Mỹ | [Worker](apps/worker/README.md) |
| `services/ai` | Shared RAG/providers và 6 role pipelines | Quang Quang | [AI](services/ai/README.md) |
| `apps/web` | Dashboard, editor, approval, lead/report | Tiến | [Web](apps/web/README.md) |
| `apps/pilot` | Website/blog/form TripC | Tiến | [Pilot](apps/pilot/README.md) |
| `database`, `contracts` | Schema/migration/policies và HTTP/JSON boundary | Thiệu Quang | [DB](database/README.md), [Contracts](contracts/README.md) |
| `design`, `docs/ba`, `qa` | UX, nghiệp vụ, kiểm chứng | Trường, Dương, Thiệu | [Design](design/README.md), [BA](docs/ba/README.md), [QA](qa/README.md) |

Giữ runtime TypeScript/SQL/Python và manifests/lockfiles riêng hiện có. Credential ở server; AI không giữ khóa CMS/OAuth và không tự duyệt. Orchestrator/executor là hạ tầng, không tính thêm agent.

## Local/staging

Yêu cầu: Windows + PowerShell, Docker Desktop, Node.js 24, Python 3.12–3.14 (AI service). Chạy từ thư mục repo:

```powershell
.\infra\staging\setup-local.ps1   # lần đầu: Docker Postgres/SearXNG, apps/api/.env.local, migrate + seed (in mật khẩu demo)
.\infra\staging\start.ps1         # build + chạy API :4000, web :3000, pilot :3001
.\infra\staging\stop.ps1
```

Đăng nhập http://localhost:3000/login bằng `owner.tripc.demo@gmail.com` (hoặc `editor.`/`viewer.`) với mật khẩu `db:seed` in ra. AI service (:5000) và worker chạy riêng nếu cần:

```powershell
$env:LLM_PROVIDER_MODE = "fake"; python -m uvicorn src.app.main:app --app-dir services/ai --host 127.0.0.1 --port 5000
cd apps/worker; npm ci; $env:QUEUE_PORT = "15432"; $env:QUEUE_PASSWORD = "<POSTGRES_PASSWORD trong infra/local/.env>"; npx tsx src/main.ts
```

Public staging `https://aigrowthos-staging.pages.dev/` deploy bằng `infra\staging\cloudflare-pages\deploy.ps1` (xem [staging README](infra/staging/README.md)).

[Hướng dẫn staging](infra/staging/README.md) có env/build/start/health. Launcher không chứng minh nghiệp vụ đã hoàn thành. Xem README từng package cho lệnh phát triển và các giới hạn fake/live; không đổi credential hoặc chạy publish/ads chỉ vì khởi động app.

## Tài liệu thực thi

[Kế hoạch 7 người/3 tuần](docs/coordination/sprint-3-weeks/README.md) là baseline hiện hành. Các checklist/bản lưu trùng đã được xóa theo yêu cầu ngày 14/10; [biên bản dọn dẹp](docs/coordination/sprint-3-weeks/bao-cao/2026-10-14-CLEANUP.md) ghi phạm vi. Audit, tài liệu nguồn và đặc tả còn dùng được tiếp tục làm căn cứ kỹ thuật.
