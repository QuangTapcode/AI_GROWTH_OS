# Deploy và test từng agent bằng trình duyệt

Ngày 05/11/2026, code `main` tại `637e5a2`. Tiếp nối [báo cáo nghiệm thu 04/11](AGENT-ACCEPTANCE-2026-11-04.md).

## 1. Kết luận

**Bản mới đã chạy và chu kỳ thật không còn kẹt.** Sau khi deploy, chu kỳ đứng từ 30/10 đã chạy lại: Research, Growth Lead, SEO, Performance và Learning đều ra kết quả thật rồi dừng ở hàng duyệt.

**Vẫn chưa có gì đến được khách.** Website công khai chưa deploy, Facebook thiếu quyền, chưa có token Telegram. Test cũng lộ thêm 12 lỗi mới; lỗi đáng chú ý nhất là khi tắt tự đăng, bảng điều khiển không có nút để đăng bài đã duyệt lên website.

Hai cờ tự duyệt, tự đăng vẫn tắt và **chưa nên bật**: các câu trả lời sai ở mục 4 đều có khả năng được tự duyệt nếu bật.

## 2. Đã deploy gì

| Thành phần | Trạng thái |
| --- | --- |
| DB thật | Sao lưu trước khi đụng vào; chạy 2 migration còn thiếu (018, 019) |
| API, AI, worker | Chạy bản `main` trên máy Windows, qua Scheduled Task |
| Giao diện quản trị | Đã lên `aigrowthos-staging.pages.dev` (bản `9ca770f7`) |
| Web 3000, site công khai 3001 | Chạy trên máy này, không tự khởi động lại khi reboot |
| **Site công khai ra Internet** | **Chưa**: chưa chốt domain, và proxy chưa mở `/public/v1/*` (GAP-SITE-2) |

Sao lưu nằm trong `infra/staging/.runtime/backups/`, bản API cũ để quay lại nằm trong `infra/staging/.runtime/rollback/`. Hai thư mục này không vào git.

Tick đầu của worker đã huỷ 26 task cũ (29/10–04/11), gồm 2 task Research do e2e tạo, đúng cơ chế đóng việc quá hạn. Các dòng này vẫn còn trong DB.

## 3. Cách test

- **Điều khiển trình duyệt thật (Chromium)**, đăng nhập bằng tài khoản owner demo, chặn GA4 để không tính thêm lượt xem.
- **Trên địa chỉ công khai, chỉ đọc:** 18 ca, 18 đúng kỳ vọng.
- **Thao tác có ghi dữ liệu:** chạy trên bản sao DB mới tạo sau deploy, không có token kênh. 47 ca, 47 đúng kỳ vọng, gồm cả 18 ca đọc ở trên.
- Trong 47 ca có **18 ca đánh dấu `test.fail`**, ứng với lỗi chưa sửa. Khi sửa xong, ca đó sẽ báo để gỡ dấu. Tôi đã bỏ dấu tạm trên 16 ca để đọc lỗi thật: 14 ca đỏ đúng lý do; 2 ca Content lần đó đỏ vì pack đã được duyệt, nên tôi đọc lại trực tiếp pack và thấy đúng lỗi. 2 ca thêm sau cùng được kiểm bằng dữ liệu và ảnh chụp, chưa qua bước bỏ dấu.
- Sau test: **DB thật không đổi** (task, lead, số bài), bản sao đã xoá.

Test: `apps/web/tests/e2e/agents-browser.spec.ts`, `infra/staging/tests/deployed-version.test.mjs`. Ảnh chụp: [qa/evidence/agent-browser-2026-11-05/](../../qa/evidence/agent-browser-2026-11-05/).

## 4. Từng agent hoạt động thế nào

