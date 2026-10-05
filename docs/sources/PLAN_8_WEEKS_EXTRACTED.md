# Văn bản trích từ kế hoạch 8 tuần

Trích để đọc; bảng mất cấu trúc cột. Đối chiếu DOCX gốc khi cần.

Kế hoạch AI Growth OS trong 8 tuần

Đội thực thi 7 người và PM riêng  |  Phương án MVP tập trung  |  Ngày 04 tháng 10 năm 2026

Kế hoạch rút gọn từ bản 28 tuần, sử dụng chung 1 BE, 1 FE, 1 UX/UI, 1 AI, 2 Tester và 1 BA. PM quản lý tiến độ và PO quyết định phạm vi/nghiệm thu. Đây là ước lượng có điều kiện, cần xác nhận theo effort thực tế sau tuần 1–2.

Phạm vi: hoàn thiện vòng goal → knowledge → research → opportunity → content → approval → website publish → analytics → report. Những module nâng cao được ghi rõ ở giai đoạn sau; bản này không tương đương full 28 tuần.

1 Khái quát nhiệm vụ từng vị trí

PM — Lập kế hoạch, cân đối năng lực, phân công, quản lý phụ thuộc và rủi ro, điều phối phát hành.

BA — Phân tích nghiệp vụ, KPI, quy tắc dữ liệu và acceptance criteria; điều phối UAT.

UX/UI — Thiết kế trải nghiệm, design system, prototype và tất cả trạng thái giao diện.

FE — Xây ứng dụng web, editor, dashboard, calendar; tích hợp API và xử lý lỗi.

BE — API, database, phân quyền, multi-tenancy, jobs, integrations và vận hành.

AI — Research, RAG, scoring, strategy, generation, analytics và learning.

Tester 1 — Kiểm thử nghiệp vụ, UI, E2E, accessibility cơ bản và UAT.

Tester 2 — API, dữ liệu, bảo mật, tích hợp, hiệu năng và kiểm định AI cùng AI engineer.

2 Nguồn lực và cách PM phân công

Mỗi module cần 1 FE và 1 BE dùng chung của đội. Không cộng số người theo số module. AI phụ trách logic AI và evaluation; BE phụ trách API, quyền, database và queue. Tester 1 làm UI/nghiệp vụ/E2E/UAT; Tester 2 làm API/data/integration/security và cùng AI kiểm định đầu ra.

Năng lực kế hoạch: mỗi FE/BE/AI có 40 ngày danh nghĩa; giữ 25% cho review, integration, bugs, tương đương khoảng 30 ngày tính năng/người. Tổng đội 7 người khoảng 210 ngày công hữu dụng, chưa tính PM. Bản 16 tuần có gấp đôi năng lực bản 8 tuần nhưng vẫn thấp hơn bản 28 tuần.

PM nên riêng ngoài 7 người. Nếu BA kiêm PM, chia khoảng 65% BA và 35% PM; bắt buộc tái ước lượng và cắt/tái sắp xếp scope, không giữ nguyên deadline bằng cách bỏ QA. PM không giao cùng lúc hai feature lớn cho FE hoặc BE; dùng một feature chính và một lane sửa lỗi.

Sprint 2 tuần; demo hàng tuần. BA chuẩn bị trước một sprint, UX/UI trước FE ít nhất một tuần. FE dùng mock dựa trên contract đã thống nhất khi BE chưa xong. BE và AI chốt schema/job boundaries trước triển khai. Blocker quá một ngày có owner và phương án.

Hạng mục

Người quyết định

Người thực hiện

Ưu tiên và thay đổi phạm vi

PO

PM tổng hợp tác động; BA phân tích.

Lịch capacity phụ thuộc

PM

FE BE AI UX QA ước lượng.

Nghiệp vụ và AC

PO

BA soạn; QA và kỹ thuật review.

Kiến trúc và API

BE đầu mối

