# DU-06 · Báo cáo Thực thi UAT & Đối chiếu Cơ sở Dữ liệu (Autonomous Agent Workflow)

## 1. Chi tiết Kết quả Đối chiếu 5 Bước Nghiệp vụ với Database Schema

### 1. Bước Research & Trend Analysis (Khớp AC nguồn tri thức & chống ảo giác)
- **AC yêu cầu:** Nạp tài liệu nguồn chuẩn, cắt chunk nhúng vector và tạo cơ hội P0/P1 mà không bịa đặt.
- **Đối chiếu Database:**
  - Bảng `sources` có ràng buộc `kind IN ('text', 'pdf', 'url')` và kiểm soát trạng thái `status`.
  - Bảng `source_chunks` thiết lập kiểu dữ liệu `vector(768)` tương thích với mô hình `embeddinggemma` kèm index HNSW (`idx_source_chunks_vector_hnsw`) giúp tìm kiếm tương đồng cực nhanh.
  - Bảng `growth_opportunities` chứa các trường điểm số (`demand_score`, `competition_score`, `business_value_score`) và phân loại priority (`P0/P1`), đảm bảo mọi cơ hội đều có căn cứ từ dữ liệu thật.

### 2. Bước Blog Generation & Briefs (Khớp AC sinh bài viết & Trích dẫn nguồn)
- **AC yêu cầu:** AI sinh bài viết Markdown (`body_markdown`) kèm thẻ trích dẫn nguồn RAG (`provenance_citations`).
- **Đối chiếu Database:**
  - Bảng `content_briefs` lưu trữ đầy đủ `primary_keyword`, `search_intent`, và `facts_to_include`.
  - Bảng `contents` lưu trữ `body_markdown` và điểm số SEO (`seo_score`, `content_score`), đảm bảo nội dung sinh ra tuân thủ đúng định dạng và có cơ sở từ các chunk tài liệu nguồn.

### 3. Bước Approval & Version Control (Khớp AC kiểm duyệt HITL & Quản lý phiên bản)
- **AC yêu cầu:** Phê duyệt phải ghi nhận rõ ràng, khi chỉnh sửa phải tạo version mới và thu hồi bản cũ (`Revoked`).
- **Đối chiếu Database:**
  - Bảng `content_approvals` (hoặc các trạng thái trong `contents` / `sources`) liên kết trực tiếp với `approved_by` (khóa ngoại trỏ đến bảng `users`).
  - Cơ chế quản lý phiên bản qua bảng `content_variants` và các trường versioning trong schema giúp lưu vết toàn bộ lịch sử chỉnh sửa, ngăn chặn việc xuất bản nhầm bản cũ chưa qua kiểm định.

### 4. Bước Publishing & URL (Khớp AC bảo mật cho Publisher & Kill-Switch)
- **AC yêu cầu:** Chỉ xuất bản bài đã duyệt (`Approved`), kiểm tra Stale Version và có công tắc khẩn cấp toàn cục (`Kill-Switch`).
- **Đối chiếu Database:**
  - Bảng `publishing_jobs` liên kết chặt chẽ với `content_id`, `channel_id`, và chỉ thực thi khi trạng thái hợp lệ (`status = 'scheduled'` hoặc `published`).
  - Bảng `workspaces` đóng vai trò cô lập dữ liệu đa khách hàng (`Multi-tenancy`) kết hợp quản lý cấu hình an toàn, hỗ trợ cơ chế ngắt khẩn cấp toàn cục khi hệ thống có sự cố.

### 5. Bước Form Lead & DB Ingestion (Khớp AC tiếp nhận khách hàng & chống trùng lặp)
- **AC yêu cầu:** Tiếp nhận lead, băm định danh chống trùng lặp (`contact_fingerprint`), phân công nhân sự (`assign_owner`) và tuân thủ phân quyền RBAC.
- **Đối chiếu Database:**
  - Bảng `leads` (hoặc các bảng community/intake) được thiết kế để lưu trữ thông tin liên hệ chuẩn hóa, kết hợp với bảng `memberships` xác định rõ vai trò RBAC (`owner`, `editor`, `viewer`) cho từng user trong workspace.
  - Bảng `audit_events` và `idempotency_keys` ghi nhận toàn bộ nhật ký thao tác và chống gửi trùng lặp request (`POST/Retry`), đảm bảo an toàn tuyệt đối cho hệ thống.