| Agent | Thấy chạy được | Sai hoặc thiếu |
| --- | --- | --- |
| **Research** | Chu kỳ thật 84 giây, chạy tay 58 giây. Có phát hiện kèm nguồn; nguồn tripc.ai tự nạp và tự duyệt | 2 bài tripc.ai báo `URL_NOT_FOUND` sau 3 lần thử (có hiện rõ trên trang) |
| **Growth Lead** | Chọn cơ hội Mì Quảng, có mục tiêu, KPI, nguồn. Chạy tay thì chờ owner duyệt, duyệt xong bàn giao được cho SEO | Ở chế độ tự động, kế hoạch đi tiếp không qua người. Thẻ duyệt ghi "The agent did not provide a summary" (GAP-UI-1) |
| **SEO** | Bài thật 369 từ, 93 giây, có nguồn và trích dẫn. Duyệt được. Đăng thử trên bản sao: trang đọc được, có mục Sources, không có link chết | **Không có nút đăng** (GAP-SEO-8). Thiếu canonical, Open Graph, JSON-LD (GAP-SEO-9). Có câu không nguồn nào nói: "pairs well with a side of rice", "umami". Sai chính tả ở tiêu đề mục: "Thị Heo" |
| **Content** | Sau khi duyệt bài, 84 giây ra bài Facebook và kịch bản TikTok đúng chủ đề, mỗi câu có nguồn. Duyệt xong chờ ở Distribution, ghi rõ vì sao chưa đăng, không tự đăng | Câu hỏi cho người đọc bị ghi "Có nguồn" (GAP-CNT-7). Gợi ý ảnh là cảnh biển chung chung, không phải món ăn (GAP-CNT-8). Trạng thái hiện thô `needs_assets`. TikTok 184 từ, vượt 120–180 |
| **Community** | Trả lời trong 3–16 giây, có nguồn, đúng tiếng Việt khi hỏi tiếng Việt. Câu về giá, giảm giá, pháp lý và câu ép nói sai đều chuyển người. Không tự gửi | **Xem 4 câu trả lời sai bên dưới.** Không viết được câu trả lời thay (GAP-COM-6). Lead mất số điện thoại và bị gán email giả (GAP-COM-2, 7) |
| **Performance** | Báo cáo 1–2 giây; phân biệt được "không có dữ liệu" với số 0 | **Mỗi lần bấm đo lại lùi một tuần** (GAP-PERF-1). Bài đã lên site vẫn tính "Published 0", lượt xem không hiện (GAP-PERF-2). 3 lead demo tính như lead thật (GAP-PERF-3) |
| **Learning** | Không có số liệu thì nói rõ "chưa có gì để học", không tự chế bài học | Bộ đếm đã 3/3 nên nút "Chạy Learning" khoá luôn (GAP-LRN-1) |

**4 câu Community sai, tái hiện được qua trình duyệt:**

| Câu hỏi | Trả lời của agent | Vì sao sai | Nhãn |
| --- | --- | --- | --- |
| Can I book a room now? | "You can book a room now, but only if..." kèm giờ nhận phòng của một khách sạn | TripC không nhận đặt phòng qua kênh này (GAP-COM-10) | Chuyển người |
| Does TripC offer airport pickup? | "Yes, TripC offers airport pickup as part of its Soft Landing service" | Nguồn chỉ nói hỗ trợ khi đến nơi, không nói đón sân bay (GAP-COM-13) | Nháp thường |
| Is TripC a scam? | "No, TripC is not a scam. It is a trusted resource..." | Tự khẳng định, chưa ai xác minh (GAP-COM-12) | Nháp thường |
| Is TripC the best travel company in Vietnam? | "No, TripC is not the best travel company in Vietnam." | Tự nói xấu thương hiệu, do khớp nhầm cụm "best way to travel" (GAP-COM-12). Chỉ xuất hiện sau khi bài blog đó được nạp | Nháp thường |

"Nháp thường" nghĩa là không có gì cảnh báo người duyệt, và là loại có thể được tự duyệt khi bật cờ.

## 5. Việc cần làm

### Việc của chủ dự án, ngay bây giờ

