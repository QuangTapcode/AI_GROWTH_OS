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
|automation\_paused|Boolean|Có|Cờ Kill-switch toàn cục ngắt automation trong workspace (`false` mặc định).|
|publishing\_paused|Boolean|Có|Cờ Kill-switch toàn cục ngắt xuất bản bài viết (`false` mặc định).|
|created\_at|Timestamp|Có|Thời điểm tạo workspace.|



###### 1.3. Bảng users  (Thông tin nhân sự / tài khoản hệ thống)



|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|user\_id|UUID / PK|Có|Khóa chính định danh người dùng hệ thống.|
|email|String / Unique|Có|Email đăng nhập (định danh duy nhất).|
|password\_hash|String|Có|Mật khẩu đã mã hóa.|
|created\_at`|Timestamptz|Có|Thời điểm tạo tài khoản.|



###### 1.4. Bảng memberships (Quan hệ thành viên - Workspace RBAC)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|membership\_id|UUID / PK|Có|Khóa chính định danh quan hệ thành viên.|
|workspace\_id|UUID / FK|Có|Khóa ngoại trỏ đến `workspaces`.|
|user\_id|UUID / FK|Có|Khóa ngoại trỏ đến `users`.|
|role|Enum|Có|Vai trò trong workspace: `owner`, `admin`, `growth\_manager`, `content\_manager`, `editor`, `viewer`. (Áp dụng UNIQUE(`workspace\_id`, `user\_id`) để 1 user tham gia nhiều workspace với quyền khác nhau).|
|status|Enum|Có|Trạng thái: `active`, `suspended`, `invited`.|
|created\_at|Timestamptz|Có|Thời điểm gán quyền.|



### 2\. NHÓM HỒ SƠ DOANH NGHIỆP \& ƯU ĐÃI (BUSINESS CONTEXT \& OFFER)

###### 2.1. Bảng business\_profiles (Hồ sơ doanh nghiệp \& Cấu hình AI)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|profile\_id|UUID / PK|Có|Khóa chính định danh hồ sơ doanh nghiệp.|
|workspace\_id|UUID / FK + Unique|Có|Khóa ngoại trỏ đến `workspaces` (Quan hệ 1-1, đảm bảo mỗi workspace có đúng 1 profile).|
|company\_name|String|Có|Tên doanh nghiệp (ví dụ: TripC).|
|industry|String|Có|Lĩnh vực hoạt động (ví dụ: Travel / Expat Services).|
|target\_markets|Text / Array|Có|Thị trường mục tiêu (ví dụ: Đà Nẵng, Việt Nam).|
|target\_audiences|Text / Array|Có|Đối tượng mục tiêu (ví dụ: English-speaking expats, digital nomads).|
|core\_offer|Text|Có|Sản phẩm/Dịch vụ cốt lõi (Cẩm nang và dịch vụ tư vấn chỗ ở, tiện ích sinh sống).|
|cta\_primary|String|Có|Lời kêu gọi hành động Top-of-funnel (ví dụ: "Tải Cẩm nang sinh sống tại Đà Nẵng miễn phí").|
|cta\_secondary|String|Không|Lời kêu gọi hành động Bottom-of-funnel (ví dụ: "Kết nối chuyên gia tư vấn TripC")|
|tone\_preset|Enum|Có|Giọng văn chuẩn: Friendly, Professional, Informative, Youthful. Áp dụng cố định vào prompt của AI Content Factory.|
|ai\_budget\_limit|Decimal|Có|Giới hạn chi phí / hạn mức gọi LLM hàng tháng cho workspace.|
|currency|String|Có|Đơn vị tiền tệ (ví dụ: `USD`, `VND`).|
|version|Integer|Có|Số phiên bản bản ghi phục vụ Optimistic Concurrency Control (tự động tăng +1, trả về HTTP 409 khi xung đột).|
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
|verified\_by|UUID / FK|Không|User ID của người đã thẩm định nguồn (`users.user\_id`).|
|verified\_at|Timestamptz|Không|Thời điểm kiểm chứng nguồn.|
|review\_due\_at|Timestamptz|Không|Thời hạn cần kiểm tra lại nguồn (để tránh lỗi thời).|
|content\_hash|String|Có|Mã hash SHA-256 nội dung nguồn để phát hiện thay đổi dữ liệu gốc.|
|source\_version|Integer|Có|Phiên bản nguồn (tự động tăng khi nội dung gốc thay đổi, kích hoạt đánh dấu `Stale` cho bài viết liên quan).|



###### 3.2. Bảng source\_chunks (Phân mảnh vector RAG pgvector)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|chunk\_id|UUID / PK|Có|Khóa chính định danh đoạn văn bản phân mảnh.|
|source\_id|UUID / FK|Có|Khóa ngoại trỏ đến bảng sources.|
|chunk\_index|Integer|Có|Số thứ tự đoạn chunk trong tài liệu gốc.|
|chunk\_text|Text|Có|Nội dung đoạn văn bản thô|
|page\_or\_section|String|Không|Vị trí trang, chương hoặc mục.|
|embedding|Vector(768)|Có|Vector nhúng 768 chiều sử dụng tiện ích mở rộng pgvector (HNSW index) phục vụ tìm kiếm ngữ nghĩa.|
|embedding\_model|String|Có|Tên model tạo vector (ví dụ: `text-embedding-3-small`).|
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
|demand\_score|Decimal|Có|Điểm nhu cầu thị trường (0-100).|
|business\_relevance\_score|Decimal|Có|Điểm phù hợp với sản phẩm/offer của doanh nghiệp (0-100).|
|target\_audience|String|Có|Đối tượng hướng tới.|
|estimated\_demand|Integer|Có|Điểm nhu cầu ước lượng.|
|growth\_potential\_score|Decimal|Có|Tiềm năng tăng trưởng traffic (0-100).|
|content\_gap\_score|Decimal|Có|Điểm khoảng trống nội dung so với đối thủ (0-100).|
|freshness\_score|Decimal|Có|Điểm tính mới của xu hướng (0-100)|
|conversion\_potential\_score|Decimal|Có|Tiềm năng chuyển đổi thành lead (0-100).|
|opportunity\_score|Decimal|Có|Điểm cơ hội tính theo công thức chuẩn PRD: Demand × Business Relevance × Growth Potential × Content Gap × Freshness × Conversion Potential. (Nếu thiếu dữ liệu search volume, bắt buộc gắn nhãn "estimated").|
|scoring\_version|String|Có|Phiên bản thuật toán tính điểm.|
|is\_estimated|Boolean|Có|Cờ phân biệt giá trị ước lượng (`true`) với dữ liệu đo đạc thực tế (`false`).|
|evidence|Text|Có|Căn cứ dữ liệu và thời điểm chấm điểm (`scored\_at`).|
|priority|Enum|Có|Mức độ ưu tiên: P0 (Cao nhất), P1, P2, P3.|

###### 4.3. Bảng campaigns (Chiến dịch tiếp thị 30 ngày - Mắt xích trung tâm)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|campaign\_id|UUID / PK|Có|Khóa chính định danh chiến dịch.|
|workspace\_id|UUID / FK|Có|Khóa ngoại trỏ đến `workspaces`.|
|goal\_id|UUID / FK|Không|Liên kết đến mục tiêu chiến lược `growth\_goals`|
|campaign\_name|String|Có|Tên chiến dịch (ví dụ: "Q4 Expat Housing Push").|
|start\_date|Date|Có|Ngày bắt đầu chiến dịch.|
|end\_date|Date|Có|Ngày kết thúc chiến dịch.|
|campaign\_status|Enum|Có|Trạng thái: `Draft`, `Active`, `Paused`, `Completed`.|

###### 4.4. Bảng campaign\_opportunities (Bảng trung gian gắn Cơ hội vào Chiến dịch)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|campaign\_id|UUID / FK|Có|Khóa ngoại trỏ đến `campaigns`.|
|opportunity\_id|UUID / FK|Có|Khóa ngoại trỏ đến `growth\\\\\\\_opportunities`.|
|assigned\_weight|Decimal|Không|Trọng số ưu tiên phân bổ trong chiến dịch.|



### 5\. NHÓM SỔ CÁI NỘI DUNG \& PHÊ DUYỆT (CONTENT LEDGER \& APPROVAL)

###### 5.1. Bảng contents (Tài sản nội dung chính)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|content\_id|UUID / PK|Có|Khóa chính định danh bài viết / nội dung.|
|workspace\_id|UUID / PK|Có|Workspace sở hữu nội dung.|
|campaign\_id|UUID / PK|Không|Chiến dịch tiếp thị liên quan.|
|title|String|Có|Tiêu đề bài viết.|
|content\_type|Enum|Có|Loại nội dung: Blog, Guide, Listicle, FAQ, Social\_Post, Comparison.|
|search\_intent|Enum|Có|Ý định tìm kiếm: Informational, Commercial, Transactional.|
|content\_status|Enum|Có|Vòng đời nội dung: Draft, In Review (Chờ duyệt), Approved (Đã duyệt), Published (Đã xuất bản), Stale (Mất hiệu lực do đổi offer/nguồn).|
|quality\_score|Integer|Không|Điểm chất lượng AI (chấm trên các tiêu chí Accuracy, Originality, SEO, Useful value, Brand fit, Conversion). Dưới ngưỡng tối thiểu sẽ bị giữ lại.|
|created\_by|String|Có|Tác nhân tạo (ai\_agent hoặc human).|

###### 



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

###### 5.3. Bảng content\_approvals (Sổ cái kiểm duyệt phiên bản - Level 2 HITL)



|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|approval\_id|UUID / PK|Có|Khóa chính định danh lượt kiểm duyệt.|
|workspace\_id|UUID / FK|Có|Khóa ngoại trỏ đến `workspaces`.|
|version\_id|UUID / FK|Có|Khóa ngoại trỏ đến chính xác `content\_versions.version\_id` được xét duyệt.|
|reviewer\_id|UUID / FK|Có|Khóa ngoại trỏ đến `users.user\_id` (Người thực hiện duyệt).|
|decision|Enum|Có|Quyết định: `Approved`, `Rejected`, `Revoked` (Thu hồi duyệt do nội dung sửa đổi).|
|comment|Text|Có|Nhận xét hoặc lý do từ chối/duyệt của reviewer.|
|created\_at|Timestamptz|Có|Thời điểm đưa ra quyết định.|



###### 5.4. Bảng publishing\_jobs (Lịch trình \& Tác vụ xuất bản)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|job\_id|UUID / PK|Có|Khóa chính định danh lịch xuất bản.|
|content\_id|UUID / FK|Có|Khóa ngoại trỏ đến `contents`.|
|version\_id|UUID / FK|Có|Khóa ngoại trỏ đến `content\_versions.version\_id` đã được phê duyệt (`Approved`). Hệ thống bắt buộc kiểm tra phiên bản này còn hợp lệ trước khi publish.|
|channel|Enum|Có|Kênh phân phối: Website, Facebook, Instagram, Newsletter|
|channel\_destination|String|Không|Định danh đích đến cụ thể (Page ID, Substack API endpoint).|
|external\_post\_id|String|Không|ID bài đăng trả về từ nền tảng bên ngoài sau khi xuất bản thành công.|
|external\_url|String|Không|Đường dẫn công khai bài viết trên kênh ngoài.|
|scheduled\_at|Timestamp|Có|Thời gian dự kiến xuất bản (chuẩn UTC / Asia/Ho\_Chi\_Minh).|
|attempt\_count|Integer|Có|Số lần thử xuất bản (mặc định 0).|
|last\_error|Text|Không|Thông báo lỗi chi tiết trong lần thử gần nhất nếu thất bại.|
|job\_status|Enum|Có|Trạng thái job: Pending\_Approval, Approved, Scheduled, Publishing, Published, Failed.|

###### 

### 6\. NHÓM TIẾP NHẬN KHÁCH HÀNG QUAN TÂM \& KẾT NỐI (LEAD INTAKE \& CONNECTORS)

###### 6.1. Bảng leads (Quản lý khách hàng tiềm năng tối giản - Sales Handoff)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|lead\_id|UUID / PK|Có|Khóa chính định danh lead.|
|workspace\_id|UUID / FK|Có|Workspace tiếp nhận lead.|
|campaign\_id|UUID / FK|Không|Liên kết chiến dịch phát sinh lead.|
|content\_id|UUID / FK|Không|Liên kết bài viết phát sinh lead.|
|contact\_fingerprint|String|Có|Mã băm (hash) thông tin liên hệ chuẩn hóa để nhận diện khách hàng cũ trong workspace.|
|contact\_name|String|Không|Tên khách hàng quan tâm.|
|contact\_email|String|Có|Email liên hệ chính.|
|phone\_number|String|Không|Số điện thoại (nếu có).|
|utm\_source|String|Không|Nguồn truy cập (ví dụ: facebook, google).|
|utm\_medium|String|Không|Kênh phân phối (ví dụ: organic, social).|
|utm\_campaign|String|Không|Tên chiến dịch (ví dụ: da-nang-housing).|
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
|encrypted\_credentials|Text|Không|Thông tin xác thực được mã hóa an toàn trên server (tuyệt đối không đưa vào prompt AI).|

### 7\. NHÓM ĐO LƯỜNG \& PHÂN TÍCH (ANALYTICS \& PERFORMANCE)

###### 7.1. Bảng analytics\_events (Sự kiện lưu lượng truy cập \& chuyển đổi)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|event\_id|UUID / PK|Có|Khóa chính sự kiện phân tích.|
|workspace\_id|UUID / FK|Có|Khóa ngoại trỏ đến workspaces.|
|content\_id|UUID / FK|Không|Bài viết phát sinh sự kiện truy cập.|
|event\_type|Enum|Có|Loại sự kiện: pageview, session\_start, cta\_click, form\_submit, lead\_capture|
|session\_duration\_sec|Integer|Không|Thời lượng tương tác trong phiên (tính bằng giây).|
|session\_id|String|Có|Định danh phiên duyệt web của người dùng ẩn danh.|
|utm\_source|String|Có|Nguồn UTM tracking.|
|utm\_campaign|String|Có|Chiến dịch UTM tracking.|
|is\_qualified\_traffic|Boolean|Có|Đánh dấu true nếu phiên truy cập thỏa mãn tiêu chí Incremental Qualified Traffic (thuộc đúng target audience, thời gian ở lại trang > 30s hoặc phát sinh chuyển đổi).|
|is\_incremental|Boolean|Có|Gắn cờ true nếu xác định đây là phần traffic tăng thêm so với baseline lịch sử đã xác định.|
|event\_timestamp|Timestamp|Có|Thời điểm ghi nhận sự kiện (chuẩn UTC quy đổi theo Asia/Ho\_Chi\_Minh).|

###### 7.2. Bảng content\_performance (Hiệu suất tổng hợp theo nội dung)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|performance\_id|UUID / PK|Có|Khóa chính bảng hiệu suất.|
|content\_id|UUID / FK|Có|Bài viết được thống kê.|
|period\_start|Date|Có|Ngày bắt đầu kỳ đo lường thống kê.|
|period\_end|Date|Có|Ngày kết thúc kỳ đo lường thống kê.|
|channel	String|String|Có|Kênh đo lường (ví dụ: Google\_Search, Facebook).|
|data\_source|String|Có|Nguồn dữ liệu tích hợp (Google\_Search\_Console, GA4).|
|impressions|Integer|Có|Tổng số lượt hiển thị (Search Console / Social).|
|clicks|Integer|Có|Tổng số lượt click.|
|qualified\_visits|Integer|Có|Số lượng qualified traffic tạo ra từ nội dung này.|
|leads\_generated|Integer|Có|Số lượng lead thực tế thu về.|
|data\_status|Enum|Có|Trạng thái dữ liệu: active, hoặc insufficient\_data (khi thiếu API hoặc chưa đủ thời gian tích lũy số liệu). Tuyệt đối không tự bịa số liệu.|
|updated\_at|Timestamptz|Có|Thời điểm tổng hợp dữ liệu gần nhất.|

### 8\. NHÓM VẬN HÀNH, HÀNG ĐỢI \& BẢO MẬT (OPERATIONS \& GOVERNANCE)

###### 8.1. Bảng agent\_tasks (Sổ cái nhiệm vụ của Orchestrator)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|task\_id|UUID / PK|Có|Khóa chính định danh nhiệm vụ agent.|
|workspace\_id|UUID / FK|Có|Workspace liên quan.|
|campaign\_id|UUID / FK|Không|Khóa ngoại trỏ đến campaigns liên quan.|
|agent\_role|Enum|Có|Vai trò thực thi: Research\_Trend, SEO\_Worker, Content\_Marketing, Performance\_Marketing, Community\_Intake, Growth\_Analyst|
|action\_name|String|Có|Tên tác vụ cần thực hiện.|
|input\_ref|Text / JSON|Không|Tham chiếu dữ liệu đầu vào cho task.|
|output\_ref|Text / JSON|Không|Tham chiếu dữ liệu đầu ra sau khi chạy xong.|
|attempt\_count|Integer|Có|Số lần thử thực thi hiện tại.|
|task status|Enum|Có|Trạng thái task: Queued, Running, Needs Review, Approved, Completed, Failed, Retry. Khi chờ con người, hệ thống không giữ model chạy.|
|max\_attempts|Integer|Có|Số lần thử tối đa trước khi đánh dấu Failed.|
|next\_retry\_at|Timestamptz|Không|Thời gian lịch hẹn chạy lại khi task bị lỗi (Retry).|
|last\_error|Text|Không|Chi tiết lỗi trong lần thực thi gần nhất.|
|scheduled\_at|Timestamptz|Có|Thời gian lên lịch chạy task.|
|started\_at|Timestamptz|Không|Thời điểm bắt đầu chạy thực tế.|
|completed\_at|Timestamptz|Không|Thời điểm hoàn thành.|

###### 8.2. Bảng idempotency\_keys (Engine chống trùng lặp thao tác)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|idempotency\_key|String |Có|Khóa định danh duy nhất cho mỗi thao tác nhạy cảm (như gửi form lead, xuất bản bài viết). Cùng khóa cùng dữ liệu trả về kết quả cũ; cùng khóa khác dữ liệu trả về HTTP 409 Conflict.|
|workspace\_id|UUID / FK|Có|Khóa ngoại trỏ đến workspaces.|
|operation\_type|String	|Có|Khởi tạo thao tác (submit\_lead, publish\_content).|
|request\_hash|String	|Có|Mã hash SHA-256 của payload request để kiểm tra tính toàn vẹn khi retry.|
|response\_payload|Text|Có|Kết quả phản hồi đã được lưu trữ để trả lại khi retry.|
|expires\_at|Timestamptz|Có|Thời hạn hết hiệu lực của khóa chống trùng.|
|created\_at|Timestamptz|Có|Thời điểm khởi tạo khóa.|

###### 8.3. Bảng usage (Sổ cái ghi nhận tiêu thụ AI Credits \& Chi phí LLM)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|usage\_id|UUID / PK|Có|Khóa chính bản ghi tiêu thụ|
|workspace\_id|UUID / FK|Có|Khóa ngoại trỏ đến workspaces.|
|agent\_role|String|Có|Tác nhân / Agent phát sinh chi phí|
|tokens\_consumed|Integer|Có|Số lượng token LLM đã sử dụng.|
|cost\_amount|Decimal|Có|Chi phí tính bằng tiền tương ứng.|
|currency|String|Có|Đơn vị tiền tệ (USD).|
|recorded\_at|Timestampt|Có|Thời điểm ghi nhận giao dịch tiêu thụ|



###### 8.4. Bảng audit\_logs (Nhật ký kiểm toán \& Dừng khẩn cấp Kill-switch)

|Tên Trường (Field)|Kiểu dữ liệu|Bắt buộc|Mô tả \& Quy tắc ràng buộc|
|-|-|-|-|
|audit\_id|UUID / PK|Có|Khóa chính nhật ký.|
|workspace\_id|UUID / FK|Có|Workspace liên quan.|
|actor\_id|UUID / String|Có|Tác nhân thực hiện hành động (User ID hoặc Agent ID).|
|action\_desc|Text|Có|Mô tả chi tiết hành động (ví dụ: Duyệt bài viết, thay đổi offer, kích hoạt Kill-switch).|
|ip\_address|String|Không|Địa chỉ IP thực hiện.|
|created\_at|Timestamp|Có|Thời điểm ghi nhận log (chính xác theo UTC).|



