# 8 agent merchant (F&B / Du lịch): trạng thái triển khai và hướng dẫn vận hành

Tài liệu này đối chiếu từng hạng mục trong **Kế hoạch hành động theo Leader** (`docs/Ke_Hoach_Hanh_Dong_AI_Growth_OS_Theo_Leader.docx`) với code hiện có. Nó cũng ghi lại các bước cấu hình để chạy thật.

Nguyên tắc xuyên suốt khi làm lại các phần đang chạy bằng dữ liệu demo:

- **Không có số liệu giả.** Khi chưa kết nối kênh nào, hệ thống trả trạng thái `not_connected` và UI ghi rõ còn thiếu gì.
- **Không có câu trả lời bịa.** Nếu mọi LLM đều lỗi, agent chuyển cho người xử lý.
- **Con người duyệt trước khi xuất bản.** Mọi nội dung đăng công khai đều cần duyệt, trừ ba trường hợp đã được thiết kế để tự chạy:
  - trả lời review 4–5★ tích cực;
  - trả lời bình luận an toàn;
  - hội thoại đặt bàn 1-1, vốn chỉ dựa trên dữ kiện quán đã nhập.

## 1. Trạng thái theo hạng mục

| Hạng mục | Đã làm | Code chính | Điều kiện để chạy thật |
| --- | --- | --- | --- |
| **Agent 1 – Growth Lead** | Onboarding 4 link và lời chào. Báo cáo ngày đếm số thật từ DB, AI viết tóm tắt, gửi Telegram/Email lúc 21h (giờ cấu hình được), chống gửi trùng. Trang `/reports/daily` dùng được trên điện thoại. | `modules/onboarding`, `modules/reports/dailyExecutive.ts`, `modules/merchant/scheduler.ts` | `TELEGRAM_BOT_TOKEN` + chat id (Hồ sơ quán), hoặc `RESEND_API_KEY` |
| **Agent 2 – Drive** | Quét thư mục và thư mục con mỗi 20 phút. Phân tích ảnh bằng LLM thị giác (Gemini, lỗi thì OpenAI/Claude) ra JSON đã kiểm tra. Loại ảnh mờ/tối. Ảnh `logo*` dùng làm watermark. Ảnh đăng đi được gắn watermark (Pillow) và phục vụ qua link có chữ ký. | `modules/assets/drive.ts`, `modules/google/drive.ts`, `modules/assets/media.ts`, `scripts/media/watermark_image.py` | `GOOGLE_OAUTH_*` (hoặc `GOOGLE_API_KEY` khi thư mục để công khai), `PUBLIC_API_BASE_URL`, Python + Pillow |
| **Agent 3 – Content Planner** | Lịch tuần đa kênh theo khung giờ vàng, gắn chủ đề ngày lễ/khuyến mãi, dùng ảnh thật. Một lần gọi AI cho cả tuần; AI lỗi thì dùng caption ảnh. Duyệt/sửa/bỏ từng bài hoặc hàng loạt. | `modules/planner/calendar.ts`, UI `/calendar` | Ít nhất 1 kênh đã kết nối |
| **Agent 4 – Publisher** | Đăng đúng giờ các bài đã duyệt lên: Facebook Page (`/photos`, `/feed`), Instagram (container rồi `media_publish`), Google Maps Local Post, Group (Group Bot), TikTok (worker dựng video carousel 720×1280, 3–5 ảnh, nhạc nền). Retry 5→15→45→120 phút; lỗi token thì dừng ngay và báo chủ quán. | `modules/publisher/calendarPublisher.ts`, `apps/worker/src/publish/MerchantTikTokCarouselRunner.ts`, `render_tiktok_carousel.py` | `FACEBOOK_PAGE_*`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, TikTok OAuth, ffmpeg |
| **Agent 5 – Google Maps** | Đồng bộ review thật mỗi 3 phút (GBP API v4). AI trả lời có từ khóa địa phương. Review ≥4★ tích cực được đăng ngay; review thấp/tiêu cực/"phốt" thành nháp, báo Telegram và chờ duyệt. Có Local Post, thêm ảnh vào Maps, cập nhật thực đơn (foodMenus). SLA tính là trung vị phút từ lúc khách viết review. | `modules/gmaps/specialist.ts`, `modules/google/businessProfile.ts`, UI `/gmaps` | `GOOGLE_OAUTH_*` (scope `business.manage`), tài khoản đã được Google duyệt dùng Business Profile API |
| **Agent 6 – Comment** | Lọc trước khi AI trả lời công khai: spam bị bỏ qua; tiêu cực/"phốt" được chuyển lên chủ quán qua Telegram và không tự trả lời. Bình luận an toàn đi qua RAG. Hỗ trợ comment Facebook và Instagram (`/replies`). Câu AI tự đánh dấu cần người kiểm tra không bao giờ được gửi tự động. | `modules/merchant/sentiment.ts`, `modules/community/service.ts`, `modules/community/leads.ts`, webhook Meta | Webhook Meta (`page` + `instagram`) |
| **Agent 7 – Booking** | State machine đặt bàn 1-1 trên Messenger, Instagram DM, Zalo OA, Telegram. Trích giờ/ngày/số người/SĐT/tên tiếng Việt không cần LLM. Kiểm tra giờ mở cửa và sức chứa; bàn đông chuyển nhân viên; yêu cầu cọc kèm VietQR. Tạo `booking_leads`; nhân viên xác nhận trong Booking Hub thì khách nhận tin báo. Câu hỏi ngoài luồng chuyển cho RAG. | `modules/booking/*`, UI `/booking-leads`, `webhooks/zalo` | Page token (Messenger/IG), Zalo OA token |
| **Agent 8 – Community** | Phễu 0→1.000 thành viên theo kế hoạch 12 tuần, so với số đo thật từ Group Bot. Bốn điểm chạm tự động: mời qua bình luận, mời sau khi đặt bàn, mini game/bình chọn trong lịch, QR in trên bàn ăn. | `modules/communityGrowth/funnel.ts`, UI `/community-growth` | Link Group/Zalo; Group Bot đã đăng nhập để đo số thành viên |
| **Multi-LLM Auto-Switch** | Gọi thật Gemini, DeepSeek, OpenAI, Claude. Gặp 429/quota/timeout/5xx/khóa sai/bị từ chối thì chuyển trong cùng request và đặt cooldown cho nhà cung cấp lỗi (tôn trọng `retryDelay`). Khóa lưu mã hóa AES-256-GCM, UI chỉ thấy dạng `••••1234`. Ping thật, ghi `llm_usage_events`, trừ credit ví. | `modules/ai/llmAdapter.ts`, `modules/ai/providers.ts`, UI `/admin/llm` | Ít nhất 1 khóa. Claude cần `npm install @anthropic-ai/sdk` trong `apps/api` |
| **Ví VietQR** | Gói 200k/500k/1,5tr. Mỗi giao dịch có mã tham chiếu duy nhất và QR động. Credit **chỉ** được cộng khi webhook ngân hàng khớp mã và đủ tiền (idempotent). Nút "Xác nhận thử" chỉ hiện ở staging. Hết credit thì agent dừng gọi AI. | `modules/billing/*`, `webhooks/payments`, modal Ví | `WALLET_BANK_*`, `PAYMENT_WEBHOOK_SECRET` |
| **Hồ sơ quán** | Một nguồn dữ kiện duy nhất cho agent: giờ mở cửa, thực đơn & giá, FAQ, cọc, từ khóa SEO, kênh báo cáo. Trang `/merchant-settings`. Có dữ liệu quán minh họa. | `modules/merchant/profile.ts`, `data/merchant/sample-restaurant-danang.json` | — |

