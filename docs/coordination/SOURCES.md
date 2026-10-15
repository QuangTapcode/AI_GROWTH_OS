# Nguồn dữ liệu pilot TripC — khảo sát ngày 05/10/2026

Người dùng giao tự tìm kiếm và gợi ý nguồn. Danh sách dưới đây là seed corpus đề xuất để AI/BA triển khai ingestion sau; đã đọc trang nguồn, **chưa crawl dataset, chưa có approved business facts, chưa xác nhận quyền bulk access**.

## Năm nguồn ưu tiên

| ID | Nguồn/seed URL | Topic và dữ liệu nên lấy | Vai trò dữ liệu |
| --- | --- | --- | --- |
| SRC-01 | [Da Nang FantastiCity — English](https://danangfantasticity.com/en) | Địa điểm, sự kiện, ăn uống, thông tin điểm đến | Context/research từ cổng thông tin du lịch Đà Nẵng |
| SRC-02 | [Vietnam Tourism — Da Nang](https://www.vietnam.travel/places-to-go/central-vietnam/da-nang) | Guide khu vực/điểm đến/ẩm thực và liên kết bài Da Nang | Nguồn context du lịch quốc gia |
| SRC-03 | [Hiyori Garden Tower — rentals](https://hiyorigardentower.com/en/cho-thue/) | Thông tin căn hộ cho thuê từ website vận hành/môi giới tại tòa nhà | Housing priority; snapshot nguồn, review trước dùng claims |
| SRC-04 | [Enosta Space](https://enostaspace.com/) | Coworking/coliving và địa điểm/dịch vụ công bố trên website đơn vị | Nguồn provider cho work/living |
| SRC-05 | [California booking](https://booking.cali.vn/) | Danh sách club/Da Nang, liên kết thông tin provider | Gym candidate; trang động nên probe khả năng extract trước chọn adapter |

Tôi ưu tiên website chính thức/website đơn vị cung cấp trước cho pilot vì có URL và provenance để đối chiếu facts. Đây là lựa chọn của kế hoạch, không có nghĩa dữ liệu công bố luôn chính xác hoặc cho phép crawl tùy ý.

Hiyori rental page có chỗ title và số phòng trong card không nhất quán tại lúc kiểm tra. Với housing: lấy title/detail/source timestamp riêng, flag conflicts để Dương/Quang Quang review; không suy ra giá/availability hiện tại hoặc tổng thị trường từ một listing. Enosta và Cali cũng không đại diện toàn bộ thị trường coworking/gym.

## Cách giới hạn corpus ban đầu

- Chỉ seed pages và các detail URLs cùng domain/topic cần thiết; AI/BE probe quyền truy cập/phương thức theo W1-AI-02/W1-BE-04 rồi chốt allowlist. Không crawl cả internet/website không giới hạn.
- Business facts TripC do Quang Quang xác nhận qua Dương; nguồn thị trường bên ngoài không được ghi là sản phẩm/chính sách/giá của TripC.
- Lưu source URL/title/fetched_at/content hash/version/language/topic/location/review status/verified_by và workspace. Chỉ facts đã review mới vào approved context.
- Raw text/snapshot và research signal khác với bài sẽ publish: viết lại thành unique value từ facts, kèm evidence, không sao chép toàn văn bài người khác để đăng lại.
- Source đã xóa/thu hồi/outdated phải bị lọc khỏi RAG/cache; refresh/review nếu facts thay đổi.
- URL/run limits, freshness TTL, provider/cost budget và access method là quyết định kỹ thuật/BA ở W1-PM-02/W1-BA-03, chưa tự gán thành cấu hình production.

## Community và search discovery

M11 trước mắt nhập conversation/URL được phép, gắn nguồn, review response và manual handoff; không cần auto crawl Facebook/Reddit/Maps để nghiệm thu. Nếu mở Reddit API, phải theo quy trình/phạm vi access của [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms); không coi trang public là đã có quyền API/bulk access.

M04 dùng một search/API provider được chọn ở W1-BE-03/W1-PM-02 để discover allowed source URLs. Việc nghiên cứu web trong task lập kế hoạch này không phải search connector product đã hoạt động.

## Analytics và conversion

- Conversion pilot là **form nhận thông tin được server lưu thành công**; dùng event đề xuất `generate_lead`, phù hợp sự kiện form/request information trong [GA4 recommended events](https://support.google.com/analytics/answer/9267735?hl=en-EN). Đánh dấu key event theo cấu hình, không bắn conversion khi chỉ click nút hoặc form lỗi.
- Không gửi email/tên/nội dung form vào GA4 parameters hoặc page URLs; lưu lead riêng trong DB. Hướng dẫn nguồn: [Google — tránh gửi PII vào Analytics](https://support.google.com/analytics/answer/6366371?hl=en).
- Website mới có thể chưa có Search Console performance data; no search clicks/delay phải hiện đúng missing/zero theo nguồn, không thay bằng data giả. Nguồn: [Search Console — newly added websites](https://support.google.com/webmasters/answer/96568?device=c&hl=en).

Đây là corpus/measurement plan. Dữ liệu live và credentials/property IDs sẽ được tạo ở task triển khai, không nằm trong W1-PM-01.

## Corpus RAG v1 — rà soát 06/10/2026

Kết luận: không có bộ dữ liệu mở nào cho giá thuê/tình trạng còn phòng ở Đà Nẵng dùng thương mại được (portal và nền tảng đặt phòng cấm sao chép/scrape; Numbeo chỉ cho cá nhân; dataset Kaggle/Hugging Face là NC hoặc cũ; Inside Airbnb không có thành phố Việt Nam). Giá, giờ mở cửa và tình trạng còn phòng chỉ lấy từ fact sheet TripC hoặc đối tác có văn bản cho phép ([mẫu](../../services/ai/corpus/templates/README.md)). Phần ngữ cảnh dùng nguồn có license dưới đây, sinh bằng `python -m corpus.build` trong `services/ai/`.

| Nguồn | License | Chủ đề | Trạng thái |
| --- | --- | --- | --- |
| Wikivoyage “Da Nang” | CC BY-SA 4.0 | Khu sống, ăn uống, đi lại, an toàn | Đã đưa vào corpus, bỏ giá; dùng tên quận cũ |
| GOV.UK FCDO travel advice Vietnam | OGL v3.0 | Nhập cảnh, an toàn, y tế | Đã đưa vào corpus (5 phần, cập nhật 21/09/2026) |
| OpenStreetMap (Overpass) | ODbL 1.0 | Gym, coworking (chỉ 3), chợ, y tế; gán phường 2025 | Đã đưa vào corpus; không có giờ/điện thoại; giữ tách khỏi dữ liệu TripC |
| NQ 1659/NQ-UBTVQH15 | Văn bản pháp luật (không bảo hộ quyền tác giả) | 23 phường mới và đơn vị cũ | Đã đưa vào corpus + bảng alias; khoản 13–20 mới đối chiếu một nguồn |
| Smartraveller (Úc), travel.state.gov (Mỹ) | CC BY / public domain | Thông tin thực tế cho người nước ngoài | Có thể thêm; bị chặn/timeout khi tải tự động ngày 06/10 |
| Thống kê TP Đà Nẵng (CPI giá thuê) | Báo cáo hành chính | Xu hướng giá thuê (% , không có mức VND) | Chỉ làm ngữ cảnh, xin xác nhận trước khi lưu toàn văn |
| danangfantasticity.com | Có bản quyền, chưa đọc được Terms | Sự kiện, ăn uống, lưu trú | Cần xin phép Trung tâm Xúc tiến Du lịch (W1-QQ-09) |
| vietnam.travel | Cấm sao chép/lưu khi chưa có văn bản cho phép | Du lịch | Chỉ research |
| Overture Maps / Foursquare OS Places | CDLA-Permissive-2.0 / Apache-2.0 | POI | Chỉ để khám phá (nhiều nhiễu, tên quận cũ) |
| batdongsan, Nhà Tốt, Airbnb, Booking, Agoda, Facebook, Google Maps, Numbeo | Điều khoản cấm | Giá/tin đăng | **Tránh** |

Từ 1/7/2025 Đà Nẵng sáp nhập Quảng Nam và bỏ cấp quận; hầu hết dữ liệu và câu hỏi người dùng vẫn dùng tên quận cũ, nên retrieval dùng [bảng alias](../../services/ai/data/danang_wards_2025.json). Corpus chưa phải source đã duyệt: BE ingest/persist (W1-MY-03/W1-MY-07), Dương review (W1-DU-06).