---

## 2. Bộ Tình huống Kiểm thử UAT (Autonomous Agent Workflow) cho 6 Vai trò

### 1. Role: Owner / Admin (Giám sát & Quản trị Hệ thống Toàn cục)
- **Mã tình huống:** `TS-AUTO-ROLE-01`
- **Mục tiêu:** Kiểm tra quyền cấu hình hệ thống Autonomous, quản lý hạn mức ngân sách AI và cơ chế ngắt khẩn cấp.
- **Tình huống thực tế (Autonomous Workflow Steps):**
  1. Đăng nhập hệ thống với quyền Admin, truy cập trang quản trị Workspace.
  2. Cấu hình hạn mức tiêu thụ token (`ai_budget_limit`) và các quy tắc an toàn (`safety_rules`).
  3. Kịch bản ngoại lệ (Kill-Switch): Giả lập tình huống phát hiện AI sinh nội dung lệch chuẩn, Admin thực hiện 1 chạm bật công tắc khẩn cấp `publishing_paused` (Kill-Switch: ON).
- **Kết quả mong đợi (Expected Results):**
  - CSDL bảng `workspaces` ghi nhận thay đổi tức thì.
  - Toàn bộ các tiến trình tự động hóa của Task Orchestrator và 6 Agent lập tức bị đóng băng khẩn cấp, ngăn chặn mọi tác vụ xuất bản bài viết hoặc gửi tin nhắn ra bên ngoài.

### 2. Role: Growth Manager (Hoạch định Mục tiêu & Giám sát Chiến lược AI)
- **Mã tình huống:** `TS-AUTO-ROLE-02`
- **Mục tiêu:** Kiểm tra cách Manager thiết lập định hướng để hệ thống AI tự động quét và đề xuất cơ hội tăng trưởng.
- **Tình huống thực tế (Autonomous Workflow Steps):**
  1. Đăng nhập tài khoản Growth Manager, thiết lập mục tiêu tăng trưởng (ví dụ: Tăng traffic du lịch Đà Nẵng 30 ngày) vào bảng `growth_goals`.
  2. Theo dõi Research & Trend Agent và Growth Analyst Agent tự động quét dữ liệu từ Google Search Console và kho RAG để sinh ra danh sách cơ hội thị trường.
  3. Kiểm tra xem hệ thống đã tự động chấm điểm 6 tiêu chí và phân loại cơ hội ưu tiên `P0/P1` vào bảng `growth_opportunities` chưa.
- **Kết quả mong đợi (Expected Results):**
  - Dữ liệu mục tiêu và chiến lược tự động liên kết chuẩn xác sang bảng `growth_strategies` mà không cần con người phải phân tích thủ công từng từ khóa.

### 3. Role: Content Editor (Giám sát Nội dung & Quản lý Phiên bản AI)
- **Mã tình huống:** `TS-AUTO-ROLE-03`
- **Mục tiêu:** Kiểm tra cơ chế tự động sinh nội dung của AI và khả năng quản lý lịch sử phiên bản khi có chỉnh sửa.
- **Tình huống thực tế (Autonomous Workflow Steps):**
  1. Đăng nhập tài khoản Content Editor, mở giao diện "Xưởng Nội dung" nơi SEO & Content Agent đã tự động sinh bài viết Blog (`body_markdown`) và bộ Social Pack.
  2. Kiểm tra các thẻ trích dẫn nguồn (`provenance_citations`) để đảm bảo AI lấy đúng dữ liệu từ cẩm nang TripC Đà Nẵng (Anti-hallucination).
  3. Thực hiện chỉnh sửa một đoạn nhỏ trực tiếp trên giao diện và bấm nút lưu phiên bản.
