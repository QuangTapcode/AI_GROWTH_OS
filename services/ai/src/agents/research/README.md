# Research & Trend

Owner: Quang Quang. Task: QQ-03 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** dedicated pipeline/schema/prompt cho `research.run` đã được đăng ký. Kết nối web bên ngoài và ingest thương mại vẫn fail-closed khi chưa có connector.

- Input: goal/profile/source refs + content inventory.
- Output/handoff: research brief + URLs/fetched_at + fit/missing facts → Growth Lead.
- Tool scope dự kiến: web/knowledge read. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
