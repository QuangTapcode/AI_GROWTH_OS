# TODO — AI Growth OS: 4 tuần / 16 module

Baseline: kế hoạch ngày 05/10/2026. Checklist chỉ gồm công việc **tuần 1–4** để phát hành pilot trên một website. Tuần/ngày tính từ kickoff, 5 ngày làm việc mỗi tuần; chưa gán ngày lịch thực tế.

`[ ]` = chưa hoàn thành; `[x]` = đã hoàn thành đúng phạm vi task (task kế hoạch không đồng nghĩa đã xây tính năng). Hiện mới có khung tài liệu/thư mục; không đánh dấu tính năng Done vì đã có tài liệu hoặc demo mock. PM tổng hợp file này; mỗi người cập nhật task riêng trong thư mục vị trí mình ở [README](README.md).

Task quản theo effort S/M/L và mốc bàn giao, không yêu cầu bảng giờ chi tiết. Trạng thái: `backlog → ready → in_progress → local_verified → integrated → done`; `blocked` luôn có owner/cách tháo gỡ. BA/QA trace theo **mã M01–M16 của kế hoạch mới** tại [SCOPE](docs/ba/SCOPE.md).

## Đọc việc của từng người

**Bắt đầu từ checklist triển khai sâu:** [Tuần 1](docs/coordination/execution/W1.md), [Tuần 2](docs/coordination/execution/W2.md), [Tuần 3](docs/coordination/execution/W3.md), [Tuần 4](docs/coordination/execution/W4.md). Mỗi tuần tách theo 8 tên người, mỗi task con ghi cụ thể dữ liệu/API/màn hình/pipeline cần làm và expected result; [DATA-AND-FLOWS](docs/coordination/execution/DATA-AND-FLOWS.md) thống nhất entities/fields/routes/quyền/version/thuật toán. Tên field/API/file mới là đề xuất cần consumer review trước freeze, không phải code đã có.

**[Bảng việc chi tiết của 8 người trong 4 tuần](docs/coordination/weekly-todos/README.md)** ghi thứ tự thực hiện, hạn ngày, phần task được giao, đầu ra, thư mục, phụ thuộc, reviewer và tiêu chí hoàn thành. Mở link theo tên ở mỗi tuần bên dưới để nhận việc; checklist tại file này giữ trạng thái tổng hợp của task cha.

