# Website khách truy cập TripC — Việt / Anh

## Tư vấn AI và lưu yêu cầu liên hệ

Trang chủ có khung tư vấn Việt/Anh gọi `POST /public/v1/sites/tripc-pilot/chat`. API dùng `GEMINI_API_KEY` ở server; có thể chọn `PUBLIC_CHAT_MODEL`, mặc định dùng `GEMINI_MODEL` hoặc `gemini-2.5-flash`. Không đưa khóa vào biến `NEXT_PUBLIC_*`.

AI chỉ nhận nội dung bài đã xuất bản và tối đa bốn lượt trao đổi trước. Khi chưa có bài, câu trả lời là hướng dẫn chung, không xác nhận giá, phòng trống hay đặt dịch vụ. Đây là adapter tư vấn công khai, không tự chạy luồng duyệt của sáu agent.

Khách hỏi mà chưa gửi biểu mẫu thì không tạo lead. Khi khách điền tên/email, đồng ý liên hệ và gửi, hệ thống lưu lead cùng các câu hỏi đã tư vấn trong `context.inquiry` (tối đa 2.000 ký tự). Hội thoại trên giao diện nằm trong bộ nhớ trang. Lỗi AI được thông báo rõ; biểu mẫu liên hệ vẫn dùng được.

Giới hạn hiện tại theo từng tiến trình API: 5 câu/phút/IP, 30 câu/phút tổng và tối đa 3 yêu cầu đồng thời. Khi triển khai nhiều tiến trình cần bổ sung giới hạn dùng chung ở edge. Hai proxy staging đã cho phép endpoint chat; người triển khai cần cập nhật cả API và proxy.

Đã kiểm tra Gemini thật qua trình duyệt local, xác nhận đồng ý liên hệ và câu hỏi được lưu đúng PostgreSQL, sau đó xóa dữ liệu QA. 21 test backend và 8 test trình duyệt đạt. Chưa triển khai công khai hoặc push các thay đổi này.

Website Next.js trong `apps/pilot`, tách biệt trang quản trị AI Growth OS ở `apps/web`.

## Chức năng

- Trang chủ tiếng Anh `/` và tiếng Việt `/vi/`, chuyển ngôn ngữ, giao diện điện thoại/desktop.
- Chỉ hiển thị bài đã xuất bản từ Public API; tìm kiếm/lọc chủ đề, trang bài viết, nguồn và bài liên quan.
- Form chọn chủ đề, bắt buộc đồng ý liên hệ; giữ thông tin khi lỗi, retry cùng idempotency key, chỉ báo thành công sau HTTP lưu thành công.
- Giữ phép đo first-party, UTM và A/B CTA hiện có. Không tạo bài/lead giả trong database thật.
- GA4 tùy chọn, chỉ tải khi người truy cập cho phép; có nút đổi lựa chọn, không gửi tên/email của form vào event Analytics.
- Metadata/canonical, trang quyền riêng tư, robots/sitemap, giá trị xác minh GSC có cấu hình. Bài viết giữ ngôn ngữ xuất bản gốc, không tự dịch hoặc tạo bản dịch giả.

## Chạy local

Yêu cầu Node 24.14.1+, API tại cổng 4000 và database đã cấu hình. Trong `apps/pilot`:

```powershell
npm ci
# Nếu chưa có .env.local: sao chép .env.example và chỉnh các giá trị public.
npm run dev
```

Mở http://localhost:3001 và http://localhost:3001/vi/.

```powershell
npm run lint
npm run test:unit
npm run build
npm start
```

Test trình duyệt độc lập, dùng API giả lập trong bộ test, chạy ở `apps/web`:

```powershell
npx playwright test --config=playwright.pilot.config.ts
```

Các cổng kiểm thử 3017/4017 không dùng API/database thật. GA4 loader được chặn bằng fixture trong trình duyệt; test không gửi dữ liệu đến Google.

## Cloudflare Pages staging như trang admin

Bản Pages là **static export**: bài công khai được chụp từ API khi build để HTML có sẵn cho SEO. Khi xuất bản/sửa/xóa bài, phải build và deploy lại Pages để đồng bộ nội dung HTML. Bản chạy Next.js server ở local/hosting Node đọc bài trực tiếp. Nếu muốn bài mới lên ngay mà không build lại, cần hosting Next.js động hoặc cơ chế rebuild sau publishing; chưa tự bật cơ chế này.

