# MY-02 — Spike quyền connector và nguồn ảnh (D3)

Ngày: 15/10/2026. Owner: Mỹ. Reviewer: Dương + Thiệu Quang. Trạng thái: `local_verified` — skeleton matrix code + decision helper; **phần verified/missing chờ thông tin quyền thật từ PM** (xem "Cần PM cung cấp").

Nguồn dữ liệu code: [`matrix.ts`](../../../apps/api/src/modules/integrations/matrix.ts) · [`stubs.ts`](../../../apps/api/src/modules/integrations/stubs.ts) · decision helper `socialChannelDecision()`.

## 1. Capability matrix hiện trạng (probe: chưa có credentials nào trên server)

| Provider | Capability | Scope/permission cần | Env key (server-only) | Trạng thái | Missing reason |
| --- | --- | --- | --- | --- | --- |
| ga4 | read_property / read_stream_events / read_realtime_events | `analytics.readonly`, Viewer property | `GOOGLE_SERVICE_ACCOUNT_JSON` | not_connected | GOOGLE_CREDENTIALS_NOT_CONFIGURED |
| gsc | read_sites / read_search_analytics / verify_site_ownership | `webmasters.readonly`, site owner | `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_VERIFICATION_TOKEN` | not_connected | GOOGLE_CREDENTIALS_NOT_CONFIGURED / PROPERTY_NOT_VERIFIED |
| facebook_page | read_page_posts / publish_page_post | `pages_read_engagement` / `pages_manage_posts`, Page Admin | `FACEBOOK_PAGE_ACCESS_TOKEN` | not_connected | FACEBOOK_PAGE_PERMISSION_MISSING |
| instagram_business | read_ig_media / publish_ig_media | `instagram_basic` / `instagram_content_publish`, IG Business linked Page | `INSTAGRAM_BUSINESS_ACCOUNT_ID` | not_connected | INSTAGRAM_ACCOUNT_NOT_LINKED |
| meta_ads | read_ads_insights (read-only theo Level 2, không mutation) | `ads_read`, Ad Account Analyst | `META_ADS_ACCESS_TOKEN` | not_connected | META_ADS_ACCESS_MISSING |
| website_cms | publish_cms_post (Next.js pilot, qua human approval + version) | internal API write, Editor/Owen | `PILOT_CMS_API_KEY` | not_connected | CMS_NOT_PUBLISHED |

Không row nào được đánh dấu `verified` — mọi stub trả `checked: false`, không bịa quyền. Ads **chỉ read**, mutation không được expose (Level 2).

## 2. Quyết định social live/manual (gate D3)

`socialChannelDecision({connected, verified})` trong `stubs.ts` là nguồn máy-đọc-được; nguyên tắc:

- Channel **live** chỉ khi provider `connected=true` VÀ capability publish đã probe `verified=true`.
- Thiếu bất kỳ điều kiện nào → **manual pack có nhãn** `manual_<capability>` + missing_reason, không pretend live.

Với dữ liệu hiện tại (chưa có credentials): **website=manual, facebook=manual, instagram=manual**. FB/IG live cần quay lại trước mốc chốt D3 khi PM cấp quyền; nếu sau D3 vẫn thiếu → pilot chạy manual pack, ghi vào runbook bàn giao MY-09.

## 3. Nguồn ảnh

- Media provider (FB/IG image API) chưa kết nối → theo MY-01 README, dùng **ảnh TripC hợp lệ** do DU-03 bàn giao; fallback: corpus/templates (chỉ fact sheet, không có ảnh thật).
- Chưa xác nhận license ảnh trong repo; mọi ảnh đưa vào social pack cần `provenance.attribution` như corpus (CR-001).

## 4. Cần PM cung cấp (blocker để chuyển verified)

1. FB Page TripC: Page ID + access token `pages_read_engagement`/`pages_manage_posts` (có/không).
2. IG Business account: đã linked FB Page chưa, có `instagram_content_publish` không.
3. Meta Ads: Ad Account ID + token `ads_read` (read-only).
4. GA4 property `G-8LQN27Y8QQ` (đang trên Cloudflare Pages): service account + property ID; GSC site URL + service account.
5. Domain/DNS access cho GSC site verification.
6. Ảnh TripC bản quyền (DU-03) + `PILOT_CMS_API_KEY` khi API publish pilot chạy.

Khi có thông tin, cập nhật `default_status` của row tương ứng sang `connected` sau khi probe thật, không sửa code khác.

## 5. Ranh giới

- Spike này **không** mở adapter live thật (thuộc MY-04/05/06); chỉ chốt matrix + decision.
- Credential chỉ server-side; không log/serialize token.
