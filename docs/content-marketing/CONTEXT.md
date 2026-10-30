# AGENT SỐ 4: CONTENT MARKETING — NGỮ CẢNH KỸ THUẬT (CONTEXT)

## 1. Kiến Trúc & Ranh Giới Hệ Thống
Agent Content Marketing đóng vai trò là nhà máy sản xuất nội dung mạng xã hội đa kênh (Facebook, TikTok) từ bài viết SEO dài, tuân thủ 3 tầng:
1. **AI Service (`services/ai`)**: Tiếp nhận `SeoArticle` -> Bóc tách `extracted_facts` (`f01`, `f02`...) -> Kiểm tra tài sản hình ảnh kép (`DualAssetManager`) -> Sinh nội dung đa kênh kèm ánh xạ câu (`sentence_fact_map`) -> Chạy bộ rào chắn xác định (`Deterministic Guardrails`) + Kiểm tra suy diễn logic (`NLI Entailment`) -> Vòng tự sửa phản tư (`Reflection Loop` <= 1.2 vòng) -> Đánh giá độc lập (`LLM Judge`).
2. **Backend API & CSDL (`apps/api`, PostgreSQL 17)**: Quản lý hàng đợi phê duyệt con người cấp 2 (`approvals` OCC ledger), lưu trữ tài sản ảnh (`media_assets`), khóa toàn vẹn `content_hash` và ghi nhận sự kiện xuất bản vào `outbox_events`. Mọi truy vấn bắt buộc ràng buộc `WHERE workspace_id = :ws_id`.
3. **Worker Executor (`apps/worker`)**: `PublishingOutboxRunner` quét `outbox_events` (`publishing.scheduled`), gọi `GatewayRecheckClient` xác thực tính toàn vẹn phiên bản và mã băm, sau đó gọi `FacebookPagePublisher` (Graph API v21.0) hoặc `TikTokPublisher` (Direct Post API). Tuyệt đối không tự động xuất bản nếu chưa qua duyệt.

## 2. Công Nghệ & Model Stack
- **AI Core**: Python 3.14 (quản lý môi trường qua `uv`), FastAPI, Pydantic v2, pytest.
- **Backend & Worker**: Node.js, TypeScript, Vitest, PostgreSQL 17 (Kysely / pg driver), PgBoss outbox.
- **Mô hình AI**:
  - *Generator*: Ghim cứng phiên bản (ví dụ `claude-3-5-sonnet-20241022` hoặc `gpt-4o-2024-08-06`). Cấm alias `latest`.
  - *LLM Judge*: Mô hình độc lập khác họ với Generator (ví dụ `gemini-1.5-pro` hoặc `gpt-4o`), hiệu chuẩn Cohen's Kappa >= 0.82.
  - *AI Image*: API Flux.1 [dev] hoặc Google Imagen 3. Tesseract OCR kiểm tra chữ/giá bịa đặt.

## 3. Schema `SeoArticle` Thực Tế Trong Repo
Được định nghĩa tại [schemas.py](file:///e:/HK_126/HocKyDoanhNghiep/AI_GROWTH_OS/services/ai/src/agents/seo/schemas.py), kế thừa từ `DraftResult` tại [contracts.py](file:///e:/HK_126/HocKyDoanhNghiep/AI_GROWTH_OS/services/ai/src/agents/contracts.py):
- **Trường từ `DraftResult`**: `workspace_id: UUID`, `context_snapshot_id: UUID`, `profile_version: int`, `version: int`, `status: Literal["draft", "needs_assets", "insufficient_data"]`, `missing_facts: list[str]`, `input_artifact_refs: list[RunArtifact]`, `requires_human_approval: Literal[True]`, `applied: Literal[False]`, `synthetic: bool`.
- **Trường riêng của `SeoArticle`**: `article_id: UUID`, `title: str`, `meta_description: str`, `primary_keyword: str`, `headings: list[str]`, `body_markdown: str`, `cta: str`, `citations: list[EvidenceRef]`, `seo_checks: dict[str, bool]`.
- *Lưu ý*: `content_hash` được tính và quản lý ở cấp `RunArtifact` (`services/ai/src/app/schemas.py`) và CSDL `content_artifacts`, không phải là thuộc tính trực tiếp nằm trên Pydantic model `SeoArticle`.

## 4. Quy Ước Đặt Tên & Ràng Buộc
- **Operations**: `content.generate` (sinh mới), `content.repurpose` (tái chế đa kênh), `content.quality_check` (thẩm định chất lượng).
- **Mã định danh**: Gói nội dung `pack_id` (`sp_...`), Sự thật trích xuất `fact_id` (`f01`, `f02`...), Tài sản ảnh `asset_id` (`ast_...`), Mẫu Golden Set `gs_...`.
- **Phân loại câu**: `factual` (bắt buộc map `fact_id` hợp lệ), `hook` / `cta` (gán `NONE` hoặc `SYSTEM_CTA`, tuân thủ Zero-Claim Rule - cấm chứa số liệu/khẳng định chưa kiểm chứng).
- **Trạng thái SocialPack**: `draft` (đủ facts và ảnh hợp lệ), `needs_assets` (thiếu ảnh thật sản phẩm/dịch vụ), `insufficient_data` (thiếu facts cốt lõi).

## 5. Hướng Dẫn Chạy Kiểm Thử (Tests)
- **Kiểm thử AI Service (Python / uv)**:
  - Chạy toàn bộ test suite AI: `uv run --project services/ai pytest services/ai/tests -q`
  - Chạy riêng test liên quan Content: `uv run --project services/ai pytest services/ai/tests/test_six_roles.py -k content -q`
- **Kiểm thử Worker (TypeScript)**:
  - Cài đặt dependencies (lần đầu): `npm --prefix apps/worker install`
  - Chạy vitest: `npm --prefix apps/worker test`
