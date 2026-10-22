# SEO Worker

Owner: Quang Quang. Task: QQ-05 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** dedicated pipeline/schema/prompt cho `seo.audit`, `seo.local_draft`, `content.refresh` đã được đăng ký. Approval/version/hash gate ở BE vẫn là điều kiện để publish.

- Input: SEO brief + approved facts + inventory.
- Output/handoff: blog/FAQ, title/meta, citations, checklist và version → Content và human approval.
- Tool scope dự kiến: knowledge/content read + draft. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
