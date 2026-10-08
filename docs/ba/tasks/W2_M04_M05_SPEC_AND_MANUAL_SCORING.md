# ĐẶC TẢ CHI TIẾT M04–M05 \& VÍ DỤ TÍNH TAY ĐIỂM SỐ (NGÀY 6–7)

* Dự án: AI Growth OS (TripC - Expat tại Đà Nẵng)



* Giai đoạn: W2 (Ngày 6–7) - Chốt M04 \& M05 phục vụ Dev \& Thanh (QA)



* Chủ trì: Dương (BA) | Reviewer: Thanh (QA) \& Team AI



#### PHẦN 1: M04 - MARKET INTELLIGENCE (QUẢN LÝ NGUỒN, TIMESTAMP \& XỬ LÝ LỖI)

##### 1.Quản lý Nguồn nghiên cứu (Research Source Provenance):

&#x09;-Mọi mẩu thông tin (discovery) quét được từ thị trường phải được gán nhãn nguồn rõ ràng (source\_type, source\_url, workspace\_id) nhằm đảm bảo tính minh bạch, chống vi phạm bản quyền và loại bỏ rủi ro pháp lý.

#### 2.Quản lý Mốc thời gian (Timestamp \& Freshness):

&#x09;-Hệ thống ghi nhận chính xác thời điểm crawl (scraped\_at).

&#x09;-Chỉ số Freshness (Độ tươi mới): Được tính dựa trên độ cũ/mới của dữ liệu để ưu tiên các xu hướng mới nổi.

&#x09;-Quy định trọng số: Dữ liệu phát sinh trong vòng 7 ngày gần nhất được đánh trọng số cao nhất (cộng điểm bonus lớn nhất vào opportunity score), dữ liệu từ 8–30 ngày giảm trọng số, và quá dữ liệu cũ trên 30 ngày sẽ bị giảm mạnh hoặc loại khỏi nhóm xu hướng nóng.

#### 3.Cơ chế xử lý lỗi khi quét dữ liệu (Crawler Failure Handling):

Khi tiến trình quét tự động gặp sự cố (timeout, HTTP 403/404, lỗi server 5xx):

&#x09;-Tuyệt đối không tự bịa đặt dữ liệu giả (no hallucination)2E

&#x09;-Ghi log lỗi chi tiết vào bảng crawler\_error\_logs (gồm url, error\_code, timestamp) để kỹ thuật viên kiểm tra.

&#x09;-Giữ nguyên giá trị dữ liệu cũ gần nhất (Last Known Good Data) trên giao diện hoặc hiển thị nhãn cảnh báo: Data syncing failed / Source outdated.

#### PHẦN 2: M05 - OPPORTUNITY ENGINE, RUBRIC \& LUỒNG DỮ LIỆU

#### 1.Công thức và Các thành phần điểm số (Opportunity Score):

Công thức tổng quát:

&#x09; **Opportunity Score = (Demand Score x Business Relevance) + Freshness Bonus**

Chi tiết thành phần:

&#x09;-Demand Score (1–10): Đánh giá mức độ quan tâm của thị trường (dựa trên tần suất thảo luận, xu hướng tìm kiếm).

&#x09;-Business Relevance (1–5): Mức độ phù hợp với dịch vụ cốt lõi của Tenant (Ví dụ: Căn hộ cho thuê dài hạn tại An Thượng sẽ có relevance cao với tenant lưu trú nhưng thấp với F\&B).

&#x09;-Freshness Bonus (0–2): Điểm thưởng dựa trên mốc thời gian scraped\_at (ưu tiên dữ liệu < 7 ngày).

#### 2.Xử lý khi thiếu dữ liệu Nhu cầu (Missing Demand):

Nếu dữ liệu thị trường chưa đủ để thống kê tự động:

&#x09;-Hệ thống gán nhãn trạng thái Demand: Uncalculated.

&#x09;-UI/UX bắt buộc hiển thị cảnh báo: "Chưa đủ dữ liệu thống kê demand thực tế, điểm số mang tính tham khảo (Heuristic Score)."

##### 3.Bộ lọc (Filter) và Chọn lựa (Select):

&#x09;-Filter: Cho phép lọc theo mức độ ưu tiên (P0, P1, P2), theo kênh nguồn (SEO, Social, Community), và trạng thái dữ liệu (Verified / Unreviewed).

&#x09;-Select: Cho phép Owner/Editor tích chọn các cơ hội tiềm năng để đẩy thẳng sang M06 (Growth Strategy) hoặc M07 (Brief) mà vẫn giữ nguyên vẹn ID gốc và nguồn liên kết.

tại sao lain có phép tính toán như vây

#### PHẦN 3: VÍ DỤ TÍNH TAY ĐIỂM SỐ (CHO THANH - QA ĐỐI CHUẾT)

Để Thanh (QA) dễ dàng kiểm tra logic tính toán của hệ thống, dưới đây là 2 kịch bản tính tay cụ thể:

###### Kịch bản 1: Cơ hội về căn hộ dịch vụ dài hạn cho Expat tại An Thượng (Tenant 1)

&#x09;-Đầu vào: Demand Score = 8 | Business Relevance = 5 | Freshness Bonus (mới crawl trong 3 ngày) = 1.5.

&#x09;-Tính toán: (8 x 5) + 1.5 = 41.5 (Quy đổi chuẩn hóa hệ thống ra 88 / 100).

&#x09;-Kết quả xếp loại: P0 (Ưu tiên cao nhất).

##### Kịch bản 2: Cơ hội về quán ăn chay (Không khớp với mảng lưu trú của Tenant 1)

&#x09;-Đầu vào: Demand Score = 9 | Business Relevance = 1 | Freshness Bonus = 0.5.

&#x09;-Tính toán: (9 x 1) + 0.5 = 9.5.

&#x09;-Kết quả xếp loại: P2 (Ưu tiên thấp / Không khuyến nghị cho Tenant này).

#### PHẦN 4: PHÂN BIỆT RÕ RÀNG HEURISTIC SCORE VÀ SEARCH VOLUME THỰC TẾ

&#x09;-Search Volume thực tế (Lượng tìm kiếm chính xác): Là con số tuyệt đối lấy từ các công cụ chuyên sâu (như Google Keyword Planner/Ahrefs) thể hiện chính xác số lượt gõ từ khóa.



&#x09;-Heuristic Score (Điểm định tính ước lượng của AI): Là điểm số định hướng (thang 1–10) do thuật toán và AI tự đánh giá dựa trên ngữ cảnh thị trường, tín hiệu mạng xã hội và độ liên kết kinh doanh.



&#x09;-Quy định kiểm thử (QA Note): Tuyệt đối không được gán nhãn điểm heuristic (Demand Score) thành lượng tìm kiếm thực tế (Search Volume) để tránh làm sai lệch báo cáo chiến lược của doanh nghiệp.

