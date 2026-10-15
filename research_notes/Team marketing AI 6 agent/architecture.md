# Kiến trúc chuyển AI Growth OS thành team marketing 6 agent

## 1. Hiện có gì, thiếu gì và tái sử dụng phần nào?

### Takeaway
Không cần viết lại toàn bộ dự án. Giữ Next.js/TypeScript, API, worker, PostgreSQL/pgvector và AI Python/FastAPI; đổi mô hình sản phẩm từ 16 màn hình/module sang 6 nhân sự AI dùng chung chiến dịch, kho nội dung và dashboard. Đây là đề xuất kiến trúc, chưa phải tính năng đã triển khai.

### Cited Findings
- Audit 09/10 ghi W1 có 3/26 task cha Done, 0/3 gate; AI pytest 85/85, worker 29/29, business units 33/33 và PostgreSQL integration 34/34. Các kết quả là audit lưu trong repo, nghiên cứu này không chạy lại test. — [Audit](../../docs/coordination/AUDIT-2026-10-09.md)
- Web/pilot mới là shell; auth/session, profile/goals, form lưu DB, live connector và tích hợp AI còn thiếu. API lint/typecheck/build chưa đạt tại lần audit. — [Audit](../../docs/coordination/AUDIT-2026-10-09.md)
- Worker có lease/heartbeat, retry/recovery, File/Memory store và queue adapter pg-boss; adapter AI hiện là fake, CMS/GA4/GSC placeholder. — [Worker README](../../apps/worker/README.md), [AI adapter](../../apps/worker/src/adapters/AiAdapter.ts)
- Tất cả worker operations hiện đi chung generic handler gọi AI fake, kể cả publish, metrics, lead và integrations. Vì vậy registry tồn tại không chứng minh publisher/analytics thật tồn tại. — [Worker operations](../../apps/worker/src/jobs/operations.ts)
- AI chỉ có pipeline dedicated knowledge.ingest, knowledge.answer và growth_map.suggest; research.run/content.generate/community.response/analytics.report và nhiều operation khác vẫn bootstrap generic. — [AI operation registry](../../services/ai/src/app/operations.py)
- AI có run registry SQLite bền vững với khóa `(job_id, operation, input_version)`, lưu kết quả và giới hạn provider calls qua restart. — [AI run store](../../services/ai/src/app/run_store.py)
- Migration đã có contents, content_variants, content_assets, publishing_jobs, campaigns, agent_runs/agent_tasks, source_chunks và audit_events. `contents` chỉ có approved_by, body/status; chưa có bảng content_versions hoặc liên kết đầy đủ artifact/run/version/approval. Bảng agent chưa chứng minh một hệ multi-agent đã hoạt động. — [Migration](../../database/migrations/001_initial_core_schema.sql)
- Baseline local Ollama concurrency 1, embedding/generation tuần tự; hạn mức context/calls/timeout được mô tả là giới hạn thiết kế, chưa phải benchmark toàn hệ thống. — [Pilot limits](../../docs/coordination/PILOT_LIMITS.md), [Worker limits](../../apps/worker/src/jobs/JobState.ts)
- Baseline cũ giới hạn một website, social draft/export, cộng đồng manual và loại hệ multi-agent độc lập. Yêu cầu mới thay đổi phạm vi cũ, cần rebaseline. — [Scope](../../docs/ba/SCOPE.md)

### Inferences
**Tái sử dụng:** app web làm dashboard; pilot làm website doanh nghiệp; API/DB làm dữ liệu nghiệp vụ; worker làm scheduler/executor; AI service làm 6 role-specific pipelines; RAG làm nguồn doanh nghiệp có duyệt; regression suite làm hàng rào nền tảng.

**Không coi đã xong:** có bảng campaign/agent/content không tương đương campaign manager hay team marketing đã chạy; 85 test không chứng minh 6 agent có năng lực; giữ task old Done đúng phạm vi bootstrap, thêm task mới thay vì gán Done cho cả vai trò.

**Đổi tổ chức 16 module thành capability bên trong:**

