# CR-003 — Growth Lead planning, QQ-04

Ngày 15/10/2026. Implementation candidate, local_verified với mock; chờ Thiệu Quang + Thiệu review. [Bàn giao và evidence](../../docs/coordination/sprint-3-weeks/bao-cao/2026-10-15-QQ04-HANDOFF.md).

## Thay đổi

`opportunity.score`, `strategy.generate`, `brief.generate` chuyển từ generic payload sang `GrowthLeadPayload` typed. Ba entry point trả cùng `CampaignPlan` tối thiểu; caller chỉ cần chọn một, ưu tiên `strategy.generate` cho campaign planning. `learning.analyze` vẫn generic/QQ-07. HTTP envelope `schema_version=1.0.0` và public OpenAPI không thay đổi.

Đầu vào bắt buộc: workspace, business profile, approved snapshot, research brief và research artifact; goal/CTA optional trong schema nhưng CTA thiếu làm plan `blocked`. Snapshot phải được pin trong JobRequest và khớp research/artifact. Hash research, source/version/quote, tenant/profile version và approval được kiểm tra trước accept run.

Model chỉ chọn finding index, tránh tự tạo source, tool, task hay business facts. Output có `contract_version=growth-lead-plan-v1`, selected_opportunity, objective, missing_facts, hai draft task với role/operation/tools/brief, dependencies và artifact refs. Mọi output giữ `requires_human_approval=true`, `applied=false`; synthetic được truyền từ research/request/fake provider.

Backend submit chỉ nhận `RunArtifact` ref. Repository phải tải AIResult/result/evidence đã persist; không tin nội dung plan client gửi. Validator chặn sai hash/version/workspace/context, unknown role/tool, source revoked, finding không thuộc research, duplicate task, cycle/unknown dependency và handoff sai. `accept` atomically persist plan/tasks/root outbox, dedup theo workspace/plan ID/input_version; nội dung đổi cùng key trả 409.

## Consumer migration / giới hạn

Payload generic cũ cho ba operation sẽ trả `422 INVALID_PAYLOAD`. Nếu pin `w1-bootstrap-1`, cần chuyển thành `growth-lead-v1` (pin sai trả 409). Đây là thay đổi typed input có ảnh hưởng compatibility; consumer phải chuyển theo [request example](../../services/ai/examples/growth_lead_request.py) trước release và chốt đánh giá version với reviewer.

Bundle role schema được cập nhật từ Pydantic bằng `python services/ai/scripts/export_qq04_contracts.py`; `schema_operations` chỉ áp dụng ba planning operation, contract learning thiết kế cũ được giữ riêng. API HTTP route TQ-03 chưa mount. Mock repository không phải DB/queue thật; worker hiện dùng operation aliases (`score`, `strategy`, `content`) và fake adapter, cần mapping sang AI operation codes, stable job/input_version và HTTP adapter khi tích hợp. Không dùng attempt làm khóa AI retry.

Social nhận `dependency_artifact_from=[seo_task_id]` vì SEO artifact chưa tồn tại ở thời điểm plan. Runner phải resolve output đúng workspace/version, pin ref thật và đáp ứng review policy trước dispatch; không tự tạo ID/hash giả. Full dispatch/resume thuộc MY-01/TQ-03, dedicated content thuộc QQ-05. Không có publish capability.
