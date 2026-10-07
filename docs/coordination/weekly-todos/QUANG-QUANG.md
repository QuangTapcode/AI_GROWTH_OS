# Quang Quang — AI, PM và PO

## Quy tắc chốt task của QQ

- `Code xong`, `local_verified`, fake/live eval hoặc demo nội bộ chỉ là đầu ra phía QQ, chưa phải `Done`.
- Các task `W1-QQ-01..08`, `W2-QQ-01..05`, `W3-QQ-01..05` và `W4-QQ-01..05` chỉ được tick `Done` khi Tester Thiệu ghi verdict `pass` trên đúng commit/build, kèm test ID, môi trường, actual result và evidence. `blocked`, `failed` hoặc `not_tested` giữ `[ ]`.
- `W1-QQ-09` còn cần PO/pháp lý/đối tác duyệt; Tester chỉ xác nhận provenance/evidence, không thay thế approval đó. Dương, BE và PO vẫn giữ các gate độc lập của mình.

[Bảng toàn đội](README.md) · [Checklist trạng thái gốc](../../../TODO.md). Ba vai trò do **một người** thực hiện; nhận một pipeline AI chính, điều phối/review theo mốc, không tính ba lane lập trình song song. Source Python tại `services/ai/`; kế hoạch/quyết định tại `docs/coordination/`; task AI tại `services/ai/tasks/`. Thiệu kiểm chứng AI, Thiệu Quang/Mỹ review giao tiếp; Dương review nghiệp vụ.

