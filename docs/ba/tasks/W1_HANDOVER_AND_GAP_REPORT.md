# BIÊN BẢN BÀN GIAO TUẦN 1 \& ĐỐI CHUẾT GAPS (M04–M09)

* Dự án: AI Growth OS (TripC - Expat tại Đà Nẵng)



* Giai đoạn: Trước Ngày 5 (W1 Closing \& W2 Handover)



* Chủ trì: Dương (BA) | Người nhận bàn giao: Team Dev, AI \& QA (Thiệu) | Phê duyệt: Quang Quang (PO)



#### 1\. BÀN GIAO STORIES \& FIELDS CHO TUẦN 2 (MODULES M04–M09)

Chính thức chuyển giao các đặc tả chi tiết và bộ trường dữ liệu (fields) cho team kỹ thuật bắt tay vào hiện thực hóa trong Tuần 2:



&#x09;-M04 (Market Intelligence): Bàn giao luồng quét dữ liệu tự động, phân loại discovery (Trend, Search gap, Freshness) và cấu trúc log API.



&#x09;-M05 (Opportunity Engine): Bàn giao công thức tính Opportunity Score (Demand x Business Relevance) và các mức ưu tiên P0/P1/P2 trên giao diện.



&#x09;-M06 (Growth Strategy Engine): Bàn giao đặc tả sinh kế hoạch chiến lược 30 ngày dạng JSON/UI phân bổ theo effort và mục tiêu workspace.



&#x09;-M07 (Content Intelligence \& Brief): Bàn giao cấu trúc trường dữ liệu của Content Brief (Intent, Audience, Angle, CTA) liên kết với Business Knowledge.



&#x09;-M08 (AI Content Factory \& Repurposing): Bàn giao quy tắc tách 1 source content thành nhiều đa kênh assets (SEO article, Social variant).



&#x09;-M09 (SEO Intelligence \& Topic Cluster): Bàn giao sơ đồ cây phân cấp chủ đề và logic kiểm tra unique value cho trang.



#### 2\. CHUẨN BỊ DEMO W1 \& ĐỐI CHIẾU AC (ACCEPTANCE CRITERIA)



&#x09;-Phạm vi Demo: Trình diễn kết quả thiết lập Workspace (M01), cơ chế kiểm duyệt vòng đời nguồn dữ liệu Unreviewed -> Verified (M02), thiết lập mục tiêu/KPI pilot (M03), cùng tập dữ liệu UAT cho 2 tenant (Hospitality \& F\&B).



&#x09;-Tiêu chí đối chiếu: Đảm bảo toàn bộ AC cơ bản từ M01 đến M03 khớp với ma trận kiểm thử và không có ngoại lệ bảo mật về tenant isolation.



#### 3\. XỬ LÝ GAPS THÀNH DEFECT / STORY MỚI (OWNER RÕ RÀNG)

Các điểm thiếu sót hoặc điểm chưa chốt (Decision Pending) phát hiện trong quá trình tuần 1 được quy hoạch thành các ticket hành động cụ thể:



###### Gap 1: Định nghĩa Qualified Traffic cho expat Đà Nẵng

###### 

&#x09;**-Phân loại:** Cần quyết định từ PO.



&#x09;**-Hành động:** Tạo task gửi PO (Quang Quang) phê duyệt ngưỡng thời gian on-site tối thiểu.



&#x09;**-Owner:** Dương (BA).



###### Gap 2: Cơ chế hiển thị UI khi API Google Analytics / Search Console trả về dữ liệu trống (0) hoặc bị trễ



&#x09;**-Phân loại:** UI/UX Defect / Technical Spike.



&#x09;**-Hành động:** Chuyển team Frontend thiết kế trạng thái hiển thị "Data syncing..." hoặc giữ số liệu cũ.



&#x09;**-Owner:** Team Frontend / Dev.

###### 

###### Gap 3: Tích hợp tự động kiểm tra định dạng text layer cho file PDF tải lên



&#x09;**-Phân loại:** Backend Defect / Validation Story mới.



&#x09;**-Hành động:** Bổ sung story kiểm tra OCR/Text-layer ở tầng API ingestion trước khi đưa vào trạng thái Unreviewed.



&#x09;**-Owner:** Team AI / Backend.

