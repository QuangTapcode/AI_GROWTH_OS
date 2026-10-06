# Risks và blockers — tuần 1

05/10/2026, cập nhật 06/10/2026 · PM/PO Quang Quang cập nhật mỗi ngày. Hạn là ngày làm việc tương đối từ kickoff. Risk là nguy cơ; blocker là điều kiện hiện đang ngăn task/gate cụ thể. Không đánh dấu resolved nếu chỉ có tài liệu hướng dẫn.

| ID | Loại / mức | Tình trạng / ảnh hưởng | Owner | Hạn | Xử lý / điều kiện đóng |
| --- | --- | --- | --- | --- | --- |
| B01 | Resolved cho local dependencies | Người dùng xác nhận máy Windows hiện tại; Docker DB/search đã chạy/probe | Quang Quang + Thiệu Quang | Đã kiểm tra | Có evidence local; app/public deployment vẫn thuộc B02/B04, không coi DB/search là CMS đã chạy |
| B02 | Partial / high | 06/10: có public HTTPS `https://aigrowthos-staging.pages.dev/` (Cloudflare Pages, 200, `noindex`), nhưng chỉ phục vụ trang thông báo; `apps/pilot`/`apps/api` chưa ra public | Thiệu Quang (routing/deploy) + Quang Quang | D5 | Next: Thiệu Quang chọn cách đưa pilot+API ra URL public (Pages build hoặc tunnel từ host Windows) và ghi URL/commit; đóng khi journey pilot chạy trên URL public có evidence |
| B03 | Partial / high | 06/10: GA4 property `557397610`/`G-8LQN27Y8QQ` nhận Realtime; GSC URL-prefix verified (owner `quang10a1dt@gmail.com`). Backend chưa có quyền API, chưa có event `generate_lead` thật | Quang Quang cấp quyền; Mỹ connector; Tiến tracking | D5 | Next: Mỹ tạo service account (Google Cloud, không bật trả phí) và gửi email SA; Quang Quang (Owner) thêm SA làm Viewer GA4 + Restricted user GSC, thêm Mỹ/Thanh làm Viewer để đối chiếu. Đóng khi backend đọc được property/site và có một event form thật |
| B04 | Partial / high | 06/10: `apps/pilot` 3001, `apps/web` 3000, `apps/api` 4000 bootstrap local (lint/build/tests pass); chưa auth/DB schema/CMS/form/worker. AI service có ingest/RAG/growth map local_verified nhưng chưa ghép worker | Thiệu Quang/Mỹ + Tiến/Huyền; Quang Quang ghép AI | D3–D5 | Next: Mỹ ghép worker với `/internal/v1/runs` (request mẫu `services/ai/examples/`), chốt nơi lưu run theo CR-001; không demo mock như staging thật |
| B05 | Partial / medium | DB/vector và SearXNG query đã qua smoke; còn worker/queue/product adapter/tenant schema | Mỹ + Thiệu Quang | D2–D5 | Hoàn thành migrations/tenant/job/error tests; query probe không thay M04 integration/eval |
| R01 | Risk / high | Quang Quang kiêm AI/PM/PO, Thanh kiêm hai lane | Quang Quang | D2, review D10 | WIP chung, reuse pipeline, BA business UAT hỗ trợ; đổi scope depth/capacity/date khi quá tải, giữ critical checks |
| R02 | Risk / high | Model local nhỏ/cold load/thiếu RAM có thể chậm hoặc hallucinate | Quang Quang + Thanh | D5 | Concurrency 1, bounded context; 30 eval cases; missing facts/critical fail chặn publish; timeout rõ |
| R03 | Risk / high | Crawl facts outdated/conflict và quyền nguồn chưa review | Dương + Quang Quang | D4 | Allowlist/provenance/source review; housing conflict không tạo claims TripC; revoked sources lọc khỏi RAG |
| R04 | Risk / medium | Search upstream rate limit/403 hoặc không trả đủ evidence | Mỹ + Quang Quang | D5 | Instance riêng bật JSON, giới hạn queries, log failed/missing; không bịa demand hoặc âm thầm dùng paid API |
| R05 | Risk / high | Máy chủ tự host có downtime/backup/storage/network issues | Thiệu Quang + Thanh | D5/D20 | Internal services/private secrets; backup/restore và release rollback có test; không suy ra Docker PC = server ready |
| R06 | Risk / medium | Site mới thiếu Search Console data/mẫu experiment | Dương + Mỹ | D14/D17 | GA4/UTM bật sớm; empty/missing/delay đúng; functional gate khác growth claim; không kết luận winner khi thiếu mẫu |
| R07 | Risk / high | Merge/API/schema/migration lệch khi hai FE/hai BE làm song song | Thiệu Quang | Daily | Contract first + consumer checks + owner review/migration ordering; feature flags khi API chưa ready |
| R08 | Risk / high | Form/publish retry đếm trùng hoặc lộ draft/cross-tenant | Mỹ + Thanh | D5/D12 | Submission/job idempotency, approval version checks, public-published-only and tenant negative tests |

B01 đã resolved cho local dependencies; B02–B05 **partial** từ 06/10 (URL/GA4/GSC đã thiết lập, app public/API Google/worker còn mở); không đóng blocker nào khi chưa có evidence journey thật. Rủi ro có mitigation nhưng chưa có benchmark/test tương ứng.

## Escalation và gate

Blocker quá một ngày: owner nêu tác động và bước tiếp theo, Quang Quang ghi quyết định giảm độ sâu/bổ sung năng lực/đổi mốc. Không đổi từ local/mocked thành integrated để tránh trễ. Cross-tenant/approval/source/duplicate conversion/publish hoặc numeric error là critical, chặn gate/release.

[W1-PM-03](W1-PM-03.md) · [DEMO-W1](DEMO-W1.md) · [TODO](../../TODO.md).
