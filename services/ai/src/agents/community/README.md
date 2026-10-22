# Community & Lead Intake

Owner: Quang Quang. Task: QQ-06 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** dedicated handler đã được đăng ký cho `community.response`; pipeline dùng shared RAG/retrieval và chỉ trả draft có evidence. Phần end-to-end qua connector, lead persistence và live campaign vẫn cần nghiệm thu theo [checklist sáu agent](../../../../../docs/coordination/AGENT-TEST-DEV-TODO.md).

- Input: question + approved knowledge + published refs.
- Output/handoff: reply draft + evidence, lead/escalation proposal → human approval hoặc lead owner.
- Tool scope dự kiến: knowledge read + lead intake proposal; send qua executor. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
