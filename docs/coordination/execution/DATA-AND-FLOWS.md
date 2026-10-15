# Dữ liệu, API và luồng cần xây

[Checklist triển khai](README.md). **Thiết kế đề xuất để owner review**, chưa phải DDL/OpenAPI đã triển khai. Endpoint có trong `contracts/README.md` được giữ cách đặt tên; public/visitor routes và detail routes bổ sung cần freeze cùng examples. BE chọn thư viện auth/ORM và versions khi bootstrap, không coi tài liệu này đã cài chúng.

## 1. Quy ước dùng cho tất cả 16 module

- Mỗi record nghiệp vụ có UUID `id`, `workspace_id`, `created_at/updated_at` UTC, `created_by`; entity sửa/duyệt có `version` tăng dần. Quan hệ phải cùng workspace, foreign ID khác tenant không hợp lệ.
- Request private lấy actor từ session và kiểm membership; `workspace_id` trong URL/body không tự cấp quyền. Đề xuất: 401 chưa login, 403 sai action trong workspace có quyền đọc, 404 object không thuộc workspace được phép; 409 stale version/idempotency conflict; 422 validation. BA/BE chốt và FE/QA dùng nhất quán.
- Create/job/approval/form retry có idempotency key theo action/tenant/entity; cùng key+payload trả kết quả cũ, cùng key khác payload trả conflict. Không retry vô hạn; caps theo [PILOT_LIMITS](../PILOT_LIMITS.md).
- List có pagination và filters, không trả toàn DB. Error envelope: `code`, `message`, `field_errors`, `request_id`; không trả stack trace/secrets. FE hiển thị field errors và retryable state.
- Content MVP dùng Markdown/plain text được render an toàn, không thực thi raw HTML/script từ source/AI. FE không query DB; AI không trực tiếp mutate nghiệp vụ/publish.

## 2. Role-action matrix đề xuất cần Dương/PO chốt ngày 2

| Action | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Đọc workspace/content/metrics đã có quyền | Có | Có | Có |
| Sửa profile/goal, nhập source, chạy research/generate/edit draft | Có | Có | Không |
| Quản member/role/integration credentials | Có | Không | Không |
| Review approved facts/strategy/brief/content/response/action/learning | Có | Không | Không |
| Schedule/publish đã approved, cấu hình experiment | Có | Không | Không |

Owner là role sản phẩm, không phải tên vị trí trong đội. Quang Quang nghiệm thu phải thao tác bằng user có quyền, audit actor/version/time/reason. Public visitor chỉ published-read/form/assignment/events được giới hạn; không có token workspace/Owner. Schema/support matrix phải ghi rõ nếu đội chọn policy khác trước freeze.

## 3. Bảng/entity tối thiểu theo module

Field là checklist cần review nullability/index/constraints, không yêu cầu tạo một bảng cho từng danh từ nếu schema gọn hơn đáp ứng AC. Thiệu Quang merge migrations/policies, Mỹ implement seed/data modules của mình.

