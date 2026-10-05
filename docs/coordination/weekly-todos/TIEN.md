# Tiến — FE nền tảng và website TripC

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). TypeScript/Next.js; sở hữu `apps/pilot/`, app quản trị routes/layout/common/config/manifest/lockfile và features `workspace`, `onboarding`, `goals`, `strategy`, `tasks`, `traffic`, `integrations`, `analytics`, `experiments`. Task tại `apps/web/tasks/` hoặc `apps/pilot/tasks/`, tên kèm `tien`. Huyền peer-review, Trường design review, Thanh kiểm AC; BE review API boundary.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — tien](../execution/W1.md#tien) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Phần task gốc:** W1-FE-01 bootstrap/shell/common/pilot; W1-FE-02 login/workspace/profile/member/goals; W1-FE-03 public blog/landing/form/tracking. Huyền làm knowledge và mocks/tests. Phụ thuộc: field/state/schema và design W1; dùng contract mocks trước live auth/lead API.

1. **Ngày 1–2:** tạo hai app Next.js (`apps/web`, `apps/pilot`) với package/lockfile/env riêng, routing/layout/session/API client, mock/live switch và lệnh dev/check/build. Chốt common-component props với Huyền; quản trị và public app không dùng chung browser secrets.
2. Làm login/session/workspace switch, profile/onboarding/member/role UI và goals/baseline/KPI/budget form. Hiển thị Viewer/read-only; vẫn để API kiểm quyền. Baseline thiếu không hiện % tăng trưởng.
3. **Ngày 3–4:** tích hợp auth/workspace của Thiệu Quang, profile/goals của Mỹ; lưu/reload dữ liệu thật. Nhận knowledge feature của Huyền và ghép route, không sửa trực tiếp source feature của Huyền.
4. Website TripC tiếng Anh: blog list/detail, landing và form theo BA/design; loading/validation/error/success. Public read chỉ published; draft chỉ thấy trong CMS có quyền. Form chỉ báo success sau server persist, double-submit/retry xử lý theo idempotency contract.
5. Gắn UTM và GA4 config khi có property/public URL; conversion `generate_lead` sau server success, không gửi email/name. Chuẩn bị điểm gắn experiment widget một landing page; không tính click CTA là conversion.
6. **Ngày 5:** build/smoke và staging demo với Thanh; Google chưa có thì feature local/mock có nhãn, live tracking/gate vẫn mở.

**Bàn giao:** shell/common/API client, workspace/onboarding/goals, `apps/pilot/` blog/landing/form/config và README chạy được. **Đạt khi:** build chạy, mock độc lập dùng cùng contract, live flows persist/reload, Viewer/UI states đúng, form failure không success/event. Review: Huyền/Trường, Thiệu Quang/Mỹ, Thanh.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — tien](../execution/W2.md#tien) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Phần task gốc:** W2-FE-01 strategy/tasks và ghép research/board; W2-FE-02/03 route/common hỗ trợ briefs/editor của Huyền. Huyền sở hữu research/opportunities/briefs/content/variants/SEO fields. Phụ thuộc: strategy/task API Thiệu Quang, shared states và design; mock trước API live.

1. **Ngày 6–7:** ghép routes research/opportunity của Huyền vào app shell, giữ workspace/goal/opportunity context. Chỉ sửa router/common của mình, gửi nhu cầu feature qua Huyền.
2. **Ngày 8:** strategy edit/detail/approve/task list; hiển thị owner/effort/deadline/KPI/budget, pending/rejected/approved state và version; action không tự thực thi khi chưa duyệt.
3. **Ngày 9:** tích hợp API thật strategy/tasks; loading/empty/errors/stale version. Nhận brief/editor navigation và shared job-progress/common components từ Huyền, giữ lineage khi chuyển màn hình.
4. **Ngày 10:** cùng Huyền/BE chạy research → strategy → brief → draft; fix shell/auth/API client blockers và build. Tiếp tục kiểm form/tracking pilot đã có, không thêm social/video/website thứ hai.

**Bàn giao:** features `strategy`, `tasks`, routes/common và integration evidence. **Đạt khi:** strategy/task save/reload/approve đúng quyền/version, journey không mất IDs, mock chuyển live không phải đổi source feature. Review: Huyền, Trường, Thiệu Quang, Thanh.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — tien](../execution/W3.md#tien) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Phần task gốc:** W3-FE-01 route/public published page; W3-FE-02 traffic/UTM; W3-FE-03 integrations/analytics/widget preparation. Huyền sở hữu SEO/approval/calendar/community. Phụ thuộc: published-read/lead/tracking/metrics APIs Mỹ, design sync/missing states, Google property/quyền.

1. **Ngày 11–12:** public blog/landing render đúng approved published version/URL/meta/headings, không lộ draft; nối CMS links từ màn calendar Huyền. Form/UTM đã hoạt động trước bài thật đầu tiên.
2. **Ngày 13:** traffic table/UTM link builder: campaign/content/channel refs, copy/open URL và validation; metadata đúng schema. Không đếm CTA click bằng form conversion.
3. **Ngày 14:** integrations/connect status và analytics dashboard: property/date range/traffic/click/CTR/conversion/sync time. Thể hiện loading/no access/error/zero/missing/delayed; đối chiếu BE mapping và nguồn Google thật khi có quyền.
4. Chuẩn bị widget interface cho hai title hoặc CTA variants tại một landing page; visitor assignment/exposure/outcome wiring theo contract, chưa tự viết rule winner.
5. **Ngày 15:** regression pilot/session/common và demo dashboard; freeze features M01–M13, ghi tracking/data blockers thay vì số liệu giả.

**Bàn giao:** `traffic`, `integrations`, `analytics`, pilot published rendering/tracking/widget interface. **Đạt khi:** URL/content/UTM đúng, analytics không chứa PII và missing không biến thành 0, live dashboard khớp nguồn có quyền; mock không đóng gate Google. Review: Huyền/Trường, Mỹ, Thanh.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — tien](../execution/W4.md#tien) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Phần task gốc:** W4-FE-01 shared task/navigation cho report Huyền; W4-FE-02 toàn bộ experiment/admin+pilot widget; W4-FE-03 strategy refresh/build/release. Huyền làm reports/learning. Phụ thuộc: experiment API Mỹ, task/strategy version Thiệu Quang, M14/M16 interfaces Huyền.

1. **Ngày 16:** approved report action mở task/goal/strategy đúng IDs, cập nhật task list sau API success; report page thuộc Huyền.
2. **Ngày 17:** experiment setup hypothesis/2 title hoặc CTA variants/metric/period; widget lấy stable assignment từ visitor-scoped API. Exposure khi variant thực sự hiển thị; outcome chỉ khi form lưu, retry theo dedup keys.
3. Results UI tách variants, sample size và thiếu bằng chứng; reload giữ variant theo policy. Không đưa Owner token vào pilot/browser hay kết luận winner tùy ý.
4. **Ngày 18:** sau learning được duyệt, app refresh đúng strategy version và liên kết insight; production config/build cho hai app, freeze feature.
5. **Ngày 19–20:** fix UAT/responsive/session/widget critical, cập nhật FE README/lệnh chạy/env mẫu, release smoke sau PO go. Bàn giao build/config/routes/known issues.

**Bàn giao:** `experiments`, pilot widget, shared integration và verified build/run docs. **Đạt khi:** visitor ổn định, exposure/form outcomes không trùng, experiment thiếu mẫu có nhãn, production build và UAT đạt. Review: Huyền/Trường, Mỹ/Thiệu Quang, Thanh.