| Module cũ | Vị trí mới |
| --- | --- |
| M01 Workspace | Nền tảng doanh nghiệp, auth/tenant/brand/audience dùng chung |
| M02 Knowledge | Kho tri thức chung, nguồn/facts/approved retrieval |
| M03 Goals | Mục tiêu chiến dịch; Growth Lead chịu trách nhiệm |
| M04 Market Intelligence | Research & Trend Agent |
| M05 Opportunity | Research tạo tín hiệu; Growth Lead ưu tiên và giao task |
| M06 Strategy | Growth Lead lập kế hoạch/chiến dịch |
| M07 Brief | Brief theo kênh do SEO/Content nhận và sửa |
| M08 Content Factory | SEO tạo blog; Content Marketing tạo social/creative; dùng chung version store |
| M09 SEO | SEO Agent |
| M10 Distribution | Content Marketing dùng capability publish/schedule chung; SEO publish website qua cùng executor |
| M11 Community | Community Agent |
| M12 Traffic | Tracking/UTM/conversion là hạ tầng dữ liệu chung |
| M13 Analytics | Metrics ingestion chung và dashboard; Performance/Growth Lead tiêu thụ |
| M14 Analyst | Growth Lead; Performance phân tích paid riêng |
| M15 Experiment | Performance/Growth Lead đề xuất, executor đo thử nghiệm |
| M16 Learning | Growth Lead lưu learning có bằng chứng và cập nhật kế hoạch có duyệt |

Performance Ads, MCP tool gateway, paid budget controls và social publishing thật là capability mới. Không tạo thêm một persona điều phối thứ 7: Growth Lead là agent số 6, workflow executor là code hạ tầng.

### Gaps
- Audit có evidence local nhưng chưa chứng minh staging/deployment current; không xác nhận số test như kết quả vừa chạy.
- Chưa có campaign/social/ads thật, account permissions, người duyệt hoặc ngân sách pilot mới. Người dùng đã chọn Website + Facebook/Instagram và Meta Ads; đây là phạm vi ưu tiên, không chứng minh đã kết nối account.
- Chưa đánh giá chất lượng model local đối với 6 role mới; eval 30 ca W1 không thay eval SEO/social/paid/community.

## 2. Sáu agent, shared memory và dashboard cần hoạt động như thế nào?

### Takeaway
Mỗi agent có nhiệm vụ, tools, input/output và quyền riêng; mọi output lưu vào một sổ nội dung/chiến dịch trước khi agent khác sử dụng. LLM đề xuất và tạo nội dung, code quản lý trạng thái/thực thi; dashboard đọc DB đã lưu thay vì hỏi model để tổng hợp tiến độ.

### Cited Findings
- API/worker dùng TypeScript/SQL, AI dùng Python và HTTP/JSON/OpenAPI có version; LangGraph chỉ thêm khi pipeline cần. — [Team và interfaces](../../docs/coordination/TEAM.md)
- JobRequest đã có workspace_id/job_id/input_version/context_snapshot_id/approved_source_versions/trace_id/prompt/model pins, thuận lợi làm agent input snapshot. — [AI schemas](../../services/ai/src/app/schemas.py)
- Worker key fake dùng `${job.id}:${job.attempt}` trong khi AI durable identity là job/operation/input_version. Cần mapping typed HTTP thật, không đổi idempotency theo attempt khi retry cùng hành động. — [Worker operations](../../apps/worker/src/jobs/operations.ts), [AI run store](../../services/ai/src/app/run_store.py)
- Worker README đã yêu cầu recheck permission/source/approved version trước publish và reconciliation trước retry khi CMS timeout chưa rõ kết quả. — [Worker execution rules](../../apps/worker/README.md)
- Baseline metrics phân biệt missing/zero và số liệu report phải khớp snapshot; source revoke/delete không được lọt RAG; edit-after-approval cần duyệt lại. — [Scope AC](../../docs/ba/SCOPE.md)

### Inferences
#### Sáu vai trò đề xuất

| Agent | Đầu vào/công việc | Output lưu chung | Quyền/action |
| --- | --- | --- | --- |
| Research & Trend | Brand/products/audience + nguồn web; đọc/tóm tắt tín hiệu, nhu cầu và đối thủ, kiểm tra phù hợp doanh nghiệp | Trend brief, nguồn URL/thời gian, ý tưởng, lý do phù hợp, missing evidence | Đọc nguồn/search; không tự xuất bản |
| SEO | Brief tìm kiếm + inventory nội dung + knowledge; keyword/intent, outline, blog/FAQ, internal links, refresh | Blog version, citations, title/meta, FAQ, canonical/link suggestions, SEO check | Tạo/sửa draft; publish website sau approval |
| Content Marketing | Mục tiêu sản phẩm + brief + brand assets; viết social copy, hook, CTA, concept ảnh/video, repurpose và lịch đăng | Creative variants, caption/script/assets, destination, calendar, publication refs | Publisher sau duyệt; quyền theo từng platform |
| Performance Marketing | Ad account stats + creative/content inventory + goal/budget; chọn bài để test, format/time hypotheses, đề xuất audience/budget và tối ưu | Campaign proposal, experiment plan, planned spend, measured CPA/ROAS khi có dữ liệu, confidence | Read/propose trước; create/update/launch theo quyền và approval/version/budget cap |
| Community | Câu hỏi/thread/comment hợp lệ + knowledge + published content | Reply draft/citations, intent, escalation, posted reply ref | Đọc/draft; reply qua API có quyền sau duyệt; trường hợp chưa hỗ trợ thì handoff manual có nhãn |
| Growth Lead & Analyst | Goal, research, lịch/cost/metrics + output 5 agents | Weekly plan, task assignments, growth report, action đề xuất, learning | Phân việc và đề xuất chiến lược; không tự duyệt ngân sách hoặc nội dung của chính mình |

