# TỪ ĐIỂN DỮ LIỆU CHI TIẾT (FIELD DICTIONARY) — HỆ THỐNG AI GROWTH OS

### 1\. NHÓM HẠ TẦNG ĐA KHÁCH HÀNG \& PHÂN QUYỀN (MULTI-TENANCY \& RBAC)

###### 1.1. Bảng organizations (Tổ chức)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|org\_id|UUID / PK|Có|Khóa chính định danh tổ chức doanh nghiệp.|
|org\_name|String|Có|Tên pháp lý hoặc thương mại của tổ chức.|
|created\_at|Timestamp|Có|Thời điểm khởi tạo tổ chức (chuẩn UTC / Asia/Ho\_Chi\_Minh).|



###### 1.2. Bảng workspaces (Không gian làm việc riêng biệt cho từng Tenant)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|workspace\_id|UUID / PK|Có|Khóa chính định danh Workspace (Mỗi khách hàng như TripC có 1 workspace độc lập, cô lập tuyệt đối dữ liệu).|
|org\_id|UUID / FK|Có|Khóa ngoại trỏ đến tổ chức cha (organizations).|
|workspace\_name|String|Có|Tên workspace (ví dụ: "TripC Danang").|
|domain|String|Không|Website chính thức của doanh nghiệp (ví dụ: tripc.vn).|
|created\_at|Timestamp|Có|Thời điểm tạo workspace.|



###### 1.3. Bảng users \& memberships (Thành viên \& Phân quyền RBAC)



|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|user\_id|UUID / PK|Có|Khóa chính định danh người dùng hệ thống.|
|email|String|Có|Email đăng nhập (định danh duy nhất).|
|workspace\_id|UUID / FK|Có|Workspace mà user đang trực thuộc.|
|role|Enum|Có|Vai trò phân quyền: owner (toàn quyền, duyệt nội dung), editor (quản trị nội dung), viewer (chỉ xem). Áp dụng cơ chế Last Owner Protection.|



### 2\. NHÓM HỒ SƠ DOANH NGHIỆP \& ƯU ĐÃI (BUSINESS CONTEXT \& OFFER)

###### 2.1. Bảng business\_profiles (Hồ sơ doanh nghiệp \& Cấu hình AI)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|profile\_id|UUID / PK|Có|Khóa chính định danh hồ sơ doanh nghiệp.|
|workspace\_id|UUID / PK|Có|Liên kết 1-1 với Workspace.|
|company\_name|String|Có|Tên doanh nghiệp (ví dụ: TripC).|
|industry|String|Có|Lĩnh vực hoạt động (ví dụ: Travel / Expat Services).|
|target\_markets|Text / Array|Có|Thị trường mục tiêu (ví dụ: Đà Nẵng, Việt Nam).|
|target\_audiences|Text / Array|Có|Đối tượng mục tiêu (ví dụ: English-speaking expats, digital nomads).|
|core\_offer|Text|Có|Sản phẩm/Dịch vụ cốt lõi (Cẩm nang và dịch vụ tư vấn chỗ ở, tiện ích sinh sống).|
|cta\_primary|String|Có|Lời kêu gọi hành động Top-of-funnel (ví dụ: "Tải Cẩm nang sinh sống tại Đà Nẵng miễn phí").|
|cta\_secondary|String|Không|Lời kêu gọi hành động Bottom-of-funnel (ví dụ: "Kết nối chuyên gia tư vấn TripC")|
|tone\_preset|Enum|Có|Giọng văn chuẩn: Friendly, Professional, Informative, Youthful. Áp dụng cố định vào prompt của AI Content Factory.|
|ai\_budget\_limit|Decimal|Có|Giới hạn chi phí / hạn mức gọi LLM hàng tháng cho workspace.|
|updated\_at|Timestamp|Có|Thời điểm cập nhật gần nhất (dùng cho cơ chế Optimistic Concurrency Control, trả về HTTP 409 khi xung đột phiên bản).|



### 3\. NHÓM TRI THỨC \& BỘ NHỚ VECTOR RAG (KNOWLEDGE BASE \& SOURCES)

