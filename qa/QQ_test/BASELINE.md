# Baseline QQ_test — 07/10/2026

Source BE: commit `ffef4bc70516fa54e09c7cec75a262d9f8bacd22` trên `Quang-Quang`. `thieu_qa` tại `759838f` đã nằm trong lịch sử target, không có commit chưa merge. Đây là evidence tại thời điểm kiểm tra; không tự cập nhật thành trạng thái của build mới.

## Automation mới

Lần chạy `2026-10-07T12-00-30-783Z-964178` (19:00:30, Asia/Bangkok), working tree có QQ_test mới:

| Nhóm | Kết quả |
| --- | --- |
| QQ suite TypeScript | Đạt |
| Migration trên database tạm | Đạt |
| QQ integration service/route + PostgreSQL | **34/34 đạt** |
| API unit/regression được runner gọi lại | **33/33 đạt** |
| Worker unit/file/kill-recovery được runner gọi lại | **29/29 đạt** |
| Tổng `npm test` | **96/96 đạt**, không skipped |
| Cleanup database của runner | Đạt; database tạm đã drop |

Lệnh `test:ai` mới cũng đã được chạy qua runner: 85/85 đạt, JUnit trong lần chạy `2026-10-07T12-02-09-622Z-c26c28`. `test:checks` được chạy ở `2026-10-07T12-02-09-632Z-c98620`: 3 gate API lỗi (lint/typecheck/build), 2 gate worker đạt; runner exit 1 đúng với kết quả.

Logs và JSON nằm trong `results/<run-id>/` trên máy chạy và được git-ignore. Không có thay đổi product source. Nhóm route là in-process, không phải HTTP server/E2E browser.

## Kiểm tra trước khi tạo suite

- AI unit: 85/85 đạt; HTTP fake-mode smoke: 16/16 check đạt.
- AI live frozen eval: 30/30 đạt, critical 23/23, facts/retrieval 12/12, qwen3:4b-instruct + embeddinggemma:latest; 135.2 giây.
- Fake eval: 28/30 đạt; RET-04/RET-05 không đạt facts/retrieval threshold. Hai ca đó đạt trong live mode; không sửa hoặc xóa fake failure.
- Web/pilot lint, typecheck, production build và bootstrap HTTP đều đạt.

## Gate còn lỗi trong source hiện tại

| Vấn đề | Evidence / ảnh hưởng |
| --- | --- |
| API Next.js 14 nhưng cấu hình `next.config.ts` | Standard production build fail vì phiên bản này không hỗ trợ TS config |
| API ESLint 8 nhưng cấu hình import `eslint/config` và frontend dependencies mới | Standard lint fail trước khi chạy rules |
| API generated `.next` types còn từ Next.js 16 | Standard typecheck thiếu `next/types.js`; typecheck source không đọc cache đạt |
| API Vitest auto-discover cả `bootstrap.test.mjs` dùng node:test | Standard npm test báo No test suite found; QQ runner gọi riêng 33 unit test nghiệp vụ |
| QA1 Playwright còn `apps/<ten-thu-muc-cms>`; actions/assertions bị comment | Nominal 5 pass với external config không chứng minh UI/E2E |
| QA Python hardcode AI port 8000 | Original 11 fail 404; dùng đúng service port 5000 thì 11 đạt |
| QA2 dùng route/ID/token mẫu và `/api/ai/ask` chưa tồn tại | 1 fail, 1 nominal 404 pass, 3 skipped; chưa phải authorization/AI acceptance |

`npm run test:checks` giữ nguyên các gate API/worker, không bypass config để giả kết quả xanh. **96/96 test đạt không có nghĩa toàn bộ dự án đủ điều kiện release** khi API production build và coverage E2E còn thiếu.
