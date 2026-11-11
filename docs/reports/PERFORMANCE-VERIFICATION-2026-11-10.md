# Bàn giao phần Performance

Cập nhật: **11/11/2026**. Đây là báo cáo tổng hợp hiện tại; lịch sử chạy thử đã được rút gọn để chuẩn bị đưa code lên GitHub.

## 1. Phạm vi đã hoàn thành

- Đếm sự kiện website và lead theo workspace, site, kỳ đo; chống trùng và loại dữ liệu giả lập/nội bộ theo định nghĩa của từng KPI.
- Tổng hợp GA4/GSC/Meta Ads với tài khoản được gắn đúng workspace, giữ kỳ dữ liệu, múi giờ, tiền tệ và trạng thái thiếu dữ liệu.
- Tính KPI, CVR, CPL và so sánh baseline tương thích. Không suy diễn nhân quả hoặc ROI khi không có bằng chứng.
- Tạo báo cáo Performance từ snapshot cố định; giữ liên kết artifact/version và chuyển quan sát sang Learning/Research qua bước duyệt.
- A/B hai CTA trên website pilot: tạo, duyệt, phân nhóm ổn định, đếm lượt thấy CTA/lead, kết thúc và đánh giá theo thời gian/mẫu tối thiểu.
- Fanpage: đồng bộ số đếm bài đã xuất bản qua hệ thống, so sánh các lần đo và xử lý thiếu trường/quyền/token hết hạn.
- Facebook Group: đăng qua trình duyệt dùng session được chủ tài khoản cung cấp; đọc thống kê quản trị và số đếm bài, giữ kỳ gốc và liên kết với nội dung hệ thống.
- Group tự đồng bộ **15 phút/lần** khi Worker chạy; có khóa PostgreSQL chống chạy chồng, lưu lịch lần sau và xử lý session hết hạn.

## 2. Kết quả nghiệm thu Facebook thật

Bài nhóm đã kiểm tra: https://www.facebook.com/groups/1134282109069209/posts/1138550578642362/

| Phép đối chiếu | Kết quả |
| --- | --- |
| Cảm xúc của bài | 1 |
| Bình luận của bài | 0, Facebook ghi rõ chưa có bình luận |
| Lượt chia sẻ của bài sau khi người dùng chia sẻ | 1 |
| Gắn đúng bài với publishing job và artifact/version | Đạt |
| Báo cáo Performance và giao diện nhận đúng 1/0/1 | Đạt |
| Chạy bộ thu thập theo lịch bằng Chrome nền | Đạt khi chủ động kích hoạt kiểm tra ngay |

Người dùng đã xác nhận sửa bài trên Facebook sau khi đăng. Dữ liệu có cờ nội dung được sửa bên ngoài; không khẳng định nội dung hiện tại vẫn trùng bản đã duyệt. Lần đăng chưa lấy được permalink ngay đã được đối chiếu trước khi cập nhật sổ đăng, không bấm đăng lại.

Thống kê quản trị nhóm đã đọc: **6 bài viết, 1 bình luận, 2 cảm xúc**, kỳ **12/10–08/11/2026**; **7 thành viên hiện tại** lúc đọc. Kỳ lịch sử này được giữ riêng với kỳ báo cáo website và số đếm tích lũy của bài mới. Không suy ra thành viên mới từ tổng hiện tại.

## 3. Cách chạy và cấu hình

### Website, báo cáo và A/B

- Vào `/agents/performance` trên Web, chọn đúng workspace để xem báo cáo và phần đo Facebook.
- GA4/GSC/Meta Ads cần tài khoản thật có quyền đọc và được gắn/xác minh đúng workspace. Các biến chính: `GA4_PROPERTY_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`, `META_AD_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN`.
- Page dùng `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` và phiên bản Graph được cấu hình; token Page không tự cấp quyền đọc Group.
- Migration **021–022** cần được áp dụng theo quy trình triển khai của nhóm. Không chạy vào database thật trong bước dọn code này.

### Đồng bộ Group theo lịch

Worker đọc `apps/worker/.fb-group-metrics.json` khi khởi động, hoặc file được chọn bằng `FACEBOOK_GROUP_METRICS_CONFIG`. Ví dụ:

```json
{
  "interval_minutes": 15,
  "session_path": ".fb-session.json",
  "status_path": ".worker-state/group-metrics-schedule.json",
  "targets": [{
    "workspace_id": "WORKSPACE_UUID",
    "group_id": "GROUP_ID",
    "post_text_overrides": {}
  }]
}
```

- Thay UUID/ID ví dụ bằng giá trị thật. `post_text_overrides` chỉ dùng cho nội dung đã được người vận hành xác nhận sửa trên Facebook.
- Cần `DATABASE_URL`, `API_BASE_URL`, `AUTOMATION_INTERNAL_TOKEN` trùng API và session Facebook còn hiệu lực. Worker không cần JWT đăng nhập người dùng cho lịch này.
- Chu kỳ được kiểm tra mỗi 30 giây, hỗ trợ 5–1440 phút. Đổi cấu hình rồi khởi động lại Worker.
- Máy hoặc Worker tắt thì lịch không chạy. Khi khởi động lại, Worker đọc lịch và tiếp tục thu thập khi đến hạn; không tạo lại các số liệu lịch sử đã bỏ lỡ.
- Lịch chỉ đọc dữ liệu, hoạt động độc lập với `AUTOPILOT`; không bật tự duyệt/đăng/phản hồi. Trên máy nghiệm thu vẫn giữ `AUTOPILOT=0`.
- Trạng thái có lần thành công, lần đến hạn tiếp theo và `requires_reauth` nếu cần đăng nhập lại. Lỗi không được biến thành số 0.
- Đọc tối đa 20 bài đã xuất bản trong 30 ngày gần nhất, chỉ thuộc Group gắn với workspace.

