# Community & Lead Intake

Owner: Quang Quang. Task: QQ-06 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** khu vực triển khai đã tạo; các operation `community.response` hiện vẫn dùng bootstrap handler. Không dùng thư mục/registry này làm bằng chứng pipeline đã hoàn thành.

- Input: question + approved knowledge + published refs.
- Output/handoff: reply draft + evidence, lead/escalation proposal → human approval hoặc lead owner.
- Tool scope dự kiến: knowledge read + lead intake proposal; send qua executor. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
