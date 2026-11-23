# Performance Marketing

Owner: Quang Quang. Task: QQ-06 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái 10/11/2026:** `analytics.report` và `experiment.hypothesis` dùng pipeline xác định `performance-v3`; Learning dùng `learning-v2` và ghép đúng lead/metric window. Phép tính không cần LLM. Còn cần reviewer độc lập và kiểm chứng provider live trước nghiệm thu production.

- Input: metric snapshots + publication refs + lead aggregates.
- Output/handoff: report/proposal có evidence hoặc insufficient_data → Growth Lead.
- Tool scope dự kiến: analytics/ads read-only; không ads mutation. Gateway backend phải enforce; prompt không cấp quyền.
- Đã có input/output typed, so sánh baseline/KPI, coverage/missing/currency, content/channel aggregates và đề xuất Research cần owner duyệt. Backend/pilot thực thi thử nghiệm hai CTA, assignment ổn định, exposure chống trùng và conversion từ lead đã lưu. Không suy diễn ROI/ROAS khi thiếu revenue/attribution.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).

[CR-007: contract và công thức](../../../../../contracts/changes/CR-007-performance-measurement.md) · [Báo cáo kiểm chứng tổng hợp](../../../../../docs/reports/PERFORMANCE-VERIFICATION-2026-11-10.md).
