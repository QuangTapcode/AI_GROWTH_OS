# CR-007 — Performance measurement and pilot CTA experiments

Date: 2026-11-10. Implementation candidate; independent review and live-provider acceptance remain required.

HTTP AI envelope remains `1.0.0`. Runtime bundles are now `performance-v3` and `learning-v2`; regenerate the executable Pydantic bundle with `python services/ai/scripts/export_six_role_contracts.py`.

## Measurement contract

- Canonical KPI names: `qualified_visits`, `leads`, `clicks`, `impressions`, `sessions`, `pageviews`, `ad_spend`, `ctr`, `cvr`, `cpl`. API goals normalize legacy `leads_generated`, `search_clicks`, `search_impressions`; unsupported names are rejected.
- First-party windows are half-open UTC timestamps. Qualified sessions require a published-content view followed by that same content's CTA, in the same site/session/window. `converted_visits` counts these sessions with a subsequent persisted, non-synthetic site lead linked by `context.visitor_id`. CVR is `100 * converted_visits / qualified_visits`; missing linkage is not inferred from total leads.
- GA4/Meta aggregates use the last complete native dates covered by stored daily snapshots; scope includes the verified workspace/account binding. Old snapshots without account provenance are not silently adopted. Resync them through the scoped connector.
- GSC uses a separate complete native-date window ending before the three-day settlement lag. `coverage` records native `from`, `to`, timezone and status inside the hashed result; its dates may differ from the first-party window.
- Comparisons require matching definitions, scope, timezone, synthetic flags, valid capture times, comparable non-overlapping periods and complete provider coverage. Mixed currencies and incomplete coverage never produce lift. A zero baseline has absolute change and no relative percentage.
- `currency`, `coverage`, `channel_metrics`, attributed per-content lead/qualified counts and approved-action proposals are additive fields. CPL is a blended aggregate observation, not ad-attributed ROI; it is unavailable when spend and leads have different effective windows. No revenue or ROAS is fabricated.
- Real `lead.aggregate` results now require `metrics_artifact_id`, `window_start`, `window_end` and `count`. Learning checks the same input artifact/window/count. Legacy synthetic fixtures remain supported; old real aggregates must be regenerated.

## Reporting

`GET /v1/workspaces/{workspace_id}/reports` validates real dates, an IANA timezone, currency and an ordered range of at most 366 days. Lead counts are aggregated in the DB across the complete period, excluding synthetic rows. The report timezone governs lead date boundaries; provider totals retain their native date labels and expose their own `timezone`. Currency conversion is not performed; a currency mismatch is missing data, not a relabelled number.

`GET .../leads` adds optional `from`, `to`, `timezone`, `exclude_synthetic=true`, and existing `offset`/`limit`. `total` refers to the filtered period. The UI labels its latest-100 interest breakdown as a sample; total KPI counts are not capped.

`metrics` worker calls `/internal/metrics/sync` with `AUTOMATION_INTERNAL_TOKEN`, a dedicated `METRICS_REQUEST_TIMEOUT_MS` (default 180000), bounded ranges, and retryable transport/429/5xx/provider failures. Repeated sync replaces the same bounded daily range under a workspace transaction lock. Server credentials alone do not authorize a workspace account.

## Owner-approved report actions

`POST /v1/workspaces/{workspace_id}/performance-actions` accepts `{artifact_id, expected_version, expected_hash, action_index}`. An active owner approves a complete real report proposal. Backend validates the pinned artifact/context/sources, then atomically writes one stable Research task plus outbox. Replay returns the same `task_id`; models cannot grant approval or mutate ad spend.

## Pilot CTA experiment API

`/v1/workspaces/{workspace_id}/experiments`:

- `GET`: member-readable experiment definitions and aggregate results; no visitor IDs.
- `POST`: owner/editor creates an immutable draft with hypothesis, optional published `content_slug` (null = landing), two distinct CTA strings, starts/ends and `min_exposures` (at least 100 per group, maximum period 90 days).
- `PATCH {id, action: start|stop}`: owner-only. Starting explicitly approves both CTA variants; only one trial can run per site/page. Stopping early never produces a winner.

`POST /public/v1/sites/{site_id}/experiment` accepts a random UUID `visitor_id`, optional `content_slug`, and optional `assignment_id`. Without assignment ID, it returns only `{assignment_id, variant, cta}` or null; backend resolves the site/workspace. Assignment is stable across refreshes and concurrent requests. With assignment ID, it records the first exposure only, for the same visitor/site/active period. The pilot sends exposure after the CTA enters the viewport.

Conversion is derived from persisted leads carrying the assignment ID, after exposure and before end/stop, excluding synthetic and internal visits. Multiple lead rows for an assignment count once. No browser conversion callback is trusted. Verdicts use a fixed horizon, minimum exposure floor and conservative non-overlapping 95% Wilson intervals. Before the horizon, after an early stop, with insufficient sample or overlapping intervals, `winner=null`.

Anonymous site events add optional UUID `event_id` and allowlisted UTM `attribution`. `(site_id,event_id)` is unique. Lead form retries preserve the idempotency key for unchanged payloads; last tagged campaign and content slug accompany the persisted submission. No email/name goes into anonymous events.

Migrations: `024_performance_event_attribution.sql`, `025_performance_experiments.sql`. These are additive; app rollback may retain the new tables/columns. Do not run a destructive down migration to undo the rollout.

