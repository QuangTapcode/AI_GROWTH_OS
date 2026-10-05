# Risks và blockers — tuần 1

05/10/2026 · PM/PO Quang Quang cập nhật mỗi ngày. Hạn là ngày làm việc tương đối từ kickoff. Risk là nguy cơ; blocker là điều kiện hiện đang ngăn task/gate cụ thể. Không đánh dấu resolved nếu chỉ có tài liệu hướng dẫn.

| ID | Loại / mức | Tình trạng / ảnh hưởng | Owner | Hạn | Xử lý / điều kiện đóng |
| --- | --- | --- | --- | --- | --- |
| B01 | Resolved cho local dependencies | Người dùng xác nhận máy Windows hiện tại; Docker DB/search đã chạy/probe | Quang Quang + Thiệu Quang | Đã kiểm tra | Có evidence local; app/public deployment vẫn thuộc B02/B04, không coi DB/search là CMS đã chạy |
| B02 | Blocker / high | Chưa domain/public HTTPS URL; GSC verification/production tracking chưa sẵn sàng | Quang Quang + Thiệu Quang | D2 | Chọn hostname hoặc public URL hợp lệ và TLS; chưa mua nếu chưa có quyết định. Đổi lịch gate nếu chưa giải quyết |
| B03 | Blocker / high | GA4/GSC property/Google access chưa cung cấp | Quang Quang + Mỹ | D2–D5 | Tạo property/data stream, verify owner/API scope; event/live-source evidence rồi đóng |
| B04 | Blocker / high | Repo chỉ skeleton, thiếu apps/schema/DB | Thiệu Quang/Mỹ + Tiến/Huyền | D3–D5 | Hoàn thành tasks bootstrap/integration; không demo mock như staging thật |
| B05 | Partial / medium | DB/vector và SearXNG query đã qua smoke; còn worker/queue/product adapter/tenant schema | Mỹ + Thiệu Quang | D2–D5 | Hoàn thành migrations/tenant/job/error tests; query probe không thay M04 integration/eval |
| R01 | Risk / high | Quang Quang kiêm AI/PM/PO, Thanh kiêm hai lane | Quang Quang | D2, review D10 | WIP chung, reuse pipeline, BA business UAT hỗ trợ; đổi scope depth/capacity/date khi quá tải, giữ critical checks |
| R02 | Risk / high | Model local nhỏ/cold load/thiếu RAM có thể chậm hoặc hallucinate | Quang Quang + Thanh | D5 | Concurrency 1, bounded context; 30 eval cases; missing facts/critical fail chặn publish; timeout rõ |
| R03 | Risk / high | Crawl facts outdated/conflict và quyền nguồn chưa review | Dương + Quang Quang | D4 | Allowlist/provenance/source review; housing conflict không tạo claims TripC; revoked sources lọc khỏi RAG |
| R04 | Risk / medium | Search upstream rate limit/403 hoặc không trả đủ evidence | Mỹ + Quang Quang | D5 | Instance riêng bật JSON, giới hạn queries, log failed/missing; không bịa demand hoặc âm thầm dùng paid API |
| R05 | Risk / high | Máy chủ tự host có downtime/backup/storage/network issues | Thiệu Quang + Thanh | D5/D20 | Internal services/private secrets; backup/restore và release rollback có test; không suy ra Docker PC = server ready |
| R06 | Risk / medium | Site mới thiếu Search Console data/mẫu experiment | Dương + Mỹ | D14/D17 | GA4/UTM bật sớm; empty/missing/delay đúng; functional gate khác growth claim; không kết luận winner khi thiếu mẫu |
| R07 | Risk / high | Merge/API/schema/migration lệch khi hai FE/hai BE làm song song | Thiệu Quang | Daily | Contract first + consumer checks + owner review/migration ordering; feature flags khi API chưa ready |
| R08 | Risk / high | Form/publish retry đếm trùng hoặc lộ draft/cross-tenant | Mỹ + Thanh | D5/D12 | Submission/job idempotency, approval version checks, public-published-only and tenant negative tests |

B01 đã resolved cho local dependencies; B02–B04 vẫn **open**, B05 partial. B02/B03 còn public URL và Google setup; B04/B05 là task kỹ thuật đã phân công. Rủi ro có mitigation nhưng chưa có benchmark/test tương ứng.

## Escalation và gate

Blocker quá một ngày: owner nêu tác động và bước tiếp theo, Quang Quang ghi quyết định giảm độ sâu/bổ sung năng lực/đổi mốc. Không đổi từ local/mocked thành integrated để tránh trễ. Cross-tenant/approval/source/duplicate conversion/publish hoặc numeric error là critical, chặn gate/release.

[W1-PM-03](W1-PM-03.md) · [DEMO-W1](DEMO-W1.md) · [TODO](../../TODO.md).
