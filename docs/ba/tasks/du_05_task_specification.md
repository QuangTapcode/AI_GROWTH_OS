# DU-05 · Bàn giao AC Community, Lead và Performance

## 1\. Mục tiêu nhiệm vụ (Objective)

Hoàn thiện toàn bộ luồng vận hành của **Community \& Intake Agent** và **Performance \& Analytics Agent**. Nhiệm vụ này tập trung vào việc chuẩn hóa hệ thống tiếp nhận khách hàng tiềm năng (`leads`), cơ chế chống trùng lặp dữ liệu (`deduplication`), quản lý quyền riêng tư (`consent`), quy trình bàn giao cho đội Sales (`Sales Handoff`), cũng như cơ chế đo lường hiệu suất, phân tích đề xuất (`proposal`) kèm giả thuyết tăng trưởng và tích hợp dữ liệu quảng cáo ở chế độ chỉ đọc (`Ads read-only`).

## 2\. Chi tiết Công việc \& Đầu ra (Deliverables \& Done Criteria)

### A. Quản lý Lead, Chống Trùng lặp \& Phân quyền (Community \& Intake)

* **Chống trùng lặp Lead (`Lead Deduplication`):** Hệ thống thực hiện băm định danh thông tin khách hàng (`contact\_fingerprint` dựa trên số điện thoại hoặc email được chuẩn hóa hóa) trong phạm vi từng `workspace`. Nếu khách hàng cũ quay lại tương tác, hệ thống tự động cập nhật vào bản ghi hiện có thay vì tạo ra các dòng rác trùng lặp.
* **Quản lý sự đồng ý (`Consent Tracking`):** Mọi thông tin lead thu thập bắt buộc phải ghi nhận trạng thái đồng ý nhận thông tin tiếp thị (`consent\_status = true/false`) kèm theo mốc thời gian (`consent\_timestamp`) để tuân thủ luật bảo mật dữ liệu.
* **Trạng thái và Phân công Sales (`Owner, Status \& Notes`):**

  * `owner\_id`: Gán nhân sự Sales phụ trách chăm sóc lead cụ thể.
  * `deal\_status`: Quản lý giai đoạn giao dịch (ví dụ: `New`, `Contacted`, `Qualified`, `Converted`, `Lost`).
  * `notes`: Lưu trữ lịch sử ghi chú tương tác giữa Sales và khách hàng.

### B. Quản lý Phản hồi: Draft vs Sent (Reply Management)

* **Phân tách rõ ràng trạng thái phản hồi:**

  * `reply\_draft`: Các tin nhắn hoặc email phản hồi do AI Agent hoặc nhân sự soạn thảo nhưng chưa gửi đi (dùng cho việc kiểm duyệt).
  * `sent`: Trạng thái chính thức khi thông tin đã được gửi thành công tới khách hàng qua các kênh tích hợp.
* Hệ thống cấm tuyệt đối việc sử dụng trực tiếp các bản nháp (`draft`) để gửi ra ngoài nếu chưa được xác nhận hoàn tất.

### C. Gói Đề xuất Tăng trưởng \& Phân tích (Growth Proposals)

Mỗi đề xuất chiến lược hoặc cải thiện hiệu suất xuất ra từ **Growth Analyst Agent** hoặc **Performance Agent** bắt buộc phải bao gồm các thành phần chuẩn:

* **Snapshot (Ảnh chụp dữ liệu hiện trạng):** Lưu trữ các chỉ số thời điểm trước khi áp dụng đề xuất (ví dụ: Traffic hiện tại, tỷ lệ chuyển đổi cũ) để làm mốc đối soát.
* **Timezone (Múi giờ):** Cố định múi giờ hệ thống (mặc định `Asia/Ho\_Chi\_Minh`) cho toàn bộ báo cáo lịch trình và sự kiện phân tích.
* **Hypothesis (Giả thuyết tăng trưởng):** Định nghĩa rõ ràng giả thuyết kinh doanh (Ví dụ: *"Nếu tối ưu từ khóa Làng Mỹ Khê Đà Nẵng, lượng Qualified Traffic sẽ tăng trưởng +20% trong vòng 14 ngày"*).

### D. Tích hợp Dữ liệu Quảng cáo (Ads Read-Only Integration)

* **Chế độ chỉ đọc (`Read-Only`):** Kết nối tới các nền tảng quảng cáo ngoài (như Meta Ads, Google Ads) chỉ phục vụ cho mục đích đọc và kéo số liệu thống kê chi phí/hiệu suất (`analytics\_events` và `content\_performance`).
* Hệ thống **không bao giờ** cho phép AI Agent hoặc người dùng tự động thay đổi cấu hình ngân sách, bật/tắt chiến dịch quảng cáo trực tiếp từ giao diện AI Growth OS nếu chưa thông qua các cổng kiểm duyệt an toàn cấp độ cao.

