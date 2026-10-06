# Local staging cho AI Growth OS

Bootstrap tối giản tạo hai giao diện Next.js và một API chạy trên máy Windows. Hai frontend kiểm tra API thật qua HTTP; môi trường này chưa triển khai authentication, CMS, database persistence hay queue nghiệp vụ.

## Bật staging

Yêu cầu Node.js major 24 (`24.14.1` đã dùng), npm và PowerShell trên Windows. Từ repository root:

```powershell
.\infra\staging\start.ps1
```

Script cài dependencies bằng `npm ci` khi thiếu, tạo `.env.local` từ `.env.example` nếu chưa có, build lần lượt và khởi chạy ba server ở chế độ `next start` trong nền. Khi đã có dependencies/build hợp lệ, có thể chạy nhanh bằng `start.ps1 -SkipBuild`. Dùng `start.ps1 -Install` để cài lại theo lockfile trước khi build.

| App | URL | Health |
| --- | --- | --- |
| Pilot TripC | http://localhost:3001 | /health |
| Web quản trị | http://localhost:3000 | /health |
| API | http://localhost:4000 | /health và /v1/health |

Server chỉ bind `127.0.0.1`. Đây là staging local; `https://aigrowthos-staging.pages.dev/` vẫn là trang thông báo riêng trên Cloudflare Pages, chưa phục vụ các app/API này. GA4/GSC đã thiết lập cho URL công khai đó; bootstrap local không gửi telemetry vào GA4.

## Kiểm tra

```powershell
npm.cmd --prefix apps/api run lint
npm.cmd --prefix apps/api run typecheck
npm.cmd --prefix apps/api test
npm.cmd --prefix apps/pilot run lint
npm.cmd --prefix apps/pilot run typecheck
npm.cmd --prefix apps/pilot test
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web test
```

Test HTTP cần các server đang chạy. Browser tests:

```powershell
Push-Location apps/web
npx.cmd playwright install chromium
npm.cmd run test:e2e
Pop-Location
```

Health chỉ kiểm tra liveness của từng tiến trình. Browser tests xác nhận hai frontend kết nối được API, hiển thị unavailable khi mất kết nối và phục hồi khi thử lại, cùng layout mobile và lỗi JavaScript.

## Dừng và khởi động lại

```powershell
.\infra\staging\stop.ps1
.\infra\staging\start.ps1
```

`stop.ps1` chỉ dừng PID đã ghi và xác nhận lại thời điểm tạo/executable/command của tiến trình. Không dừng tùy tiện tiến trình đang chiếm port. Script không thay đổi startup của Windows; sau khi reboot cần chạy start lại.

Logs và PID được lưu tại `.runtime/` và bị Git ignore. Nếu port đã bị chiếm, start báo lỗi trước khi build/start. Nếu startup thất bại, script thu hồi các tiến trình vừa tạo và giữ log để kiểm tra.

## Cấu hình và chỉnh sửa

`services.json` xác định app/port của bộ launcher. Port trong scripts của mỗi package phải giữ đồng bộ với file này. `.env.local` chỉ nằm trên máy, không commit. FE chỉ dùng `NEXT_PUBLIC_API_BASE_URL`; API dùng `APP_ENV`, `INTEGRATION_MODE` và `CORS_ALLOWED_ORIGINS`.

Đổi API URL của frontend cần stop và build lại vì biến `NEXT_PUBLIC_*` được đóng vào bundle khi build. Khi làm development, chạy `npm.cmd run dev` trong từng app sau khi đã dừng staging; không chạy dev/start cùng port hoặc build trên app đang phục vụ.

Mỗi app giữ manifest và lockfile riêng; không có root workspace/lockfile mới. Next.js build chỉ dùng một worker để phù hợp RAM trống của máy hiện tại.

Phạm vi bootstrap không đồng nghĩa hoàn thành các task W1-FE/W1-BE hoặc release gate của sản phẩm.
