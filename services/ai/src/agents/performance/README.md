# Performance Marketing

Owner: Quang Quang. Task: QQ-06 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** dedicated pipeline/schema/prompt cho `analytics.report` và `experiment.hypothesis` đã đăng ký; metrics ngoại vi fail-closed thành `insufficient_data` khi chưa có GA4/GSC/Meta Ads.

- Input: metric snapshots + publication refs + lead aggregates.
- Output/handoff: report/proposal có evidence hoặc insufficient_data → Growth Lead.
- Tool scope dự kiến: analytics/ads read-only; không ads mutation. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
