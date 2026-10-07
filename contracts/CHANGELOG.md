# Contract changelog

## 1.0.0 — 06/10/2026 — Baseline Freeze W1

- Đóng băng OpenAPI 3.1.0 contract (`contracts/schemas/openapi.json`) cho các endpoint tuần 1:
  - System probes: `/healthz`, `/readyz`.
  - M01 Workspaces & Members: `/v1/workspaces`, `/v1/workspaces/{workspace_id}`, `/v1/workspaces/{workspace_id}/members`.
  - M02 Sources & Knowledge: `/v1/workspaces/{workspace_id}/sources`, `/v1/workspaces/{workspace_id}/sources/{source_id}/review`.
  - M03 Goals: `/v1/workspaces/{workspace_id}/goals`.
  - Pilot Lead Form: `/public/v1/sites/{site_id}/leads`.
- Cung cấp synthetic examples canonical:
  - `contracts/examples/tripc-workspace.json`: payload workspace TripC Da Nang.
  - `contracts/examples/lead-submission.json`: payload lead submission từ expat renter/coworker.
- Đảm bảo boundary isolation:
  - Không leak thông tin private / draft / internal evidence ra public endpoints.
  - Mọi mutation endpoint yêu cầu actor context và kiểm tra RBAC (Owner/Editor/Viewer).

## 0.2.0 — 05/10/2026 — Draft / pilot 4 tuần

- Đổi mã module sang M01–M16 theo kế hoạch mới; bổ sung strategy/brief approvals, SEO/community/UTM, experiment/learning interfaces.
- Bổ sung metric snapshots, stable visitor assignment/event dedup và learning approval boundary.
- Chưa có OpenAPI/JSON Schema/validator hoặc services thật; bản catalog vẫn là draft cần đội chốt tuần 1.


## 0.1.0 — 05/10/2026 — Draft

- Tạo catalog public API, AI run boundary, state machines và quy tắc dữ liệu.
- Tạo examples synthetic cho content, job và missing/zero analytics.
- Chưa có schema/OpenAPI, validator hay consumer tests. Chưa phát hành contract 1.0.0.
