# CR-002 — Contracts sáu role và AI run artifact

Ngày: 14/10/2026. Owner: Quang Quang. **Implementation candidate, chờ Dương/Mỹ/Thiệu Quang review**; không ghi nhận phê duyệt thay reviewer. Phạm vi QQ-01–03.

## Baseline và budget

Giữ roster 7 người theo TEAM, 6 role theo registry, một process AI và concurrency 1. Orchestrator/executor do BE điều phối; AI không tự duyệt nguồn, ghi DB nghiệp vụ hoặc publish/send. Meta Ads read-only. Paid-provider budget mặc định 0 USD; chỉ dùng Ollama/model local đã có, không thêm cloud fallback/download model. Chi phí điện/phần cứng chưa đo, không gọi tổng chi phí bằng 0.

Caps thực thi: 2 LLM calls/job gồm repair/retry, budget persist qua restart; 2 attempts/run; context 4096, Research input ước lượng <=2800, output <=1024; provider timeout 240s, LLM run <=600s, embedding <=300s, embedding batch <=8. Semaphore 1 đã có trong service, không cần thêm sáu process. Research estimate dùng chars/3, chưa phải tokenizer chính xác; không suy ra SLA từ một smoke.

## Contracts và quyền

[Bundle JSON](../schemas/ai-six-role-contracts.json) chứa input/output schema, HTTP envelope, limits và role/tool matrix. Research và HTTP schemas được xuất từ Pydantic thực thi; baseline QQ-01–03 giữ năm role khác ở `design_review_candidate_not_active`. Cập nhật QQ-04: ba Growth Lead planning operations đã có typed schema thực thi theo [CR-003](CR-003-growth-lead-plans.md); learning và bốn role còn lại vẫn bootstrap. Không bật validators thiết kế vào các bootstrap handlers trước khi consumer chuyển đổi.

| Role | Input | Output chính | Tool scope đề xuất |
| --- | --- | --- | --- |
| Research | Profile/goal + approved snapshot + inventory | Brief, source quote/URL/fetched_at, fit/missing facts | Read sources/knowledge/inventory |
| Growth Lead | Objective, snapshot ID, upstream artifact refs | Campaign plan, briefs, task dependencies, learning | Read aggregate, propose campaign/task |
| SEO | Objective, snapshot ID, upstream artifact refs | Blog/title/meta, internal links, checklist/evidence | Read knowledge/inventory, draft |
| Content | Objective, snapshot ID, upstream artifact refs | Parent/version, captions/CTA, image asset refs/evidence | Draft content/assets |
| Community | Objective, snapshot ID, upstream artifact refs | Reply draft, lead proposal, escalation/evidence | Read knowledge/published, propose lead |
| Performance | Objective, snapshot ID, upstream artifact refs | Snapshot refs, proposal, timezone, missing reason | Metrics/Ads read, propose experiments |

Không role nào có publish/send/Ads mutation capability. Đây là declaration để TQ-06 enforce tại gateway; không coi matrix Python là cơ chế cấp quyền backend đã hoàn thành.

## Thay đổi HTTP có thực thi

- `GET /internal/v1/agents`: cùng internal bearer auth như runs; trả role/tools, operation status/prompt/payload schema và caps. Credential vẫn do môi trường server cấp.
- `POST /internal/v1/runs`: giữ envelope `schema_version=1.0.0`. `research.run` chuyển sang payload typed; request generic cũ thiếu profile/snapshot trả `422 INVALID_PAYLOAD`. Mỹ cần chuyển consumer theo request mẫu trước release.
- `GET /internal/v1/runs/{id}`: kết quả thêm optional `artifact`: stable ID, workspace, version=input_version, SHA-256, context_snapshot_id, role, storage=`ai_run_store`. Run cũ không có artifact vẫn đọc được.
- `growth_map.suggest`: thêm optional snapshot. Khi có snapshot, lấy facts verified/chưa hết hạn từ approved source đúng version; không dùng danh sách approved_facts tách rời. Payload không snapshot giữ compatibility.

Artifact được persist cùng AIResult trong SQLite trước status completed. Đây là artifact của AI boundary, chưa phải Content Ledger PostgreSQL. Backend nhận result/artifact refs rồi persist qua TQ-02/MY-01. Hash = SHA-256 JSON canonical `{result,evidence}` với sort_keys=true, ensure_ascii=false, separators=(',', ':'); usage/latency không nằm trong hash.

## Research contract và handoff

Snapshot/source/chunk/profile/goal/inventory phải đúng workspace. Chunk source ID/version phải khớp parent. Chỉ source approved, chưa deleted/revoked, được pin trong approved_source_versions được đưa vào prompt. URL phải HTTP(S), fetched_at có timezone và không nằm trong tương lai. Thiếu metadata thì loại nguồn và ghi missing, không tự đoán ngày.

Nguồn do worker fetch; Research không tự crawl/search rộng. Quote phải là substring nguyên văn của chunk đã cấp vào prompt; ID/quote bịa bị loại. Kiểm topic trùng inventory và unsupported numeric/sensitive claims. Nguồn nhạy cảm không được dùng làm business facts từ text. Fit/rationale là hypothesis, demand_estimate=null; thiếu offer ghi confirmed_offer. Khi không còn excerpt hợp lệ trả insufficient_data, không gọi LLM.

Output gồm brief_id ổn định theo job/input_version, findings/evidence, missing_facts, handoff_role=growth_lead và handoff_operation=opportunity.score. Đây là dữ liệu bàn giao; tạo task thật thuộc workflow runner. Nguồn/profile/goal luôn là untrusted data, không đổi quyền hoặc workflow theo nội dung bên trong.

## Estimate và phụ thuộc để review

| Task | Estimate ban đầu | Bàn giao và việc của consumer |
| --- | --- | --- |
| QQ-01 | M | Decision, schema bundle, role/tool matrix; Dương xác nhận nghiệp vụ, Mỹ/TQ review contract |
| QQ-02 | M | Snapshot scope, artifact, request builder và live HTTP/persistence smoke; MY-01/TQ-02 nối worker/business DB |
| QQ-03 | M | Handler/schema/prompt/guards, tests và brief live; Dương/Thiệu review chất lượng và rubric |

M là effort tương đối, không phải thời gian đo; giữ một task chính + lane sửa lỗi/người. Không đổi trạng thái DU-01/02, TQ-01/02 hoặc MY-01 thay owner. Lịch D2/D4/D5 theo sprint hiện hành; checkbox QQ-01–03 để người dùng tích sau review.

## Kiểm tra

104 AI tests đạt ở vòng triển khai. Live smoke có 4 operation completed, Research 1 LLM call, idempotent retry và artifact qua restart đạt. [Handoff/evidence](../../docs/coordination/sprint-3-weeks/bao-cao/2026-10-14-QQ01-03-HANDOFF.md).

Smoke dùng process/token/SQLite riêng, nguồn công khai và profile/approval TEST. Không coi đây là nguồn production được duyệt, integrated business DB hoặc actual demo dashboard. Backend cần review version bump cho typed Research input trước release; OpenAPI public không tự được coi là đã cập nhật.