FE AI tham vấn; PM xử lý nguồn lực.

Chất lượng AI

AI

Tester 2 xác minh; BA review facts.

Release

PM và PO

QA evidence; BE xác nhận readiness.

2 1 Điều kiện thực hiện

Full-time, ngân sách API, staging/CI có sẵn, một CMS ưu tiên và quyền GA4/GSC từ đầu. Chỉ tích hợp social qua API chính thức khi đủ quyền. Dùng LLM/embeddings/payment/analytics services có sẵn; không xây nền tảng video hay custom LLM. Dữ liệu giả chỉ dùng test và có nhãn.

PM tái ước lượng sau tuần 2 và mỗi gate. Nếu backlog vượt capacity, chọn dời mốc, giảm độ sâu hoặc bổ sung người. Ưu tiên thêm BE integration/DevOps khi cần giữ scope/deadline, sau đó FE; không có cơ sở cam kết một số lượng bổ sung cố định trước khi estimate.

3 Danh mục module và mức bàn giao

Mỗi dòng dùng 1 FE + 1 BE dùng chung; AI tham gia research/generation/analysis. “Giai đoạn sau” nghĩa là không nghiệm thu chức năng đó trong bản 8 tuần. “Cơ bản” nghĩa là có luồng chạy thật nhưng giới hạn integrations, automation và quy mô.

Mã

Module

Lịch và mức triển khai

M01

Organization Workspace RBAC

T2 đầy đủ cơ bản

M02

Business onboarding và brand

T2 cơ bản

M03

Knowledge và source lifecycle

T2 cơ bản PDF text và URL

M04

Growth Goal và measurement settings

T2 và T6 cơ bản

M05

Market Intelligence và Research

T3 cơ bản

M06

Opportunity Engine và Board

T3 cơ bản

M07

Growth Strategy và Action Plan

T3 kế hoạch và task đơn giản

M08

Content intelligence và brief

T4 cơ bản

M09

AI Content Factory

T4 bài SEO và social draft

M10

Repurposing và localization

T5 chuyển bài sang Facebook draft

M11

Governance quality và approval

T5 approval bắt buộc

M12

SEO keyword và topic clusters

Giai đoạn sau

M13

Programmatic local SEO

Giai đoạn sau

M14

Internal linking và SEO audit

Giai đoạn sau

M15

SEO optimizer decay refresh recycling

Giai đoạn sau

M16

Distribution calendar website publish

T6 một CMS

M17

Social newsletter và channel adaptation

Giai đoạn sau

M18

Community Growth và Intent Radar

Giai đoạn sau

M19

Traffic UTM và attribution

T6 UTM và conversion cơ bản

M20

Analytics và Command Center

T6–T7 GA4 và GSC cơ bản

M21

AI Growth Analyst và reports

T7 báo cáo có bằng chứng

M22

Experiment Engine

Giai đoạn sau

M23

Learning và Opportunity graph

Giai đoạn sau

M24

Competitor Intelligence

Giai đoạn sau

M25

Agents và Growth Orchestrator

T3 workflow tuần tự và job status

M26

Autonomous rules và confidence

Giai đoạn sau

M27

Billing subscriptions AI credits

Giai đoạn sau

M28

Integration Settings và API

T2–T6 CMS GA4 GSC

M29

Admin notifications security operations

T1–T8 quyền audit backup tối thiểu

M30

AI evaluation observability

T1–T8 evaluation và cost logging

4 Nhiệm vụ theo từng tuần

Mỗi tuần có mục tiêu, owner chuyên môn và cổng bàn giao. Công việc dưới đây là các đầu ra tối thiểu; PM chuyển thành story và subtask có estimate, reviewer, phụ thuộc và AC.

Tuần 1 Chốt yêu cầu và nền tảng

Trọng tâm: Chốt yêu cầu và nền tảng. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Chốt full backlog, release map, quyền API và ngân sách; mở risk register. Chốt capacity sprint; kiểm tra staging/CI và quyền dịch vụ.