| Module / BE owner | Entity/fields tối thiểu | Invariant bắt buộc |
| --- | --- | --- |
| Nền tảng / Thiệu Quang + Mỹ | users, memberships(user/role/status); jobs(operation/input_version/status/attempt/deadline/result_ref); audit_events(actor/action/entity/version); idempotency records | Tenant/role trước handler; jobs progress không completed trước persist; keys scoped và có payload hash |
| M01 / Thiệu Quang, Mỹ profile | workspaces(name/timezone/language); business_profiles(company/industry/locations/audiences/products/services/voice/guidelines/competitors/version) | TripC `en`; timezone dùng khai báo, không lấy timezone máy chạy |
| M02 / Thiệu Quang | sources(kind/url/blob_ref/category/status/version/checksum/reviewed_by/reviewed_at/deleted_at); source_chunks(source_id/source_version/text/embedding/model/citation_locator); source_facts(key/value/unit/source_ref/verification) | Imported source chưa approved không vào RAG; revoked/deleted filter ngay, async cleanup sau; thiếu fact = null |
| M03 / Mỹ | goals(objective/primary_metric/baseline/target/target_kind/period/audience/location/conversion/budget/status) | Baseline null khác 0; conversion pilot = persisted lead, không signup account |
| M04 / Mỹ | research_runs(goal/query/provider/status/job_id); research_evidence(url/title/excerpt/fetched_at/content_hash/type) | Source có URL/time; evidence ngoài chỉ là research, chưa thành business facts |
| M05 / Thiệu Quang | opportunities(goal/research/topic/intent/audience/location/keyword/format/channel/evidence_ids/score_components/rubric_version/status) | Demand volume null khi không có provider; heuristic phải gắn nhãn, score có provenance |
| M06 / Thiệu Quang | plans(goal/opportunity_ids/version/horizon/status); strategy_versions; tasks(plan/action/owner/effort/deadline/KPI/status) | Approve plan mới tạo tasks, retry không trùng; 30 ngày strategy khác 4 tuần xây sản phẩm |
| M07 / Thiệu Quang | briefs(plan/opportunity/title/keywords/intent/audience/pain_point/angle/unique_value/facts/source_versions/CTA/destination/format/channel/version/status) | Generation chỉ approved brief version; facts có source/version hoặc warning thiếu |
| M08 / Thiệu Quang | contents(brief/type/language/current_version/status); content_versions(body/title/slug/meta/evidence/warnings/hash); variants(source_version/channel/body/version) | PATCH expected_version; restore tạo version mới; variant vẫn draft cần review |
| M09 / Mỹ | seo_pages(content/public_url); keywords(intent/location/language/volume_nullable); audits(rule/results/evidence); clusters/links; refresh proposals | URL cap; đề xuất link trỏ published same-site URL, local unique facts; refresh không tự overwrite/publish |
| M10 / Thiệu Quang approval, Mỹ publishing | approvals(entity/version/hash/actor/decision/reason); publishing_jobs(content/approved_version/schedule/status/idempotency/cms_ref/public_url) | Version/hash/source/quyền recheck lúc execution; unknown outcome reconcile trước create mới |
| M11 / Mỹ | conversations(source_url/text/observed_at/topic/intent); responses(conversation/source_versions/body/version/status); handoffs(response/approved_version/post_url/posted_at/actor) | Manual nhập/đăng, approved response mới handoff; không tự động spam |
| M12 / Mỹ | campaign_links(content/channel/UTM/destination); visitor_events(event_id/type/visitor/session/campaign/content/assignment/submission/time) | UTM không PII; dedup event_id; event visitor không cấp quyền private API |
| M13 / Mỹ | integrations(provider/property/site/status/credential_ref); sync_runs(range/timezone/status/error); metric_snapshots(source/property/range/timezone/values/availability/synced_at) | Credentials server-only; zero/missing/delayed tách; property/range trong snapshot |
| M14 / Mỹ; Thiệu Quang tasks | reports(goal/snapshot_ids/version/summary/evidence/limitations); recommendations(report/action/status/task_ref) | Số học deterministic trước LLM; approve action mới create task idempotent |
| M15 / Mỹ | experiments(page/hypothesis/variants/metric/period/status/version); assignments(experiment/visitor/variant); exposures(assignment/event_id); outcomes(assignment/submission/event_id) | Unique assignment/visitor/experiment; outcome có submission persisted; không double-count retry |
| M16 / Mỹ; Thiệu Quang strategy | learning_runs(snapshot_ids/rule_version); insights(topic/format/channel/evidence/recommendation/status/version); applications(insight/old_strategy/new_strategy/actor) | Approved insight mới new strategy version, expected_strategy_version chống stale, replay không apply hai lần |

## 4. API và route UI để các bên làm cùng một luồng

Private prefix `P = /v1/workspaces/{workspace_id}`; management route đề xuất `/w/{workspaceId}/...` dưới `apps/web`. Endpoint absent trong baseline là đề xuất bổ sung, cần schema/examples/consumer review trước code.

| Phần | API phải đặc tả/implement | UI cần dựng |
| --- | --- | --- |
| Auth/M01 | session login/logout/me theo auth provider; GET/POST `/v1/workspaces`; GET/POST `P/members`, revoke; GET/PATCH `P/business-profile` | login, workspace switch/onboarding/profile/members |
| M02 | GET/POST `P/sources`; detail/upload; POST `P/sources/{id}/review`; DELETE source; job status | knowledge list/upload/detail/review/provenance |
| M03 | GET/POST `P/goals`; PATCH/detail theo schema | goals list/form/detail/baseline/progress |
| M04–M05 | POST `P/research-runs`→202 job; GET job/run evidence; GET opportunities/detail/select | research run/progress, opportunity board/detail |
| M06–M07 | POST/PATCH `P/plans`, approve; tasks list/update; GET/POST/PATCH briefs, approve | strategy/tasks, brief edit/review |
| M08 | POST contents/generate, GET/PATCH content, versions/restore/variants | content editor/history/variant/job progress |
| M09 | keywords/audits/local-drafts/content refresh và proposals | seo audit/cluster/links/local/refresh |
| M10 | submit-review/approve/reject; publishing-jobs; calendar/status/retry/cancel | approval queue/preview/calendar/publish result |
| Public pilot | đề xuất GET `/public/v1/sites/{site_id}/posts`, GET post by slug, GET landing; POST `/public/v1/sites/{site_id}/leads` | `/blog`, `/blog/{slug}`, `/living-in-da-nang` |
| M11 | conversations/responses/approve/handoff | community radar/detail/response/manual link |
| M12–M13 | campaign-links/traffic-sources/integrations/connect/disconnect/sync/metrics/metric-snapshots | traffic/UTM, integrations, analytics filters/sync |
| M14 | reports create/detail; recommendations approve | reports two periods/evidence/action review |
| M15 | private experiments/results; đề xuất public assignment/event routes gắn site/experiment | experiments setup/results, pilot CTA widget |
| M16 | learning/runs, insights/detail/approve | learning evidence/review → strategy link |

