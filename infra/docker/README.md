# AI Growth OS core trong Docker (máy Windows làm server)

Từ 2026-11-11, API (cổng 4000), AI service (cổng 5000) và Cloudflare Tunnel chạy trong Docker Desktop
(`compose.yaml`, project `ai-growth-os-core`). Postgres và SearXNG vẫn ở `infra/local/compose.yaml`.
Ollama và draft worker (Autopilot, đăng Group bằng Edge, làm video bằng Remotion/edge-tts) vẫn chạy trên Windows
qua task `AI-Growth-OS Draft Worker`, gọi API/AI ở 127.0.0.1 như trước.

Web công khai: https://aigrowthos-staging.pages.dev (Cloudflare Pages, gọi `/v1/*` qua Worker tới tunnel này).

## Khi bật máy

1. Windows tự đăng nhập (cài một lần, xem dưới).
2. Docker Desktop tự mở khi đăng nhập; mọi container có `restart: unless-stopped` tự chạy lại.
3. Task `AI-Growth-OS Draft Worker` chạy khi đăng nhập và thử lại mỗi phút cho tới khi AI sẵn sàng.

Máy không ngủ khi cắm điện (`powercfg /change standby-timeout-ac 0`).

## Lệnh thường dùng

```powershell
docker compose -f infra/docker/compose.yaml ps
docker compose -f infra/docker/compose.yaml logs -f api
# Sau khi sửa code API hoặc AI:
docker compose -f infra/docker/compose.yaml up -d --build
# Build lại riêng API thì PHẢI tạo lại cả tunnel (tunnel dùng chung mạng của container api, mất mạng khi api bị tạo lại):
docker compose -f infra/docker/compose.yaml up -d --build api; docker compose -f infra/docker/compose.yaml up -d --force-recreate tunnel
```

Bí mật không nằm trong image: `apps/api/.env.local`, `infra/local/.env` (mật khẩu Postgres) và
`%USERPROFILE%\.cloudflared\aigrowthos-api.token` được gắn vào lúc chạy. Dữ liệu run của AI nằm ở volume `ai_runs`.

## Quay lại cách cũ (chạy thẳng trên Windows)

```powershell
docker compose -f infra/docker/compose.yaml down
'AI-Growth-OS AI','AI-Growth-OS API','AI-Growth-OS Named Tunnel' | ForEach-Object { Enable-ScheduledTask -TaskName $_; Start-ScheduledTask -TaskName $_ }
```

## Tự chạy khi bật máy, không cần đăng nhập (chủ máy chạy một lần, quyền Admin)

Docker Desktop chỉ chạy trong phiên đã đăng nhập, nên dùng chính sách Windows "Sign-in and lock last interactive
user automatically after a restart": bật máy là Windows vào phiên rồi khoá màn hình ngay, server chạy phía sau,
muốn dùng máy vẫn phải nhập mật khẩu/PIN.

```powershell
# PowerShell "Run as administrator"
powershell -ExecutionPolicy Bypass -File D:\Hoc\AI-Growth-OS\infra\docker\enable-boot-start.ps1
# Tắt: thêm -Disable
```

Nếu sau khi khởi động lại Windows dừng ở màn hình đăng nhập (không vào phiên), đăng nhập một lần bằng mật khẩu
(không dùng PIN) rồi khởi động lại.
