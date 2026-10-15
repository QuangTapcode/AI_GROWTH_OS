# ST-M01-001 — Onboarding doanh nghiệp và cấu hình Workspace

* Module Mxx; PRD section nguồn:Module M01 (Workspace \& Profile setup)
* Persona/mục tiêu và business value:Owner cấu hình thông tin nền tảng, brand voice, audience (expat tại Đà Nẵng) và ngôn ngữ để AI khởi tạo context kinh doanh chuẩn xác.
* Owner:Dương (BA) 
* Reviewer:Quang Quang (PO) / Thiệu Quang 
* Estimate:4h 
* Tuần/gate:W1(Gate 1)
* Dependencies, contract version, design spec:Nền tảng Auth \& Database; API v1; Next.js minimalist UI.
* In scope / out of scope:

  * In scope: Nhập thông tin công ty, website, ngôn ngữ (en), target audience.
  * Out of scope: Quản lý thanh toán hóa đơn (Billing).
* Inputs/fields và validation:

  * Company Name: String, bắt buộc, tối đa 100 ký tự.	
  * Website: URL hợp lệ, bắt đầu bằng https://
* Tenant/RBAC; state transitions; concurrency:

  * RBAC: Chỉ Owner hoặc Editor được quyền lưu thay đổi.
  * Tenant Isolation: Mọi thao tác ràng buộc theo workspace\_id
* Loading/empty/error/permission/cancel/retry nếu áp dụng:

  * Hiển thị loading khi gọi API; chặn quyền và trả về lỗi 403 nếu user là Viewer.

## Acceptance criteria

* AC-01:Given người dùng có quyền Owner/Editor, When nhập đầy đủ Tên công ty và Website hợp lệ rồi bấm Save, Then hệ thống ghi nhận dữ liệu vào DB và hiển thị thông báo thành công.
* AC-02: Given người dùng có vai trò Viewer, When truy cập trang cấu hình Workspace, Then giao diện ở chế độ chỉ đọc và các nút lưu bị vô hiệu hóa.
* AC-03: Given để trống trường Tên công ty, When bấm Save, Then hệ thống chặn lại và hiển thị lỗi bắt buộc nhập.

## Traceability và bàn giao

|AC|Test ID|Owner|Evidence|Trạng thái|
|-|-|-|-|-|
|AC-01|TC-M01-01|Thiệu (QA)|Log API 200 OK|backlog|
|AC-02|TC-M01-02|Thiệu (QA)|UI Read-only state|backlog|
|AC-03|TC-M01-03|Thiệu (QA)|Validation error message|backlog|

* Local evidence (mock/stub):Local API test via Swagger UI \& Unit Test logs
* Integrated evidence (staging thật):Chờ deploy môi trường staging.
* Known limitations/decision record:Chỉ hỗ trợ tiếng Anh (en) cho giai đoạn pilot TripC.
* PO nghiệm thu:Quang Quang

# ST-M02-001 — Quản lý vòng đời nguồn dữ liệu (Source Lifecycle)

* Module M02; PRD section nguồn: Module M02 (Business Knowledge Base)
* Persona/mục tiêu và business value: Người quản trị nạp tài liệu PDF/URL, thực hiện review và approve để cung cấp nguồn dữ liệu sạch, biến thành verified Business facts cho AI RAG.
* Owner, reviewer, estimate, tuần/gate:

  * Owner: Dương (BA)
  * Reviewer: Quang Quang (PO) / Thiệu Quang
  * Estimate: 6h
  * Tuần/Gate: W1 (Gate 1)
* Dependencies, contract version, design spec: Phụ thuộc M01 (Workspace) và dịch vụ Storage/Embeddings.
* In scope / out of scope:

  * In scope:In scope: Upload file/URL, chuyển trạng thái Unreviewed -> Verified, Revoke, Delete, Version.
  * Out of scope: OCR hình ảnh hoặc xử lý file media phức tạp (để sau).
* Inputs/fields và validation:

  * Source URL / File: Định dạng PDF hoặc URL hợp lệ, dung lượng trong giới hạn cho phép.
* Tenant/RBAC; state transitions; concurrency:

  * RBAC: Viewer không có quyền upload hay approve. Chỉ Owner/Editor được duyệt nguồn.
  * State: Unreviewed (Mới tạo) -> Verified (Đã duyệt) -> Revoked/Deleted.
* Loading/empty/error/permission/cancel/retry nếu áp dụng:

  * Báo lỗi khi upload file sai định dạng hoặc quá dung lượng.