BA — Phân rã PRD, KPI và role; viết story M01–M04; rà mục loại trừ. Chi tiết role/invite/revoke, organization và policy truy cập.

UX/UI — Sitemap, luồng mục tiêu đến hành động; wireframe; design system. UI workspace switcher, member settings và lỗi quyền.

FE — Khởi tạo app, routing, layout, mock APIs và component nền. Login, workspace, members; tích hợp API thay mock.

BE — Kiến trúc tenant, DB, CI/staging, API/job contracts và secret strategy. Auth/RBAC/tenant isolation, invite, audit, worker skeleton.

AI — Thiết kế pipeline, schemas; chọn provider; bộ eval facts/retrieval. Adapter LLM, structured output, tracing và cost logging.

Tester 1 — Test plan, traceability, persona journeys và E2E skeleton. Test login, workspace switch, invite và các trạng thái UI.

Tester 2 — API/security plan, tenant fixtures, AI adversarial cases. Test token, revoke, truy cập chéo tenant; smoke CI.

Đầu ra nghiệm thu trong tuần

Chạy được luồng chốt yêu cầu và nền tảng trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 2 Workspace brand goals và knowledge

Trọng tâm: Workspace brand goals và knowledge. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Kiểm tra UX handoff; chốt KPI với PO và website pilot. Tái ước lượng ingestion; chốt định dạng hỗ trợ và giới hạn crawl.

BA — Business profile, audience, brand rules, baseline và conversion definitions. Source approval, outdated/delete/version; acceptance PDF URL Docs.

UX/UI — Thiết kế onboarding, brand rules và goal setup hoàn chỉnh. UI upload, nguồn, provenance, connect/health state.

FE — Forms hồ sơ/brand/goals, validation và draft save. Knowledge list/detail, upload, approve, connect settings.

BE — APIs profile/brand/goals, version và validation rules. Storage, source lifecycle, ingestion queue; OAuth foundation.

AI — Chuẩn hóa context; kiểm tra không tự bổ sung facts thiếu. Extract PDF/Docs/text/web; chunk/index; RAG có trích dẫn.

Tester 1 — Test onboarding, edit goal, audience/language và lỗi nhập liệu. Test upload, review, search nguồn và lỗi xử lý.

Tester 2 — Test API schema/role, goal persistence và context isolation. Test URL/file safety, tenant vector filters và delete propagation.

Đầu ra nghiệm thu trong tuần

Chạy được luồng workspace brand goals và knowledge trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 3 Research opportunity và kế hoạch

Trọng tâm: Research opportunity và kế hoạch. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Chốt nguồn nghiên cứu hợp lệ; giới hạn job/time/cost. Review cơ hội với PO; chốt scoring và kế hoạch 30 ngày.

BA — Research types, source freshness và failure/retry rules. Rubric opportunity, owner/deadline/action/KPI và approval plan.

UX/UI — UI research run, agent tasks và source evidence. Board, priority detail, strategy preview và task list.

FE — Research form, run status, cancel và detail sources. Opportunity filters, choose brief, strategy/action board.

BE — Research job APIs, tracing, retries, cancellation và quota. Opportunity/strategy/task APIs và relation với goals.

AI — Research agent lấy nguồn; news/trends/questions có timestamp. Scoring có giải thích; tạo strategy theo budget/effort.

Tester 1 — Test tạo run, progress, cancel, partial failure và empty. Test filter, select, approve plan, assign task và status.

Tester 2 — Test timeout, provider errors, injection và source grounding. Test scoring consistency, missing metrics, schema và permissions.

Đầu ra nghiệm thu trong tuần

Chạy được luồng research opportunity và kế hoạch trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 4 Brief Content Factory và editor

Trọng tâm: Brief Content Factory và editor. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Chốt brief workflow; kiểm soát WIP trước editor. Demo milestone nội dung; tái ước lượng giữa kỳ.

