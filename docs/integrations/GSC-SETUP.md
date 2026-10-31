# Kết nối Google Search Console (GSC)

Mục đích: Research và Performance đọc **query, clicks, impressions, CTR, position thật** của website TripC thay vì ghi `gsc_snapshot_missing_or_stale` / `search_console_not_connected`. Kết nối chỉ đọc (`webmasters.readonly`), dùng service account ở server; token không đi vào job, prompt hay evidence.

Cần có: quyền **Owner** trên property GSC của website (ví dụ `tripc.ai`), một Google Cloud project, và quyền sửa `apps/api/.env.local` trên máy chạy API.

## 1. Tạo service account (Google Cloud Console)

1. Vào https://console.cloud.google.com/ → chọn hoặc tạo project (ví dụ `ai-growth-os`).
2. **APIs & Services → Library** → tìm **Google Search Console API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account**: đặt tên `gsc-reader`, không cần cấp role IAM nào → **Done**.
4. Mở service account vừa tạo → tab **Keys → Add key → Create new key → JSON**. File JSON được tải về.
5. Lưu file **ngoài repo**, ví dụ `C:\secrets\ai-growth-os\gsc-reader.json`. Không commit, không dán nội dung vào chat/issue.
6. Ghi lại `client_email` trong file (dạng `gsc-reader@<project>.iam.gserviceaccount.com`).

## 2. Cấp quyền trên Search Console

1. Vào https://search.google.com/search-console → chọn property của TripC.
2. **Settings → Users and permissions → Add user**.
3. Email: `client_email` ở bước 1; Permission: **Restricted** (đủ để đọc dữ liệu).
4. Ghi lại **chính xác** tên property, vì backend so khớp từng ký tự:
   - Domain property → `sc-domain:tripc.ai`
   - URL-prefix property → `https://tripc.ai/` (có `/` cuối, đúng `http`/`https`, có/không `www` như trong GSC)

Nếu website chưa có property: **Add property** → chọn Domain và xác minh bằng bản ghi DNS TXT, hoặc URL-prefix và xác minh bằng HTML tag/file. Dữ liệu chỉ bắt đầu tích lũy sau khi xác minh; GSC không trả lịch sử trước đó cho property mới.

## 3. Cấu hình API

Thêm vào `apps/api/.env.local` (file đã nằm trong `.gitignore`):

```text
INTEGRATION_MODE=production
GSC_SITE_URL=sc-domain:tripc.ai
GSC_SERVICE_ACCOUNT_JSON=@C:\secrets\ai-growth-os\gsc-reader.json
```

- Tiền tố `@` cho phép trỏ tới file thay vì dán JSON một dòng vào env.
- Nếu GA4 dùng chung service account, có thể đặt `GOOGLE_SERVICE_ACCOUNT_JSON` thay cho `GSC_SERVICE_ACCOUNT_JSON`; GSC ưu tiên biến riêng nếu có.
- `GSC_SITE_URL` phải trùng tên property ở bước 2.

Khởi động lại API để nạp env. API staging chạy bằng `infra/staging/api-host.ps1` (`next start`, port 4000): dừng process đang giữ port 4000 rồi chạy lại script. Nếu đã cài scheduled task `AI-Growth-OS API`, task tự khởi động lại trong khoảng 1 phút.

## 4. Xác minh kết nối

Đăng nhập lấy token owner/editor, rồi đồng bộ metrics (PowerShell, từ thư mục repo):

```powershell
$api = 'http://127.0.0.1:4000'
$ws  = '10000000-0000-4000-8000-000000000001'
$login = Invoke-RestMethod "$api/v1/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{ email = 'owner.tripc.demo@gmail.com'; password = '<mật khẩu owner>' } | ConvertTo-Json)
$h = @{ authorization = "Bearer $($login.access_token)" }

# 4a. Gọi GSC thật; thành công thì backend ghi integration_connections gsc = connected + verified_at
(Invoke-RestMethod "$api/v1/workspaces/$ws/metrics/sync" -Method Post -Headers $h -ContentType 'application/json' -Body '{}').results
```