### Những phần chưa làm được và lý do

- **Trả lời comment TikTok.** API công khai của TikTok không cho trả lời comment, nên Agent 6 không hỗ trợ TikTok.
- **Bình chọn (poll) thật trong Group Facebook.** Graph API đã bỏ Groups API (4/2024). Agent 3 tạo bài bình chọn bằng cảm xúc, đăng qua Group Bot.
- **Claude.** Cần cài gói `@anthropic-ai/sdk`. Quyền cài gói bị chặn trong phiên làm việc này nên router hiện báo Claude là `unavailable` và bỏ qua, không lỗi.
- **Mockup Figma và InvokeAI (phần của Trường).** Không làm trong code. Watermark logo đã có, chạy bằng Pillow.
- **Slide nghiệm thu (phần của Dương).** Chưa làm. Nội dung có thể lấy từ tài liệu này và `QA-TEST-REPORT.md`.

## 2. Luồng chạy

```
worker (mỗi 60s) ──POST /internal/merchant/tick──► API: tickMerchantAgents()
   ├─ inbox_concierge  : community_messages → Agent 7 (đặt bàn) | Agent 6 (cầu chì) → RAG
   ├─ gmaps_specialist : 3 phút — đồng bộ review, tự trả lời/ chờ duyệt
   ├─ publisher        : 1 phút — đăng bài đã duyệt tới giờ, đối soát TikTok
   ├─ asset_manager    : 20 phút — quét Drive, phân tích ảnh
   ├─ content_planner  : 6 giờ — lập lịch tuần còn trống (tối Chủ nhật lập tuần sau)
   ├─ community_growth : 6 giờ — đo tiến độ phễu
   └─ growth_lead      : 15 phút — sau giờ báo cáo thì lập + gửi báo cáo ngày (1 lần/ngày)
worker (mỗi 1s)  CommunityReplyRunner  : gửi outbox community.reply (Messenger, IG, Zalo, Telegram, comment)
worker (mỗi 15s) MerchantTikTokCarouselRunner : dựng video + đăng TikTok
```