BA — Brief fields, intent, unique value, facts, CTA và channel. Content schema, version rules và content acceptance.

UX/UI — Brief editor, source panel, content workspace states. Editor, headings/meta, version history và regenerate UX.

FE — Tạo/chỉnh brief từ opportunity và template theo format. Rich text editor, meta fields, history, generation progress.

BE — Brief/version APIs; source bindings; draft persistence. Content/version/job APIs; optimistic concurrency.

AI — Chọn format/angle; sinh brief gắn facts và brand. Sinh article, FAQ và social draft; enforce approved facts.

Tester 1 — Test brief CRUD, source display, autosave và navigation. Test tạo/sửa/lưu/restore version, editor và mất dữ liệu.

Tester 2 — Test invalid output, stale context và tenant permissions. Test factual eval, concurrent edits, invalid schema và cost caps.

Đầu ra nghiệm thu trong tuần

Chạy được luồng brief content factory và editor trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 5 Repurposing kiểm tra và duyệt

Trọng tâm: Repurposing kiểm tra và duyệt. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Chốt quality gate với PO; không dùng AI score làm bằng chứng duy nhất.

BA — Approval transitions, sensitive topics và sửa sau duyệt.

UX/UI — Variants, QA findings, approve/reject và audit UI.

FE — Repurpose view, quality feedback và approval controls.

BE — Variant lineage; state machine; approval/version audit.

AI — Channel drafts; brand/fact/duplicate checks và explanations.

Tester 1 — Test reject/edit/resubmit, role reviewer và variant sync.

Tester 2 — Test approve stale version, forbidden claims và eval regressions.

Đầu ra nghiệm thu trong tuần

Chạy được luồng repurposing kiểm tra và duyệt trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 6 Website publishing và analytics

Trọng tâm: Website publishing và analytics. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Go/no-go luồng nội bộ; kiểm tra CMS permissions và rollback. Đảm bảo GA4/GSC có dữ liệu; chốt delayed-data handling.

BA — Schedule timezone, cancel, update/unpublish support theo CMS. Qualified traffic, event mapping, attribution model/window.

UX/UI — Calendar, publish confirmation và failure recovery. Dashboard baseline, funnels, data unavailable/zero.

FE — Calendar, publish now/schedule, status và post URL. KPI cards, date filters, property selector và sync status.

BE — CMS adapter, scheduler, idempotency, retries và publish audit. GA4/GSC sync; UTM/event join; consent-aware mapping.

AI — Validate format/meta trước publish; hỗ trợ QA nội dung. Chuẩn hóa metric input cho analyst; không tạo số liệu giả.

Tester 1 — E2E goal→content→approve→publish trên CMS thật. Test filters, conversion config và dashboard states.

Tester 2 — Duplicate/restart/timeout tests; kiểm tra credential và revoke. Đối chiếu API nguồn, timezone, zero/missing và revoked OAuth.

Đầu ra nghiệm thu trong tuần

Chạy được luồng website publishing và analytics trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 7 Growth report và kiểm thử tích hợp

Trọng tâm: Growth report và kiểm thử tích hợp. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Review dữ liệu đo được; đóng scope; chuẩn bị UAT và release readiness.

BA — Chốt report AC; kiểm tra KPI definitions, baseline và kịch bản UAT.

UX/UI — QA dashboard/report, empty states; hoàn thiện hướng dẫn người dùng.

FE — Dashboard cơ bản, report evidence và tạo task; sửa lỗi luồng chính.

BE — Hoàn thiện GA4/GSC sync, report APIs, UTM và conversion mapping.

AI — Báo cáo có evidence; ghi thiếu dữ liệu; chạy lại fact/report evaluation.

Tester 1 — Test dashboard/report, task creation; regression goal→publish.

Tester 2 — Đối chiếu source metrics; test revoked token, missing/zero và AI numerics.

