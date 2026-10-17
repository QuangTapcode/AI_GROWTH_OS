# Kế hoạch kiểm thử Tuần 1 (W1 Test Plan)

## 1. Mục tiêu (Scope)
Xác minh luồng Core (Plumbing), Phân quyền (Auth/Tenant), AI Adapter và Cơ chế an toàn (Critical Gates) dựa trên AC DU-01.

## 2. Ma trận Test Case (AC → Case → Task)

| ID Tiêu chí (AC) | Kịch bản kiểm thử (Test Case) | Thuộc Task | Critical Gate? |
| :--- | :--- | :--- | :--- |
| **Auth/Tenant** (Core) | Test cách ly dữ liệu: User của Workspace A (Tenant 1) không thể truy cập chéo data của Workspace B (Tenant 2). | TH-02 | **Yes** |
| **Auth/Tenant** (Core) | Test giới hạn quyền: Viewer/Editor bị từ chối (Deny) khi thực hiện tác vụ của Owner. | TH-02 | **Yes** |
| AC-RES-01 (Nguồn) | Agent Research trả về kết quả bắt buộc kèm URL nguồn hợp lệ và timestamp. | TH-02 | No |
| AC-SEO-02 (Anti-hallucination) | Nội dung sinh ra phải khớp với Knowledge Base (TripC) và có trích dẫn nguồn (provenance). | TH-02 | **Yes** |
| AC-SEO-03 (Versioning) | Khi User hoặc AI chỉnh sửa bài viết đã duyệt -> Trạng thái bắt buộc reset về "Chờ duyệt" (Pending). | TH-03 | **Yes** |
| AC-COM-01 (Approval) | Agent phản hồi khách hàng phải nằm trong Approval Queue, tuyệt đối không được tự động Live. | TH-03 | **Yes** |
| AC-COM-02 (Idempotency) | Bắn 2 request chứa cùng dữ liệu Lead -> Hệ thống chặn trùng lặp, chỉ tạo 1 Lead duy nhất. | TH-02 | **Yes** |
| AC-PER-02 (Ranh giới) | Performance Agent gửi request can thiệp ngân sách/bật tắt Ads -> API trả về lỗi Access Denied. | TH-02 | **Yes** |
| Tham số TripC (Bối cảnh)| Test luồng Handoff Lead sinh ra đủ: Lead ID, Nguồn/UTM, Trạng thái (New) và giao cho Sales TripC. | TH-03 | No |