###### 3.1. Bảng sources (Tài liệu gốc \& Nguồn tri thức)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|source\_id|UUID / PK|Có|Khóa chính định danh tài liệu tri thức.|
|workspace\_id|UUID / FK|Có|Workspace sở hữu nguồn dữ liệu.|
|source\_title|String|Có|Tiêu đề tài liệu hoặc tên trang web.|
|source\_url|String|Không|Đường dẫn URL công khai hợp lệ hoặc tệp tham chiếu.|
|source\_type|Enum|Có|Loại nguồn: Website, PDF, FAQ, Pricing, Brand\_Guideline.|
|knowledge\_status|Enum|Có|Vòng đời tri thức: Imported, Processing, Verified (Đã kiểm chứng), Outdated, Needs review. (Chỉ tri thức Verified mới dùng cho dữ liệu nhạy cảm).|



###### 3.2. Bảng source\_chunks (Phân mảnh vector RAG pgvector)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|chunk\_id|UUID / PK|Có|Khóa chính định danh đoạn văn bản phân mảnh.|
|source\_id|UUID / FK|Có|Khóa ngoại trỏ đến bảng sources.|
|chunk\_text|Text|Có|Nội dung đoạn văn bản thô|
|embedding|Vector(768)|Có|Vector nhúng 768 chiều sử dụng tiện ích mở rộng pgvector (HNSW index) phục vụ tìm kiếm ngữ nghĩa.|
|provenance\_tag|String|Có|Mã định danh nguồn gốc dùng để trích dẫn (provenance) vào nội dung nhằm chống ảo giác (hallucination).|

###

### 4\. NHÓM CHIẾN LƯỢC \& CƠ HỘI TĂNG TRƯỞNG (GOALS \& OPPORTUNITIES)

###### 4.1. Bảng growth\_goals (Mục tiêu tăng trưởng của chủ doanh nghiệp)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|goal\_id|UUID / PK|Có|Khóa chính định danh mục tiêu.|
|workspace\_id|UUID / FK|Có|Workspace sở hữu mục tiêu.|
|objective|String|Có|Mục tiêu lớn (ví dụ: Tăng organic traffic).|
|target\_metric|String|Có|Chỉ số hướng tới (ví dụ: Incremental Qualified Traffic).|
|target\_percentage|Integer|Có|Tỷ lệ tăng trưởng kỳ vọng (ví dụ: +50% hoặc +30%).|
|timeframe\_days|Integer|Có|Khoảng thời gian thực hiện (ví dụ: 90 ngày hoặc 30 ngày).|
|primary\_conversion|String|Có|Hành vi chuyển đổi cốt lõi (ví dụ: Signup / Lead form).|

######

###### 4.2. Bảng growth\_opportunities (Cơ hội tăng trưởng do Opportunity Engine phát hiện)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|opportunity\_id|UUID / PK|Có|Khóa chính định danh cơ hội.|
|workspace\_id|UUID / PK|Có|Workspace liên quan.|
|opportunity\_type|Enum|Có|Loại cơ hội: Trend, Search\_Opportunity, Content\_Gap, Fresh\_Opportunity, User\_Intent.|
|topic|String|Có|Chủ đề (ví dụ: Da Nang Housing, Coworking).|
|target\_audience|String|Có|Đối tượng hướng tới.|
|estimated\_demand|Integer|Có|Điểm nhu cầu ước lượng.|
|opportunity\_score|Decimal|Có|Điểm cơ hội tính theo công thức chuẩn PRD: Demand × Business Relevance × Growth Potential × Content Gap × Freshness × Conversion Potential. (Nếu thiếu dữ liệu search volume, bắt buộc gắn nhãn "estimated").|
|priority\_score|Enum|Có|Mức độ ưu tiên: P0 (Cao nhất), P1, P2, P3.|

### 5\. NHÓM SỔ CÁI NỘI DUNG \& PHÊ DUYỆT (CONTENT LEDGER \& APPROVAL)

###### 5.1. Bảng contents (Tài sản nội dung chính)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|content\_id|UUID / PK|Có|Khóa chính định danh bài viết / nội dung.|
|workspace\_id|UUID / PK|Có|Workspace sở hữu nội dung.|
|campaign\_id|UUID / PK|Không|Chiến dịch tiếp thị liên quan.|
|title|String|Có|Tiêu đề bài viết.|
|content\_type|Enum|Có|Loại nội dung: Blog, Guide, Listicle, FAQ, Social\_Post, Comparison.|
|primary\_keyword|String|Không|Từ khóa SEO chính.|
|search\_intent|Enum|Có|Ý định tìm kiếm: Informational, Commercial, Transactional.|
|content\_status|Enum|Có|Vòng đời nội dung: Draft, In Review (Chờ duyệt), Approved (Đã duyệt), Published (Đã xuất bản), Stale (Mất hiệu lực do đổi offer/nguồn).|
|quality\_score|Integer|Không|Điểm chất lượng AI (chấm trên các tiêu chí Accuracy, Originality, SEO, Useful value, Brand fit, Conversion). Dưới ngưỡng tối thiểu sẽ bị giữ lại.|
|created\_by|String|Có|Tác nhân tạo (ai\_agent hoặc human).|
|published\_at|Timestamp|Không|Thời điểm xuất bản chính thức lên kênh public.|

