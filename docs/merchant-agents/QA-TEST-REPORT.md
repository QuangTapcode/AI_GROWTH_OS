# Báo cáo kiểm thử: 8 agent merchant (22/11/2026)

**Phạm vi.** Code trên nhánh `Quang-Quang` sau khi gộp `thieuquang_be` và `origin/Quang-Quang`, cộng với phần hoàn thiện 8 agent (migration 029).

**Môi trường.** Windows 11, Node 24.14, Python 3.14 (Pillow 13), ffmpeg 9, Postgres pgvector local (Docker).

## Kết quả

| Bộ kiểm thử | Lệnh | Kết quả |
| --- | --- | --- |
| API: typecheck | `npx tsc --noEmit` (apps/api) | Đạt |
| API: unit + route | `npx vitest run` (apps/api) | **492 đạt**, 66 bỏ qua (cần cờ DB) |
| API: tích hợp Postgres thật, 8 agent | `RUN_MERCHANT_DB=1 npx vitest run tests/merchant/merchantAgents.pg.test.ts` | **9/9 đạt** |
| API: automation/unattended/live DB | `RUN_AUTOMATION_DB=1 RUN_DB_TESTS=1 RUN_KPI_DB_TESTS=1 …` | Đạt, trừ 3 test phụ thuộc trạng thái DB dùng chung (xem bên dưới) |
| Worker: typecheck + unit | `npx tsc -p tsconfig.test.json` · `npx vitest run` (apps/worker) | **264 đạt**, 12 bỏ qua |
| Web: typecheck + ESLint (phần đã sửa) | `npx tsc --noEmit` · `npx eslint src/features src/lib src/app` | 0 lỗi |
| QA Auto-Switch | `npx tsx scripts/qa/simulate-gemini-429.ts` | **PASS** |
| Smoke test chạy thật (API :4000 + web :3000) | đăng nhập owner/viewer, gọi 9 endpoint, chụp 8 màn hình desktop và mobile | Đạt |

## Ca kiểm thử chính

1. **Auto-Switch, gọi HTTP thật tới server giả lập.**
   - Gemini trả 429 `RESOURCE_EXHAUSTED` (retryDelay 45s).
   - Request #1 chuyển sang DeepSeek ngay trong cùng request. Request #2–5 bỏ qua Gemini vì Gemini đang cooldown.
   - Không request nào thất bại. Có 6 bản ghi `llm_usage_events`.
2. **Bảo mật route.**
   - 26 route mới đều trả 401 khi không đăng nhập.
   - Viewer gọi trang Admin LLM nhận 403.
   - Email `@gmail.com` bất kỳ với mật khẩu sai nhận 401 (cửa sau đã bị gỡ).
   - Phản hồi `GET admin/llm-config` không chứa khóa thật (không có chuỗi `AIza`).
3. **Agent 7, nhiều lượt trên Postgres thật.**
   - Tin nhắn "đặt bàn 5 người tối mai 19h, sđt …" rồi "ok em" tạo một `booking_leads` ở trạng thái `pending` và 2 tin trả lời trong outbox.
   - Nhân viên xác nhận thì khách nhận tin báo qua Messenger.
   - Unit test phủ thêm: ngoài giờ mở cửa, bàn đông chuyển nhân viên, cọc kèm VietQR, khách hủy.
4. **Agent 6.** Bình luận "đau bụng… bẩn" chuyển sang `escalated` (crisis) và không có câu trả lời tự động. Spam bị bỏ qua.
5. **Agent 5.**
   - Review 5★ tích cực được tự trả lời qua `PUT …/reply`. Review 1★ chê thành `needs_approval` và không được đăng.
   - Đồng bộ lần 2 không trả lời trùng.
   - Tổng quan hiển thị đúng 4.7★ / 120 review / 100% đã trả lời.
6. **Agent 3 + 4.**
   - Lập lịch tuần từ ảnh thật, duyệt, rồi đăng lên `/{page}/photos` với ảnh qua link có chữ ký. Bài được ghi `published` kèm `external_post_id`.
   - Tick lại không đăng trùng. Lỗi 500 được thử lại có backoff; lỗi token 190 dừng ngay và báo chủ quán.
7. **Ví.**
   - Tạo giao dịch chờ kèm VietQR. Chưa thanh toán thì không cộng credit.
   - Thanh toán thiếu tiền bị từ chối. Webhook gửi lặp chỉ cộng một lần.
8. **Agent 1.** Báo cáo ngày đếm đúng: 1 bài đã đăng, 1 lượt đặt bàn (5 khách), 1 review đã trả lời, 1 bình luận bị chuyển lên.
9. **Renderer.**
   - Video carousel: 4 ảnh ra MP4 H.264 720×1280, có luồng AAC, dài 8 giây.
   - Watermark: chữ tiếng Việt có dấu hiển thị đúng. Lỗi mojibake đã được phát hiện và sửa (stdin được đọc theo UTF-8).

## Lỗi có sẵn từ trước đã được sửa

- **`automation.pg.test` "an escalation is never sent"** và **`unattendedPublishing.pg.test` "a lead whose question has no grounded answer … nothing is sent"**.
  - Cả hai đã fail ngay ở commit `fc376b3`, trước khi gộp `thieuquang_be`.
  - Nguyên nhân: câu trả lời có `escalation_required` vẫn bị gửi cho khách.
  - Cách sửa: không gửi tự động câu có cờ này, trừ khi thứ duy nhất còn thiếu là xác minh đồng ý của lead.
- **Bộ test bảo mật/tenant (6 test).** Bị đỏ sau khi gộp `thieuquang_be` (cửa sau đăng nhập, tenant fallback, mất kiểm tra cross-tenant). Nay đã xanh lại.
- **`tiktokAutoVideo.test`.** Fail khi máy không cài `imageio_ffmpeg`. Renderer nay dùng `ffmpeg` trong PATH khi thiếu gói này.

## Còn tồn tại (không do thay đổi lần này)

- **`liveDb.test`** ("metrics … missing" và "retry … 409") và **`securityTenantHardening`** ("Outbox … pending") fail khi chạy lặp trên cùng DB `ai_growth_os`, vì dữ liệu của lần chạy trước vẫn còn. Ở commit gốc `fc376b3` các test này fail y hệt. Cần sửa test để tự tạo DB tạm như các file `*.pg.test.ts` khác.
- **`apps/web` `npm test`** (bootstrap) cần web đang chạy ở :3000, nên fail khi chạy độc lập.
- **Chưa thử với tài khoản thật** của Google Business Profile, Meta, Zalo, TikTok, ngân hàng. Mọi lời gọi đã được kiểm tra bằng fetch giả đúng định dạng tài liệu API; cần một lượt UAT khi có thông tin đăng nhập thật.
