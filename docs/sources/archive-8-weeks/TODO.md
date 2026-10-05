# TODO — AI Growth OS MVP 8 tuần

Mốc tuần tính từ kickoff do PM chốt, không tự gán ngày lịch. Đây là backlog thực thi đề xuất; đội estimate và PO chốt scope trước cam kết. `[ ]` nghĩa chưa hoàn thành; không đánh dấu Done bằng demo mock.

PM/đầu mối tích hợp cập nhật file tổng. Mỗi người cập nhật task riêng trong vùng sở hữu; dùng ID bên dưới và liên kết story Mxx. Task phải có owner, estimate, reviewer, dependencies, AC, contract version và evidence. Trạng thái: backlog/ready/in_progress/local_verified/integrated/done/blocked.

## 0. Bộ khung đã bàn giao

- [x] Tạo README, quy trình làm việc và ranh giới FE/BE/AI/BA/UIUX/QA.
- [x] Tạo bảng phạm vi M01–M30, giữ chênh lệch PRD/kế hoạch để đội chốt.
- [x] Tạo thư mục độc lập, README theo vị trí và env examples đề xuất.
- [x] Tạo dự thảo contract, examples synthetic và templates task/PR/change.
- [x] Lưu bản sao PRD và kế hoạch để truy vết yêu cầu.

Các mục trên là bàn giao tài liệu; không xác nhận ứng dụng đã chạy.

## 1. Việc mở khóa toàn đội — PM/PO, BE đầu mối

- [ ] CORE-01 · T1 · PM/PO: chốt phạm vi 8 tuần và quyết định D01–D06 trong SCOPE; đầu ra là decision records.
- [ ] CORE-02 · T1 · PM: xác nhận 7 người full-time + PM riêng, capacity, WIP, reviewer; giữ 25% review/integration/bugs.
- [ ] CORE-03 · T1 · BE: tạo Git remote/baseline, ánh xạ username/team, CODEOWNERS, required reviews/checks và branch protection.
- [ ] CORE-04 · T1 · BE + FE + AI: chốt runtimes/package manager và phiên bản; tạo manifest/lockfile riêng, lệnh dev/test/build thật trong từng README.
- [ ] CORE-05 · T1 · BE: chốt queue và hosting worker/AI; dựng local/staging tách tenant, secret store và seed synthetic.
- [ ] CORE-06 · T1 · BE + consumers: hoàn thiện OpenAPI/JSON Schema v1, error model, job states; freeze 1.0.0 sau review.
- [ ] CORE-07 · T1 · BE + QA2: tạo schema/examples validation, breaking diff và CI path/consumer checks; chạy trên merged state.
- [ ] CORE-08 · T1 · PM + BE: chọn một CMS và có quyền thật; có GA4/GSC properties, OAuth permissions, ngân sách/quota LLM.
- [ ] CORE-09 · T1–2 · BE: dựng mock/stub/fake modes và smoke độc lập cho FE/BE/AI; verify không cần secrets production.
- [ ] CORE-10 · T2 · PM: tái estimate backlog theo effort thực tế; cắt/dời scope hoặc bổ sung nguồn lực khi vượt capacity.
- [ ] CORE-11 · T1–8 · PM: weekly demo luồng thật, risk register, blocker >1 ngày có owner/next action.

## 2. BA — `docs/ba/`

- [ ] BA-01 · T1 · Phân rã PRD → M01–M30 → story/AC; traceability đến test IDs và release gate.
- [ ] BA-02 · T1 · Chốt organization/workspace membership, role-action matrix, invite/revoke và tenant access với PO.
- [ ] BA-03 · T1–2 · Viết M01–M04: onboarding, brand/audience/language, goals/KPI/baseline/budget, source lifecycle.
- [ ] BA-04 · T2 · Chốt PDF text/URL, file size/type, crawl limits, approved facts, delete/outdated/version semantics; xử lý D03.
- [ ] BA-05 · T2 · Định nghĩa qualified traffic/conversion, range/timezone, consent, attribution cơ bản; phân biệt business KPI và code AC.
- [ ] BA-06 · T2–3 · Viết research types/freshness, retry/cancel, opportunity rubric, action owner/deadline/KPI và strategy approval.
- [ ] BA-07 · T3–4 · Chốt brief fields, intent, angle, unique value, facts/CTA/source bindings, version/restore/autosave.
- [ ] BA-08 · T4–5 · Chốt variant lineage, quality gate, reviewer rights, reject/resubmit; sửa sau duyệt phải duyệt lại.
- [ ] BA-09 · T5–6 · Chốt schedule timezone, cancel/retry, CMS capability update/unpublish, UTM/event mapping và OAuth states.
- [ ] BA-10 · T6–7 · Chốt dashboard/report AC: evidence, missing/zero/delayed, % baseline 0, recommendations→tasks.
- [ ] BA-11 · T7–8 · Chuẩn bị UAT theo persona; đối chiếu từng AC với evidence và PO ký nhận limitations.
- [ ] BA-12 · T8 · Bàn giao data dictionary, processes, backlog sau MVP và owner support.