Đầu ra nghiệm thu trong tuần

Chạy được luồng growth report và kiểm thử tích hợp trên staging; API và giao diện tích hợp; QA có evidence, lỗi còn mở có owner.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

Tuần 8 UAT phát hành và bàn giao

Trọng tâm: UAT phát hành và bàn giao. Các công việc từ kế hoạch dài được giới hạn theo bảng phạm vi ở mục 3.

PM — Chốt go/no-go với PO; triage blocker; rollout nhỏ, xác định rollback và bàn giao owner.

BA — Điều phối UAT, đối chiếu AC từng module; ký nhận limitations và cập nhật backlog.

UX/UI — Design QA cuối, usability các luồng chính; bàn giao hướng dẫn và design system.

FE — Sửa lỗi critical flows, production build/config; smoke test và tài liệu frontend.

BE — Sửa lỗi tích hợp/quyền; backup restore, migration, monitoring, deployment và rollback.

AI — Chạy eval cuối, khóa prompt/model; xác nhận factuality, cost/latency và fallback.

Tester 1 — UAT và regression E2E; test phiên bản phát hành; tổng hợp chất lượng nghiệp vụ.

Tester 2 — API/security/integration regression; đối chiếu analytics, jobs và permission; xác minh restore.

Đầu ra nghiệm thu trong tuần

UAT và regression đạt; không còn lỗi critical/high về quyền dữ liệu hoặc luồng chính; rollout có monitoring và rollback.

PM cập nhật capacity và forecast; task chỉ Done sau code review, test AC, staging integration, xử lý loading/error/permission và tài liệu cần thiết. Không coi mock là tích hợp hoàn tất.

5 Mốc nghiệm thu và chất lượng

Tuần

Cổng

Điều kiện

2

Nền tảng

Workspace, brand, goals và knowledge có quyền.

5

Content loop

Research→brief→content→approval chạy thật.

7

Measurement

Một CMS xuất bản; GA4/GSC và report đối chiếu được.

8

Release MVP

UAT, regression, backup/rollback và tài liệu.

Critical gates: API kiểm tra tenant/RBAC; thu hồi nguồn có hiệu lực; chỉnh sửa sau duyệt phải duyệt lại; publish retry không đăng trùng; analytics phân biệt missing và zero; consent/tracking minh bạch; secrets không xuất hiện trong log; backup restore được thử.

AI engineer và Tester 2 chốt test set và ngưỡng ở tuần 2. Đề xuất: toàn bộ critical safety cases đạt; ít nhất 90% fact/retrieval cases chuẩn đạt; số liệu báo cáo mẫu khớp input. Ngưỡng chỉ có giá trị kèm dataset và phương pháp chấm, không chứng minh AI luôn đúng.

Hiệu năng chốt theo tải pilot, đo API p95 và job timeout/cost. AI chạy async có progress/cancel/failure. Traffic tăng X% không phải điều kiện nghiệm thu code; business growth cần baseline, thời gian và thiết kế đo hợp lệ.

6 Giới hạn và quyết định sau phát hành

Không bao gồm native app, full CRM, ad platform, custom LLM, avatar/livestream, hàng trăm integrations hoặc hạ tầng Enterprise/SSO riêng. Không có quyền social thì dùng export/handoff và ghi rõ chưa activated. Billing sandbox không được gọi là thanh toán production.

Sau phát hành, PO/PM quyết định mở rộng theo dữ liệu pilot. Bản 8 tuần phải bổ sung các module ghi giai đoạn sau trước khi coi là đầy đủ sản phẩm.

Bàn giao: backlog/AC, design, API/DB, prompt/schema/eval, test evidence, support matrix, runbook deploy/rollback/restore, known limitations và owner vận hành. Nguồn phạm vi là PRD AI Growth OS v1.0 người dùng cung cấp; lịch và staffing là đề xuất, cần đội xác nhận.