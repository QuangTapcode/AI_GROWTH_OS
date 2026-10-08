# ĐẶC TẢ CHI TIẾT M08 - AI CONTENT FACTORY (NGÀY 9)

* Dự án: AI Growth OS (TripC - Expat tại Đà Nẵng)



* Giai đoạn: W2 (Ngày 9) - Chốt M08 phục vụ Dev, QA và Team Content



* Chủ trì: Dương (BA) | Reviewer: Thanh / Thiệu (QA) \& Team AI



#### PHẦN 1: EDITOR, VARIANT, VERSION, AUTOSAVE, RESTORE \& REGENERATE

###### 1\.Editor \& Autosave (Trình soạn thảo \& Tự động lưu):



&#x09;-Giao diện tích hợp trình soạn thảo hỗ trợ quản lý các biến thể nội dung (variant) cho cùng một chủ đề (ví dụ: tạo biến thể tone giọng, biến thể độ dài).



&#x09;-Cơ chế Autosave: Hệ thống tự động lưu nháp định kỳ để tránh mất dữ liệu khi người dùng đang chỉnh sửa.



###### 2\.Version Control \& Restore (Quản lý phiên bản \& Khôi phục):



&#x09;-Mỗi lần chỉnh sửa lớn hoặc tạo bản mới đều sinh ra một version (version ID).



&#x09;-Quy định khi Restore (Khôi phục): Khi người dùng chọn khôi phục một bản cũ, hệ thống không được ghi đè thô bạo mà phải tạo ra một version mới chứa nội dung cũ đó để giữ trọn vẹn lịch sử chỉnh sửa (audit trail).



###### 3\.Regenerate (Tái tạo nội dung bằng AI):



Cho phép yêu cầu AI viết lại một phần hoặc toàn bộ bài dựa trên prompt bổ sung mà không làm mất dữ liệu gốc nếu chưa xác nhận.



#### PHẦN 2: XỬ LÝ LỖI HỆ THỐNG \& ĐỒNG THỜI (CONCURRENCY \& JOB MANAGEMENT)

###### 1\.Lỗi chỉnh sửa đồng thời (Concurrent Edit Conflict):



&#x09;-Khi 2 người dùng (hoặc 1 người mở 2 tab) cùng chỉnh sửa một bài viết tại một thời điểm:



&#x09;-Hệ thống phát hiện xung đột phiên bản (Optimistic Locking).



&#x09;-Cảnh báo người vào sau: "Nội dung này đã được cập nhật bởi \[User] lúc \[Timestamp]. Vui lòng tải lại trang để tránh ghi đè dữ liệu."



###### 2\.Hệ thống Job ngầm (Job Timeout, Cancel \& Quota):



&#x09;-Việc sinh nội dung dài (bài SEO, FAQ, social batch) chạy qua hệ thống background job:



&#x09;-Job Timeout: Nếu AI hoặc API call quá thời gian giới hạn (ví dụ: > 60 giây), job tự động ngắt và báo lỗi timeout để tránh treo server.



&#x09;-Cancel: Cho phép người dùng bấm nút hủy (Cancel Job) khi đang chờ sinh nội dung nếu không muốn tiếp tục.



&#x09;-Quota: Kiểm tra hạn mức sử dụng (token/credit) của Tenant trước khi chạy job. Nếu hết quota, hệ thống chặn và yêu cầu nâng cấp gói.



#### PHẦN 3: RÀNG BUỘC ĐỊNH DẠNG TRUYỀN THÔNG (SOCIAL \& MEDIA SCOPE)

###### 1.Phạm vi của Social Draft:



&#x09;-Đối với nội dung mạng xã hội (Facebook, Instagram, LinkedIn...), hệ thống chỉ cung cấp tính năng soạn thảo bản nháp (draft) và xuất file (export).



&#x09;-Tuyệt đối không tích hợp API tự động publish trực tiếp lên mạng xã hội trong giai đoạn này (để đảm bảo kiểm duyệt thủ công).



###### 2.Ràng buộc Media (Video \& Hình ảnh):



&#x09;-Nhắc lại nguyên tắc cốt lõi: Đối với video, hệ thống chỉ sinh kịch bản (script); đối với hình ảnh, hệ thống chỉ sinh câu lệnh mô tả (prompt).



&#x09;-Không bàn giao các tính năng tự động tạo tệp media hoàn chỉnh (như render video hoặc xuất file ảnh đồ họa tự động) trong module này.