Kết quả mong đợi: dòng `provider = gsc` có `status = synced` (có dữ liệu) hoặc `no_data` (kết nối được nhưng chưa có click/impression trong cửa sổ). `skipped` nghĩa là env chưa được nạp; `error` kèm mã lỗi xem bảng ở mục 6.

```powershell
# 4b. Trạng thái kết nối (không trả secret)
(Invoke-RestMethod "$api/v1/workspaces/$ws/integrations" -Headers $h).providers |
  Where-Object provider -eq 'gsc' | Select-Object provider, status, property_ref
```

## 5. Đưa dữ liệu GSC vào Research

```powershell
# Context hiện tại của workspace
$ctx = (Invoke-RestMethod "$api/v1/workspaces/$ws/knowledge-contexts" -Headers $h).context

# Tạo snapshot research.search_metrics (28 ngày, kết thúc 3 ngày trước theo giờ Pacific)
Invoke-RestMethod "$api/v1/workspaces/$ws/research-metrics" -Method Post -Headers $h -ContentType 'application/json' `
  -Body (@{ context_snapshot_id = $ctx.snapshot_id } | ConvertTo-Json)
```

Trả `status = available` kèm `artifact_id` là đạt. Scheduler tự làm mới snapshot này trước mỗi vòng Research; khi chạy Research thủ công thì gọi lệnh trên trước.

Worker chỉ đưa snapshot vào Research khi: connection `gsc` đã verified và `account_ref` trùng `site_url` của snapshot, snapshot cùng context, tạo **trước** task và không quá 7 ngày. Sau khi chạy Research, kết quả có `search_metrics_ref` khác null và `measurement_status` là `available` (có query khớp finding) hoặc `no_matching_queries`.

## 6. Lỗi thường gặp

| Dấu hiệu | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `gsc_not_configured` / `skipped` | Thiếu `INTEGRATION_MODE=production`, `GSC_SITE_URL` hoặc JSON; hoặc API chưa restart | Kiểm tra bước 3 và restart |
| `INTEGRATION_CONFIG_INVALID` | Đường dẫn sau `@` sai, hoặc JSON thiếu `client_email`/`private_key` | Trỏ đúng file key JSON gốc |
| `INTEGRATION_REQUEST_FAILED (PERMISSION_DENIED)` / HTTP 403 | Service account chưa được thêm vào property, hoặc `GSC_SITE_URL` khác tên property | Làm lại bước 2; so khớp `sc-domain:` / `https://.../` |
| HTTP 403 `SERVICE_DISABLED` | Chưa bật Google Search Console API trong project | Bước 1.2 |
| `gsc_property_not_verified_for_workspace` | Chưa chạy bước 4a sau khi cấu hình, hoặc đã đổi `GSC_SITE_URL` | Chạy lại `metrics/sync` |
| `GSC_PROPERTY_MISMATCH` | Connection của workspace trỏ property khác env | Đồng bộ lại bằng bước 4a |
| `INVALID_GSC_WINDOW` | `to` gần hơn 3 ngày Pacific hoặc `from > to` | Bỏ `from`/`to` để dùng cửa sổ mặc định |
| `gsc_no_query_rows` | Property hợp lệ nhưng không có query trong cửa sổ | Không phải lỗi; không được coi là search volume bằng 0 |
| Research vẫn `gsc_snapshot_missing_or_stale` | Snapshot tạo sau task, khác context hoặc cũ hơn 7 ngày | Gọi `research-metrics` trước khi tạo task Research |

## Giới hạn

Dữ liệu chỉ phản ánh property đó và tối đa 100 query hàng đầu, không phải search volume toàn thị trường. GSC dùng ngày Pacific và chỉ có dữ liệu `final` sau khoảng 2–3 ngày. Thu hồi quyền: xóa user ở Search Console và xóa key trong Google Cloud; connection ở workspace có thể chuyển `revoked` qua `POST /v1/workspaces/{id}/integrations`.

Chi tiết cách Research dùng số liệu: [Research quality rubric](../reports/RESEARCH-QUALITY-RUBRIC.md#dữ-liệu-gsc-trong-research).