SEO “thân thiện với AI”: cấu trúc dễ đọc/crawl, câu trả lời rõ, facts có nguồn, entity/FAQ/structured data hợp lệ và nội dung hữu ích. Không coi số bài/schema là đảm bảo được AI search trích dẫn. Content Marketing tách SEO theo channel/objective/format, có thể tái sử dụng blog bằng lineage thay vì copy tách rời.

Không có số liệu lịch sử thì Performance trả `insufficient_data` và lịch/format/budget thử nghiệm có giới hạn; không bịa “giờ tối ưu”, giá CPC/CPA hoặc khẳng định ảnh/video thắng. Budget tiền thật khác cost model; tách ledger theo currency, timezone và platform.

#### Luồng một chiến dịch

Business context + goal → Research signals → Growth Lead campaign/task plan → SEO và Content Marketing nhận nhánh có brief → shared draft versions → kiểm facts/brand/SEO/dedup → human approval → publisher executor → website/social → metrics sync → Performance/Growth Lead phân tích → learning → brief/task vòng tiếp theo. Community dùng nguồn và published inventory đồng thời.

Research/SEO/Content có thể là các task độc lập trong DAG; không đưa toàn bộ lịch sử vào mỗi prompt và không tạo trò chuyện agent vô hạn. Agent chỉ đọc snapshot nghiệp vụ liên quan. LLM local vẫn 1 job đang chạy toàn hệ; fetch/sync/read tasks có thể song song theo provider limits. Sáu role logic không đòi hỏi sáu model hay sáu GPU process.

#### Shared content memory phải có hai lớp

1. **Nguồn sự thật có cấu trúc (PostgreSQL):** content_id, immutable content_version_id, workspace_id, campaign_id, owner_agent/run_id, parent_content_id và variant_of, topic/intent/audience/product, format/channel, nguồn/fact versions, status/approval version/hash, published URL/platform_post_id, schedule UTC/timezone, performance snapshot refs.
2. **Truy xuất ngữ nghĩa (pgvector):** index title/summary/body của approved/published versions để tìm gần giống, topic coverage, candidate internal links và refresh. Luôn filter tenant/status/current source validity; vector similarity chỉ cảnh báo near-duplicate, quyết định dựa trên registry/intent. Vector không thay state/metric DB.

Trước generation, SEO/Content query inventory để biết bài/creative nào đã tồn tại, trạng thái/URL/intent và owner. Task reserve topic/brief hoặc unique key trong DB để tránh hai worker đồng thời tạo cùng nội dung; mapping lineage cho repurpose là reuse có chủ đích. Sau generation mới persist version, phát event, cập nhật projection dashboard và index.

#### Typed orchestration đề xuất

- TypeScript API/worker giữ authority cho RBAC, tenancy, budget, schedules, publisher/sync; Python agent pipeline trả schema xác định (`ResearchResult`, `SeoDraftResult`, `CreativeResult`, `AdProposalResult`, `CommunityReplyResult`, `GrowthPlanResult`).
- Workflow/version/state lưu PostgreSQL: `workflow_runs`, `workflow_steps`, dependency refs, input snapshot/version, attempt, lease, deadline, result_ref, parent trace. Dùng queue pg-boss hiện có; transactional outbox kết hợp commit artifact và enqueue để tránh mất/đúp step.
- Chia operation handler: deterministic ingestion persistence/metrics sync/publish/form không gọi LLM generic; AI jobs gọi HTTP adapter ánh xạ operation versioned.
- Progress job `queued/running/completed/failed` tách business status `draft/in_review/approved/scheduled/published/blocked`; job completed nghĩa là kết quả đã lưu, không nghĩa là nội dung đã đăng.
- Stable idempotency `(workspace, action, entity_version)`; provider timeout ambiguous phải lookup/reconcile external ID trước retry. Approval vô hiệu khi content/campaign version/hash đổi; recheck account permission/source/budget lúc execution.
- Agent tools qua server-side MCP gateway allowlist, workspace/account-scoped credentials, typed input/output và audit; read/write tool phân tách. MCP là interface tool, không thay queue/state/database. Connector chưa có MCP thì adapter official API trong code; không gắn nhãn “MCP đã hoạt động” khi chỉ có spec.
- Không thêm framework agent/workflow lớn chỉ để có nhãn multi-agent. Có thể bổ sung LangGraph bên Python cho reasoning nhiều bước khi thật sự cần; worker vẫn sở hữu retries/lịch/human waits và không tạo hai orchestrator tranh quyền.