BE/AI internal contract giữ `/internal/v1/runs`; worker validate result rồi persist. Operation codes theo `contracts/README.md`: ingest/research/score/strategy/brief/content/SEO/community/report/experiment/learning. Python không import types TypeScript. Schema versions phải chung giữa examples, fake provider, mock FE và QA.

## 5. Những quy tắc phải có thuật toán, không chỉ prompt

**Source và publish:** retrieval query bắt buộc workspace/status/source_version; không chỉ dặn LLM lọc. Delete/revoke commit trạng thái trước enqueue cleanup. Publish đọc content version/hash + approval + source validity + actor quyền; check fail thì không tạo public snapshot.

**Opportunity score đề xuất:** giữ 6 yếu tố PRD, BA viết rubric ordinal 1–5 cho demand signal, business relevance, growth potential, content gap, freshness, conversion potential. Demand signal là heuristic có evidence, **khác search volume** (volume vẫn null nếu không có). `raw_score = product(6 factors)`, normalized `100 * raw_score / 5^6`; thiếu factor thì score null + warning, không điền 0/5 tùy ý. Fixture factors `[2,5,3,4,2,5]` → raw 1200, normalized 7.68; ghi rubric version. Đây là phương án BA/PO review, không khẳng định PRD đã quy định thang 1–5/ngưỡng priority.

**Report numeric:** baseline 100/current 120 → delta 20, percent 20%; baseline 0/current 10 → delta 10, percent null + ZERO_BASELINE; baseline missing → delta/percent null + MISSING_BASELINE. CTR = clicks/impressions khi denominator >0; form rate = persisted leads/sessions khi >0. Không cộng GSC clicks với GA4 sessions rồi gọi là traffic; không lấy CTR của Google làm form conversion rate.

**Experiment:** policy đề xuất server persist assignment unique(visitor, experiment), chọn variant một lần rồi đọc lại; experiment config freeze khi running. Exposure chỉ ghi lúc widget thực sự hiển thị; outcome chỉ liên kết persisted submission và hợp lệ theo attribution policy BA. Mỗi submission/assignment outcome đếm một lần; results có denominators/sample limitations. GA4 event có thể thiếu do consent/blocker, DB form count là nguồn persisted leads, không bắt ép hai hệ luôn bằng tuyệt đối.

**Learning:** rules tạo evidence-based proposal từ snapshot đã pin; nhóm nhỏ/khác periods phải cảnh báo. Approve dùng expected strategy version, transaction tạo new version + application audit duy nhất; không claim causal uplift hoặc tự train model.

## 6. File triển khai và cách không đụng nhau

Thiệu Quang: `apps/api/src/modules/<core-domain>/{routes,service,repository,schemas}.ts`; Mỹ tương tự cho domain của mình, worker `apps/worker/src/jobs/<operation>.ts`; core router/config/migrations do Thiệu Quang tích hợp. Đây là quy ước gợi ý, có thể gộp file khi nhỏ, không tạo lớp rỗng để đủ tên.

Tiến/Huyền: `apps/web/src/features/<feature>/` chứa components/api/tests riêng; Tiến nối route `src/app/`, API client/common và config. Tiến sở hữu `apps/pilot/src/` và widget; Huyền sở hữu mocks/UI tests. AI: `services/ai/src/{agents,rag,guardrails}/` + prompts/evals; không viết nghiệp vụ publish trong AI. BA: một module một story/AC/data-dictionary file; Trường: một module một spec/state file; Thiệu: module tests + fixtures riêng, evidence theo build/task.

Ví dụ PR: `W1-MY-04 / W1-BE-04 / EP-M10-AC-...` ghi endpoint/schema version và request success/duplicate/validation examples; Tiến consume cùng examples, Thiệu test same keys. Nếu đổi schema, gửi contract CR trước và chỉ merge implementation sau consumer review.