###### 5.2. Bảng content\_versions (Phiên bản nội dung \& Content Repurposing)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|version\_id|UUID / PK|Có|Khóa chính định danh phiên bản bản ghi.|
|content\_id|UUID / PK|Có|Khóa ngoại trỏ đến bảng contents.|
|parent\_content\_id|UUID / PK|Không|Liên kết bài viết gốc nếu đây là biến thể tái sử dụng (Repurposing từ Blog sang Social Pack).|
|version\_number|Integer|Có|Số thứ tự phiên bản (tự động tăng +1 mỗi khi chỉnh sửa hoặc bị từ chối/sửa lại). Mọi chỉnh sửa làm mất hiệu lực phê duyệt cũ (Approval Revoked).|
|body\_markdown|Text|Có|Nội dung chi tiết chuẩn Markdown của phiên bản này.|
|meta\_description|String|Không|Thẻ meta SEO description.|
|provenance\_citations|Text / JSON|Có|Danh sách trích dẫn nguồn (provenance tags) xác thực mọi факts trong bài.|



###### 5.3. Bảng publishing\_jobs (Lịch trình \& Tác vụ xuất bản)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|job\_id|UUID / PK|Có|Khóa chính định danh lịch xuất bản.|
|content\_id|UUID / PK|Có|Nội dung được chỉ định xuất bản|
|channel|Enum|Có|Kênh phân phối: Website, Facebook, Instagram, Newsletter|
|scheduled\_at|Timestamp|Có|Thời gian dự kiến xuất bản (chuẩn UTC / Asia/Ho\_Chi\_Minh).|
|job\_status|Enum|Có|Trạng thái job: Pending\_Approval, Approved, Scheduled, Publishing, Published, Failed.|

######

### 6\. NHÓM TIẾP NHẬN KHÁCH HÀNG QUAN TÂM \& KẾT NỐI (LEAD INTAKE \& CONNECTORS)

###### 6.1. Bảng leads (Quản lý khách hàng tiềm năng tối giản - Sales Handoff)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|lead\_id|UUID / PK|Có|Khóa chính định danh lead.|
|workspace\_id|UUID / PK|Có|Workspace tiếp nhận lead.|
|idempotency\_key|String|Có|Khóa chống trùng lặp dữ liệu lead (tính theo hash thông tin liên hệ trong workspace), trả về HTTP 409 nếu trùng khóa khác dữ liệu.|
|contact\_name|String|Không|Tên khách hàng quan tâm.|
|contact\_email|String|Có|Email liên hệ chính.|
|phone\_number|String|Không|Số điện thoại (nếu có).|
|utm\_source|String|Có|Nguồn truy cập (ví dụ: facebook, google).|
|utm\_medium|String|Có|Kênh phân phối (ví dụ: organic, social).|
|utm\_campaign|String|Có|Tên chiến dịch (ví dụ: da-nang-housing).|
|lead\_status|Enum|Có|Trạng thái lead: New (Mới), Assigned (Đã gán), Contacted, Converted.|
|lead\_owner|UUID / FK|Có|ID nhân sự Sales / Telesale phụ trách tiếp nhận (Sales Handoff).|
|captured\_at|Timestamp|Có|Thời điểm ghi nhận lead.|

###### 6.2. Bảng connectors (Quản lý kết nối bên thứ ba \& API)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|connector\_id|UUID / PK|Có|Khóa chính định danh kết nối.|
|workspace\_id|UUID / FK|Có|Workspace sở hữu kết nối.|
|platform\_name|String|Có|Tên nền tảng (ví dụ: Meta\_Social, Google\_Analytics\_4, Google\_Search\_Console).|
|account\_owner|String|Có|Người phụ trách tài khoản kết nối|
|capabilities|Text / Array|Có|Quyền hạn hỗ trợ: read, draft, publish, send.|
|connection\_status|Enum|Có|Trạng thái: planned, configured, verified (đã chạy live), unavailable, pending.|
|encrypted\_credentials|Text|Có|Thông tin xác thực được mã hóa an toàn trên server (tuyệt đối không đưa vào prompt AI).|