Mỗi agent được khóa bằng `merchant_agent_runs.locked_until`, nên hai tick chồng nhau không chạy trùng. Kết quả lần chạy gần nhất hiển thị ở trang **Kết nối & 8 Agent**.

## 3. Cài đặt

1. Chạy migration: `npm --prefix apps/api run db:migrate`. Lệnh này áp dụng `029_merchant_agents_live.sql`.
2. Khai báo env theo `apps/api/.env.example`, mục *8 agent merchant*. Tối thiểu cần:
   - `TOKEN_ENCRYPTION_KEY`
   - `AUTOMATION_INTERNAL_TOKEN`
   - `GEMINI_API_KEY`
   - `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`
   - `PUBLIC_API_BASE_URL` (HTTPS)
3. Nếu dùng Google, tạo OAuth client (Desktop/Web) trong Google Cloud:
   - Bật **My Business Account Management API**, **My Business Business Information API**, **Google My Business API** (v4: reviews, localPosts, foodMenus) và **Drive API**.
   - Lấy refresh token với scope `https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/drive.readonly`.
   - Business Profile API cần Google duyệt quyền truy cập cho project.
4. Đăng ký webhook Meta:
   - URL: `/v1/webhooks/facebook`, object `page` (`messages`, `feed`) và `instagram` (`messages`, `comments`).
   - Webhook Zalo OA: `/v1/webhooks/zalo`, sự kiện `user_send_text`.
5. Đăng ký webhook ngân hàng: `/v1/webhooks/payments`, header `Authorization: Apikey <PAYMENT_WEBHOOK_SECRET>`.
6. Chạy worker (`src/main.ts` hoặc `src/draft-main.ts`, cả hai đã có tick merchant và runner TikTok). Máy worker cần Python + Pillow + ffmpeg.
7. Chủ quán vào **Kết nối & 8 Agent**, dán 4 link rồi bấm **Kích hoạt**. Sau đó điền **Hồ sơ quán**: giờ mở cửa, thực đơn, cọc, Telegram chat id.

Để demo nhanh hồ sơ quán, chạy: `npx tsx --env-file-if-exists=.env.local scripts/seed-sample-merchant.ts <workspace_id>`. Dữ liệu này là minh họa, cần thay bằng dữ liệu thật.

## 4. Sửa lỗi bảo mật kèm theo (từ nhánh `thieuquang_be`)

- **Đăng nhập.** Bỏ cửa sau "mọi email `@gmail.com` với mật khẩu bất kỳ đều đăng nhập được với quyền owner".
- **Tenant.** Bỏ việc tự cấp quyền `owner` khi truy vấn DB lỗi.
- **Route mới.** Toàn bộ route mới (LLM config, Maps, Drive, Booking, Ví, Onboarding, báo cáo) trước đây không kiểm tra đăng nhập. Riêng `GET admin/llm-config` trả nguyên API key. Nay mọi route kiểm tra đăng nhập và vai trò.
- **Chế độ demo offline.** Các "fallback offline" trả dữ liệu giả, kể cả giả "duyệt thành công", đã được gỡ. Dữ liệu demo khi không có Postgres nay chỉ bật khi đặt `AGOS_OFFLINE_DEMO=1`, chỉ cho thao tác đọc và chỉ khi lỗi là mất kết nối DB.
- **`tasks/service.ts`.** Khôi phục các kiểm tra chống cross-tenant (campaign, dependency, operation) đã bị xóa, và sửa query `knowledge_contexts` bị thiếu tham số.
