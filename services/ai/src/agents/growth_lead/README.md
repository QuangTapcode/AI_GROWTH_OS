# Growth Lead & Analyst

Owner: Quang Quang. Task: QQ-04, QQ-07 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** khu vực triển khai đã tạo; các operation `opportunity.score, strategy.generate, brief.generate, learning.analyze` hiện vẫn dùng bootstrap handler. Không dùng thư mục/registry này làm bằng chứng pipeline đã hoàn thành.

- Input: research + goals + report artifacts.
- Output/handoff: campaign/task proposal, briefs, learning, next-task proposal → SEO, Content và worker validate plan.
- Tool scope dự kiến: campaign/task proposal + aggregate reads. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