Lệnh chủ động trong `apps/worker`:

```text
npm run facebook:group -- insights WORKSPACE_UUID GROUP_ID
npm run facebook:group -- sync WORKSPACE_UUID JOB_UUID
npm run facebook:group -- publish WORKSPACE_UUID JOB_UUID
```

Lệnh CLI cần thêm `WORKER_GATEWAY_TOKEN` có quyền workspace; `publish` chỉ dùng cho job đã được duyệt đúng version/hash. Dấu vết lần bấm phải lưu vào `GROUP_INTENT_DIRECTORY` được Git bỏ qua. Kết quả chưa rõ thì phải đối chiếu trước, không tự đăng lại.

Dữ liệu được đồng bộ tự động, nhưng báo cáo đã tạo là snapshot cố định: tạo báo cáo mới để sử dụng dữ liệu mới. Nút tải lại số liệu nhóm trên giao diện đọc dữ liệu đã lưu, không mở một lượt thu thập Facebook mới.

## 4. Kiểm thử và giới hạn

Các lượt chạy gần nhất trước khi dọn phạm vi:

| Hạng mục | Kết quả |
| --- | --- |
| Toàn bộ API, có database Performance test riêng | 321 đạt, 47 bỏ qua |
| Toàn bộ Worker sau khi thêm lịch Group | 194 đạt, 12 bỏ qua |
| AI liên quan Performance/Group/Learning | 20 đạt |
| TypeScript API, Worker, Web; build API/Web | Đạt |
| ESLint các file thay đổi và kiểm tra giao diện local | Đạt |

Test dùng fixture không thay thế nghiệm thu tài khoản thật; các test bỏ qua không được tính là đã chạy. CI Performance giữ các test dữ liệu, tenant, kỳ đo, scheduler và trình duyệt; không gọi Facebook thật.

Benchmark local trước đó dùng 10.000 sự kiện/1.000 lead: p95 nối tiếp 256,70 ms, đồng thời 3 là 286,61 ms, đồng thời 5 là 689,81 ms; không ghi nhận lỗi trong hai mẫu đồng thời 10 giây. Đây chỉ là bộ tạo snapshot trên PostgreSQL local, chưa phải SLO production. Công cụ benchmark chỉ chấp nhận database `performance_test`, chế độ fake; kết quả thô mới ghi vào `test-results/performance-benchmark.json`, được Git bỏ qua.

Còn phải nghiệm thu riêng:

- Thành viên mới, reach và impressions Group; không tự thay bằng tổng thành viên hoặc số tương tác.
- Đối chiếu GA4/GSC/Meta Ads thật cùng kỳ, quyền, múi giờ và tiền tệ.
- A/B với khách bên ngoài, đủ mẫu/thời gian; tải staging kéo dài.
- Toàn bộ chu trình sáu agent với dữ liệu thật. Test hợp đồng Learning/Research không có nghĩa đã nghiệm thu toàn bộ vận hành thực tế.
- Thu thập Group phụ thuộc giao diện Facebook/session; không bảo đảm đọc được mọi chỉ số hoặc cập nhật tức thời.

## 5. Chuẩn bị GitHub

- Giữ code Performance, tích hợp Learning/Research liên quan, migrations, schema giao tiếp, test và CI cần thiết.
- Giữ các sửa lint/build nhỏ cần để chạy kiểm tra; bỏ sửa logic trả lời Community ngoài phạm vi.
- Khôi phục các đường dẫn type sinh tự động của Next; bỏ template hướng dẫn sinh ở Pilot và file kết quả benchmark thô khỏi thay đổi cần push.
- Không đưa `.env`, `.env.local`, `.fb-session.json`, `.fb-group-metrics.json`, `.worker-state`, profile Chrome, log, ảnh chạy thử hoặc runtime vào commit. Cấu hình và session trên máy vẫn được giữ để hệ thống đang chạy không mất kết nối.
- Bản sao trước khi dọn nằm trong runtime local được Git bỏ qua. Không commit/push hoặc deploy tự động trong bước này.


### Kiểm tra sau khi dọn

- TypeScript API và Web: đạt; ESLint Web toàn bộ và công cụ benchmark: đạt.
- Bộ AI liên quan KPI/Performance/Learning/Research và sáu role: **83 test đạt**.
- Bộ Worker được dùng trong CI Performance: **30 test đạt**.
- `git diff --check`: đạt. Quét 96 file thay đổi/chưa theo dõi không thấy mẫu API key Google, token Facebook, private key hoặc JWT thật; đây là kiểm tra theo mẫu, không phải chứng nhận bảo mật toàn bộ repository.
- Không thay env, session, cấu hình lịch đang chạy hoặc database; không stage, commit hoặc push thay người dùng.
