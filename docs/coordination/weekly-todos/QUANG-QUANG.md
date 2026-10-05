# Quang Quang — AI, PM và PO

[Bảng toàn đội](README.md) · [Checklist trạng thái gốc](../../../TODO.md). Ba vai trò do **một người** thực hiện; nhận một pipeline AI chính, điều phối/review theo mốc, không tính ba lane lập trình song song. Source Python tại `services/ai/`; kế hoạch/quyết định tại `docs/coordination/`; task AI tại `services/ai/tasks/`. Thanh kiểm chứng AI, Thiệu Quang/Mỹ review giao tiếp; Dương review nghiệp vụ.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — quang-quang](../execution/W1.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Task gốc:** W1-PM-01/02/03, W1-AI-01/02/03. PM-01/02 và W1-AI-01 bootstrap đã hoàn thành ở mức local_verified; PM-03, W1-AI-02 và W1-AI-03 còn mở. Phụ thuộc: AC M01–M03 của Dương, internal job/source schema của Thiệu Quang/Mỹ, fixtures hai tenant của Thanh.

### Trạng thái bàn giao Ngày 1–2

- [x] Rà lại roster/WIP/blockers và giữ nguyên PM plan; cập nhật blocker public URL, GA4/GSC và app staging trong [W1-PM-03](../../W1-PM-03.md). Không tự đánh dấu các quyền hoặc deployment chưa có.
- [x] Chốt baseline local: Ollama `qwen3:4b-instruct`, embeddings `embeddinggemma:latest`, context 4096, input 2800, output 1024, tối đa 2 provider calls/job, timeout provider 240s, job 600s theo [PILOT_LIMITS](../../PILOT_LIMITS.md). Paid provider/cloud fallback vẫn tắt.
- [x] Bootstrap AI Python/FastAPI tại `services/ai/`: `pyproject.toml`, `requirements.lock`, env validation, fake/live provider, `/healthz`, `/readyz`, `POST /internal/v1/runs` và `GET /internal/v1/runs/{run_id}`.
- [x] Structured output được validate bằng Pydantic trước khi trả cho BE; log có job/tenant/operation/model/prompt version/token/timeout/latency, không ghi payload/prompt/secret. `pytest services/ai/tests -q`: 2 tests passed.
- [ ] Public URL/TLS, GA4/GSC property và app staging thật: vẫn là blocker của PM-03, owner/mốc giữ nguyên trong [RISKS](../../RISKS.md).

**Bằng chứng Ngày 1–2:** [AI bootstrap report](../../../services/ai/evals/reports/W1-AI-01-02-bootstrap.json), [README chạy local](../../../services/ai/README.md). Registry run hiện chỉ ở RAM để kiểm tra contract; queue durable, tenant-scoped retrieval và 30 eval cases thuộc các bước tiếp theo.

1. **Ngày 1–2:** rà owner/WIP và blockers; tiếp tục xử lý public URL, quyền Google và app staging trong PM-03. Không tạo lại roster/plan đã chốt. Chốt model/context/token/timeout theo [limits](../PILOT_LIMITS.md), local Ollama, không tự chuyển sang paid API.
2. Bootstrap Python/FastAPI, manifest/lockfile và cấu hình fake/live provider. Tạo health endpoint, nhận internal job theo schema, kiểm tra structured output; log job/tenant/prompt/model/token/timeout, không log secret.
3. **Ngày 2–4:** extraction text/PDF có text/URL được phép → chunk → embedding 768 theo model đã probe → index/retrieval. Chỉ retrieve nguồn tenant hiện tại đã duyệt; lưu source/version/citation, hỗ trợ revoke/delete để nguồn cũ không còn truy hồi.
4. Tạo business context/Growth Map và gợi ý goal/KPI từ facts có nguồn; thiếu facts trả trạng thái thiếu, gợi ý chưa tự áp dụng. BE giữ quyền approve, auth và tenant boundary.
5. Cùng Thanh chuẩn bị **ít nhất 30 ca** retrieval/facts/content/scoring/report; thêm injected instructions, revoked/deleted source và thiếu facts. Dương/PO chốt rubric, critical cases, dataset version; chốt ngưỡng 100% critical và ≥90% facts/retrieval chuẩn theo rubric được duyệt.
6. **Ngày 5:** chạy tích hợp với BE, để Thanh đối chiếu kết quả độc lập; tổ chức demo theo [agenda](../DEMO-W1.md), ghi kết quả thực tế và mở/đóng blockers. Nếu thiếu staging/Google thì ghi chưa đạt, không dùng mock để đóng gate.

**Bàn giao:** `services/ai/src/` pipeline/context/guardrails, `prompts/`, `evals/datasets/`, `evals/reports/`, README/lệnh run/check; cập nhật W1-PM-03/RISKS/DEMO-W1. **Đạt khi:** service gọi được từ worker, schema đúng, RAG đúng tenant/approved source, nguồn xóa không còn dùng, facts thiếu không bịa; 30 ca có kết quả và QA review. PM-03 chỉ Done khi phần deploy/tracking/demo thực tế đủ evidence.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — quang-quang](../execution/W2.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Task gốc:** W2-PM-01/02, W2-AI-01/02/03. Phụ thuộc: SearXNG adapter/jobs của Mỹ, rubric/AC của Dương, source/goal/strategy/brief/content contracts của Thiệu Quang; dùng frozen fixtures khi live chưa có.

1. **Ngày 6–7:** research từ một provider đã chọn và URL được phép, dedup kết quả, ghi URL/timestamp/evidence. Phân loại insight và tính opportunity score theo rubric; lưu từng thành phần/rationale. Không sinh search volume khi không có nguồn.
2. **Ngày 8:** strategy 30 ngày có goal/KPI, owner, effort, deadline, budget; trả proposal để con người duyệt. Brief từ approved facts/brand/source có CTA, destination/format và giá trị riêng; giữ IDs nối goal → opportunity → strategy → brief.
3. **Ngày 9:** article/FAQ/meta/social draft và một variant. Kiểm JSON/facts/citations/brand trước trả output; thiếu facts gắn cờ. SEO title/meta/headings bắt đầu bằng rule kiểm tra được rồi mới gợi ý LLM. Không thêm tạo ảnh/video.
4. Chạy từng pipeline với queue của Mỹ; kiểm retry không tạo kết quả trùng, timeout/quota không bypass caps. Prompt và schema có version; lưu cost/token/latency. Thanh chạy lại frozen eval.
5. **Ngày 10:** demo opportunity → approved strategy/brief → draft; review capacity tuần 3–4 và dữ liệu cho M14–M16. Nếu chậm, chốt giảm độ sâu/bổ sung năng lực/đổi mốc bằng decision record; giữ QA và integration.

**Bàn giao:** agents/pipelines M04–M09 trong `services/ai/src/agents/`, prompt/eval versions; biên bản demo/capacity trong `docs/coordination/`. **Đạt khi:** output đúng schema, score tính lại được, đủ source/CTA/lineage, facts thiếu báo thiếu, generation chỉ dùng brief đã duyệt và staging chạy trọn một journey. Review: BE interface, Dương rubric, Thanh AI/eval.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — quang-quang](../execution/W3.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Task gốc:** W3-PM-01/02, W3-AI-01/02/03. Phụ thuộc: SEO page/audit của Mỹ, approval của Thiệu Quang, metrics/snapshots có source và BA rules; title/meta đã có từ tuần 2.

1. **Ngày 11–12:** keyword cluster/link/local-page/refresh suggestions trên tập URL giới hạn. Local draft cần dữ liệu riêng được duyệt; chưa có metrics thì refresh ghi thiếu dữ liệu. Output là proposal/version, không tự ghi đè hay publish.
2. Format/channel check dùng cùng quy trình duyệt M10. Community: phân loại intent, chấm ưu tiên và tạo response có nguồn; người duyệt rồi handoff thủ công. Không tự crawl nhóm kín hoặc đăng community tự động.
3. **Ngày 13–14:** nhận metric snapshots chuẩn hóa theo property/range/timezone/unit; thử analyst/learning trên fixture có nhãn synthetic. Chuẩn bị cases baseline 0/missing, thiếu mẫu, evidence mâu thuẫn và learning chưa được duyệt.
4. PM theo dõi approval → CMS thật → tracking trước bài đầu tiên; xác nhận owner/recovery khi publish lỗi. PO duyệt nội dung **bằng thao tác người dùng có identity/audit**, không để pipeline tự approve.
5. **Ngày 15:** demo W3, khóa chức năng mới M01–M13, chốt lỗi và inputs tuần 4; ghi Google/public URL/metric delay còn thiếu với người xử lý.

**Bàn giao:** SEO/community pipeline + eval; schema/fixture analyst/learning trong vùng AI; demo/freeze decision. **Đạt khi:** rule/nguồn truy được, local facts không bịa, response chờ duyệt, metric thiếu không biến thành 0, snapshot có provenance; QA độc lập và live publish/tracking có evidence cho gate. Review: Dương, Mỹ/Thiệu Quang, Thanh.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — quang-quang](../execution/W4.md#quang-quang) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Task gốc:** W4-PM-01/02, W4-AI-01/02/03; điều phối W4-GATE-01/02/03/04. Phụ thuộc: snapshots/report/experiment/learning APIs của Mỹ, approved action/strategy update của Thiệu Quang; Thanh/Dương cung cấp eval/UAT verdict.

1. **Ngày 16:** Growth Brief hai kỳ; dùng số học đã tính xác định trước diễn đạt. Gắn nhận xét/action với source/metric/content; baseline 0 và missing ghi đúng giới hạn, actions vẫn chờ duyệt.
2. **Ngày 17:** đề xuất hypothesis/title hoặc CTA hai variants cho một trang pilot, metric là form lưu thành công; giải thích kết quả theo evidence, thiếu mẫu không kết luận winner.
3. **Ngày 18:** learning rules rank topic/format từ snapshots, insight có evidence/version. Chỉ proposal strategy update; quyền approve/apply thuộc API. Chốt prompt/model/schema và frozen eval cuối, gồm M15–M16; freeze tính năng.
4. **Ngày 19:** hỗ trợ Thanh/Dương UAT, sửa lỗi critical/numeric/grounding/timeout; ghi known issues và limits. Không tự chấm pipeline thay QA.
5. **Ngày 20:** đọc QA evidence, UAT, restore/rollback readiness, blocker list; ghi go/no-go và owner vận hành. No-go nếu critical/điều kiện release chưa đạt, không ký Done vì đã đến ngày 20.

**Bàn giao:** AI reports/eval/fallback/run instructions; PO acceptance/release decision và backlog sau pilot. **Đạt khi:** số report khớp input, learning có human approval, caps được giữ, AI có reviewer độc lập; cả bốn release gates có evidence trước go. Review: Thanh AI, Dương nghiệp vụ/UAT, hai BE interface/vận hành.