## 3. UI/UX — `design/`

- [ ] UX-01 · T1 · Sitemap và flow goal→content→publish→report; prototype ưu tiên critical journey.
- [ ] UX-02 · T1 · Design system/tokens, typography/spacing/colors, responsive/accessibility, component state matrix.
- [ ] UX-03 · T1–2 · Login, workspace switcher, invite/member settings, permission/expired-session states.
- [ ] UX-04 · T1–2 · Onboarding/brand/goals: validation, draft save, language/audience/baseline setup.
- [ ] UX-05 · T2 · Knowledge upload/list/review/provenance, source outdated/delete, processing/failure states.
- [ ] UX-06 · T2–3 · Research form/status/cancel/evidence; opportunity filters/detail, plan/action board.
- [ ] UX-07 · T3–4 · Brief/editor/source panel/meta fields, autosave/conflict, history/restore, regenerate progress.
- [ ] UX-08 · T4–5 · Facebook draft, variant lineage, quality findings, approve/reject/resubmit và audit UI.
- [ ] UX-09 · T5–6 · Calendar, publish confirmation/failure recovery, integration connect/revoke và property selectors.
- [ ] UX-10 · T5–7 · Dashboard/report: baseline/date filters, missing/zero/delayed, evidence và recommendation action.
- [ ] UX-11 · T1–8 · Handoff trước FE ít nhất một tuần; design QA theo story, file specs tách feature.
- [ ] UX-12 · T8 · Usability critical flows, design QA cuối và bàn giao assets/tokens/hướng dẫn.

## 4. FE — `apps/web/`

- [ ] FE-01 · T1 · Bootstrap app, layout/routing, component base, API client, env validation và local README chạy thật.
- [ ] FE-02 · T1 · Mock API theo contract v1 cho success/error/empty/permission/job states; test không cần BE chạy.
- [ ] FE-03 · T1–2 · Login/session, workspace switch, members/invite/revoke và permission UX; tích hợp API thật.
- [ ] FE-04 · T2 · Business/brand/goals forms, validation, draft save và measurement settings.
- [ ] FE-05 · T2 · Knowledge upload/list/detail/review, source provenance/outdated/delete, job progress và integration settings.
- [ ] FE-06 · T3 · Research runs/cancel/detail; opportunities filters/board/select; action plan/tasks.
- [ ] FE-07 · T4 · Brief create/edit; content editor/meta, autosave/history/restore và optimistic conflict recovery.
- [ ] FE-08 · T4 · Async generation progress/cancel/failure/retry; hiển thị evidence và thiếu facts rõ ràng.
- [ ] FE-09 · T5 · Repurpose variants, quality findings, role-based approval controls và edit-after-approval UX.
- [ ] FE-10 · T6 · Calendar/publish now/schedule/status/post URL; timezone và duplicate-submit handling.
- [ ] FE-11 · T6–7 · GA4/GSC properties/date filters/sync health, KPI cards và missing/zero/delayed states.
- [ ] FE-12 · T7 · Growth report/evidence/recommendation→task; tích hợp toàn bộ critical flow.
- [ ] FE-13 · T1–8 · UI/component/consumer tests, typecheck/build, accessibility fixes theo AC; giữ tests trong vùng FE.
- [ ] FE-14 · T8 · Fix critical/high, production config/build, release smoke và frontend handover.

## 5. BE — `apps/api`, `apps/worker`, `database`, `infra`

