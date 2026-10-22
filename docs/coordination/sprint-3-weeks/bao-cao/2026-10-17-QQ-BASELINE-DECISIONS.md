# QQ-01 — Baseline và quyết định triển khai 17/10/2026

Đây là quyết định kỹ thuật trong phạm vi yêu cầu hoàn thành QQ-01–09. Chưa phải chữ ký nghiệm thu của Dương, Mỹ hoặc Thiệu. Các nhận xét ngày 16/10 được giữ làm lịch sử; evidence mới nằm trong [handoff](2026-10-17-QQ-ALL-HANDOFF.md).

## Scope và mapping

Giữ 7 người: Quang Quang AI/PM/PO; Dương BA; Trường UI/UX; Thiệu Quang API/data/contracts; Mỹ worker/integrations; Tiến FE admin/pilot; Thiệu QA hai lane. Orchestrator/executor là hạ tầng, không tính thêm agent.

| Tên BA | Runtime role | Operation chính | Đầu ra |
| --- | --- | --- | --- |
| Research & Trend | `research` | `research.run` | Topic, keywords, user_need, fit, quote, URL, fetched_at |
| Growth Lead | `growth_lead` | `strategy.generate`, `learning.analyze` | Campaign/DAG và task vòng tiếp theo |
| SEO Worker | `seo` | `seo.local_draft` | Blog/title/meta/headings/links/citations |
| Content Marketing | `content` | `content.repurpose` | Caption/CTA/asset refs/parent/version |
| Community | `community` | `community.response` | Grounded reply/escalation/lead proposal |
| Performance | `performance` | `analytics.report` | Snapshot/window/observations/proposal |

Schema thực thi: [bundle](../../../../contracts/schemas/ai-six-role-contracts.json). Cả 6 role có handler/schema riêng; Performance và learning dùng quy tắc xác định để bảo toàn số liệu, không cần gọi LLM. Các operation bổ sung trong cùng role tái sử dụng pipeline tối thiểu của role.

## Policy áp dụng cho candidate

- Owner/editor tạo draft và enqueue nội bộ. Chỉ owner đang active được duyệt output hoặc task learning, pin chính xác version/hash. Không diễn giải quyền editor trong bản BA khác thành quyền publish.
- Approval trong candidate chỉ mở dependency nội bộ; không tự publish/send/spend. Social dùng `manual_review_pack` cho đến khi capability thật được xác minh.
- Handoff API dùng role ID như bảng; AI result `draft/needs_assets/insufficient_data`; DB task `queued/awaiting_approval/completed/failed`. `completed` của task duyệt không đồng nghĩa bài đã live.
- Cùng task ID và payload trả replay; đổi payload trả 409. Campaign/tasks/outbox commit cùng transaction. Learning có dedup theo workspace + refs/version + iteration, tối đa 3 vòng và 1 task mỗi kết quả trong backend.
- Điểm cơ hội = tích 6 factor 0–5, luôn ghi `estimated`; factor chưa có là null và score null, không coi là search volume thật. `0` của metrics khác missing/null; thiếu dữ liệu không kết luận causal lift.
- Profile/source/snapshot/version phải đúng workspace; source bị revoke, profile mới hoặc context mới khiến job/approval cũ bị chặn. Chunks phải thuộc version sau source review.
- License/attribution của asset mock chỉ phục vụ test; không phải chứng nhận quyền sử dụng ảnh TripC. Không tự tạo facts/approval thật từ fixture.
- Lead replay giữ policy API hiện có: cùng key/payload replay; đổi nội dung 409. Community chỉ đề xuất, chưa tạo contact khi thiếu owner/consent.

## Budget và estimate

Giữ context 4096, input 2800, output 1024 tokens; một LLM job tại một thời điểm trong mỗi process AI, tối đa 2 provider calls/job bao gồm repair. Triển khai nhiều process phải có giới hạn đồng thời ở hạ tầng trước rollout; chưa chứng minh distributed semaphore.

Estimate tương đối giữ QQ-01/02/03/04/06/07/08/09 = M, QQ-05 = L (SEO rồi Content). Một task chính + lane sửa lỗi mỗi người, Quang Quang dùng chung capacity AI/PM/PO; không tự chuyển thành cam kết giờ. Cần Dương/Mỹ xác nhận mapping, scope và capacity tại gate D2; Thiệu xác nhận rubric/QA độc lập.

## Còn cần người phụ trách xác nhận

Dương: scope/fit/keywords/user_need và policy BA. Mỹ: adapter/outbox/recovery/connector. Thiệu Quang: migration/API/contract rollout. Thiệu: chạy độc lập dataset và UAT. Không tự tick các dependency DU/TQ/MY/TH/TI.
