### PHẦN 1: TIÊU CHÍ CHẤP NHẬN (ACCEPTANCE CRITERIA - AC) CHO 7 KHÂU / 6 VAI TRÒ AGENT

**1. Khâu Research (Research \& Trend Agent)**

* AC-RES-01 (Nguồn dữ liệu đầu vào công khai): Mọi ý tưởng nghiên cứu xu hướng, tin tức hoặc câu hỏi thị trường bắt buộc phải có ít nhất 1 URL nguồn công khai hợp lệ, timestamp thu thập và lý do chọn lựa. Tuyệt đối không dùng dữ liệu tự suy diễn hoặc cào trái phép.



* AC-RES-02 (Định dạng Research Brief): Kết quả thu thập phải được đóng gói thành Research Brief lưu trữ trong hệ thống, bao gồm: Chủ đề, Từ khóa định hướng, Nhu cầu cốt lõi của user và các điểm chưa rõ cần xác minh thêm.



**2. Khâu Campaign \& Strategy (Growth Lead \& Analyst)**

* AC-CAM-01 (Chấm điểm cơ hội minh bạch): Cơ hội tăng trưởng phải được chấm điểm theo công thức chuẩn (Opportunity Score = Demand × Business Relevance × Growth Potential × Content Gap × Freshness × Conversion Potential). Các chỉ số ước lượng thiếu dữ liệu chuẩn từ bên thứ ba phải được gắn nhãn rõ ràng "estimated / ước lượng".



* AC-CAM-02 (Đầu ra Campaign Plan): Hệ thống phải sinh ra thành công Campaign Plan chứa danh sách các task chi tiết phân công cho SEO Worker và Content Marketing kèm theo mục tiêu đối tượng, CTA và deadline cụ thể.



**3. Khâu SEO (SEO Worker)**

* AC-SEO-01 (Kiểm soát On-page chuẩn): Bài viết/Trang SEO chuẩn bị xuất bản phải vượt qua danh sách kiểm tra on-page (Tiêu đề, Meta description, Cấu trúc Heading, Internal links cơ bản).



* AC-SEO-02 (Chống bịa đặt dữ liệu - Anti-hallucination): Toàn bộ thông tin về giá cả, địa điểm, quy định hay facts phải khớp tuyệt đối với Business Knowledge Base, đi kèm trích dẫn nguồn (provenance) cho từng đoạn nội dung.



AC-SEO-03 (Quản lý phiên bản - Versioning): Bài viết phải được quản lý theo cơ chế versioning. Mọi chỉnh sửa từ con người hay AI đều tạo ra version mới và làm mất hiệu lực phê duyệt cũ (bắt buộc duyệt lại từ đầu).



**4. Khâu Content (Content Marketing)**

* AC-CNT-01 (Đồng bộ Brand Voice \& Ngữ cảnh): Nội dung sinh ra phải bám sát Tone Preset được chọn. Khi tái sử dụng bài viết Blog thành các Social Pack, phải lưu liên kết gốc (parent\_content\_id).



* AC-CNT-02 (Tài nguyên và định dạng đi kèm): Đầu ra bao gồm đầy đủ Caption, Call to Action, định dạng hiển thị kênh và Image Prompt hoặc tệp hình ảnh hợp lệ. (Video trong MVP 4 tuần chỉ giới hạn ở mức kịch bản chi tiết - script).



**5. Khâu Community \& Lead Intake (Community \& Lead Intake Agent)**

* AC-COM-01 (Kiểm soát tương tác cộng đồng): Các câu trả lời thảo luận/thắc mắc trên mạng xã hội do agent soạn thảo phải dựa trên tài liệu đã xác minh và luôn bắt buộc qua Hàng đợi phê duyệt (Approval Queue) trước khi phản hồi live.



* AC-COM-02 (Chống trùng lặp Lead): Form thu thập thông tin khách hàng phải tích hợp cơ chế Idempotency Engine chống trùng lặp lead theo workspace.



* AC-COM-03 (Bàn giao Lead tối giản - Sales Handoff): Lead thu về phải ghi nhận đầy đủ các trường: Lead ID, Nguồn/UTM, Trạng thái (New / Assigned), và Người phụ trách nhận lead.



**6. Khâu Performance (Performance Marketing)**

* AC-PER-01 (Minh bạch dữ liệu \& Bằng chứng): Mọi báo cáo hiệu suất hoặc đề xuất phải có bằng chứng từ snapshot dữ liệu thực tế (GA4, Search Console, Meta Insights). Nếu thiếu quyền hoặc thiếu dữ liệu, bắt buộc ghi nhãn insufficient\_data, tuyệt đối không tự bịa số liệu.



* AC-PER-02 (Ranh giới quyền hạn): Agent Performance chỉ ở mức đọc dữ liệu và đề xuất (khung giờ đăng, đối tượng, ý tưởng creative), hoàn toàn không có quyền tự động bật/sửa hoặc chi tiêu ngân sách quảng cáo trực tiếp.



**7. Khâu Learning (Growth Lead \& Analyst - Learning Module)**

* AC-LRN-01 (Báo cáo tổng kết tuần): Hệ thống tổng hợp được báo cáo định kỳ hàng tuần, ghi nhận rõ ràng các bài học sơ bộ (Learning) rút ra từ hiệu suất nội dung thực tế.



* &#x20;AC-LRN-02 (Đề xuất tác vụ vòng tiếp theo): Tự động sinh danh sách tác vụ (task) cải tiến hoặc điều chỉnh chiến lược cho vòng lặp tăng trưởng tiếp theo dựa trên dữ liệu đã phân tích.



### PHẦN 2: XÁC NHẬN THAM SỐ VẬN HÀNH CHO TRIPC (ĐÀ NẴNG)

Dựa trên tài liệu PRD, các tham số vận hành thực tế cho khách hàng thí điểm TripC (Đà Nẵng) được chốt như sau:



* **Khách hàng mục tiêu** (Target Audience): Cộng đồng người nước ngoài (expat) đang sinh sống, làm việc từ xa, hoặc có dự định chuyển đến sinh sống tại Đà Nẵng.



* **Chủ đề ưu tiên** (Content Pillars): Khu vực sinh sống/nhà ở (Housing), coworking space, gym \& fitness, ẩm thực, sự kiện, thủ tục visa và dịch vụ di chuyển.



* **Offer cốt lõi** (Sản phẩm / Giá trị cốt lõi): Cẩm nang toàn diện và dịch vụ tư vấn/kết nối chỗ ở, tiện ích sinh sống tại Đà Nẵng dành cho expat(người nước ngoài).



* **Call to Action** (CTA chuẩn):



&#x09;Top-of-funnel: "Tải Cẩm nang sinh sống tại Đà Nẵng miễn phí" (Nhận qua email/form).



&#x09;Bottom-of-funnel: "Kết nối với chuyên gia tư vấn TripC để tìm chỗ ở \& dịch vụ phù hợp".



* **Reviewer** (Người phê duyệt nội dung - Mức độ 2 Human-in-the-loop): Đại diện / Product Owner của TripC (giữ quyền duyệt cuối cùng trước khi bất kỳ nội dung nào được xuất bản lên kênh public).



* **Lead Owner** (Người phụ trách nhận lead): Đội ngũ Sales / Telesale của TripC (tiếp nhận thông tin khách hàng qua bảng phân công lead tối giản).

