# ĐẶC TẢ CHI TIẾT \& AC M09–M13 (CHUẨN BỊ CHO TUẦN 3)

* Dự án: AI Growth OS (TripC - Expat tại Đà Nẵng)
* Giai đoạn: Trước Ngày 10 - Bàn giao AC M09–M13 cho Dev \& QA
* Chủ trì: Dương (BA) | Reviewer: Thanh / Thiệu (QA) \& Team AI

#### PHẦN 1: M09 - SEO \& LOCAL PAGES (SEO RUBRIC, LOCAL UNIQUE DATA \& REFRESH)

###### 1\.SEO Rubric \& Tiêu chuẩn On-page:

&#x09;-Hệ thống tự động chấm điểm SEO cho bài viết/trang đích dựa trên checklist chuẩn: Title độ dài tối ưu, Meta Description, mật độ từ khóa (keyword density), thẻ Heading phân cấp (H1, H2, H3), và Alt text của hình ảnh.

###### 2\.Local Unique Data (Dữ liệu địa phương độc bản):

&#x09;-Các trang landing page địa phương (ví dụ: khu vực An Thượng, Mỹ Khê, Hải Châu) bắt buộc phải tích hợp các dữ liệu thực tế được quét hoặc tổng hợp từ M04 (như tọa độ, giá thuê thực tế, feedback expat gần đây) để tránh tạo ra nội dung rác trùng lặp (thin content).

###### 3\.Cơ chế Refresh nội dung:

&#x09;-Hệ thống tự động quét và cảnh báo khi các trang SEO cũ có dấu hiệu sụt giảm hiệu suất hoặc dữ liệu thời gian (ví dụ: giá cả năm cũ) để đề xuất thời điểm cập nhật mới (Content Refresh).

##### PHẦN 2: M10 - PUBLISHING \& WORKFLOW (APPROVAL, REJECT, RESUBMIT, VERSION \& HASH)

###### 1\.Quy trình Phê duyệt khép kín (Approval \& Reject Flow):

&#x09;-Trạng thái: Draft->Pending Review->Approved->Rejected.

&#x09;-Nếu bài viết bị Reject, reviewer phải nhập lý do bắt buộc. Biên tập viên sửa lại và bấm Resubmit để gửi lại luồng duyệt từ đầu.

###### 2\.Version Control \& Content Hash:

&#x09;-Mỗi bản duyệt thành công sẽ được hệ thống đóng một mã băm (content\_hash) duy nhất.

&#x09;-Nếu bài viết bị chỉnh sửa sau khi đã duyệt, mã hash thay đổi->hệ thống tự động đưa trạng thái về chưa duyệt để đảm bảo an toàn nội dung trước khi xuất bản.

#### PHẦN 3: M11 - CMS INTEGRATION (CMS RETRY, CALENDAR \& TIMEZONE)

###### 1\.Cơ chế Retry khi đẩy sang CMS (WordPress / Web chính):



&#x09;-Khi gọi API đẩy bài sang CMS đích mà gặp lỗi kết nối (timeout, 5xx):



&#x09;-Hệ thống kích hoạt cơ chế thử lại tự động (Auto-retry) tối đa 3 lần theo chu kỳ tăng dần (exponential backoff).



&#x09;-Nếu vẫn thất bại, ghi log lỗi vào cms\_sync\_errors và hiển thị cảnh báo cho Admin.



###### 2.Content Calendar \& Timezone:



&#x09;-Lịch xuất bản nội dung hiển thị trực quan theo dạng lịch (Calendar view).



&#x09;-Bắt buộc quản lý đồng bộ theo múi giờ chuẩn (ví dụ: UTC+7 cho thị trường Việt Nam) để tránh việc lên lịch bài viết bị lệch giờ hiển thị.

#### PHẦN 4: M12 - COMMUNITY DISTRIBUTION (COMMUNITY MANUAL LINK)

###### 1\.Cơ chế chia sẻ cộng đồng (Community Link Distribution):

###### 

&#x09;-Nhắc lại nguyên tắc kiểm duyệt: Hệ thống không tự động post bài spam lên các hội nhóm Facebook/Reddit của expat.



&#x09;-Module này đóng vai trò cung cấp link, tóm tắt nội dung (snippet) và checklist thủ công để nhân员 marketing copy và đăng bài đúng quy định của từng cộng đồng, đồng thời ghi nhận trạng thái (Posted / Pending).



#### PHẦN 5: M13 - ANALYTICS \& ATTRIBUTION (UTM, EVENT, DEDUP \& METRIC MAPPING)

###### 1\.Gắn mã UTM tự động:



&#x09;-Mỗi đường link xuất bản từ hệ thống đi kèm các tham số UTM tiêu chuẩn (utm\_source, utm\_medium, utm\_campaign) bám sát vào ID của chiến lược (M06) và Content Brief (M07) để tracking chuẩn xác.



###### 2.Event Tracking \& Deduplication (Chống trùng lặp dữ liệu):



&#x09;-Ghi nhận các sự kiện người dùng (Click, Form Submission, Lead Signup).



&#x09;-Hệ thống có thuật toán khử trùng lặp (Deduplication) dựa trên IP, Device ID và khoảng thời gian để số liệu analytic không bị thổi phồng ảo.



###### 3\.Metric Mapping:

###### 

&#x09;-Ánh xạ các chỉ số thô từ Google Analytics / Social Platform về dashboard tổng quan của Tenant để tính toán ROI chiến dịch.

##### 

##### PHẦN 6: CHUẨN BỊ MẪU (SAMPLE DATA)

&#x09;-Yêu cầu bàn giao: Chuẩn bị sẵn 01 bộ mẫu Sample SEO Page và Sample Local Page (kèm theo nguồn trích dẫn từ dữ liệu quét M04) để làm benchmark trực quan cho team Dev dựng khung giao diện trong Tuần 3.