## Acceptance criteria

* AC-01: Given người dùng upload thành công một file PDF nguồn, When hệ thống tiếp nhận, Then trạng thái nguồn được ghi nhận là Unreviewed (chưa được coi là facts đã duyệt).
* AC-02: Given người quản trị thực hiện duyệt tài liệu, When bấm nút Approve, Then trạng thái chuyển thành Verified và được đưa vào RAG index.
* AC-03: Given tài liệu bị xóa (Delete), When hoàn tất, Then nguồn đó lập tức bị gỡ khỏi index và không thể truy xuất trong câu trả lời của AI.

## Traceability và bàn giao

|AC|Test ID|Owner|Evidence|Trạng thái|
|-|-|-|-|-|
|AC-01|TC-M02-01|Thiệu (QA)|DB status check Unreviewed|backlog|
|AC-02|TC-M02-02|Thiệu (QA)|Vector index log|backlog|
|AC-03|TC-M02-03|Thiệu (QA)|Query test trả về missing|backlog|

* Local evidence (mock/stub):Local file ingestion test.
* Integrated evidence (staging thật):Chờ deploy staging.
* Known limitations/decision record:Phân biệt rõ Business facts với Research facts (nguồn chưa review tuyệt đối không tính là facts chính thức).
* PO nghiệm thu:Quang Quang

# ST-M03-001 — Thiết lập Mục tiêu tăng trưởng \& Quy định Pilot Form (TripC)

* Module M03; PRD section nguồn: Module M03 (Growth Goal Manager)
* Persona/mục tiêu và business value: Người dùng thiết lập mục tiêu tăng trưởng, baseline, KPI và cấu hình form cho pilot TripC phục vụ expat tại Đà Nẵng, chốt conversion là gửi form thành công.
* Owner, reviewer, estimate, tuần/gate:

  * Owner: Dương (BA)
  * Reviewer: Quang Quang (PO) / Thiệu Quang
  * Estimate: 6h
  * Tuần/Gate: W1 (Gate 1)
* Dependencies, contract version, design spec: Phụ thuộc M01; API định nghĩa metric.
* In scope / out of scope:

  * In scope: Tạo Goal/KPI, cấu hình form landing page (fields, consent, server-confirmed success), quy tắc không có baseline thì không hiển thị %.
  * Out of scope: Tích hợp hệ thống thanh toán tự động.
* Inputs/fields và validation:

  * Form fields: Full Name (bắt buộc), Email (bắt buộc, đúng định dạng), Phone Number (tùy chọn), Message (tùy chọn), Consent checkbox (bắt buộc tích chọn).
* Tenant/RBAC; state transitions; concurrency:

  * Gắn kết dữ liệu theo workspace\_id.
* Loading/empty/error/permission/cancel/retry nếu áp dụng:

  * Giao diện chỉ hiển thị thông báo thành công và reset form sau khi nhận được phản hồi lưu thành công từ server (server-confirmed success).

## Acceptance criteria

* AC-01: Given người dùng thiết lập mục tiêu nhưng để trống giá trị baseline, When xem biểu đồ tiến độ, Then hệ thống tuyệt đối không hiển thị chỉ số tăng trưởng phần trăm (%).
* AC-02: Given khách hàng truy cập form pilot TripC, When chưa tích chọn consent checkbox mà bấm Submit, Then form từ chối gửi và báo lỗi yêu cầu đồng thuận.
* AC-03: Given khách hàng điền đầy đủ thông tin hợp lệ và bấm Submit, When server xử lý và phản hồi thành công (200 OK), Then màn hình hiển thị thông báo thành công và conversion được ghi nhận dưới dạng form submission (tuyệt đối không tính bằng account signup).

## Traceability và bàn giao

|AC|Test ID|Owner|Evidence|Trạng thái|
|-|-|-|-|-|
|AC-01|TC-M03-01|Thiệu (QA)|UI display check (No % shown)|backlog|
|AC-02|TC-M03-02|Thiệu (QA)|Form validation check|backlog|
|AC-03|TC-M03-03|Thiệu (QA)|Server response \& form reset log|backlog|

* Local evidence (mock/stub):Form submission mock API test.
* Integrated evidence (staging thật):Chờ deploy staging.
* Known limitations/decision record:Conversion giai đoạn pilot chỉ tính form submission; tài khoản đăng ký (signup) không tính là conversion.
* PO nghiệm thu:Quang Quang

# 

