# Contract changelog

## 2.0.0 — 24/10/2026 — SocialPack v2 Schema Freeze (CM-01)

- Đóng băng schema `SocialPack` v2.0 (`contracts/schemas/social_pack_v2.json`) cho Agent số 4: Content Marketing theo kế hoạch v2.0:
  - Models cốt lõi: `SocialPack`, `FactItem`, `SentenceMap`, `CTAObject`, `AssetV2`, `AIImageMetadata`, `CitationItem`.
  - Hỗ trợ đầy đủ Request/Response cho 3 operations: `content.generate`, `content.repurpose`, `content.quality_check`.
  - Bộ rào chắn xác định:
    - Kênh phân phối `channels`: chỉ chấp nhận `facebook`, `tiktok`.
    - Trạng thái `status`: `draft`, `needs_assets`, `insufficient_data`.
    - Quy tắc Zero-Claim cho câu phi sự thật: câu `hook` và `cta` bắt buộc gán `NONE` hoặc `SYSTEM_CTA` và cấm gắn Fact ID thật; câu `factual` bắt buộc có danh sách Fact ID hợp lệ và tồn tại trong `extracted_facts`.
    - Chính sách Dual-Asset: ảnh `real_asset` bắt buộc có `url`, `license`, `attribution`; ảnh `ai_generated` bắt buộc có `ai_image_meta` và `alt_text` bắt đầu bằng `[Ảnh minh họa AI]`.
  - Hàm băm toàn vẹn `content_hash` (SHA-256 trên Canonical JSON nghiệp vụ) phân định minh bạch các trường nội dung vs metadata vòng đời.


## 17/10/2026 — CR-004 six-role pilot candidate

Dedicated pipelines for all six roles and learning, Research v2 keywords/user_need, plan v2 deadlines/estimated score, scoped draft APIs, PostgreSQL context/ledger/outbox and owner-gated dependency/learning tasks. [Compatibility and validation](changes/CR-004-six-role-pilot-integration.md). Candidate schemas are reviewable; production freeze/signoff remains pending.

## 16/10/2026 — QQ-01/02/03 reviewer checks, candidate

Research preflight yêu cầu snapshot pin và profile version; trả `SNAPSHOT_REQUIRED`/`PROFILE_VERSION_REQUIRED` khi thiếu. Output guard loại quote whitespace. Input validation chặt hơn, consumer cần migrate; chưa ghi nhận reviewer approval/version freeze. [CR-002 update](changes/CR-002-six-agent-pipelines.md), [30 reviewer test cases](../docs/coordination/sprint-3-weeks/bao-cao/2026-10-16-QQ01-03-TEST-CASES.md).

## 15/10/2026 — CR-003 QQ-04 implementation candidate

Growth Lead `opportunity.score`, `strategy.generate`, `brief.generate` dùng typed payload và campaign/task proposal `growth-lead-v1`; learning vẫn bootstrap. Schema bundle, backend plan validator và mock transaction/outbox có evidence local. Chưa mount HTTP route, chưa nối PostgreSQL/broker; public OpenAPI giữ nguyên. Consumer migration/version review trong [CR-003](changes/CR-003-growth-lead-plans.md).

## 1.1.0 — 15/10/2026 — First Slice Freeze: Task, Artifact, Approval (TQ-01)

- Đóng băng OpenAPI 3.1.0 contract (`contracts/schemas/openapi.json`) phiên bản 1.1.0:
  - Workflow tasks: `/v1/workspaces/{workspace_id}/tasks`, `/v1/workspaces/{workspace_id}/tasks/{task_id}` (`WorkflowTask`, `WorkflowTaskCreate`).
  - Content/Evidence artifacts: `/v1/workspaces/{workspace_id}/artifacts`, `/v1/workspaces/{workspace_id}/artifacts/{artifact_id}` (`Artifact`, `EvidenceRef`).
  - Human review approvals: `/v1/workspaces/{workspace_id}/approvals`, `/v1/workspaces/{workspace_id}/approvals/{approval_id}/review` (`ApprovalRecord`, `ApprovalReviewRequest`).
- Bổ sung synthetic canonical examples:
  - `contracts/examples/task-run.json`: cấu trúc task chạy pipeline research với dependency và snapshot.
  - `contracts/examples/artifact-evidence.json`: cấu trúc artifact chứa SHA-256 content hash và mảng evidence refs.
  - `contracts/examples/approval-decision.json`: bản ghi phê duyệt với actor, target version/hash, và OCC audit trail.
- Khớp nối hoàn toàn với AI internal 6-role contracts (`CR-002`) cho giai đoạn TQ-01 -> TQ-04 / MY-01.

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

## 14/10/2026 — CR-002 implementation candidate, awaiting review

AI internal: six-role schema bundle/registry; typed research.run input; optional AIResult.artifact; optional snapshot for growth_map.suggest. Public OpenAPI unchanged. Consumer migration and version assessment in [CR-002](changes/CR-002-six-agent-pipelines.md).