**Cập nhật: 06/10/2026.** Đã hoàn thành thiết lập public URL, tài khoản đo lường GA4/GSC và bootstrap staging local tối giản. Các mốc Ngày 1–20 bên dưới là ngày trong kế hoạch, không phải ngày lịch.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — quang-quang](../execution/W1.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Task gốc:** W1-PM-01/02/03, W1-AI-01/02/03. PM-01/02 và W1-AI-01 bootstrap đã hoàn thành ở mức local_verified. PM-03 đã có URL/TLS, GA4/GSC và app bootstrap local; vẫn còn mở cho triển khai ứng dụng công khai, tích hợp nghiệp vụ và demo có QA review. W1-AI-02 và W1-AI-03 còn mở. Phụ thuộc: AC M01–M03 của Dương, internal job/source schema của Thiệu Quang/Mỹ, fixtures hai tenant của Thiệu.

### Trạng thái bàn giao Ngày 1–2

- [x] Rà lại roster/WIP/blockers và giữ nguyên PM plan; ghi nhận blocker ban đầu trong [W1-PM-03](../W1-PM-03.md). Trạng thái bổ sung ngày 06/10/2026 được ghi tại mục bàn giao bên dưới.
- [x] Chốt baseline local: Ollama `qwen3:4b-instruct`, embeddings `embeddinggemma:latest`, context 4096, input 2800, output 1024, tối đa 2 provider calls/job, timeout provider 240s, job 600s theo [PILOT_LIMITS](../PILOT_LIMITS.md). Paid provider/cloud fallback vẫn tắt.
- [x] Bootstrap AI Python/FastAPI tại `services/ai/`: `pyproject.toml`, `requirements.lock`, env validation, fake/live provider, `/healthz`, `/readyz`, `POST /internal/v1/runs` và `GET /internal/v1/runs/{run_id}`.
- [x] Structured output được validate bằng Pydantic trước khi trả cho BE; log có job/tenant/operation/model/prompt version/token/timeout/latency, không ghi payload/prompt/secret. `pytest services/ai/tests -q`: 2 tests passed.
- [x] Public URL/TLS: Cloudflare Pages tại `https://aigrowthos-staging.pages.dev/`, HTTPS trả 200; hiện phục vụ trang thông báo staging.
- [x] Thiết lập GA4/GSC: GA4 nhận dữ liệu Realtime; GSC đã xác minh quyền sở hữu qua Google Analytics theo ảnh người dùng cung cấp.
- [x] Bootstrap staging local: `apps/pilot`, `apps/web`, `apps/api` chạy tại các port `3001`, `3000`, `4000`; hai frontend kết nối API qua HTTP.
- [ ] Triển khai ứng dụng nghiệp vụ trên URL công khai, hoàn thành luồng Website/CMS/API và quyền/tích hợp API Google khi cần đọc metrics từ backend.
- [ ] Demo journey thực tế với BE và QA review độc lập trước khi đóng PM-03; giữ owner/mốc theo [RISKS](../RISKS.md).

**Bằng chứng Ngày 1–2:** [AI bootstrap report](../../../services/ai/evals/reports/W1-AI-01-02-bootstrap.json), [README chạy local](../../../services/ai/README.md). Registry run hiện chỉ ở RAM để kiểm tra contract; queue durable, tenant-scoped retrieval và 30 eval cases thuộc các bước tiếp theo.

**Cập nhật AI 06/10 (W1-QQ-01…05):** thay registry RAM bằng run store bền vững (khóa `job_id + operation + input_version`, restart → `RUN_INTERRUPTED` retryable, tối đa 2 LLM calls/job), lỗi có mã thống nhất; thêm `knowledge.ingest` (text/PDF/URL allowlist, locator page/paragraph/url, embeddinggemma 768), `knowledge.answer` (snapshot đúng tenant/approved, evidence, thiếu giá/địa chỉ/availability báo thiếu) và `growth_map.suggest` (đề xuất chờ duyệt). Bộ 30 eval cases draft `w1-ai-eval-0.1.0` có report fake/live. Trạng thái từng task con và phần chờ Mỹ/Thiệu/Dương: [W1](../execution/W1.md#quang-quang), [CR-001](../../../contracts/changes/CR-001-ai-internal-runs.md).

### Bàn giao URL, đo lường và staging — 06/10/2026

| Hạng mục | Cấu hình và bằng chứng | Trạng thái |
| --- | --- | --- |
| Public URL | [aigrowthos-staging.pages.dev](https://aigrowthos-staging.pages.dev/); HTTPS 200, đã gắn Google tag | Hoàn thành thiết lập URL; trang thông báo riêng, chưa phục vụ app/API local |
| Tài khoản Google | `quang10a1dt@gmail.com` | Người dùng quản lý và tự xác minh quyền sở hữu |
| GA4 | Property `AI Growth OS - Staging` (`557397610`), stream `AI Growth OS Staging Web` (`16047521297`), Measurement ID `G-8LQN27Y8QQ` | Ảnh Realtime ghi nhận 10 người dùng hoạt động và 12 lượt xem tại `/` trong 30 phút; xác nhận thu thập dữ liệu |
| GSC | URL-prefix `https://aigrowthos-staging.pages.dev/`; phương thức Google Analytics | Ảnh xác nhận “Bạn là chủ sở hữu được xác minh” |
| Pilot | `apps/pilot` — `http://localhost:3001`, `/health` | Giao diện ban đầu và kiểm tra kết nối API |
| Web quản trị | `apps/web` — `http://localhost:3000`, `/health` | Giao diện ban đầu và kiểm tra kết nối API |
| API | `apps/api` — `http://localhost:4000`, `/health`, `/v1/health` | Health trả `scope: process_only`; chỉ xác nhận tiến trình đang chạy |

**Kiểm chứng bootstrap:** lint, typecheck và production build của cả ba app đã pass; 5 HTTP tests và 2 Playwright tests đã pass. Browser tests kiểm tra kết nối API, báo mất kết nối và phục hồi khi thử lại, layout mobile và lỗi JavaScript. Launcher đã kiểm tra từ chối port bị chiếm, dừng và khởi động lại.

**Chạy lại trên Windows:** từ repository root, dùng `.\infra\staging\start.ps1`; dừng bằng `.\infra\staging\stop.ps1`. Sau khi reboot cần chạy start lại. Xem [hướng dẫn staging](../../../infra/staging/README.md), [Pilot README](../../../apps/pilot/README.md), [Web README](../../../apps/web/README.md) và [API README](../../../apps/api/README.md).

**Phần còn lại:** authentication/roles, CMS/nội dung/form, database persistence, queue/worker và journey nghiệp vụ chưa hoàn thành trong bootstrap này. GA4/GSC đã xong phần thiết lập và xác minh; backend connector đọc Google API chưa triển khai. Public Pages đang `noindex, nofollow`; số Realtime dùng để chứng minh tracking hoạt động, chưa là evidence tăng trưởng hay kết quả SEO. Các ghi nhận blocker cũ trong W1-PM-03/RISKS cần đối chiếu với bản bàn giao này trước lần review tiếp theo; PM-03 và release gates vẫn mở.

1. **Ngày 1–2:** rà owner/WIP và blockers; đối chiếu evidence URL, GA4/GSC và bootstrap local đã hoàn thành, tiếp tục phần deploy app và tích hợp nghiệp vụ trong PM-03. Không tạo lại roster/plan đã chốt. Giữ model/context/token/timeout theo [limits](../PILOT_LIMITS.md), local Ollama, không tự chuyển sang paid API.
2. Bootstrap Python/FastAPI, manifest/lockfile và cấu hình fake/live provider. Tạo health endpoint, nhận internal job theo schema, kiểm tra structured output; log job/tenant/prompt/model/token/timeout, không log secret.
3. **Ngày 2–4:** extraction text/PDF có text/URL được phép → chunk → embedding 768 theo model đã probe → index/retrieval. Chỉ retrieve nguồn tenant hiện tại đã duyệt; lưu source/version/citation, hỗ trợ revoke/delete để nguồn cũ không còn truy hồi.
4. Tạo business context/Growth Map và gợi ý goal/KPI từ facts có nguồn; thiếu facts trả trạng thái thiếu, gợi ý chưa tự áp dụng. BE giữ quyền approve, auth và tenant boundary.
5. Cùng Thiệu chuẩn bị **ít nhất 30 ca** retrieval/facts/content/scoring/report; thêm injected instructions, revoked/deleted source và thiếu facts. Dương/PO chốt rubric, critical cases, dataset version; chốt ngưỡng 100% critical và ≥90% facts/retrieval chuẩn theo rubric được duyệt.
6. **Ngày 5:** chạy tích hợp với BE, để Thiệu đối chiếu kết quả độc lập; tổ chức demo theo [agenda](../DEMO-W1.md), ghi kết quả thực tế và mở/đóng blockers. Kiểm tra journey nghiệp vụ trên staging công khai và tracking tương ứng; nếu thiếu deployment/tích hợp thì ghi chưa đạt, không dùng trang thông báo hoặc mock để đóng gate.

**Bàn giao:** `services/ai/src/` pipeline/context/guardrails, `prompts/`, `evals/datasets/`, `evals/reports/`, README/lệnh run/check; cập nhật W1-PM-03/RISKS/DEMO-W1. **Đạt khi:** service gọi được từ worker, schema đúng, RAG đúng tenant/approved source, nguồn xóa không còn dùng, facts thiếu không bịa; 30 ca có kết quả và QA review. PM-03 chỉ Done khi phần deploy/tracking/demo thực tế đủ evidence.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — quang-quang](../execution/W2.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Task gốc:** W2-PM-01/02, W2-AI-01/02/03. Phụ thuộc: SearXNG adapter/jobs của Mỹ, rubric/AC của Dương, source/goal/strategy/brief/content contracts của Thiệu Quang; dùng frozen fixtures khi live chưa có.

**Điều kiện trước khi vào W2:** W1 run/RAG contract và 30-case dataset/rubric phải có version; Mỹ có research/queue contract với URL safety và failure states; Dương chốt M04–M09 AC/rubric; Thiệu Quang freeze opportunity/strategy/brief/content schemas. Thiếu live dependency chỉ được bắt đầu bằng fixture có nhãn, chưa được đóng gate.

1. **Ngày 6–7:** research từ một provider đã chọn và URL được phép, dedup kết quả, ghi URL/timestamp/evidence. Phân loại insight và tính opportunity score theo rubric; lưu từng thành phần/rationale. Không sinh search volume khi không có nguồn.
2. **Ngày 8:** strategy 30 ngày có goal/KPI, owner, effort, deadline, budget; trả proposal để con người duyệt. Brief từ approved facts/brand/source có CTA, destination/format và giá trị riêng; giữ IDs nối goal → opportunity → strategy → brief.
3. **Ngày 9:** article/FAQ/meta/social draft và một variant. Kiểm JSON/facts/citations/brand trước trả output; thiếu facts gắn cờ. SEO title/meta/headings bắt đầu bằng rule kiểm tra được rồi mới gợi ý LLM. Không thêm tạo ảnh/video.
4. Chạy từng pipeline với queue của Mỹ; kiểm retry không tạo kết quả trùng, timeout/quota không bypass caps. Prompt và schema có version; lưu cost/token/latency. Thiệu chạy lại frozen eval.
5. **Ngày 10:** demo opportunity → approved strategy/brief → draft; review capacity tuần 3–4 và dữ liệu cho M14–M16. Nếu chậm, chốt giảm độ sâu/bổ sung năng lực/đổi mốc bằng decision record; giữ QA và integration.

**Bàn giao:** agents/pipelines M04–M09 trong `services/ai/src/agents/`, prompt/eval versions; biên bản demo/capacity trong `docs/coordination/`. **Đạt khi:** output đúng schema, score tính lại được, đủ source/CTA/lineage, facts thiếu báo thiếu, generation chỉ dùng brief đã duyệt và staging chạy trọn một journey. Review: BE interface, Dương rubric, Thiệu AI/eval.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — quang-quang](../execution/W3.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Task gốc:** W3-PM-01/02, W3-AI-01/02/03. Phụ thuộc: SEO page/audit của Mỹ, approval của Thiệu Quang, metrics/snapshots có source và BA rules; title/meta đã có từ tuần 2.

**Điều kiện trước khi vào W3:** W2 journey và QA verdict đã pass; M01–M09 contracts/versions đã freeze; Mỹ có public/CMS, tracking và metric snapshot interfaces; Thiệu Quang có approval/publish/audit boundary; Dương chốt SEO, local facts, UTM/GA4/GSC rules. Public URL hoặc Google chưa có thì giữ blocker và owner, không dùng mock để pass live gate.

1. **Ngày 11–12:** keyword cluster/link/local-page/refresh suggestions trên tập URL giới hạn. Local draft cần dữ liệu riêng được duyệt; chưa có metrics thì refresh ghi thiếu dữ liệu. Output là proposal/version, không tự ghi đè hay publish.
2. Format/channel check dùng cùng quy trình duyệt M10. Community: phân loại intent, chấm ưu tiên và tạo response có nguồn; người duyệt rồi handoff thủ công. Không tự crawl nhóm kín hoặc đăng community tự động.
3. **Ngày 13–14:** nhận metric snapshots chuẩn hóa theo property/range/timezone/unit; thử analyst/learning trên fixture có nhãn synthetic. Chuẩn bị cases baseline 0/missing, thiếu mẫu, evidence mâu thuẫn và learning chưa được duyệt.
4. PM theo dõi approval → CMS thật → tracking trước bài đầu tiên; xác nhận owner/recovery khi publish lỗi. PO duyệt nội dung **bằng thao tác người dùng có identity/audit**, không để pipeline tự approve.
5. **Ngày 15:** demo W3, khóa chức năng mới M01–M13, chốt lỗi và inputs tuần 4; ghi Google/public URL/metric delay còn thiếu với người xử lý.

**Bàn giao:** SEO/community pipeline + eval; schema/fixture analyst/learning trong vùng AI; demo/freeze decision. **Đạt khi:** rule/nguồn truy được, local facts không bịa, response chờ duyệt, metric thiếu không biến thành 0, snapshot có provenance; QA độc lập và live publish/tracking có evidence cho gate. Review: Dương, Mỹ/Thiệu Quang, Thiệu.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — quang-quang](../execution/W4.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Task gốc:** W4-PM-01/02, W4-AI-01/02/03; điều phối W4-GATE-01/02/03/04. Phụ thuộc: snapshots/report/experiment/learning APIs của Mỹ, approved action/strategy update của Thiệu Quang; Thiệu/Dương cung cấp eval/UAT verdict.

**Điều kiện trước khi vào W4:** W3 M01–M13 đã freeze và có publish/tracking/metric evidence hoặc blocker chính thức; Mỹ cung cấp immutable report/experiment/learning inputs; Thiệu Quang freeze approve→task/strategy transactions; Dương chốt formulas/UAT; Thiệu có frozen M15–M16 eval, critical fixtures, restore/rollback và release smoke checklist.

1. **Ngày 16:** Growth Brief hai kỳ; dùng số học đã tính xác định trước diễn đạt. Gắn nhận xét/action với source/metric/content; baseline 0 và missing ghi đúng giới hạn, actions vẫn chờ duyệt.
2. **Ngày 17:** đề xuất hypothesis/title hoặc CTA hai variants cho một trang pilot, metric là form lưu thành công; giải thích kết quả theo evidence, thiếu mẫu không kết luận winner.
3. **Ngày 18:** learning rules rank topic/format từ snapshots, insight có evidence/version. Chỉ proposal strategy update; quyền approve/apply thuộc API. Chốt prompt/model/schema và frozen eval cuối, gồm M15–M16; freeze tính năng.
4. **Ngày 19:** hỗ trợ Thiệu/Dương UAT, sửa lỗi critical/numeric/grounding/timeout; ghi known issues và limits. Không tự chấm pipeline thay QA.
5. **Ngày 20:** đọc QA evidence, UAT, restore/rollback readiness, blocker list; ghi go/no-go và owner vận hành. No-go nếu critical/điều kiện release chưa đạt, không ký Done vì đã đến ngày 20.

**Bàn giao:** AI reports/eval/fallback/run instructions; PO acceptance/release decision và backlog sau pilot. **Đạt khi:** số report khớp input, learning có human approval, caps được giữ, AI có reviewer độc lập; cả bốn release gates có evidence trước go. Review: Thiệu AI, Dương nghiệp vụ/UAT, hai BE interface/vận hành.