Đặt các biến môi trường trước khi build (không dùng giá trị URL ví dụ để deploy thật):

| Biến | Ý nghĩa |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Origin HTTPS thật của website khách, khác URL admin |
| `NEXT_PUBLIC_SITE_ID` | Site ID được khai báo đúng workspace trong API |
| `PILOT_API_ORIGIN` | Origin HTTPS công khai của backend, đọc được `/public/v1/sites/...` |
| `SITE_INDEXABLE` | `false` cho staging; chỉ bật `true` khi muốn Google lập chỉ mục |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Measurement ID `G-...` của web stream dành cho website khách; có thể để trống |
| `GOOGLE_SITE_VERIFICATION` | Giá trị content của thẻ xác minh GSC; có thể để trống |

Chạy tại `apps/pilot`:

```powershell
npm run build:pages
```

Lệnh tạo bản sao build trong `infra/staging/.runtime/tripc-pages-build` và xuất vào thư mục `out` ở đó, không ghi đè code/env hoặc bản `.next` đang chạy. Build dừng nếu API không tải đủ bộ bài xuất bản; không âm thầm đưa trang thiếu bài lên production. HTML tiếng Việt trong gói xuất có `lang=vi`.

Sau khi kiểm tra gói và được chủ dự án cho phép, deploy vào **project Pages riêng cho TripC**, không ghi đè project admin:

```powershell
# Chạy từ repository root, thay YOUR_TRIPC_PROJECT bằng tên project thật đã tạo.
npx wrangler pages deploy infra/staging/.runtime/tripc-pages-build/out --project-name YOUR_TRIPC_PROJECT --branch staging
```

Trong Cloudflare Pages, cấu hình runtime `PUBLIC_API_ORIGIN` bằng cùng backend HTTPS và redeploy khi đổi cấu hình. Gói có `_worker.js` chỉ chuyển tiếp endpoint public của đúng site, không chuyển tiếp auth/admin/internal, cookie hoặc token; giữ idempotency key khi gửi form. `_routes.json` giới hạn Worker ở đường dẫn public, nội dung HTML/assets được Pages phục vụ trực tiếp.

Backend Cloudflare hiện có trong repository ban đầu chỉ proxy `/v1/*`. Thay đổi `infra/staging/cloudflare-api/index.mjs` bổ sung whitelist GET/HEAD bài công khai và POST form/events/experiment; cần triển khai bản backend proxy này trước nếu dùng chính Worker API staging cũ. Không tự deploy proxy trong công việc chỉnh giao diện.

Nếu backend vẫn nối qua tunnel đến máy cá nhân, máy, Docker/database và tunnel phải hoạt động. Pages không tự host database hoặc API. Không dùng localhost làm backend của site công khai.

## GA4 và GSC

- Bật GA4 bằng Measurement ID của website khách, không tái sử dụng stream admin chỉ vì cùng dự án. Sau deploy, kiểm tra sự kiện với sự đồng ý của người truy cập.
- Website gửi page_view thủ công theo đường dẫn, bỏ query/fragment tùy ý. Trong GA4, tránh bật thêm phép đo page_view theo browser history trùng với phép đo này. `cta_click` và `generate_lead` không mang tên/email.
- Xác minh GSC đúng tên miền/URL khách; staging mặc định noindex. Chỉ gửi sitemap và cho phép index sau khi công khai nội dung thật.
- Quyền đọc dữ liệu GA4/GSC, service account JSON và token nằm ở **API**, không đưa vào biến `NEXT_PUBLIC_*` hoặc bundle frontend.
- Chưa nghiệm thu GA4/GSC thật, kết nối Cloudflare thật hoặc quá trình Google lập chỉ mục bằng bản giao diện mới.

## Trạng thái kiểm chứng

### Slideshow ảnh ở bốn thẻ khám phá

Cập nhật theo chủ đề: Nhà ở dùng khung cảnh đô thị/khu lưu trú; Làm việc dùng không gian cà phê và bàn cà phê ở Đà Nẵng; Sống mỗi ngày dùng chợ Cồn/cà phê; Du lịch dùng biển/Cầu Rồng. Không xoay ảnh chéo nhóm. Rê chuột hoặc focus bàn phím phóng ảnh 12%, vẫn giữ ảnh trong khung. Đã bỏ toàn bộ gạch chỉ báo trong ảnh. Ảnh là gợi ý chủ đề, không khẳng định địa điểm đang có nhà trống hoặc cà phê đó cung cấp dịch vụ coworking.

