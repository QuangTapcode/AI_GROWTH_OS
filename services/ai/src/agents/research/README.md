# Research & Trend

Owner: Quang Quang. Task: QQ-03 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái (26/10):** `research-v5` chạy live trên dữ liệu thật của TripC (qwen3:8b, `synthetic=false`) và bàn giao được cho Growth Lead. Evidence: [research-real-2026-10-26](../../../../../qa/evidence/research-real-2026-10-26/research-real-pipeline.json). Chưa có chữ ký reviewer.

## Luồng dữ liệu thật

1. **Tìm xu hướng** — `POST /v1/workspaces/:id/research-discovery` chạy ≤3 truy vấn SearXNG sinh từ hồ sơ (`PILOT_LIMITS`). Mọi kết quả vào `trend_signals` (chỉ query/rank/title/URL, không lưu nội dung trang). Bộ lập lịch (`agent_automation`) tự làm mới trước mỗi `research.run` khi tín hiệu cũ hơn `interval_hours`; lỗi search không chặn Research mà ghi vào `last_error`.
2. **Chọn nguồn** — chỉ domain trong [`sourcePolicy.ts`](../../../../../apps/api/src/modules/research/sourcePolicy.ts) được tải nội dung: TripC first-party (tripc.ai/tripc.vn), Wikivoyage/Wikipedia (CC BY-SA 4.0), cổng du lịch chính thức. Owner thêm URL qua Sources cũng tự nhận license theo policy.
3. **Nạp nguồn** — worker `SourceIngestRunner` → AI `knowledge.ingest` (allowlist + robots.txt RFC 9309 + User-Agent có liên hệ). Trang SPA của TripC được dựng bằng Edge headless (`BrowserRenderer`, bỏ banner fixed/sticky và danh sách link) rồi gửi HTML. Kết quả → `needs_review`; tối đa 3 lần, lỗi ở `ingest_error`.
4. **Duyệt** — owner duyệt trên trang agent Research; duyệt chuyển chunk sang version mới và tạo knowledge context mới.
5. **Research** — chunk được chọn theo từng chủ đề xu hướng trước, rồi theo độ liên quan với hồ sơ (bỏ tên địa danh). Kết quả có `trend_coverage` và `source_gap:<topic>` khi chủ đề đang được tìm không có nguồn.

## Kiểm tra cứng (không phụ thuộc model)

| Kiểm tra | Hành động |
|---|---|
| Trích dẫn không có trong đoạn nguồn (cho phép khác hoa/thường, khoảng trắng; lưu đúng span gốc) | `UNGROUNDED_IDEA_DROPPED` |
| Trích dẫn < 6 từ (tiêu đề, cụm từ) | `WEAK_QUOTE_DROPPED` |
| Khẳng định nhu cầu ("demand", "search volume"…) | `DEMAND_CLAIM_DROPPED` |
| Lập luận nhắc tới search/ranking (không kiểm chứng được) | `LANDSCAPE_CLAIM_DROPPED` |
| Số/giá không có trong nguồn | `UNSUPPORTED_CLAIM_DROPPED` |
| Đoạn nguồn tự ghi "(updated <năm>)" cũ hơn 3 năm | giữ, thêm `stale_evidence:<năm>`; Growth Lead chặn nếu là cơ hội được chọn |

Tín hiệu xu hướng gắn vào finding do code khớp (bỏ địa danh và từ đệm như "best/guide"), kèm `previous_rank`/`is_new` so với lần tìm trước.

## Hợp đồng

- Input: profile/goal + snapshot đã duyệt + `trend_signals` + content inventory.
- Output/handoff: research brief (findings có quote/URL/license/`evidence_updated`/`trend_signals`, `trend_coverage`, missing facts) → Growth Lead (`strategy.generate`).
- Tool scope: web/knowledge read. Backend enforce; prompt không cấp quyền.
- Done còn lại: role eval có QA review và chữ ký reviewer.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