Chu kỳ thật đang chờ bạn ở [Review Queue](https://aigrowthos-staging.pages.dev/review-queue/): bài SEO Mì Quảng, bài học Learning và đề xuất thử nghiệm của Performance. Nếu chưa duyệt bài SEO thì Content chưa chạy.

Nếu bỏ qua, lịch 13:30 ngày 06/11 sẽ bị bỏ qua vì còn việc chưa xong. Đến lịch kế tiếp, 13:30 ngày 07/11, hệ thống đóng các bản nháp này và mở vòng mới.

### Lỗi mới cần sửa, theo thứ tự

| Ưu tiên | ID | Việc |
| --- | --- | --- |
| 1 | GAP-SEO-8 | Thêm nút "Đăng lên website" cho bài đã duyệt, gọi `POST /site-posts` có sẵn |
| 1 | GAP-COM-12, 13 | Câu hỏi về chính TripC và về dịch vụ TripC phải chuyển người, không dựa vào khớp từ |
| 1 | GAP-COM-2, 7 | Lead giữ số khách để lại, không tạo email giả |
| 2 | GAP-PERF-2, 3 | Tính bài trên site vào "Published", hiện lượt xem của site, tách lead demo |
| 2 | GAP-LRN-1 | Cách tính vòng Learning không được khoá nút vĩnh viễn trên một context |
| 2 | GAP-UI-2 | Một trạng thái GSC thống nhất: Overview ghi "Not connected", trang Performance ghi "connected" |
| 3 | GAP-CNT-7, 8 | Câu hỏi không tính là dữ kiện; gợi ý ảnh theo chủ đề bài |
| 3 | GAP-SEO-9 | Thêm canonical, Open Graph, JSON-LD |
| 3 | GAP-UI-1, 4 | Thẻ duyệt có tóm tắt thật; trên điện thoại menu gập lại được (hiện chỉ còn khoảng 165px cho nội dung) |

Các lỗi đã ghi trước đó vẫn còn và đều tái hiện qua trình duyệt: GAP-COM-6, GAP-COM-10, GAP-PERF-1, GAP-SITE-3, GAP-SITE-4.

**Chưa có test:** Distribution dài khoảng 16.600px vì liệt kê hết 129 job lỗi và 82 mục "ready", kể cả Research và kế hoạch vốn không phải để đăng. Dashboard ghi "Review 4" trong khi hàng duyệt ghi 3, và "Running 1" mãi vì một task demo từ 18/10. Trình duyệt ghi nhận nhiều lỗi 404 ở file `__next.*.txt` khi tải trước trang; chưa thấy ảnh hưởng tới việc dùng.

### Việc chỉ chủ dự án làm được (không đổi)

Chọn domain cho site công khai, quyền Meta cho Facebook, token Telegram, quyền GSC cho property tripc.ai, trả lời `hoc-46` về dữ liệu e2e. Chi tiết ở mục 5 của [báo cáo 04/11](AGENT-ACCEPTANCE-2026-11-04.md).

**Facebook, kiểm tra chỉ đọc ngày 05/11:** Meta trả về `(#200) API access blocked` ngay cả với lệnh đọc thông tin Page, và `debug_token` báo token không thuộc app trong `FACEBOOK_APP_ID`. Cần xem cảnh báo của app trên Meta for Developers, rồi tạo lại Page token từ đúng app đó. Chưa có bài nào lên Facebook: 129 job đều lỗi, lần gần nhất ngày 21/10.

## 6. Giới hạn của lần test

- Chỉ một chu kỳ thật, một bài và một pack được xem kỹ. Câu không có nguồn trong bài SEO là tôi tự đọc và đối chiếu, không phải một phép đo toàn bài.
- Facebook và Telegram không được gọi thật. Lượt xem và lead trên bản sao là do chính bộ test tạo.
- Đăng bài lên site chỉ thử trên bản sao và phải gọi API trực tiếp, vì chưa có nút.
- Test tìm chữ cố định "Mì Quảng" theo chu kỳ hiện tại; chu kỳ khác cần đặt `AGENT_BROWSER_TOPIC`.
- Giao diện quản trị trên Cloudflare chỉ được kiểm phần đọc. Thao tác ghi chạy đúng bản build đó, nhưng qua proxy thử trên máy này thay cho Pages Function.
- Toàn bộ backend vẫn chạy trên một máy Windows: máy tắt hoặc sleep thì API và agent dừng.