- **Kết quả mong đợi (Expected Results):**
  - Bảng `contents` cập nhật nội dung mới.
  - Hệ thống tự động tạo một bản ghi phiên bản mới trong bảng `content_versions` (ví dụ nâng từ `v1.0` lên `v1.1`) và tự động thu hồi trạng thái duyệt cũ thành `Revoked`, bắt buộc bài viết phải qua vòng kiểm duyệt lại để đảm bảo không xuất bản nhầm.

### 4. Role: Reviewer / HITL Manager (Chốt chặn Phê duyệt Cuối cùng)
- **Mã tình huống:** `TS-AUTO-ROLE-04`
- **Mục tiêu:** Kiểm tra cơ chế kiểm định chất lượng (4 lớp Guardrails) và quyền phê duyệt 1 chạm của con người trước khi phát hành.
- **Tình huống thực tế (Autonomous Workflow Steps):**
  1. Đăng nhập tài khoản Reviewer (ví dụ: quản lý kiểm duyệt nội dung).
  2. Kiểm tra kết quả kiểm tra tự động 4 tiêu chí (Facts Check, SEO, Brand Voice, Asset Validation).
  3. Thao tác phê duyệt: Bấm nút `[APPROVE]` hoặc từ chối `[REJECT]`.
- **Kết quả mong đợi (Expected Results):**
  - Nếu bấm `APPROVE`: Bảng `content_approvals` ghi nhận `decision = 'Approved'` và tự động đẩy task sang hàng đợi của Publishing & Ops Agent để lên lịch xuất bản.
  - Nếu bấm `REJECT`: Bài viết bị khóa vĩnh viễn, ngăn chặn tuyệt đối không cho phép đưa vào lịch phát hành.

### 5. Role: Sales Staff (Giám sát Lead thông minh & Xử lý Ngoại lệ)
- **Mã tình huống:** `TS-AUTO-ROLE-05`
- **Mục tiêu:** Kiểm tra cách hệ thống Autonomous tự động tiếp nhận lead, chống trùng lặp và hỗ trợ Sales chăm sóc khách hàng.
- **Tình huống thực tế (Autonomous Workflow Steps):**
  1. Đăng nhập tài khoản Sales Staff, mở màn hình "Quản lý Lead & Sales Handoff".
  2. Quan sát danh sách khách hàng mới do Community & Intake Agent đã tự động tiếp nhận, băm mã định danh (`contact_fingerprint`) và phân gợi ý nhân sự phụ trách (`assign_owner`).
  3. Kiểm tra bản nháp trả lời (`Reply Draft`) do AI chuẩn bị sẵn cho khách hàng.
- **Kết quả mong đợi (Expected Results):**
  - Dữ liệu hiển thị thời gian thực từ bảng `leads`. Khách cũ quay lại được hệ thống tự động gộp lịch sử thay vì sinh dòng rác trùng lặp. Sales chỉ cần kiểm tra bản nháp và bấm xác nhận gửi, tiết kiệm 80% thời gian soạn thảo.

### 6. Role: End-user / Khách hàng cuối (Trải nghiệm Tự động hóa Đa kênh)
- **Mã tình huống:** `TS-AUTO-ROLE-06`
- **Mục tiêu:** Kiểm tra trải nghiệm thực tế của khách hàng khi tiếp cận nội dung do AI xuất bản và điền form tương tác.
- **Tình huống thực tế (Autonomous Workflow Steps):**
  1. Khách hàng vãng lai truy cập vào website TripC Đà Nẵng, đọc bài viết Blog chuẩn SEO do hệ thống tự động xuất bản.
  2. Khách hàng tương tác và điền thông tin vào form nhận cẩm nang du lịch (Họ tên, Số điện thoại, Email).
- **Kết quả mong đợi (Expected Results):**
  - Giao diện website mượt mà, tốc độ tải nhanh nhờ chuẩn hóa từ bảng `seo_pages`.
  - Dữ liệu form ngay lập tức được hệ thống ngầm tiếp nhận, mã hóa `contact_fingerprint` và đổ về bảng `leads` trong cơ sở dữ liệu một cách chính xác tuyệt đối.