#### Dashboard duy nhất

- Tổng quan theo chiến dịch/kỳ: goal, organic/paid/community, traffic/leads, planned vs actual spend và CPA/ROAS chỉ khi nguồn đầy đủ.
- Sáu thẻ agent: đang làm gì, task queued/running/blocked, output mới nhất, thời gian/calls, lỗi và next action.
- Content inventory: nội dung đã tạo, brief/parent/variants, agent owner, version, nguồn, status, URL/platform, metrics. Bộ lọc agent/channel/campaign/format.
- Approval inbox: xem output cụ thể, nguồn, phiên bản, schedule/budget/actions để duyệt hoặc yêu cầu sửa.
- Calendar: website/social/ads theo timezone, trạng thái scheduled/published/failed, account/provider thực thi.
- Research: tín hiệu/ý tưởng có nguồn và lý do phù hợp. Performance: creative tests, ad proposals, spend caps, actual results. Community: questions/replies/escalations.
- Activity + connector health: handoff agent-to-agent, trace/job IDs, sync lần cuối, lỗi/quyền thiếu. Dữ liệu demo/mock/read-only/actual/insufficient phải có nhãn rõ.

### Gaps
- Chưa có capability matrix account/provider thật; các platform cụ thể do stream MCP nghiên cứu xác nhận.
- Chưa có data retention/media storage/licensing policy và benchmark concurrency mới.
- Không xác nhận platform hiện cho phép tự động publish/reply hoặc chạy ads từ account TripC; cần OAuth scopes/account prerequisites.

## 3. Chuyển đổi thế nào để có demo thật và phân công đội hiện tại?

### Takeaway
Rebaseline theo các lát cắt nghiệm thu, bắt đầu một workspace TripC và một vòng Research → SEO → publish website → metrics trên dashboard, rồi mới thêm social/paid/community. Không hứa toàn bộ đa nền tảng trong bốn tuần cũ; estimate sau contract và kiểm quyền connector.

### Cited Findings
- Đội thực tế 8 người; Quang Quang kiêm AI/PM/PO, Thiệu một người QA hai lane; 2 FE/2 BE có vùng sở hữu riêng. Không được tính các vai trò kiêm nhiệm như headcount thêm. — [Team](../../docs/coordination/TEAM.md)
- Task chỉ Done khi có review + integration staging + AC/evidence; fake/local_verified không thay nghiệm thu. — [README](../../README.md), [Audit](../../docs/coordination/AUDIT-2026-10-09.md)
- Pilot TripC và audience đã được chọn trong baseline. — [Pilot](../../docs/coordination/PILOT.md)

### Inferences
#### Các phase đề xuất, chưa cam kết ngày

Ưu tiên đã được người dùng chọn: **Website + Facebook/Instagram; quảng cáo Meta**. Các kênh khác là extension sau, không nằm critical path pilot mới.