## Review fixes (2026-11-10)

- Metrics snapshots add optional `spend_window_leads`. The backend counts non-synthetic leads for the selected site using the spend provider's date bounds and IANA timezone. `coverage.cpl` equals `coverage.ad_spend`; incomplete or mismatched coverage cannot produce CPL. The denominator is separate from rolling-window `leads`. The CPL definition explicitly identifies blended cost, not ad attribution.
- Research adds optional `performance_action: {metric_name, reason, report_artifact_id}`. The outbox passes owner-approved investigation guidance from new nested task inputs and legacy queued envelopes to the Research prompt. Guidance is never treated as source evidence.
- Starting a trial serializes transitions per workspace and closes expired trials on the same page at their scheduled `ends_at`, releasing the unique slot without marking a completed horizon as an early stop.
- Migration 021 reuses migration 003's existing workspace/time index. An older copy already applied elsewhere may retain its redundant index; this change does not drop it automatically.
- Performance CI now runs API/Web/Pilot lint plus the Research input and Community history regressions. API lint uses the installed Next 14/ESLint 8 configuration through FlatCompat.
# Bổ sung bàn giao số liệu kênh ngày 10/11/2026

## Bổ sung ngày 11/11/2026: lịch sử đo và vòng đời kết nối

- `GET /v1/workspaces/{workspace_id}/performance-social?from=YYYY-MM-DD&to=YYYY-MM-DD` cho thành viên workspace xem so sánh số tích lũy trước kỳ với lần chụp trong kỳ (UTC), tối đa 20 bài. Thiếu baseline không coi là 0; baseline bằng 0 không tính phần trăm. Phản ánh chênh lệch quan sát, không khẳng định reach hay số tương tác phát sinh chính xác trong kỳ.
- Mọi điểm đo phải khớp workspace, account/Page, publishing job, external post ID, artifact và version; không nhận điểm chụp trước lúc đăng, sau thời điểm hiện tại hoặc sai phiên bản. Kết quả giữ mã nội dung, hash, version và timestamp của từng mốc.
- Facebook trả mã token 190/HTTP 401: ghi số mới là thiếu và trạng thái kết nối lỗi, ngừng gọi các bài còn lại; không dùng số cũ như mới và không tự thử đăng nhập. HTTP 403, 429, timeout có lý do riêng, không retry hàng loạt.
- Chủ workspace có thể gọi `POST` với `{ "action": "verify" }` sau khi thay token ở máy chủ. Chỉ xác minh lại Page đã được gắn với workspace, không tạo gắn kết mới từ token dùng chung. Facebook phải xác nhận đúng Page ID trước khi bỏ trạng thái lỗi. Quyền đọc từng bài vẫn được kiểm tra khi sync.
- Báo cáo lịch sử được phép hiển thị số đã lưu của kết nối lỗi kèm cảnh báo; snapshot AI mới chỉ nhận dữ liệu từ kết nối hiện được xác minh và connected.

- Meta Ads dùng `ad_clicks`, `ad_impressions`, `ad_ctr` riêng; `clicks`, `impressions`, `ctr` tiếp tục là tìm kiếm tự nhiên. `ad_ctr = 100 × ad_clicks / ad_impressions`; mẫu số bằng 0 thì không tính tỷ lệ. Lần đồng bộ mới thiếu trường không được dùng lại số cũ.
- `POST /v1/workspaces/{workspace_id}/performance-social` nhận `{from,to}` là ngày xuất bản. Chỉ owner/editor được gọi, chỉ đọc tối đa 20 bài Facebook đã xuất bản và gắn artifact thuộc workspace, trên Page hiện được xác minh.
- Cấu hình máy chủ: `INTEGRATION_MODE=production`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`; phiên bản lấy từ `FACEBOOK_GRAPH_API_VERSION` nếu có, nếu không dùng `META_GRAPH_API_VERSION` hiện có. Không đưa token vào trình duyệt hoặc payload AI; không thay cấu hình env của người dùng trong thay đổi này.
- `social_posts` là mảng quan sát có `workspace_id`, `publishing_job_id`, `content_id`, `artifact_id`, `artifact_version`, `campaign_id` nếu liên kết được, `external_post_id`, `published_at`, `captured_at`, `provider=facebook_page`, `scope=post_lifetime`, `counters`, `missing_reasons`.
- `counters` chỉ gồm reactions/comments/shares. Giá trị 0 là có đo; null là thiếu. Đây là số tích lũy lúc chụp, không phải reach/unique visitors trong kỳ, không chứng minh doanh thu hoặc nguyên nhân. Chưa thay thế bộ Page Insights đầy đủ.
- Snapshot Performance chỉ nhận bài thuộc workspace, xuất bản trong kỳ và số đếm chụp không muộn hơn snapshot. Thu hồi xác minh Page làm các quan sát đó không còn được đưa vào snapshot mới.
- Learning giữ tham chiếu phiên bản nội dung trong `lessons.channel_observations` (tối đa 5 ghi nhận); Research nhận trường này như hướng điều tra, vẫn phải dùng nguồn được duyệt làm bằng chứng. Không có quan sát kênh thì định dạng lời nhắc Research cũ được giữ nguyên.
- Kiểm thử fixture/PostgreSQL tạm không thay thế nghiệm thu provider thật; quyền Page, phiên bản Graph được hỗ trợ và số liệu đối chiếu cần được xác nhận trên môi trường của nhóm.

