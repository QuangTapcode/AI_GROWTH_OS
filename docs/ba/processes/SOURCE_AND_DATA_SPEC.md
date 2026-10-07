## ĐẶC TẢ KỸ THUẬT: ĐỊNH DẠNG DỮ LIỆU \& VÒNG ĐỜI NGUỒN (SOURCE LIFECYCLE)

* Dự án: AI Growth OS (Pilot TripC - Expat tại Đà Nẵng)



* Giai đoạn: Ngày 3–4 (W1)



* Owner: Dương (BA) | Reviewer: Quang Quang (PO)



### 1\. Quy định Định dạng Đầu vào (Text/PDF \& URL)



##### 1.1. Định dạng File Text \& PDF

**- File PDF:**

&#x20; - Bắt buộc phải có lớp văn bản (Text Layer / Searchable PDF). Các tệp PDF dạng ảnh quét thuần túy không có OCR layer sẽ bị hệ thống từ chối hoặc yêu cầu chạy qua mô-đun OCR hỗ trợ.

&#x20; - Giới hạn dung lượng tối đa cho mỗi file tải lên: 25 MB.

&#x20; - Ngôn ngữ hỗ trợ ưu tiên trong giai đoạn pilot: Tiếng Anh (en) để phục vụ cộng đồng expat tại Đà Nẵng.



**- File Text (.txt, .md):**

&#x20; - Định dạng mã hóa chuẩn UTF-8 không có BOM.

&#x20; - Cấu trúc văn bản nên được chia rõ theo các thẻ Heading để mô hình phân tách ngữ cảnh (chunking) chính xác hơn.



##### 1.2. Định dạng URL được phép (Allowed URLs)

\- **Giao thức bảo mật:** Chỉ chấp nhận các URL bắt buộc sử dụng giao thức HTTPS. Các URL dùng HTTP thuần túy sẽ bị từ chối bảo mật.

**- Nguồn crawl hợp lệ:**

&#x20; - Bài viết blog, trang thông tin dịch vụ, cẩm nang du lịch/sinh sống chính thống hướng dẫn expat tại Đà Nẵng.

&#x20; - Không chấp nhận các trang yêu cầu đăng nhập tài khoản hoặc trang chứa nội dung vi phạm bản quyền.

##### 

### 2\. Vòng đời nguồn dữ liệu \& Nguồn gốc (Source Lifecycle \& Provenance)

\- **Trạng thái 1:** Unreviewed (Mới nạp / Chưa duyệt) - Trạng thái mặc định khi upload, tuyệt đối không được tính là Business facts và không đưa vào vector index.

**- Trạng thái 2:** Verified (Đã kiểm duyệt / Chính thức) - Sau khi Owner/Editor kiểm tra và bấm Approve, dữ liệu chính thức trở thành Business facts phục vụ AI RAG.

**- Trạng thái 3:** Revoked / Deleted (Đã thu hồi / Xóa bỏ) - Khi tài liệu lỗi thời hoặc bị gỡ bỏ, lập tức bị xóa khỏi RAG index để AI không truy xuất nữa.