### 7\. NHÓM ĐO LƯỜNG \& PHÂN TÍCH (ANALYTICS \& PERFORMANCE)

###### 7.1. Bảng analytics\_events (Sự kiện lưu lượng truy cập \& chuyển đổi)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|event\_id|UUID / PK|Có|Khóa chính sự kiện phân tích.|
|workspace\_id|UUID / PK|Có|Workspace liên quan.|
|content\_id|UUID / PK|Không|Bài viết phát sinh sự kiện truy cập.|
|event\_type|Enum|Có|Loại sự kiện: pageview, session\_start, cta\_click, form\_submit, lead\_capture|
|utm\_source|String|Có|Nguồn UTM tracking.|
|utm\_campaign|String|Có|Chiến dịch UTM tracking.|
|is\_qualified\_traffic|Boolean|Có|Đánh dấu true nếu phiên truy cập thỏa mãn tiêu chí Incremental Qualified Traffic (thuộc đúng target audience, thời gian ở lại trang > 30s hoặc phát sinh chuyển đổi).|
|event\_timestamp|Timestamp|Có|Thời điểm ghi nhận sự kiện (chuẩn UTC quy đổi theo Asia/Ho\_Chi\_Minh).|

###### 7.2. Bảng content\_performance (Hiệu suất tổng hợp theo nội dung)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|performance\_id|UUID / PK|Có|Khóa chính bảng hiệu suất.|
|content\_id|UUID / PK|Có|Bài viết được thống kê.|
|impressions|Integer|Có|Tổng số lượt hiển thị (Search Console / Social).|
|clicks|Integer|Có|Tổng số lượt click.|
|qualified\_visits|Integer|Có|Số lượng qualified traffic tạo ra từ nội dung này.|
|leads\_generated|Integer|Có|Số lượng lead thực tế thu về.|
|data\_status|Enum|Có|Trạng thái dữ liệu: active, hoặc insufficient\_data (khi thiếu API hoặc chưa đủ thời gian tích lũy số liệu). Tuyệt đối không tự bịa số liệu.|

### 8\. NHÓM VẬN HÀNH, HÀNG ĐỢI \& BẢO MẬT (OPERATIONS \& GOVERNANCE)

###### 8.1. Bảng agent\_tasks (Sổ cái nhiệm vụ của Orchestrator)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|task\_id|UUID / PK|Có|Khóa chính định danh nhiệm vụ agent.|
|workspace\_id|UUID / PK|Có|Workspace liên quan.|
|agent\_role|Enum|Có|Vai trò thực thi: Research\_Trend, SEO\_Worker, Content\_Marketing, Performance\_Marketing, Community\_Intake, Growth\_Analyst|
|action\_name|String|Có|Tên tác vụ cần thực hiện.|
|task\_status|Enum|Có|Trạng thái task: Queued, Running, Needs Review, Approved, Completed, Failed, Retry. Khi chờ con người, hệ thống không giữ model chạy.|

###### 8.2. Bảng idempotency\_keys (Engine chống trùng lặp thao tác)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|idempotency\_key|String / PK|Có|Khóa định danh duy nhất cho mỗi thao tác nhạy cảm (như gửi form lead, xuất bản bài viết). Cùng khóa cùng dữ liệu trả về kết quả cũ; cùng khóa khác dữ liệu trả về HTTP 409 Conflict.|
|response\_payload|Text|Có|Kết quả phản hồi đã được lưu trữ để trả lại khi retry.|

###### 8.3. Bảng audit\_logs (Nhật ký kiểm toán \& Dừng khẩn cấp Kill-switch)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|audit\_id|UUID / PK|Có|Khóa chính nhật ký.|
|workspace\_id|UUID / FK|Có|Workspace liên quan.|
|actor\_id|String|Có|Tác nhân thực hiện hành động (User ID hoặc Agent ID).|
|action\_desc|Text|Có|Mô tả chi tiết hành động (ví dụ: Duyệt bài viết, thay đổi offer, kích hoạt Kill-switch).|
|ip\_address|String|Không|Địa chỉ IP thực hiện.|
|created\_at|Timestamp|Có|Thời điểm ghi nhận log (chính xác theo UTC).|