- [ ] BE-01 · T1 · API/worker skeleton, DB migrations/seed, local/staging, healthcheck, request tracing và secret strategy.
- [ ] BE-02 · T1–2 · Auth/session, organization/workspace, role matrix, invite/revoke; RLS/API/storage tenant isolation.
- [ ] BE-03 · T2 · Business/brand/goals APIs và versioned context; validations theo AC.
- [ ] BE-04 · T2 · Signed upload/URL safety, source lifecycle, storage và ingestion queue; delete/revoke propagate vào RAG/cache.
- [ ] BE-05 · T1–3 · Durable queue, worker lease/heartbeat, status/progress, timeout/retry/backoff/cancel, quota/cost caps; AI stub.
- [ ] BE-06 · T3 · Research/opportunities/plans/tasks APIs, evidence/context/goal relations; internal AI auth và run recovery.
- [ ] BE-07 · T4 · Brief/content/version APIs, result validation, source bindings, optimistic concurrency/restore.
- [ ] BE-08 · T5 · Variant lineage, approval state machine, approved-version/hash audit; edit vô hiệu approval và schedule cũ.
- [ ] BE-09 · T2–6 · OAuth connect/callback/revoke, encrypted credentials, CMS/GA4/GSC adapters và support matrix.
- [ ] BE-10 · T6 · Một CMS thật: publish/schedule/cancel/retry, idempotency/reconciliation, recheck quyền/approval trước execute.
- [ ] BE-11 · T6 · UTM/event mapping, GA4/GSC sync, timezone/range/property provenance, delayed/missing/zero semantics.
- [ ] BE-12 · T7 · Metrics snapshots/report APIs, audit/usage/cost logs; đối chiếu số liệu nguồn cùng QA2.
- [ ] BE-13 · T1–8 · API/job/unit/contract/RLS tests; migration DB trống và nâng từ phiên bản trước; schema change tương thích rollback.
- [ ] BE-14 · T7–8 · API p95/load pilot, monitoring/alerts/rate limiting, secret redaction và revoked token regression.
- [ ] BE-15 · T8 · Backup restore drill, deploy/migrate/rollback runbook, rollout nhỏ và operations handover.

## 6. AI — `services/ai/`

- [ ] AI-01 · T1 · Provider adapters fake/live, structured output validation, internal run interface, prompt/model versioning.
- [ ] AI-02 · T1–2 · Golden/adversarial datasets với QA2, facts/retrieval rubric, critical cases và ngưỡng PO chốt; freeze dataset version.
- [ ] AI-03 · T2 · Extract/chunk/index PDF text/URL; tenant-scoped retrieval và source/version citations.
- [ ] AI-04 · T2 · Context normalization: approved facts, brand/audience/goals; thiếu facts phải trả thiếu, không suy diễn.
- [ ] AI-05 · T3 · Research agent nguồn có timestamp/provenance, prompt injection handling, provider errors và partial results.
- [ ] AI-06 · T3 · Opportunity scoring với rubric/rationale/evidence; strategy/actions theo budget/effort, không full autonomous planning.
- [ ] AI-07 · T4 · Brief generation theo intent/unique value/CTA/facts và schema.
- [ ] AI-08 · T4 · Article/FAQ/meta/social draft từ approved context; generation timeout/cost caps và cancellation.
- [ ] AI-09 · T5 · Article→Facebook draft, language/brand consistency, variant source version và factual fidelity.
- [ ] AI-10 · T5 · Brand/fact/duplicate checks có findings/evidence; reviewer con người quyết định approval.
- [ ] AI-11 · T6–7 · Analyst input từ metric snapshots; tính toán số bằng code xác định, report có evidence, xử lý missing/zero/baseline 0.
- [ ] AI-12 · T1–8 · Trace/token/cost/latency logs không secrets; regression eval theo prompt/model/dataset versions.
- [ ] AI-13 · T8 · Final eval, khóa phiên bản phát hành, fallback và bàn giao prompt/schema/eval report/limitations.

## 7. Tester 1 — `qa/tester-1/`

