# DU-04 · Bàn giao AC Blog, Social Pack, Kiểm duyệt (HITL) và Publisher

## 1\. Mục tiêu nhiệm vụ (Objective)

Hoàn thiện toàn bộ luồng tạo lập nội dung đa kênh (Blog \& Social Pack) từ AI Agent, chuẩn hóa cơ chế kiểm duyệt nội dung (Human-in-the-Loop - HITL), cơ chế quản lý phiên bản (`Version Control`), và đảm bảo tác vụ xuất bản (`Publisher`) chỉ kích hoạt khi dữ liệu đạt chuẩn an toàn tuyệt đối, tránh phát hành nhầm bản thảo (`Draft`) hoặc phiên bản cũ chưa qua kiểm định.

\---

## 2\. Chi tiết Công việc \& Đầu ra (Deliverables \& Done Criteria)

### A. Định nghĩa Ví dụ Input / Output chuẩn (Acceptance Criteria)

* **Input (Đầu vào):**

  * Bản ghi `content\\\_briefs` đã được phê duyệt ở Phase 3 (`campaigns` \& `growth\\\_opportunities`).
  * Tài liệu ngữ cảnh từ bảng `sources` và `source\\\_chunks` thông qua vector database (`pgvector`).
* **Output (Đầu ra):**

  * Bài viết Blog hoàn chỉnh lưu trong bảng `contents` dưới định dạng Markdown (`body\\\_markdown`).
  * Bộ gói mạng xã hội tương ứng (Social Pack gồm caption cho Facebook, LinkedIn, Instagram) được lưu trữ tại bảng `content\\\_versions`.
  * Các thẻ trích dẫn nguồn (`provenance\\\_citations` / `provenance\\\_tags`) gắn liền với từng đoạn nội dung nhằm loại bỏ hoàn toàn hiện tượng bịa đặt thông tin (`Hallucination`).

### B. Checklist Kiểm định Chất lượng \& Guardrails (4 Tiêu chí cốt lõi)

Trước khi hệ thống chuyển trạng thái nội dung sang hàng đợi chờ duyệt (`Review Queue`), nội dung bắt buộc phải vượt qua 4 tiêu chí kiểm tra tự động:

1. **Facts Check (Sự thật):** Không có thông tin sai lệch về giá cả, địa chỉ, hoặc chính sách (đối chiếu trực tiếp với Knowledge Base của workspace như TripC Đà Nẵng).
2. **SEO Optimization:** Đảm bảo từ khóa chính xuất hiện ở Tiêu đề (`Title`), thẻ `H1`, các thẻ Heading phụ và duy trì mật độ từ khóa tự nhiên.
3. **Brand Voice Fit:** Giọng văn phải khớp hoàn toàn với cấu hình `tone\\\_preset` đã khai báo trong bảng `business\\\_profiles`.
4. **Asset Validation:** Hình ảnh và đường dẫn (`URL`) đính kèm phải hợp lệ, không gặp lỗi link gãy hoặc lỗi 404.

### C. Quản lý Phiên bản \& Cơ chế Hủy duyệt (Version Control \& Rejection Handling)

* **Sửa đổi phiên bản (`content\\\_versions`):** Khi người dùng chỉnh sửa trực tiếp nội dung trên giao diện hoặc yêu cầu AI viết bổ sung, hệ thống tự động sinh một `version\\\_id` mới (ví dụ: nâng từ `v1.0` lên `v1.1`), đồng thời giữ lại toàn bộ lịch sử các bản cũ phục vụ cho việc đối soát lịch sử (`Audit Log`).
* **Hủy duyệt / Từ chối (`Reject`):** Nếu nội dung không đạt yêu cầu, người dùng click vào nút `\\\[Request Changes]` hoặc `\\\[Reject]`, hệ thống sẽ ghi nhận quyết định vào bảng `content\\\_approvals`, đồng thời khóa chặt phiên bản đó lại, ngăn chặn tuyệt đối việc đưa vào lịch xuất bản.

### D. Cơ chế An toàn cho Publisher (Anti-Publishing Drafts \& Guardrails)

* **Chặn xuất bản bản thảo (No Draft Publishing):** Tác vụ trong bảng `publishing\\\_jobs` chỉ được khởi tạo khi liên kết với một `version\\\_id` có trạng thái duyệt quyết định là `decision = 'Approved'`.
* **Kiểm tra phiên bản cũ / Mất hiệu lực (Stale Approval Check):** Sau khi bài viết đã được duyệt, nếu nội dung gốc bị chỉnh sửa lại thành bản nháp (`Draft`), hệ thống sẽ tự động vô hiệu hóa lệnh duyệt cũ (chuyển sang trạng thái `Stale`), bắt buộc bài viết phải trải qua một lượt bấm `\\\[APPROVE]` hoàn toàn mới thì mới được phép đưa lên lịch phát hành.
* **Cờ Kill-switch toàn cục:** Tác vụ xuất bản luôn kiểm tra trạng thái cờ `publishing\\\_paused` trong bảng `workspaces`. Nếu cờ này bật `true`, toàn bộ lịch trình xuất bản tự động **tạm dừng khẩn cấp** ngay lập tức.

\---