Hai FE/hai BE cùng tham gia một mã task nhưng làm các phần khác nhau. Task chung chỉ Done khi đủ tất cả phần đã phân công; không tick vì một người đã xong. Quang Quang là một người kiêm AI/PM/PO, Thanh là một người làm cả hai lane QA. Mỗi người giữ một feature chính + một lane sửa lỗi, theo [quy tắc bàn giao](docs/coordination/weekly-todos/README.md#cách-nhận-và-hoàn-thành-việc). Mỗi bàn giao ghi story/AC, contract version, commit/build, môi trường và evidence; mock chỉ chứng minh làm độc lập, không thay tích hợp thật. Checklist triển khai sâu theo dõi task con; file này giữ trạng thái task cha tổng hợp, chỉ tick khi các phần liên quan và gate đạt.

## Tuần 1 — Ngày 1–5: nền tảng, M01–M03 và tracking M13

**Mục tiêu:** workspace/onboarding → knowledge/source review → goal → RAG có nguồn chạy thật. Chốt contract đủ 16 module, đặt tracking và kiểm tra quyền CMS/GA4/GSC ngay tuần này.

**Nhịp:** ngày 1–2 scope/estimate/contracts; ngày 3–4 tích hợp nền tảng; ngày 5 QA/demo. BA/UIUX chuẩn bị tuần 2 theo lô trước 1–2 ngày.

### Ai làm gì tuần 1?

| Người | Phần việc được giao | Mốc bàn giao / chi tiết |
| --- | --- | --- |
| Quang Quang | Tiếp tục PM-03 quyền/URL/staging/demo; bootstrap AI, extraction/RAG/source lifecycle, goal suggestions và 30 eval cases | Ngày 2 schema/limits; ngày 4 RAG; ngày 5 eval/demo · [Chi tiết](docs/coordination/weekly-todos/QUANG-QUANG.md#tuan-1) |
| Dương | Story/AC M01–M03 và form, role/KPI/source rules; trace sơ bộ đủ 16 module, chuẩn bị M04–M09 | Ngày 2 field/rules; trước ngày 5 W2 stories · [Chi tiết](docs/coordination/weekly-todos/DUONG.md#tuan-1) |
| Thiệu Quang | API/core/auth/tenant/workspace/knowledge, schemas/examples 16 module, migrations/policies/CI và staging core | Ngày 2 contract/core; ngày 4 live APIs; ngày 5 gate · [Chi tiết](docs/coordination/weekly-todos/THIEU-QUANG.md#tuan-1) |
| Mỹ | Worker/queue/seed, business profile/goals, source jobs, form persistence/UTM và Google integration baseline | Ngày 2 job schema; ngày 4 profile/goals/form; ngày 5 evidence · [Chi tiết](docs/coordination/weekly-todos/MY.md#tuan-1) |
| Tiến | Bootstrap FE/common/routes, workspace/profile/member/goals; TripC blog/landing/form/tracking | Ngày 2 shell/mock; ngày 4 live/pilot; ngày 5 build/demo · [Chi tiết](docs/coordination/weekly-todos/TIEN.md#tuan-1) |
| Huyền | Knowledge upload/review/provenance/version/delete, FE mocks/component/consumer tests | Ngày 2 mocks; ngày 4 live knowledge; ngày 5 tests · [Chi tiết](docs/coordination/weekly-todos/HUYEN.md#tuan-1) |
| Trường | Tokens/core journey, thiết kế M01–M03 và public pilot đủ states; wireframe W2 | Ngày 2 lô nền tảng; trước ngày 5 lô W2 · [Chi tiết](docs/coordination/weekly-todos/TRUONG.md#tuan-1) |
| Thanh | Hai runner/fixtures/test plan, tenant/role/source/form UI+API, 30 eval cases và E2E W1 | Test từng lát ngày 2–4; ngày 5 QA verdict · [Chi tiết](docs/coordination/weekly-todos/THANH.md#tuan-1) |

### PM/PO: Quang Quang — `docs/coordination/`, PM cập nhật `TODO.md`

- [x] W1-PM-01 · Chốt 16 epic + epic nền tảng, owner/reviewer/AC/dependencies và website/dataset/người nghiệm thu pilot. [Bàn giao](docs/coordination/W1-PM-01.md): TripC, Next.js website/CMS, form conversion, roster và nguồn nghiên cứu đã chọn.
- [x] W1-PM-02 · [Bàn giao](docs/coordination/W1-PM-02.md): quản theo task S/M/L và mốc, roster/WIP kiêm nhiệm; Ollama + server sẵn có, PostgreSQL/pgvector, SearXNG tự host; không paid API/cloud mặc định; token/timeout/tải và phương án xử lý quá tải đã lập.
- [ ] W1-PM-03 · [Điều phối đã chuẩn bị](docs/coordination/W1-PM-03.md): host Windows xác nhận, local LLM/embeddings/DB/vector/search probes đạt, access matrix/risks/WIP/deployment plan/demo ngày 5 có owner và mốc. Còn public URL/GA4-GSC, app staging và actual demo; xem [blockers](docs/coordination/RISKS.md).

### BA: Dương — `docs/ba/`

- [ ] W1-BA-01 · Viết chi tiết M01–M03: Owner/Editor/Viewer, profile/brand/audience/language, source lifecycle, goals/baseline/KPI/conversion/budget; story blog/landing/form pilot, fields/consent và server-confirmed success.
- [ ] W1-BA-02 · Soạn AC sơ bộ đủ M04–M16 và traceability; định nghĩa qualified traffic, metric units, missing/zero/timezone, dữ liệu test/UAT.
- [ ] W1-BA-03 · Chốt text/PDF có lớp văn bản/URL được phép, source approval/version/delete; chuẩn bị stories M04–M09 trước ngày 5.

### UI/UX: Trường — `design/`

- [ ] W1-UX-01 · Sitemap/core journey, design system/tokens và component/state matrix tái sử dụng.
- [ ] W1-UX-02 · Handoff M01–M03: login/workspace/onboarding, knowledge/upload/review/provenance và goals; blog/landing/form pilot với success/error states; đủ loading/empty/error/permission.
- [ ] W1-UX-03 · Chuẩn bị wireframe research/board/strategy/brief/editor cho tuần 2; FE review field/state theo contract.

### FE: Tiến/Huyền — `apps/web/`, Tiến: `apps/pilot/`

- [ ] W1-FE-01 · Bootstrap TypeScript/Next.js: apps/web quản trị (Tiến/Huyền), apps/pilot công khai (Tiến), mỗi app manifest/lockfile/env riêng; routing/layout/components/API client; mock/live modes và lệnh dev/test/build đã kiểm chứng.
- [ ] W1-FE-02 · [M01–M03] Login/session/workspace, profile/member UI, knowledge upload/review/list/detail và goal form/progress; tích hợp API lưu/mở lại dữ liệu thật.
- [ ] W1-FE-03 · [M12–M13] Dựng blog/landing/form tiếng Anh tối giản trong apps/pilot với mock API; gắn GA4/UTM cùng BE, chỉ ghi conversion khi server xác nhận lưu form; thử event thật, chốt chỗ gắn widget M15; mock/consumer/component tests cho nền tảng.

### BE: Thiệu Quang/Mỹ — `apps/api/`, `apps/worker/`, `database/`, `infra/`

- [ ] W1-BE-01 · Bootstrap API CMS Next.js/TypeScript và worker TypeScript, runtime/queue/DB/storage, migrations/seed hai tenants, audit, secret strategy, staging/CI; manifests/lockfiles/run/check commands riêng.
- [ ] W1-BE-02 · [M01–M03] Auth/RBAC/tenant policies, workspace/profile/member, source/ingestion/review/version/delete và goals/KPI APIs; test Viewer và cross-tenant.
- [ ] W1-BE-03 · Chốt contract/OpenAPI/JSON Schema cho 16 module với FE/AI/QA2; job retry/recovery/input-output và metric/assignment/event schemas; canonical examples/stubs.
- [ ] W1-BE-04 · Thiết kế và probe CMS Next.js tối giản: public read chỉ published content, lead form API lưu/idempotency, CMS mutation có auth/approval; tạo/kết nối GA4/GSC và lưu support matrix; bật event collection tối thiểu, kiểm tra tracking schema/dedup, chuẩn bị sync từ dữ liệu có quyền.
- [ ] W1-BE-05 · Tạo Git remote/baseline/ownership, branch protection/required checks, schema/examples validation và CI smoke; contract changes chạy consumer checks.

### AI: Quang Quang — `services/ai/`

- [ ] W1-AI-01 · Bootstrap Python/FastAPI, pyproject.toml/lockfile/venv riêng và run/check commands; provider fake/live, internal service/job contract, structured output validation, context/model/prompt versions, trace/token/cost logging.
- [ ] W1-AI-02 · [M01–M03] Extract text/PDF/URL, chunk/index, tenant-scoped RAG citations; approved sources only, source delete propagation, thiếu facts báo thiếu; goal/Growth Map gợi ý chờ duyệt.
- [ ] W1-AI-03 · Với QA2 xây và chốt bộ tối thiểu 30 ca retrieval/facts/content/scoring/report, gồm injection/deleted sources; BA/PO xác nhận rubric/ngưỡng, freeze dataset version.

### Tester lane 1: Thanh — `qa/tester-1/`

- [ ] W1-QA1-01 · Test plan/AC traceability cho 16 module, TypeScript/Playwright runner với package/lockfile riêng và fixtures; chuẩn bị journeys research→content.
- [ ] W1-QA1-02 · [M01–M03] Test login/workspace/roles/onboarding, upload/source review/delete/provenance, goals/baseline và form/error/empty states mỗi ngày; pilot form chỉ báo thành công sau server xác nhận.
- [ ] W1-QA1-03 · E2E staging nền tảng, retest lỗi; evidence theo build/task, responsive/accessibility cơ bản và demo ngày 5.

### Tester lane 2: Thanh — `qa/tester-2/`, đầu mối `qa/fixtures/`

- [ ] W1-QA2-01 · Fixtures hai workspace/Owner/Editor/Viewer, Python/pytest/HTTP client/SQL API/contract/security suite, pyproject/lockfile riêng và CI smoke; cross-tenant API/DB/storage/vector negative tests.
- [ ] W1-QA2-02 · [M02/M13] Source lifecycle/revoke/delete, upload/URL safety, event thật/tracking mapping; public API không lộ draft, form persistence/dedup và analytics không chứa tên/email; không dùng synthetic data thay bằng chứng connector thật.
- [ ] W1-QA2-03 · Cùng AI kiểm chứng 30 ca: missing facts, injection, grounding, source xóa; ghi dataset/schema/model/prompt versions và kết quả critical cases.

### Gate cuối tuần 1

- [ ] W1-GATE-01 · M01–M03 lưu/mở lại được trên staging; Viewer không sửa; workspace A không đọc B.
- [ ] W1-GATE-02 · RAG dùng nguồn đã duyệt có citations; nguồn xóa không còn truy hồi; baseline thiếu không hiển thị % tăng trưởng.
- [ ] W1-GATE-03 · Contract đủ 16 module và quyền CMS/GA4/GSC có kết quả kiểm tra; tracking đã đặt, blockers/capacity có quyết định PM/PO.

**Note tuần 1:** chưa có quyền connector thì ghi blocker/người xử lý, không tick gate tích hợp bằng mock. Tracking phải bắt đầu từ đây để tuần 3–4 có dữ liệu; nếu dữ liệu trễ, dùng lịch sử hợp lệ được cấp quyền hoặc hiển thị thiếu.

## Tuần 2 — Ngày 6–10: M04–M08 và SEO cơ bản M09

**Mục tiêu:** research có nguồn → opportunity theo rubric → strategy duyệt → brief duyệt → draft/editor/version/variant. Giữ liên kết goal/opportunity/source xuyên suốt.

**Nhịp:** ngày 6–7 research/opportunity; ngày 8 strategy/brief; ngày 9 content/SEO; ngày 10 tích hợp/demo và review capacity.

### Ai làm gì tuần 2?

| Người | Phần việc được giao | Mốc bàn giao / chi tiết |
| --- | --- | --- |
| Quang Quang | AI research/score → strategy/brief → draft/variant/SEO rules; điều phối đường phụ thuộc/capacity | Ngày 7 research/score; ngày 8 strategy/brief; ngày 9 draft; ngày 10 demo · [Chi tiết](docs/coordination/weekly-todos/QUANG-QUANG.md#tuan-2) |
| Dương | AC M04–M08/score/version/jobs, chuẩn bị AC M09–M13 và SEO/local fixtures | Theo lô ngày 6–9; trước ngày 10 W3 AC · [Chi tiết](docs/coordination/weekly-todos/DUONG.md#tuan-2) |
| Thiệu Quang | Opportunity/strategy/task/brief/content/version APIs, concurrency và result persistence | Ngày 7 opportunity; ngày 8 strategy/brief; ngày 9 content · [Chi tiết](docs/coordination/weekly-todos/THIEU-QUANG.md#tuan-2) |
| Mỹ | Research/SearXNG jobs/evidence, AI generation adapters/quota/retry/recovery và metrics ingestion nền | Ngày 7 research; ngày 9 jobs; ngày 10 failure/restart evidence · [Chi tiết](docs/coordination/weekly-todos/MY.md#tuan-2) |
| Tiến | Strategy/approve/tasks UI, ghép routes/common cho research/brief/editor | Ngày 8 strategy/tasks; ngày 10 journey integration · [Chi tiết](docs/coordination/weekly-todos/TIEN.md#tuan-2) |
| Huyền | Research/board, brief/approve, editor/autosave/history/restore/variant và SEO fields | Ngày 7 board; ngày 8 brief; ngày 9 editor; ngày 10 live · [Chi tiết](docs/coordination/weekly-todos/HUYEN.md#tuan-2) |
| Trường | Specs research→editor đủ states, design QA; chuẩn bị publish/analytics W3 | Bàn giao trước từng lô; trước ngày 10 W3 handoff · [Chi tiết](docs/coordination/weekly-todos/TRUONG.md#tuan-2) |
| Thanh | Journey research→draft, score/version/permissions, job failure/quota/restart và AI grounding eval | Test ngày 6–9; ngày 10 regression/gate verdict · [Chi tiết](docs/coordination/weekly-todos/THANH.md#tuan-2) |

### PM/PO: Quang Quang — `docs/coordination/`

- [ ] W2-PM-01 · Xếp đường phụ thuộc M04→M05→M06→M07→M08, theo dõi WIP FE/BE/AI hằng ngày; xử lý blocker bằng lát nhỏ.
- [ ] W2-PM-02 · Ngày 10 tái estimate publish/analytics/M14–M16, giữ thời gian QA/tích hợp; PO chốt mọi điều chỉnh độ sâu hoặc nguồn lực/mốc.

### BA: Dương — `docs/ba/`

- [ ] W2-BA-01 · Chốt AC M04–M08: research source/freshness/failure, score rubric/missing demand, strategy version/approval/tasks, brief facts/CTA/destination và content lifecycle.
- [ ] W2-BA-02 · Viết AC M09–M13, approval transitions, CMS/timezone/UTM/event definitions và community manual handoff; chuẩn bị dữ liệu local page/SEO fixtures.

### UI/UX: Trường — `design/`

- [ ] W2-UX-01 · Handoff research progress/sources, opportunity board/detail/filter, strategy/action review, brief/editor/source panel và history/conflict states.
- [ ] W2-UX-02 · Chuẩn bị SEO audit, review queue/calendar, intent radar, UTM/analytics dashboard cho tuần 3; design QA tuần 2.

### FE: Tiến/Huyền — `apps/web/`, Tiến: `apps/pilot/`

- [ ] W2-FE-01 · [M04–M06] Research run/status/evidence, opportunity board/filter/detail/select, strategy edit/approve/task list; dùng list/detail/form chung.
- [ ] W2-FE-02 · [M07] Brief create/edit/source/facts/CTA/format và duyệt brief trước generation; giữ goal/opportunity IDs.
- [ ] W2-FE-03 · [M08–M09] Editor/autosave/version/restore/regenerate/progress/variant; title/meta/headings, xử lý stale conflict; thay mock bằng API thật.

### BE: Thiệu Quang/Mỹ — `apps/api/`, `apps/worker/`, `database/`

- [ ] W2-BE-01 · [M04–M06] Research jobs/evidence, opportunity score components/filter và strategy version/action/approval APIs liên kết goal.
- [ ] W2-BE-02 · [M07–M08] Brief/source bindings/approval, content/variant/version/generation APIs; optimistic concurrency, restore tạo version mới.
- [ ] W2-BE-03 · Queue AI chung có timeout/retry/quota/progress/cancel theo khả năng đã chốt; idempotent AI run recovery; tiếp tục analytics ingestion nền.

### AI: Quang Quang — `services/ai/`

- [ ] W2-AI-01 · [M04–M05] Một search/API nguồn đã chọn + URLs được phép; dedup/timestamp/evidence/classification và score/rationale theo rubric, không giả search volume.
- [ ] W2-AI-02 · [M06–M07] Strategy 30 ngày theo budget/effort; brief từ approved facts/brand, đủ unique value/CTA/source, thiếu fact gắn cờ.
- [ ] W2-AI-03 · [M08–M09] Article/FAQ/meta/social draft và một variant từ source; rule SEO trước LLM suggestions; eval từng pipeline, cost/timeout checks.

### Tester lane 1: Thanh — `qa/tester-1/`

- [ ] W2-QA1-01 · E2E research→board→strategy approve→brief approve→draft; filters/source display và goal/opportunity lineage.
- [ ] W2-QA1-02 · Editor autosave/history/restore/regenerate, errors/empty/cancel, missing fact UX; hồi quy M01–M03 và evidence tuần 2.

### Tester lane 2: Thanh — `qa/tester-2/`

- [ ] W2-QA2-01 · Schema/score components/recompute, strategy/brief permissions, tenant lineage, concurrent edit/version conflicts; timeout/provider errors/quota/restart.
- [ ] W2-QA2-02 · AI factuality/brand/grounding/invalid JSON, cost caps và job failure states; đối chiếu frozen eval theo từng bước.

### Gate cuối tuần 2

- [ ] W2-GATE-01 · Một opportunity tạo strategy/action và brief được duyệt, sinh draft có nguồn/CTA/version trên staging thật.
- [ ] W2-GATE-02 · Score tính lại đúng rubric; heuristic không gắn nhãn search volume; generation không bịa facts/demand thiếu.
- [ ] W2-GATE-03 · PM hoàn tất capacity review ngày 10; AC/design tuần 3 và kế hoạch dữ liệu cho M14–M16 sẵn sàng.

**Note tuần 2:** title/meta/headings là lát đầu M09; cluster/link/local/refresh tiếp tục tuần 3. Brief/strategy cần duyệt trước áp dụng; không tự thực thi action chưa duyệt. Media chỉ script/prompt, không thêm video/image generation.

## Tuần 3 — Ngày 11–15: M09–M13, đăng CMS và đo lường

**Mục tiêu:** SEO giới hạn → approval → CMS thật → UTM/events → dashboard; Community Radar dùng nhập/nguồn được phép và đăng thủ công có link.

**Nhịp:** ngày 11 SEO/approval; ngày 12 CMS; ngày 13 community/UTM; ngày 14 analytics; ngày 15 regression/demo, freeze chức năng mới M01–M13.

### Ai làm gì tuần 3?

| Người | Phần việc được giao | Mốc bàn giao / chi tiết |
| --- | --- | --- |
| Quang Quang | AI SEO/local/refresh/community; metric input/analyst-learning eval prep, PO approval và freeze | Ngày 12 SEO; ngày 13 community; ngày 15 demo/freeze · [Chi tiết](docs/coordination/weekly-todos/QUANG-QUANG.md#tuan-3) |
| Dương | SEO/approval/CMS/community/UTM/metric rules; AC M14–M16 và UAT toàn bộ | Ngày 12 publish rules; ngày 14 W4 AC; trước ngày 15 UAT · [Chi tiết](docs/coordination/weekly-todos/DUONG.md#tuan-3) |
| Thiệu Quang | Approval/version/hash/audit/execution checks; review migrations/contracts/tenant/public boundaries | Ngày 11 approval; ngày 12 execution checks; ngày 15 regression · [Chi tiết](docs/coordination/weekly-todos/THIEU-QUANG.md#tuan-3) |
| Mỹ | SEO jobs, scheduler/CMS recovery, community/UTM/tracking, GA4/GSC/snapshots và experiment schemas | Ngày 12 publish; ngày 13 community/tracking; ngày 14 metrics · [Chi tiết](docs/coordination/weekly-todos/MY.md#tuan-3) |
| Tiến | Published public pages, traffic/UTM/integrations/analytics UI và widget interface | Ngày 12 public URL; ngày 14 dashboard; ngày 15 widget readiness · [Chi tiết](docs/coordination/weekly-todos/TIEN.md#tuan-3) |
| Huyền | SEO suggestions/local draft, approval/reject/resubmit/calendar, community/manual link UI | Ngày 11 approval/SEO; ngày 12 calendar; ngày 13 community · [Chi tiết](docs/coordination/weekly-todos/HUYEN.md#tuan-3) |
| Trường | Publish/analytics/community specs/design QA, handoff report/experiment/learning | Theo lô ngày 11–14; trước ngày 15 W4 specs · [Chi tiết](docs/coordination/weekly-todos/TRUONG.md#tuan-3) |
| Thanh | Approval→publish E2E/recovery, UTM/real metrics checks, SEO/community và regression | Test ngày 11–14; ngày 15 gate verdict · [Chi tiết](docs/coordination/weekly-todos/THANH.md#tuan-3) |

### PM/PO: Quang Quang — `docs/coordination/`

- [ ] W3-PM-01 · Ưu tiên approval/CMS trên đường găng; tracking phải hoạt động trước bài đăng đầu tiên, kiểm tra quyền/rollback CMS.
- [ ] W3-PM-02 · Ngày 15 freeze chức năng mới M01–M13; review snapshots/experiment widget/assignment readiness; chốt backlog lỗi và tuần 4.

### BA: Dương — `docs/ba/`

- [ ] W3-BA-01 · Chốt SEO rubric/local unique data/refresh rules, approval/version, CMS capability, pilot timezone, community response/handoff, UTM/attribution/metric mapping.
- [ ] W3-BA-02 · AC chi tiết M14–M16: hai kỳ/baseline 0/missing, stable assignment/dedup/thiếu mẫu, learning evidence/approval→strategy; UAT đủ 16 module.

### UI/UX: Trường — `design/`

- [ ] W3-UX-01 · Hoàn thiện SEO audit/suggestions/local draft, review queue/calendar/publish errors, radar/handoff và traffic/analytics sync states.
- [ ] W3-UX-02 · Trước ngày 15 handoff report/action review, experiment form/results và learning insights/evidence/approval; design QA tuần 3.

### FE: Tiến/Huyền — `apps/web/`, Tiến: `apps/pilot/`

- [ ] W3-FE-01 · [M09–M10] SEO suggestions/local draft/version, approve/reject/resubmit, calendar/publish URL/status/retry; edit-after-approval UX.
- [ ] W3-FE-02 · [M11–M12] Radar/conversation/response/approve/manual post link, UTM links và traffic table; label handoff/draft rõ.
- [ ] W3-FE-03 · [M13/M15] Connect/filter/date range/traffic/click/CTR/conversion/sync dashboard; chuẩn bị widget hai biến thể trên trang pilot và measurement wiring.

### BE: Thiệu Quang/Mỹ — `apps/api/`, `apps/worker/`, `database/`

- [ ] W3-BE-01 · [M09] Keyword/cluster/audit/page records, small URL job/internal links/local template/refresh version; giới hạn URL theo scope đã chốt.
- [ ] W3-BE-02 · [M10] Approval/version/hash audit + scheduler/CMS adapter; idempotency/reconciliation/retry/cancel, quyền/source/approval recheck lúc execution.
- [ ] W3-BE-03 · [M11–M12] Community conversation/response/approval/handoff status và link; UTM builder, campaign/content/event mapping/aggregation.
- [ ] W3-BE-04 · [M13–M16] GA4/GSC OAuth/sync/metric API, snapshots có range/property/timezone; chuẩn bị stable assignment/exposure/outcome schemas và strategy update approval.

### AI: Quang Quang — `services/ai/`

- [ ] W3-AI-01 · [M09] Cluster/title/meta/headings/link/refresh suggestions, local draft có unique data; rule audit kiểm tra được, refresh dựa metric/context có nguồn.
- [ ] W3-AI-02 · [M10–M11] Format/channel checks, intent scoring/response có nguồn; người duyệt trước handoff, không autonomous community posting.
- [ ] W3-AI-03 · [M13–M16] Chuẩn hóa metric input; prototype analyst/learning trên snapshot test có nhãn; chuẩn bị eval report/experiment/learning và missing-data cases.

### Tester lane 1: Thanh — `qa/tester-1/`

- [ ] W3-QA1-01 · E2E draft→reject→edit→approve→publish→URL/dashboard; sửa sau duyệt phải duyệt lại, calendar/timezone/cancel/failure recovery.
- [ ] W3-QA1-02 · SEO suggestions/local drafts, radar approve/handoff/link, UTM, dashboard filters/sync/empty/zero/missing; hồi quy M01–M08.

### Tester lane 2: Thanh — `qa/tester-2/`

- [ ] W3-QA2-01 · Reviewer rights/stale approval, CMS duplicate/timeout/unknown outcome/restart/revoked token; kiểm tra audit và secrets logs.
- [ ] W3-QA2-02 · GA4/GSC nguồn thật/range/property/timezone, UTM→click/conversion, zero/missing/delay; SEO/link/refresh rules trên fixtures và source refs.

### Gate cuối tuần 3

- [ ] W3-GATE-01 · Nội dung approved version đăng CMS thật có URL; retry không trùng, edit hủy hiệu lực approval; timestamps UTC + pilot timezone.
- [ ] W3-GATE-02 · UTM/event thử nối được campaign/content; dashboard khớp GA4/GSC source có quyền, hiển thị sync/delay/missing đúng.
- [ ] W3-GATE-03 · Community nhập→response→approve→manual link hoàn tất; SEO/local/refresh đạt AC tối thiểu; snapshots và widget đủ sẵn sàng tuần 4.

**Note tuần 3:** chỉ một CMS là auto publishing; social/community khác là draft/export/handoff có nhãn. Analytics connector nghiệm thu bằng event thật hoặc dữ liệu lịch sử có quyền. Đến ngày 15 chỉ thêm feature M14–M16 và sửa lỗi phần M01–M13.

## Tuần 4 — Ngày 16–20: M14–M16, UAT và release pilot

**Mục tiêu:** report có evidence → approved actions → experiment hai biến thể → learning insight → approve → strategy version mới; regression toàn bộ 16 module.

**Nhịp:** ngày 16 report; ngày 17 experiment; ngày 18 learning/feature freeze; ngày 19 UAT/triage; ngày 20 go/no-go/release/handover.

### Ai làm gì tuần 4?

| Người | Phần việc được giao | Mốc bàn giao / chi tiết |
| --- | --- | --- |
| Quang Quang | Analyst/hypothesis/learning/frozen eval; freeze, UAT triage và PO go/no-go | Ngày 16–18 AI; ngày 19 UAT; ngày 20 release decision · [Chi tiết](docs/coordination/weekly-todos/QUANG-QUANG.md#tuan-4) |
| Dương | Trace/evidence 16 module, điều phối UAT, hướng dẫn/data dictionary/limits/backlog sau pilot | Ngày 19 UAT verdict; ngày 20 bàn giao · [Chi tiết](docs/coordination/weekly-todos/DUONG.md#tuan-4) |
| Thiệu Quang | Approved action→task, approved learning→strategy, tenant/schema/infra/migration/rollback readiness | Ngày 16 action; ngày 18 strategy; ngày 19 restore; ngày 20 deploy readiness · [Chi tiết](docs/coordination/weekly-todos/THIEU-QUANG.md#tuan-4) |
| Mỹ | Reports/snapshots, experiment assignment/events/results, learning records, jobs/runbooks/restore | Ngày 16 report; ngày 17 experiment; ngày 18 learning; ngày 19–20 ops · [Chi tiết](docs/coordination/weekly-todos/MY.md#tuan-4) |
| Tiến | Experiments/admin+pilot widget, action/task/strategy integration, final builds/config/release smoke | Ngày 17 experiment; ngày 18 freeze/build; ngày 19–20 UAT/release · [Chi tiết](docs/coordination/weekly-todos/TIEN.md#tuan-4) |
| Huyền | Report/evidence/action review, learning/approve/version UI; UI regression/fixes/handoff | Ngày 16 report; ngày 18 learning; ngày 19–20 UAT/release · [Chi tiết](docs/coordination/weekly-todos/HUYEN.md#tuan-4) |
| Trường | Design QA W4/core flows, usability fixes và final design handoff | Ngày 16–19 QA; ngày 20 tokens/specs/screens · [Chi tiết](docs/coordination/weekly-todos/TRUONG.md#tuan-4) |
| Thanh | Numeric/assignment/dedup/learning tests, final eval, full UAT/restore/performance và release verdict | Ngày 16–18 critical tests; ngày 19 UAT; ngày 20 release smoke · [Chi tiết](docs/coordination/weekly-todos/THANH.md#tuan-4) |

### PM/PO: Quang Quang — `docs/coordination/`

- [ ] W4-PM-01 · Điều phối M14–M16 ngày 16–18, đóng feature ngày 18; ngày 19 UAT/triage, chỉ nhận sửa lỗi cần cho gate.
- [ ] W4-PM-02 · Ngày 20 PM/PO go/no-go dựa QA evidence/BE readiness; rollout giới hạn, xác định owner vận hành/monitoring/rollback và ký limitations.

### BA: Dương — `docs/ba/`

- [ ] W4-BA-01 · Đối chiếu đủ 16 module với AC/test evidence, UAT goal→learning và metric definitions; xác nhận pilot/manual handoff/thiếu mẫu limitations.
- [ ] W4-BA-02 · Bàn giao hướng dẫn, data dictionary, support matrix và backlog mở rộng riêng; PO nghiệm thu chức năng, không lấy traffic/revenue tăng làm code AC.

### UI/UX: Trường — `design/`

- [ ] W4-UX-01 · Design QA report/actions/experiment/learning và critical flows; sửa usability ưu tiên cao cùng FE.
- [ ] W4-UX-02 · Handoff design system/tokens/specs/screens và hướng dẫn người dùng pilot sau final review.

### FE: Tiến/Huyền — `apps/web/`, Tiến: `apps/pilot/`

- [ ] W4-FE-01 · [M14] Report hai kỳ, metric/evidence/source, thiếu dữ liệu/baseline 0 và action approve→task.
- [ ] W4-FE-02 · [M15] Experiment setup hypothesis/title hoặc CTA hai variants/primary metric/period; tích hợp stable assignment/exposure widget trên một trang pilot và result/insufficient-data UI.
- [ ] W4-FE-03 · [M16] Insight/evidence review→approve→strategy update; fix E2E, production config/build, release smoke và frontend README chạy thật.

### BE: Thiệu Quang/Mỹ — `apps/api/`, `apps/worker/`, `database/`, `infra/`, `docs/runbooks/`

- [ ] W4-BE-01 · [M14] Versioned metric snapshots/report APIs, approved recommendation→task liên kết goal/strategy.
- [ ] W4-BE-02 · [M15] Stable visitor assignment, exposure/conversion dedup, assignment→exposure→outcome trace và result API; một trang/two variants, quyền và tracking theo pilot.
- [ ] W4-BE-03 · [M16] Content/channel/performance/experiment snapshots, learning records/evidence/version, strategy update chỉ sau duyệt.
- [ ] W4-BE-04 · Fix tenant/RBAC/jobs/integrations; thử migration/backup/restore/rollback, monitoring/alerts, deploy/config/support matrix; readiness ngày 20.

### AI: Quang Quang — `services/ai/`

- [ ] W4-AI-01 · [M14] Analyst dùng metric đã tính, số/% đúng snapshots và hai kỳ; evidence/limitations/missing/baseline 0, actions chờ duyệt.
- [ ] W4-AI-02 · [M15–M16] Experiment hypothesis và giải thích thiếu mẫu; learning rules rank topic/format có evidence/version, không khẳng định nhân quả hoặc tự huấn luyện model.
- [ ] W4-AI-03 · Final frozen eval có M15–M16 cases, cost/timeout/numeric/grounding; khóa prompt/schema/model config và bàn giao fallback/limitations.

### Tester lane 1: Thanh — `qa/tester-1/`

- [ ] W4-QA1-01 · E2E/UAT 16 module: goal→report→approved action và insight→approve→strategy update; retest lỗi, regression UI.
- [ ] W4-QA1-02 · Experiment setup/widget/variant results/thiếu mẫu; pilot user guide/usability, release smoke và evidence UAT cuối.

### Tester lane 2: Thanh — `qa/tester-2/`

- [ ] W4-QA2-01 · API/tenant/RBAC/CMS/analytics regression; assignment ổn định, event dedup/trace, AI report numeric và learning approval consistency.
- [ ] W4-QA2-02 · Final eval: 100% critical, ≥90% facts/retrieval chuẩn theo rubric được duyệt; report numbers khớp input, phân biệt synthetic và dữ liệu nguồn thật.
- [ ] W4-QA2-03 · Secrets/retry/restore/migration/rollback và performance theo tải/caps ngày 2; release evidence và known issues.

### Gate cuối tuần 4 — Release pilot

- [ ] W4-GATE-01 · 16 module có chức năng tối thiểu/lưu thật/AC evidence; report số/% đúng, experiment stable/dedup, learning update strategy chỉ sau duyệt.
- [ ] W4-GATE-02 · Full closed-loop E2E/UAT và regression đạt; không còn blocker/critical, các critical tenant/source/approval/publish/event/numeric checks đạt.
- [ ] W4-GATE-03 · Migrations/backup restore/rollback/monitoring có evidence; PM/PO ghi go/no-go, support limitations và owner vận hành.
- [ ] W4-GATE-04 · Bàn giao backlog/AC, design, source/env mẫu, DB/migrations/API/schemas, prompts/evals, test/UAT evidence, support matrix, deploy/restore/rollback runbooks.

**Note tuần 4:** số mẫu ít không cản nghiệm thu chức năng experiment, nhưng không chứng minh winner hoặc hiệu quả growth. Learning chỉ dùng rules/evidence và cần duyệt. Không mở thêm social publishing/OCR/billing/statistical engine trong tuần cuối; backlog mở rộng nằm ở tài liệu riêng, không thuộc TODO bốn tuần này.
