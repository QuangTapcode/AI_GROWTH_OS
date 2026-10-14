# Bản đồ tái sử dụng và chuyển task cũ

Ngày đọc mã nguồn: 14/10/2026. Có code không đồng nghĩa nghiệm thu tích hợp; số test/tiến độ trong audit 09/10 là bằng chứng lịch sử, cần kiểm lại trên candidate hiện hành.

| Phần đã có | Cách dùng lại / phần còn thiếu | Owner/task mới |
| --- | --- | --- |
| Workspace/member/source services, RBAC/OCC, migration 001 | Giữ APIs và schema tương thích; rà auth, build, tenant và migration bổ sung | TQ-01/02, TH-02 |
| RAG ingest/retrieval/answer, guardrails và growth_map | Giữ module/import/operation; dùng approved snapshot và evidence cho sáu role | QQ-02, TH-02 |
| AI run store, provider fake/live, HTTP API, constraints | Giữ persistence/call budget; worker nối HTTP contract thật | MY-01, QQ-02 |
| Worker queue, retry/lease/heartbeat/file store | Giữ runner/adapters; nối DB store, dependency workflow/outbox/human wait | MY-01/03/08 |
| Generic AI operations | Đã tách bootstrap.py; registry sáu role; thay từng handler bằng pipeline riêng | QQ-03–06 |
| Lead schemas/service/in-memory transaction | Giữ validation/idempotency rules; repository DB + contact dedup/owner/status | TQ-05, MY-06, TH-05 |
| Public content DTO và mock snapshots | Giữ field allowlist; nối published version thật và CMS executor | TQ-04, MY-04/05 |
| Integration capability matrix/stubs | Giữ missing reasons; spike quyền rồi thay từng adapter; không đánh dấu live vì có stub | MY-02/06 |
| Web/pilot shell, API client, manifests/lockfiles | Giữ packages/routes; bổ sung features dùng common list/detail | TI-01–09 |
| QA runners/fixtures và bộ AI eval 30 ca | Giữ ca phù hợp; bỏ placeholder khỏi checks, thêm coverage 6 role và evidence candidate | TH-01–09, QQ-08 |
| BA/spec/design cũ | Dùng rules/AC đúng scope; reconcile 7 người/3 tuần và phạm vi tối thiểu | DU-01–09, TR-01–09 |

## Đối chiếu task cũ → gói mới

| Nhóm cũ | Task mới | Cách xử lý |
| --- | --- | --- |
| W1-PM/BA/UX; V2-01/04 | QQ-01, DU-01–03, TR-01–03 | Rà scope và capacity; không kế thừa Done |
| W1-BE core/contract; V2-02/05/08 | TQ-01–06 | Reuse schema/auth, bổ sung ledger/gateway |
| W1-AI/worker; V2-06/07/10 | QQ-02, MY-01/03, TH-02/03 | Nối run thật; fake không thay live evidence |
| V2-11/12 và W2 research/strategy/content | QQ-03–05, DU-04, TI-04/05 | Dedicated role handlers và versioned artifacts |
| V2-13/14/15 và W3 publish/tracking | TQ-04/05, MY-04–06, TI-06, TH-04/05 | Website + lead DB trước social mở rộng |
| V2 community/performance/report | QQ-06/07, MY-06/07, TI-07, DU-05/08 | Proposal/learning tối thiểu, read-only ads |
| W4 QA/release/runbooks | TH-07–09, TQ-08/09, MY-08/09, TI-08/09 | Đưa vào tuần 3 mới, không bỏ gate |
| Task FE của Huyền trong baseline cũ | TI-02/04/05/07 | Tiến tiếp nhận theo UI tối giản; Trường hỗ trợ spec/common patterns |

## Lịch sử và nguồn trạng thái

Các checklist phân công cũ, snapshot trùng và backlog V2 đã được xóa theo yêu cầu 14/10/2026. Bảy file cá nhân tại đây là nguồn trạng thái hiện hành. Giữ audit, nguồn gốc và đặc tả DATA-AND-FLOWS/EXAMPLES để tái sử dụng nghiệp vụ, không lấy lịch cũ làm cam kết mới. Xem [biên bản dọn dẹp](CLEANUP.md).

Các task mở rộng chưa cần trong 15 ngày: rich editor, calendar lifecycle, AI video render, CRM ngoài, Sales AI team, ads spend, autonomous experiment engine và thêm kênh. Đưa backlog sau pilot, không xóa mã nguồn đang có.

## Skills

Đã dùng find-skills để tra directory và xem chất lượng nguồn; lượt CLI trước không trả kết quả nên dùng directory trực tiếp. Dùng hướng dẫn sẵn có karpathy-guidelines (thay đổi nhỏ, giữ code dùng được) và codebase-documenter (ownership/data flow/handoff). Chưa cài thêm package skill. Skill nghiệp vụ có thể tham khảo sau: content-strategy, seo-audit, analytics-tracking từ coreyhaines31/marketingskills; phải chuyển thành prompt/schema/eval của service, không coi cài skill là có workflow tự động.