| Phase | Công việc | Gate/đầu ra reviewable |
| --- | --- | --- |
| P0 Rebaseline + sửa nền | Chốt 6 role/AC, shared schemas và quyền; sửa API build/auth/tenant; chọn initial channel; kiểm connector permissions; giữ audit/Done cũ | Contract và connector matrix có nguồn/quyền/cost; APIs/CI đạt; plan mới không đổi lịch sử old TODO |
| P1 Memory + dashboard + backbone | Content/version/campaign/task/run registry, PostgreSQL job store/outbox, live AI HTTP adapter, 6 agent registry/tool policies, dashboard đọc API thật | Tạo task → fake xác định để kiểm contract → chạy một live AI job → lưu/version/restart → xuất hiện dashboard; tenant isolation và retry budget đạt |
| P2 Closed loop SEO | Research/Growth Lead/SEO dedicated pipeline; nguồn có duyệt, inventory dedup, draft/approval/pilot publish, form persist và GSC/GA4 snapshot | Một campaign thật: sources → blog → duyệt → public URL đúng version → traffic/form persisted → dashboard; sửa draft invalidate approval, retry không đăng trùng |
| P3 Content + Community | Content agent + asset workflow; một social connector publish thật nếu quyền đáp ứng; community draft/read channel trước, reply khi API cho phép | Creative không lẫn blog role; social post có external ID/URL; question → grounded reply/handoff → trace; connector unsupported hiện nhãn manual |
| P4 Performance + Lead learning | Một ads provider read/propose; budget ledger, experiment và pause/launch gates; 6th agent báo cáo số liệu thật | Recommendation truy tới metric snapshot; missing history không giả timing/CPA; read-only khi chưa launch permission; approved capped pilot ad nếu người dùng cấp phép riêng; summary 6 agents trên cùng dashboard |

Không chờ P4 mới dựng agent thẻ hoặc input/output schemas. Sáu role hiện từ P1; role chưa có pipeline/tool phải trạng thái `not_enabled`/`draft_only`, không fake completed. Giữ ads write/launch feature disabled khi chưa có quyền/ngân sách được duyệt; user yêu cầu lên kế hoạch không phải lệnh tiêu tiền.

Sau P0 đội estimate S/M/L, phụ thuộc connector, capacity thực tế và ngày demo; dự báo revised W1–W4 chỉ khi scope nhỏ đủ nguồn lực. Thứ tự tuần cũ không nên ép team làm 16 modules trước rồi mới 6 agents.

#### Chủ sở hữu đề xuất theo người

| Người | Trách nhiệm migration |
| --- | --- |
| Quang Quang | Agent role/prompt/eval 6 roles, routing/hand-off logic với BE, product scope và prioritization; giữ WIP vì kiêm AI/PM/PO |
| Dương | Stories/AC per agent, source policy, campaign/content states, metric dictionary, approvals và platform capability matrix; phân biệt SEO/content/paid |
| Trường | Một dashboard có 6 agents, campaign/content inventory, approvals/calendar/report, trạng thái empty/missing/error/not-enabled |
| Thiệu Quang | Sửa API/build/auth, tenant boundaries, contracts, schema migration version/lineage/approval/job/outbox, CI, gateway authorization |
| Mỹ | Durable workers/live AI adapter, MCP/official API adapters, publisher/scheduler/reconciliation, metrics/lead persistence và budget execution |
| Tiến | Dashboard shell/agent cards/campaign KPIs/integrations; public pilot blog/form/tracking và numeric data views |
| Huyền | Shared content inventory/editor/version/approval/calendar; research/community/performance proposal views và mocks/contracts |
| Thiệu | Contract/API/tenant/source/dedup/retry/restart, live UI E2E, deterministic numeric checks, 6 role eval và tool authorization/ad caps |

#### Tiêu chí Done cho hướng mới

- Agent có dedicated prompt/output schema/tool scope/eval và input snapshot, không chỉ một tên trong registry.
- Output mỗi worker phải tìm được trên dashboard với owner/source/version/parent/status; restart không mất kết quả và handoff không tạo trùng.
- Publisher chỉ thực thi đúng approved version; edit/revoke source buộc review lại; timeout/retry không tạo duplicate posts/spend.
- Metrics reconciled nguồn thật; attribution organic/paid rõ, thiếu revenue không hiển thị ROAS; form DB success là conversion, không chỉ click CTA.
- Paid recommendation và action log riêng; configured caps chặn trước API mutation; human approval chỉ ra campaign/version/currency/amount/time horizon; account identity audit đầy đủ.
- Agent không đọc tenant khác, không tin chỉ dẫn trong scraped content; source tracing/citations/source revoke xuyên toàn hệ.
- Browser/demo thấy một campaign thực tế đóng vòng; fake fixtures vẫn có nhãn test và không tính số liệu kinh doanh.

### Gaps
- Chưa có lịch revised chính xác; không có căn cứ ước tính tỷ lệ hoàn thành cho hướng mới trước task breakdown.
- Platform đã chọn Website + Facebook/Instagram và Meta Ads. Ads budget/quyền account chưa có; read/propose trước, không thực thi chi tiêu thật từ yêu cầu lập kế hoạch này.
- TikTok video không thuộc phạm vi nghiên cứu này; không khẳng định đã xem/nội dung video.
