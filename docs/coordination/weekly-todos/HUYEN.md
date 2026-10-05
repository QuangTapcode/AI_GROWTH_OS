# Huyền — FE knowledge, content và các luồng review

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). TypeScript/Next.js; sở hữu features `knowledge`, `research`, `opportunities`, `briefs`, `content`, `variants`, `seo`, `approval`, `calendar`, `community`, `reports`, `learning`; `apps/web/src/mocks/`, UI tests. Task tại `apps/web/tasks/`, tên kèm `huyen`. Tiến tích hợp routes/common/manifest/lockfile; đề xuất thay đổi qua Tiến, không tạo lockfile thứ hai trong app.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — huyen](../execution/W1.md#huyen) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Phần task gốc:** W1-FE-01 component consumers/mocks/tests; W1-FE-02 knowledge; W1-FE-03 mock/consumer/component tests. Tiến bootstrap/shell/workspace/goals/public pilot. Phụ thuộc: knowledge fields/schema và design, common-component interfaces Tiến; có thể làm mock trước API.

1. **Ngày 1–2:** cùng Tiến chốt list/detail/form/upload/common props, mock/live client interface; tạo mock fixtures có version cho thành công/loading/empty/error/forbidden, không giả fixture là live data.
2. Knowledge UI: upload text/PDF có text/URL được phép, danh sách/detail, ingestion progress/error, source/provenance/version và review approve/revoke/delete theo role.
3. **Ngày 3–4:** tích hợp source/knowledge API Thiệu Quang và job status Mỹ; save/reload, lỗi validation/provider, Viewer read-only. Nguồn chưa duyệt có nhãn, nguồn bị xóa không còn xuất hiện như active context.
4. Viết component/consumer checks nền tảng cho cả inputs common thống nhất với Tiến; unit UI tests dưới vùng FE, E2E suite độc lập do Thanh quản. Nhờ Tiến ghép routes.
5. **Ngày 5:** chạy knowledge journey live với BE/AI/Thanh, fix UI blockers; review pilot form/common states của Tiến trong PR, không tự đổi source pilot.

**Bàn giao:** feature `knowledge`, mocks/component tests và integration evidence. **Đạt khi:** đầy đủ state/role/source metadata, upload/review/delete dùng API thật và reload đúng; schema changes phát hiện qua consumer checks. Review: Tiến/Trường, Thiệu Quang/Mỹ, Thanh.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — huyen](../execution/W2.md#huyen) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Phần task gốc:** W2-FE-01 research/opportunities; W2-FE-02 briefs; W2-FE-03 content/editor/variants/SEO fields. Tiến giữ strategy/tasks. Phụ thuộc: Mỹ research/job API, Thiệu Quang opportunity/brief/content API, AI outputs và design.

1. **Ngày 6–7:** research run/progress/sources/failure, opportunity board/filter/detail/select với score components/rationale. Demand không có dữ liệu hiển thị thiếu, source links/timestamp xem được.
2. **Ngày 8:** brief create/edit/facts/source/CTA/format/destination và approve state; giữ goal/opportunity/strategy IDs. Generation bị khóa với brief chưa duyệt; strategy page nhận từ Tiến.
3. **Ngày 9:** editor/autosave/history/version/restore/regenerate/progress và một variant; title/meta/headings/SEO warnings cơ bản. Stale version có conflict UI, không ghi đè âm thầm; restore tạo version mới.
4. Thiếu facts/schema/job failed có thông báo và bước sửa; cancel/retry đúng capability, không hiển thị job complete nếu output chưa lưu. Dùng list/detail/form tái sử dụng để giữ scope pilot.
5. **Ngày 10:** chuyển mock → API thật cho cả journey, phối hợp Tiến ghép route, Thanh chạy E2E; lưu consumer/component evidence và fix blockers.

**Bàn giao:** `research`, `opportunities`, `briefs`, `content`, `variants`, SEO fields + mocks/tests. **Đạt khi:** research→strategy Tiến→brief approved→draft giữ lineage, edit/version/conflict đúng, citations/CTA hiển thị và dữ liệu reload thật. Review: Tiến/Trường, hai BE/AI, Thanh.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — huyen](../execution/W3.md#huyen) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Phần task gốc:** W3-FE-01 SEO/approval/calendar; W3-FE-02 community; W3-FE-03 consumer/interface checks phần mình. Tiến giữ traffic/analytics/pilot/widget. Phụ thuộc: Mỹ SEO/publishing/community APIs, Thiệu Quang approval/version, BA state rules.

1. **Ngày 11:** SEO audit/cluster/link/local draft/refresh suggestions; approve/reject/resubmit queue với version/hash/source info. Edit sau approve phải hiển thị cần duyệt lại.
2. **Ngày 12:** calendar/schedule/timezone/publish URL/status, failed/unknown outcome/retry/cancel states; dùng shared approval, không tạo workflow duyệt khác trong content/community.
3. **Ngày 13:** radar/conversation/intent/response sources/approve, manual handoff/post link; label draft/export/manual rõ, không tạo UI ngụ ý auto-post social.
4. **Ngày 14:** test source/version/permission/missing states và chuyển sang analytics của Tiến qua đúng content/campaign refs; consumer checks khi BE sửa schemas.
5. **Ngày 15:** E2E publish flow với Thanh/BE, hồi quy editor/knowledge và design QA, freeze M01–M13.

**Bàn giao:** `seo`, `approval`, `calendar`, `community`, component/consumer tests. **Đạt khi:** đúng state transitions, stale approval không cho publish, URL/status/calendar đúng, manual link lưu thật; UI failure không báo success giả. Review: Tiến/Trường, Thiệu Quang/Mỹ, Thanh.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — huyen](../execution/W4.md#huyen) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Phần task gốc:** W4-FE-01 reports; W4-FE-02 peer/consumer review experiment của Tiến; W4-FE-03 learning/fix UI. Tiến sở hữu experiments/widget/build config. Phụ thuộc: report/learning APIs Mỹ, AI evidence, task/strategy approval Thiệu Quang.

1. **Ngày 16:** report hai kỳ/metric/source/evidence/limitations; baseline 0/missing đúng label. Action review/approve→task hiển thị kết quả server, không tự tạo task lúc đọc report.
2. **Ngày 17:** review experiment UI/consumer states với Tiến, bảo đảm result/missing sample không gây hiểu sai; viết component checks theo schema mình tiêu thụ.
3. **Ngày 18:** learning insight/evidence/version/review/approve; chỉ sau API apply thành công mới báo strategy version mới và link đến trang Tiến. Xử lý reject/stale/concurrent approval; freeze.
4. **Ngày 19:** hồi quy knowledge→editor→publish→report→learning, sửa UAT/usability với Trường; cập nhật mocks/UI tests/known gaps.
5. **Ngày 20:** review final FE build và docs của Tiến, release smoke phần mình với Thanh, bàn giao source/tests và cách sử dụng content/report/learning.

**Bàn giao:** `reports`, `learning`, final UI tests/mocks và handoff. **Đạt khi:** evidence truy được, zero/missing đúng, approve action/insight lưu thật/idempotent, version mới rõ; UAT/design review đạt. Review: Tiến/Trường, Mỹ/Thiệu Quang/AI, Thanh.