Ảnh bổ sung, nguồn và giấy phép (đã ghi công tại trang Nguồn ảnh):

- `danang-city-view.webp`: [View of Da Nang](https://commons.wikimedia.org/wiki/File:View_of_Da_Nang.jpg), Christophe95, CC BY-SA 4.0.
- `apartment-living-room.webp`: [Modern Apartment Interior Design](https://www.pexels.com/photo/modern-apartment-interior-design-11296222/), Vidal Balielo Jr., Pexels License. Ảnh stock gợi ý nhà ở, không khẳng định đây là căn hộ tại Đà Nẵng hoặc căn hộ đang cho thuê.
- `danang-con-market.webp`: [Con Market 1](https://commons.wikimedia.org/wiki/File:Con_Market_1.jpg), Christophe95, CC BY-SA 4.0.
- `danang-cafe-interior.webp`: [Modern Interior Design in Da Nang Cafe](https://www.pexels.com/photo/modern-interior-design-in-da-nang-cafe-32303447/), QUI NGUYEN, [Pexels License](https://www.pexels.com/license/).
- `danang-coffee-table.webp`: [Refreshing Coffee and Plant in Da Nang Café](https://www.pexels.com/photo/refreshing-coffee-and-plant-in-da-nang-cafe-32744964/), nhavantuonglai, Pexels License.

Các ảnh mới giảm chiều rộng 1000 px, chuyển WebP và cắt khung CSS, vẫn giữ giấy phép tương ứng.

- Bộ ảnh được chia theo từng chủ đề, không xoay ảnh chéo nhóm. Ảnh tự trượt ngang mỗi 3 giây, phóng nhẹ, có nút tạm dừng/tiếp tục và ảnh tiếp theo. Vẫn tự chạy khi rê chuột/focus; bấm ảnh tiếp theo không tự tạm dừng.
- Tạm dừng khi bấm nút dừng, tab ẩn hoặc phần ảnh ra khỏi vùng nhìn. Tôn trọng `prefers-reduced-motion`: không tự chạy/không hiệu ứng, vẫn đổi ảnh bằng nút.
- Ảnh bổ sung: `dragon-bridge-river.webp` (93.892 byte), [Dragon Bridge Da Nang 5](https://commons.wikimedia.org/wiki/File:Dragon_Bridge_Da_Nang_5.jpg); `dragon-bridge-city.webp` (48.872 byte), [Dragon Bridge Da Nang 2](https://commons.wikimedia.org/wiki/File:Dragon_Bridge_Da_Nang_2.jpg). Cả hai do Christophe95 chụp, giấy phép CC BY-SA 4.0; đã giảm chiều rộng 1000 px, chuyển WebP, cắt khung CSS khi hiển thị. Trang Nguồn ảnh đã bổ sung ghi công tương ứng.

### Ảnh chụp thật thay hình AI — 11/11/2026

Ảnh chụp được tìm qua công cụ tìm kiếm và xác minh giấy phép trên Wikimedia Commons, không lấy tùy ý từ Google Images. Đã tối ưu WebP/lưu local, không hotlink ảnh bên ngoài:

| File trong `public/images` | Tác giả, nguồn gốc | Giấy phép |
| --- | --- | --- |
| `my-khe-coast.webp` (1400×1050, 299.270 byte) | Jpatokal — [My Khe Beach Danang Coastline](https://commons.wikimedia.org/wiki/File:My_Khe_Beach_Danang_Coastline.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `my-khe-beach.webp` (1400×651, 161.504 byte) | Christophe95 — [My Khe Beach 5](https://commons.wikimedia.org/wiki/File:My_Khe_Beach_5.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

Thay đổi: xoay theo orientation, giảm kích thước, chuyển WebP, có thể cắt khung CSS. Các bản ảnh đã xử lý được phân phối cùng giấy phép CC BY-SA 4.0; giấy phép này áp dụng cho ảnh, không tự đổi giấy phép code. Ghi công công khai ở `/photo-credits/` và `/vi/photo-credits/`, truy cập từ footer “Nguồn ảnh”. Ảnh chung Đà Nẵng dùng làm ảnh giao diện/dự phòng, không phải ảnh xác thực của từng doanh nghiệp trong bài viết. Ảnh riêng do API cung cấp tiếp tục được ưu tiên khi có.

### Bản đồ: mở trực tiếp TripC Map

- Theo lựa chọn của chủ dự án, nút Bản đồ và Khám phá bản đồ mở `https://tripc.ai/?cat=all` ở tab mới. Cẩm nang/form vẫn ở website khách hàng.
- `/map/` và `/vi/map/` được giữ thành trang có liên kết mở TripC Map để các bookmark cũ vẫn dùng được.
- Đã gỡ bản đồ riêng, truy vấn Overpass, danh mục địa điểm rỗng, CSS/test liên quan và dependency Leaflet. Không còn xin vị trí hoặc gọi nguồn địa điểm trên website này.
- Thao tác và dữ liệu trên tripc.ai do website đó xử lý, chưa đồng bộ vào Performance của AI Growth OS. Không có quyền quản trị website kia chỉ nhờ đặt liên kết.
- Sau khi chuyển sang liên kết ngoài: build/TypeScript, ESLint, 7 unit test và 5 test trình duyệt đạt, gồm kiểm tra đúng URL/tab mới và không gọi Overpass/tile từ website khách hàng.
- Cảnh báo npm audit hiện có trong bộ dependency vẫn cần xử lý trước deploy công khai; việc gỡ Leaflet không xử lý các cảnh báo đó.

### Bổ sung ảnh, khám phá và lưu bài — 11/11/2026

- Khu nổi bật chọn bài xuất bản mới nhất, không bịa bài hoặc số liệu tương tác. Chưa có bài thì không hiển thị khu này.
- Thẻ khám phá lọc theo chủ đề. Lưu/bỏ lưu tối đa 200 slug trên trình duyệt, có bộ lọc bài đã lưu; không đồng bộ giữa thiết bị và không ghi database.
- Chia sẻ dùng bảng chia sẻ của thiết bị khi có, nếu không thì sao chép liên kết bài. Không tự đăng Facebook và không gửi dữ liệu form vào URL.
- Frontend hỗ trợ `meta.og_image` HTTPS hoặc đường dẫn ảnh nội bộ từ API, tự dùng ảnh chụp Đà Nẵng chung nếu thiếu/lỗi. Backend PostgreSQL hiện chưa có chức năng quản trị/upload ảnh riêng từng bài.
- TypeScript/build, ESLint, 7 unit test và 4 test trình duyệt đã đạt sau thay đổi.

Đối chiếu giao diện → API → PostgreSQL local ngày 11/11/2026 đã đạt:

- Tạo tạm bài published và draft có mã QA riêng trong database local; bài published xuất hiện ở danh sách/trang chi tiết, draft không có trong danh sách và API chi tiết trả 404.
- Gửi form bằng trình duyệt thật; database lưu đúng tên, email, site, đồng ý liên hệ và slug bài nguồn. Gửi lại cùng idempotency key không tạo lead trùng.
- Sự kiện page_view/cta_click được lưu đúng bài; truy cập local được đánh dấu internal, không coi là khách bên ngoài.
- Đã xóa đúng bài, lead và sự kiện QA sau kiểm tra. Database hiện chưa có bài published cho TripC nên giao diện danh sách trống là đúng.
- TypeScript, ESLint, 7 test unit/bootstrap và 7 test proxy đạt. Ba test trình duyệt với API giả lập và hai trường hợp build Pages đã đạt ở bước trước.

Phạm vi nghiệm thu là trang khách hàng local và luồng đọc bài/thu lead/ghi sự kiện. Bài QA được tạo trực tiếp để kiểm tra hiển thị, không thay thế nghiệm thu luồng SEO → duyệt → xuất bản. Chưa nghiệm thu màn hình quản trị lead, GA4/GSC thật hoặc hosting công khai. API hiện giới hạn 200 bài published toàn bộ kho trong `PgPublicContentRepository`; cần phân trang backend trước khi mở rộng kho bài lớn. Không có lỗi chặn các luồng local vừa kiểm tra.


Build Next.js local và Cloudflare Pages đã đạt: website chưa có bài và hai bài kiểm thử phân trang. TypeScript, ESLint, 6 unit test, 7 test proxy, 3 test trình duyệt đã đạt.

Gói hiện tại dùng localhost và bài giả lập, **không deploy gói kiểm thử này**. Chạy lại `npm run build:pages` với URL HTTPS website/API thật và nội dung xuất bản thật; không bật `PILOT_ALLOW_LOCAL_PREVIEW`. Chưa deploy, commit hoặc push.