- [ ] QA1-01 · T1 · Persona journeys, test plan/traceability, E2E skeleton và QA runner README.
- [ ] QA1-02 · T1–2 · Login/workspace switch/invite/revoke và UI permission/loading/error/empty.
- [ ] QA1-03 · T2 · Onboarding/brand/goals validation, save/reload, audience/language; knowledge upload/review/search/lifecycle UI.
- [ ] QA1-04 · T3 · Research progress/cancel/partial failure, opportunity filters/select và plan/task status.
- [ ] QA1-05 · T4 · Brief source panel/autosave, editor/meta/history/restore, stale conflict và mất dữ liệu.
- [ ] QA1-06 · T5 · Reject/edit/resubmit, reviewer rights, approval stale version, variant lineage/sync UX.
- [ ] QA1-07 · T6 · E2E goal→knowledge→research→brief→draft→approve→publish với CMS thật; lịch/timezone/cancel.
- [ ] QA1-08 · T6–7 · Dashboard filters/property/conversions, missing/zero/delayed; report evidence và task creation.
- [ ] QA1-09 · T1–8 · Accessibility cơ bản, responsive/design QA; lưu screenshots/video theo task/build ID.
- [ ] QA1-10 · T7–8 · Regression/UAT cùng BA, release smoke và tổng hợp chất lượng nghiệp vụ/known issues.

## 8. Tester 2 — `qa/tester-2/`

- [ ] QA2-01 · T1 · API/security/data plan, contract suite, tenant A/B/role fixtures và CI smoke.
- [ ] QA2-02 · T1–2 · Auth expired/revoked, invite/revoke, API/DB/storage/vector cross-tenant negative tests.
- [ ] QA2-03 · T2 · File/URL safety, source approve/outdated/delete, RAG cache/index delete propagation.
- [ ] QA2-04 · T1–3 · AI schema/input-output/timeout/injection/grounding, retry/cancel/restart và idempotent AI runs.
- [ ] QA2-05 · T2–5 · Cùng AI xác minh frozen eval: critical safety, facts/retrieval, scoring/missing metrics, stale context và cost caps.
- [ ] QA2-06 · T4–5 · Concurrent edits/optimistic conflict, invalid output, content version/approval hash; không publish stale approval.
- [ ] QA2-07 · T6 · CMS duplicate/restart/unknown outcome/revoke tests; logs không credentials; schedule execution recheck permissions.
- [ ] QA2-08 · T6–7 · Đối chiếu GA4/GSC source metrics/range/timezone/property; zero/missing/delay và revoked OAuth.
- [ ] QA2-09 · T7 · Report numbers match snapshots, baseline 0 handling; evidence references đúng tenant và version.
- [ ] QA2-10 · T7–8 · Performance theo tải pilot/p95/timeout; migrations upgrade; backup restore/rollback verification.
- [ ] QA2-11 · T8 · API/security/integration regression, final AI eval evidence và release readiness.

## 9. Cổng tích hợp chung

| Gate | Phải thấy trên staging với service thật | Người xác nhận evidence |
| --- | --- | --- |
| G2 — tuần 2 | Workspace/brand/goals/knowledge có phân quyền; test tenant A/B đạt | BA, QA1, QA2, BE |
| G5 — tuần 5 | Research→opportunity→brief→AI draft→approval; sửa sau duyệt chặn publish | BA, QA1, QA2, AI |
| G7 — tuần 7 | Publish một CMS không trùng; GA4/GSC đối chiếu được; report có evidence | QA1, QA2, BE, AI |
| G8 — tuần 8 | UAT/regression đạt; critical/high đã xử lý; restore/rollback/monitoring sẵn sàng | QA evidence, BE readiness, PM/PO go/no-go |

- [ ] GATE-02 · Hoàn thành G2 và tái estimate capacity; ghi limitations/risks.
- [ ] GATE-05 · Hoàn thành G5; quality gate dùng dataset và evidence, không chỉ AI score.
- [ ] GATE-07 · Hoàn thành G7; không thay mock/số synthetic thành dữ liệu pilot thật.
- [ ] GATE-08 · Hoàn thành G8; bàn giao AC/design/API/DB/prompts/evals/test evidence/runbooks/support matrix/owners.

## 10. Sau MVP — không đưa vào cam kết 8 tuần

- [ ] NEXT-01 · M12–M15: keyword clusters, programmatic SEO, internal linking/audit, decay/refresh/recycling.
- [ ] NEXT-02 · M17–M18: social publishing/API permissions, newsletter, community/intent radar có human approval.
- [ ] NEXT-03 · M22–M24: experiments, learning/opportunity graph, competitor intelligence.
- [ ] NEXT-04 · M26: autonomous rules/decisioning với policy, evidence và validation riêng.
- [ ] NEXT-05 · M27: billing/subscriptions/AI credits sau validation; không gọi sandbox là payment production.

Không bao gồm full CRM, ad platform, custom LLM, video editor phức tạp, native app, avatar/livestream, spam bot hoặc hàng trăm integrations.
