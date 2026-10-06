## PHẦN 1: BẢNG AC SƠ BỘ VÀ MA TRUY XUẤT CHO CÁC MODULE M04–M16



|Module|Tên Module|Story / Thành phần chính|Epic AC cơ bản|Test IDs|Evidence yêu cầu|Trạng thái|
|-|-|-|-|-|-|-|
|M04|Market Intelligence|Quét trend, search results, social, competitor|AI tự động quét và phân loại đúng loại discovery (Trend, Search gap, Freshness)|TC-M04-01|Log API quét dữ liệu \& Dashboard Market Intelligence|backlog|
|M05|Opportunity Engine|Chấm điểm cơ hội (Opportunity Object \& Score)|Tính toán Opportunity Score theo công thức Demand x Business Relevance|TC-M05-01|Bảng xếp hạng Opportunity hiển thị điểm số P0/P1/P2|backlog|
|M06|Growth Strategy Engine|Tạo 30-day Growth Strategy|Phân bổ effort tự động theo opportunity score và mục tiêu workspace|TC-M06-01|Kế hoạch chiến lược 30 ngày dưới dạng JSON/UI|backlog|
|M07|Content Intelligence \& Brief|Tạo Content Brief (Intent, Audience, Angle, CTA)|Brief sinh ra chứa đầy đủ thông tin từ Business Knowledge và từ khóa|TC-M07-01|Giao diện Content Brief hiển thị đúng các trường dữ liệu|backlog|
|M08|AI Content Factory \& Repurposing|Sinh nội dung \& Tái sử dụng đa kênh|1 source content tách ra được nhiều assets (SEO article, Social...)|TC-M08-01|Danh sách content variant sinh ra từ bản brief gốc|backlog|
|M09|SEO Intelligence \& Topic Cluster|Discovery từ khóa, Topic Cluster, Programmatic SEO|Xây dựng cây phân cấp chủ đề và kiểm tra unique value cho trang|TC-M09-01|Sơ đồ Topic Cluster và danh sách từ khóa index|backlog|
|M10|Distribution Engine \& Auto Publishing|Đa kênh, định dạng, lịch trình và phê duyệt|Mặc định ở MVP là Level 2 (Approval mode). Không tự publish nếu chưa duyệt|TC-M10-01|Publishing log và trạng thái chờ duyệt (Pending approval)|backlog|
|M11|Community Growth Engine|Intent Radar tìm kiếm hội thoại cộng đồng|Phát hiện đúng intent hỏi đáp (Ví dụ: "Where to live in Da Nang?")|TC-M11-01|Danh sách Community Opportunities kèm điểm Intent Radar|backlog|
|M12|Traffic Engine \& Attribution|Gắn UTM \& Quản lý nguồn traffic|Mọi link phân phối tự động gắn UTM chuẩn (utm\_source, utm\_medium,...)|TC-M12-01|URL sau khi gắn UTM đầy đủ thông số|backlog|
|M13|Analytics Engine|Tích hợp GA, GSC, CRM, Social|Đồng bộ dữ liệu metrics awareness, search, social, website, business|TC-M13-01|Biểu đồ báo cáo khớp với nguồn tích hợp|backlog|
|M14|AI Growth Analyst|Daily Growth Brief|AI tự tổng hợp báo cáo tăng trưởng hằng ngày kèm khuyến nghị|TC-M14-01|Bản tin Daily Growth Brief xuất hiện trên Command Center|backlog|
|M15|Experiment Engine|Chạy thử nghiệm A/B Testing (Title, CTA, Format)|Chia variant A/B và theo dõi kết quả tương ứng cho từng biến thể|TC-M15-01|Báo cáo kết quả Experiment hiển thị tỷ lệ chuyển đổi A/B|backlog|
|M16|Learning Engine|Học hỏi từ dữ liệu hiệu suất để cập nhật strategy|AI tìm ra correlation (Ví dụ: Nội dung housing sinh ra nhiều signup hơn)|TC-M16-01|Bảng ghi nhận learning weights cập nhật chiến lược|backlog|



## 

