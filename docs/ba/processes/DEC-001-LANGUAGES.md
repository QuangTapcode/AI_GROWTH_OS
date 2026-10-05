# DEC-001 — TypeScript cho FE/BE, Python cho AI

- Ngày: 05/10/2026.
- Trạng thái: **confirmed_by_user**.
- PO/PM theo roster: Quang Quang.
- Nguồn: người dùng chỉ định ngôn ngữ và bảng vai trò trong phiên W1-PM-01.

## Quyết định

FE và BE/worker dùng TypeScript, database dùng SQL; AI dùng Python. FE theo Next.js/React/Tailwind; AI theo Python/FastAPI làm lựa chọn cơ sở; SDK LLM, LangGraph chỉ khi cần. Website pilot và CMS tối giản đã được người dùng chọn Next.js/TypeScript; tổ chức Next.js API, runtime versions/package tooling/queue/hosting vẫn là đầu ra W1-BE-01, không coi đã triển khai.

## Hệ quả

- `apps/pilot`, `apps/web`, `apps/api`, `apps/worker` giữ package/lockfile TypeScript riêng theo đơn vị; `services/ai` cần `pyproject.toml` và dependency lock riêng khi bootstrap.
- QA1 TypeScript/Playwright; QA2 Python/pytest/HTTP/SQL. Thanh đảm nhận cả hai lane nhưng môi trường/dependencies tách.
- HTTP/JSON + OpenAPI/JSON Schema là contract chung; SDK types có thể sinh riêng TypeScript/Python. Không yêu cầu Python import package source của FE/BE.
- CI AI/QA2 dùng Python lint/type checks/pytest/evals; CI FE/BE dùng TypeScript lint/typecheck/tests/build. Hiện chưa có manifest/CI/test runners.

Xem [TEAM](../../coordination/TEAM.md), [backlog](../../coordination/backlog/README.md) và [contract](../../../contracts/README.md).
