# Frontend QA

Thư mục này có suite Playwright độc lập cho route web admin, phiên/phân quyền, các thao tác task/approval và luồng guide/form lead của pilot.

## Cài đặt và chạy

Từ thư mục repo:

```powershell
npm.cmd --prefix qa/frontend ci
npx.cmd --prefix qa/frontend playwright install chromium
npm.cmd --prefix qa/frontend test
```

Playwright tự khởi động web (`127.0.0.1:3000`) và pilot (`127.0.0.1:3001`), hoặc tái sử dụng server đang chạy. API không bắt buộc: luồng login giả lập phản hồi API bằng Playwright route, không tạo dữ liệu hay gọi đăng nhập thật.

Các file test ở `tests/` bao phủ đăng nhập, route web admin, menu, phiên và workspace, quyền viewer/owner, tạo task, duyệt/từ chối approval, xung đột version, lỗi/retry API, responsive và guide/form lead trên pilot. Web admin dùng API giả lập; pilot dùng API tổng hợp riêng ở `mock-public-api.mjs`, không gọi dịch vụ thật hay ghi lead thật. Đây là test frontend với contract giả lập, không thay thế kiểm thử tích hợp với backend thật. Cấu hình ở `playwright.config.ts`. Kết quả và screenshot khi test lỗi được ghi vào `test-results/`.

## Kiểm tra bổ sung trong app

Test bootstrap, lint, typecheck và E2E gắn với source web vẫn chạy riêng:

```powershell
npm.cmd --prefix apps/web test
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web run test:e2e
```

`apps/web run test:e2e` là suite tích hợp web/API hiện có; có thể yêu cầu database và dữ liệu được seed. Không dùng nó thay cho smoke suite độc lập ở thư mục này.

## Bộ test QA hiện có

Các kịch bản UI/UAT và page objects cũ được giữ tại `qa/tester-1/` để không làm gãy tham chiếu. Suite mới trong thư mục này có lệnh chạy riêng và test thực thi được.
