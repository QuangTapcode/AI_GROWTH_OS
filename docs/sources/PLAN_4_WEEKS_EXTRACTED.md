# Văn bản trích từ kế hoạch 4 tuần / 16 module

Nguồn kế hoạch ngày 05/10/2026. Trích để đọc; bảng mất bố cục cột, cần đối chiếu DOCX gốc.

Kế hoạch triển khai AI Growth OS trong 4 tuần

Phạm vi 16 module  |  Đội thực thi 7 người và PM riêng  |  Ngày 05 tháng 10 năm 2026

Mục tiêu là bàn giao bản pilot bao phủ đủ 16 module, vận hành được vòng mục tiêu → nghiên cứu → cơ hội → chiến lược → nội dung → duyệt → đăng website → đo lường → phân tích → thử nghiệm → học hỏi. Mỗi module có chức năng tối thiểu, dữ liệu lưu thật và tiêu chí nghiệm thu riêng.

Mốc 4 tuần áp dụng cho phạm vi giới hạn bên dưới, với dịch vụ có sẵn và một website pilot. Đây là kế hoạch mục tiêu có điều kiện, không phải cam kết hoàn thiện toàn bộ năng lực SaaS thương mại hoặc tự động hóa trong PRD. PM xác nhận khả thi sau khi kỹ thuật ước lượng vào ngày 2.

1 Khái quát nhiệm vụ từng vị trí

Vị trí

Số người

Trách nhiệm và đầu ra chính

PM

1 riêng

Chốt ưu tiên, năng lực, phụ thuộc; điều phối tích hợp, demo, rủi ro và phát hành.

BA

1

Đặc tả 16 module, user story, quy tắc nghiệp vụ, KPI, AC và kịch bản UAT.

UX/UI

1

Thiết kế luồng, design system và giao diện; bàn giao đủ trạng thái và kiểm tra thiết kế.

FE

1

Xây giao diện, biểu mẫu, editor, board, dashboard; tích hợp API và xử lý trạng thái lỗi.

BE

1

Database, API, tenant/RBAC, jobs, CMS, tracking, analytics và triển khai.

AI

1

RAG, research, scoring, strategy, content, SEO, analyst và learning; schema và bộ đánh giá.

Tester 1

1

Kiểm thử UI, nghiệp vụ, E2E, hồi quy và UAT; lưu bằng chứng theo AC.

Tester 2

1

Kiểm thử API, dữ liệu, quyền, jobs, tích hợp và đối chiếu chất lượng AI.

PO là người đại diện sản phẩm quyết định ưu tiên và nghiệm thu; không tính là một lập trình viên bổ sung. PM riêng giúp BA giữ đủ thời gian phân tích và UAT.



2 Nguồn lực và cách PM điều phối

Mỗi module dùng chung 1 FE và 1 BE của đội; không có 16 FE hoặc 16 BE. AI phụ trách xử lý AI; BE đóng gói API, dữ liệu và jobs. BA, UX/UI và hai Tester tham gia xuyên suốt theo trách nhiệm ở mục 1.

Năng lực dự kiến

Giả định 5 ngày làm việc mỗi tuần, toàn thời gian: mỗi người có 20 ngày danh nghĩa. Dành 5 ngày cho review, tích hợp, sửa lỗi và bàn giao, còn tối đa 15 ngày tính năng/người. Đội 7 người có 105 ngày tính năng tham chiếu; PM có 20 ngày điều phối riêng. FE, BE và AI là các nút thắt, không được cộng ngày của QA hoặc BA để bù năng lực lập trình.

Ngày 1–2: mỗi chuyên môn ước lượng phần việc của mình theo module, cộng riêng FE/BE/AI, kiểm tra chuỗi phụ thuộc và quyền tích hợp. Nếu một vai trò vượt 15 ngày tính năng, PO/PM phải giảm độ sâu trong cả 16 module, bổ sung năng lực phù hợp hoặc đổi mốc. Không giải quyết quá tải bằng cách bỏ kiểm thử.

Quy tắc giao việc

PM tạo backlog 16 epic M01–M16 và một epic nền tảng. Mỗi story có owner, reviewer, effort, AC, phụ thuộc và ngày bàn giao. FE/BE chỉ giữ một tính năng chính đang làm và một luồng sửa lỗi; không giao nhiều module lớn cùng lúc. AI xử lý tuần tự các pipeline, dùng chung context, schema và logging.

BA và UX/UI chuẩn bị trước theo lô 1–2 ngày. FE dùng mock theo API contract đã chốt; story chỉ hoàn tất khi thay mock bằng API và kiểm thử tích hợp. QA viết test trước khi code bàn giao và kiểm thử từng lát chức năng mỗi ngày.

Tuần

Luồng tập trung

Mốc kiểm tra

1

M01–M03; nền tảng, tracking và quyền kết nối

Workspace, knowledge, goal chạy thật; chốt contract 16 module.

2

M04–M08; lát SEO cơ bản M09

Research đến draft có nguồn và liên kết dữ liệu.

3

M09–M13; dữ liệu đầu vào cho M14–M16

Duyệt → đăng CMS → UTM → dashboard chạy thật.

4

M14–M16; hồi quy M01–M13

Báo cáo, thử nghiệm, learning; UAT và phát hành pilot.

Điều kiện đầu vào

Có tài khoản LLM/embeddings, staging, kho mã và ngân sách API; một CMS có quyền đăng bài; quyền GA4/GSC và dữ liệu lịch sử hoặc khả năng bật tracking từ tuần 1. Chốt một bộ dữ liệu pilot và người nghiệm thu. BA kiêm PM chỉ là phương án thay thế: cần tính lại capacity và giảm phạm vi tương ứng.



3 Phạm vi module nền tảng và nghiên cứu

M01 Workspace  T1

Onboarding doanh nghiệp, brand voice, audience, ngôn ngữ, sản phẩm; workspace và vai trò Owner, Editor, Viewer. Tenant isolation là nền tảng dùng chung.

BE: auth, bảng workspace, RBAC và audit. FE: login, chuyển workspace, hồ sơ và thành viên. AI: chuẩn hóa business context, gợi ý Growth Map để người dùng duyệt.

Phụ thuộc: Nền tảng auth và database. Nghiệm thu: Tạo/sửa hồ sơ được lưu; Viewer không sửa; người của workspace A không đọc dữ liệu B.

M02 Business Knowledge Base  T1

Nạp text, PDF có lớp văn bản và URL được phép; duyệt nguồn, trạng thái xử lý, version và xóa nguồn; truy xuất có dẫn nguồn.

BE: storage, source APIs và ingestion job. FE: upload, danh sách, duyệt và xem nguồn. AI: extract, chunk, vector index, RAG theo workspace.

Phụ thuộc: M01; storage, embeddings. Nghiệm thu: Câu trả lời chỉ dùng nguồn hợp lệ; thiếu facts thì báo thiếu; xóa nguồn khiến nguồn không còn được truy xuất. OCR và media extraction để sau.

M03 Growth Goal Manager  T1

Mục tiêu, baseline, KPI, kỳ hạn, audience, conversion, budget và kênh; liên kết mục tiêu với các hành động.

BE: goal/KPI schema, validation. FE: goal form và progress. AI: chuyển mục tiêu thành objective/KPI đề xuất, chờ xác nhận.

Phụ thuộc: M01; định nghĩa metric do BA chốt. Nghiệm thu: Lưu và mở lại đúng mục tiêu; baseline thiếu không hiển thị tăng trưởng phần trăm; tiến độ dùng metric đã chọn.

M04 Market Intelligence Engine  T2

Chạy research theo yêu cầu từ một nguồn tìm kiếm/API được chọn và URL công khai được phép; lưu title, URL, thời gian, evidence và loại tín hiệu.

BE: research jobs, trạng thái, timeout và quota. FE: tạo run, xem tiến độ và nguồn. AI: tìm, tóm tắt, phân loại, loại trùng.

Phụ thuộc: M01–M03; quyền nguồn nghiên cứu. Nghiệm thu: Run trả tín hiệu kèm nguồn; lỗi provider có trạng thái rõ; không giả số liệu demand. Social listening đa nền tảng để sau.

Phân công chung: BA viết story và AC; UX/UI thiết kế; Tester 1 kiểm tra luồng giao diện/nghiệp vụ; Tester 2 kiểm tra API, dữ liệu, quyền và cùng AI đánh giá đầu ra. Mỗi module dùng 1 FE và 1 BE chung của đội.



4 Phạm vi module cơ hội chiến lược và nội dung

M05 Opportunity Engine  T2

Board cơ hội, keyword/topic, intent, relevance, freshness, business value và priority; rubric chấm điểm được công khai.

BE: lưu cơ hội, score components, filter và liên kết goal. FE: board/detail, lọc, chọn cơ hội. AI: chấm theo rubric, giải thích và đánh dấu dữ liệu thiếu.

Phụ thuộc: M03–M04. Nghiệm thu: Điểm tính lại đúng rubric; chọn cơ hội sang chiến lược/brief giữ được ID và nguồn. Điểm heuristic không được gắn nhãn search volume thực.

M06 Growth Strategy Engine  T2

Kế hoạch 30 ngày được đề xuất từ goal và cơ hội; action có owner, effort, deadline, channel, KPI; người dùng duyệt trước áp dụng.

BE: strategy version, action APIs. FE: xem/sửa/duyệt kế hoạch và task list. AI: đề xuất kế hoạch theo budget và effort.

Phụ thuộc: M03, M05. Nghiệm thu: Kế hoạch duyệt tạo task liên kết goal/opportunity; thay đổi được lưu phiên bản. Không tự thực thi các tác vụ chưa duyệt.

M07 Content Intelligence Engine  T2

Brief gồm keyword, intent, audience, angle, unique value, facts, nguồn, CTA, destination, format và channel.

BE: brief APIs và source bindings. FE: tạo/sửa brief từ opportunity. AI: đề xuất format và brief từ context đã duyệt.

Phụ thuộc: M02, M05–M06. Nghiệm thu: Brief không mất nguồn và CTA; người dùng sửa rồi duyệt trước khi sinh nội dung; facts chưa xác minh được gắn cờ.

M08 AI Content Factory  T2

Sinh bài SEO, FAQ, metadata, social draft và một biến thể từ bài nguồn; editor và version. Duyệt nội dung dùng chung với M10.

BE: content/variant/version APIs và generation job. FE: editor, lưu, lịch sử, regenerate. AI: sinh có nguồn và brand rules; kiểm tra claims.

Phụ thuộc: M02, M07; job framework. Nghiệm thu: Có thể sinh/sửa/lưu/khôi phục draft; sửa bản đã duyệt phải duyệt lại. Video chỉ là script, hình chỉ là prompt; không bàn giao media generation.

Phân công chung: BA viết story và AC; UX/UI thiết kế; Tester 1 kiểm tra luồng giao diện/nghiệp vụ; Tester 2 kiểm tra API, dữ liệu, quyền và cùng AI đánh giá đầu ra. Mỗi module dùng 1 FE và 1 BE chung của đội.



5 Phạm vi module SEO phân phối và traffic

M09 SEO Intelligence Engine  T2–T3

Keyword và cluster cơ bản; kiểm tra title/meta/headings; gợi ý internal links, phát hiện link hỏng trong tập URL nhỏ; một template local page; refresh từ dữ liệu sẵn có.

BE: keyword/audit/page records và job giới hạn URL. FE: keyword list, audit và áp dụng gợi ý vào draft. AI: cluster, SEO suggestions, local draft và refresh.

Phụ thuộc: M07–M08; M13 cấp metric cho refresh. Nghiệm thu: Audit tìm đúng lỗi trong mẫu; link nội bộ thuộc website; local draft có unique data; refresh lưu phiên bản. Không build crawler lớn hoặc rank tracker riêng.

M10 Distribution Engine  T3

Duyệt/reject/resubmit; lịch và publish qua một CMS; lưu URL, trạng thái, lỗi, retry. Kênh khác xuất draft theo format; chưa coi là đăng tự động.

BE: approval state machine, scheduler, CMS adapter và idempotency. FE: review queue, calendar, publish result. AI: kiểm tra format trước gửi duyệt.

Phụ thuộc: M08–M09; quyền CMS kiểm tra từ T1. Nghiệm thu: Chỉ phiên bản được duyệt mới đăng; retry không đăng trùng; sửa nội dung hủy hiệu lực duyệt. Hỗ trợ một timezone của pilot, lưu thời gian UTC.

M11 Community Growth Engine  T3

Intent Radar từ URL/nội dung cộng đồng do người dùng nhập hoặc nguồn được phép; chấm intent, sinh response, duyệt và ghi nhận link đăng thủ công.

BE: conversation/response/status APIs. FE: radar, review và handoff. AI: phân loại intent, gợi ý câu trả lời hữu ích có nguồn.

Phụ thuộc: M02, M05, M08; dùng duyệt M10. Nghiệm thu: Nhập conversation → response → approve → ghi nhận link chạy được; không tự đăng bình luận hàng loạt. Phát hiện tự động đa cộng đồng để sau.

M12 Traffic Engine  T3

Tạo và quản lý UTM theo campaign/content/channel; theo dõi nguồn click và conversion trong website pilot; tổng hợp đóng góp kênh cơ bản.

BE: UTM builder, event mapping và aggregation. FE: campaign links, bảng nguồn traffic. AI: gợi ý kênh từ brief, chưa tự phân bổ ngân sách.

Phụ thuộc: M03, M10; tracking đặt từ T1, metric từ M13. Nghiệm thu: URL có UTM đúng; click/conversion thử nghiệm nối được campaign/content. Chốt attribution đơn giản theo dữ liệu; không gọi là multi-touch.

Phân công chung: BA viết story và AC; UX/UI thiết kế; Tester 1 kiểm tra luồng giao diện/nghiệp vụ; Tester 2 kiểm tra API, dữ liệu, quyền và cùng AI đánh giá đầu ra. Mỗi module dùng 1 FE và 1 BE chung của đội.



6 Phạm vi module đo lường phân tích và học hỏi

M13 Analytics Engine  T1–T3

Bật event từ T1; đến T3 có GA4/GSC connector giới hạn và dashboard date range, traffic, click, CTR, conversion, sync status.

BE: OAuth/token handling, sync và metric API. FE: kết nối, filter, dashboard. AI: chuẩn hóa metric schema cho analyst.

Phụ thuộc: M01, M03, M12; quyền GA4/GSC. Nghiệm thu: Số liệu mẫu đối chiếu nguồn khớp; zero khác missing; hiển thị thời gian sync và độ trễ. CRM/social analytics và revenue attribution nâng cao để sau.

M14 AI Growth Analyst  T4

Growth Brief theo yêu cầu: so sánh hai kỳ, chỉ rõ metric, nguồn, điểm mạnh/yếu và recommended actions; tạo task sau khi duyệt.

BE: snapshot/report APIs. FE: report và action review. AI: dùng metric đã tính, tạo nhận xét có evidence và nêu thiếu dữ liệu.

Phụ thuộc: M03, M06, M13. Nghiệm thu: Số và phần trăm khớp snapshot; baseline bằng 0 không chia sai; thiếu dữ liệu không suy ra tăng trưởng. Lịch daily job mở rộng sau pilot.

M15 Experiment Engine  T4

Đăng ký giả thuyết và hai biến thể title/CTA; primary metric, thời gian, phương pháp phân nhóm và trạng thái; ghi exposure/conversion trên một trang pilot.

BE: assignment ổn định, experiment events và result API. FE: setup, kết quả theo biến thể. AI: đề xuất giả thuyết; giải thích kết quả có giới hạn.

Phụ thuộc: M08, M10, M12–M13; website cho phép gắn tracking. Nghiệm thu: Một visitor giữ cùng biến thể; events không đếm trùng; đủ trace assignment → exposure → outcome. Mẫu nhỏ chỉ báo chưa đủ bằng chứng, không tuyên bố winner.

M16 Learning Engine  T4

Lưu đặc trưng content, channel, performance và experiment outcome; luật đơn giản xếp hạng topic/format, đề xuất cập nhật strategy có người duyệt.

BE: performance snapshot, learning records và liên kết task. FE: learning insights, evidence và duyệt đề xuất. AI: rút nhận xét theo rules; ghi phiên bản đề xuất.

Phụ thuộc: M06, M08, M13–M15. Nghiệm thu: Insight truy ngược được content/metric; chỉ sau duyệt mới cập nhật strategy. Dữ liệu ít thì báo chưa đủ, không khẳng định nhân quả hoặc tự huấn luyện model.

Phân công chung: BA viết story và AC; UX/UI thiết kế; Tester 1 kiểm tra luồng giao diện/nghiệp vụ; Tester 2 kiểm tra API, dữ liệu, quyền và cùng AI đánh giá đầu ra. Mỗi module dùng 1 FE và 1 BE chung của đội.



7 Tuần 1 Chốt phạm vi và xây nền tảng

Trọng tâm: M01–M03; hạ tầng và chuẩn bị M04–M16

Vị trí

Nhiệm vụ cụ thể

Đầu ra cuối tuần

PM

Ngày 1–2 chốt 16 epic, estimate theo vai trò, đường phụ thuộc và quyền CMS/GA4/GSC. Ngày 3–5 xử lý blocker, kiểm tra API contract, demo nền tảng; khóa độ sâu pilot.

Backlog có owner, thời hạn và AC; bảng tiến độ/rủi ro.

BA

Viết chi tiết M01–M03 và định nghĩa KPI, baseline, conversion, vai trò; soạn AC sơ bộ đủ M04–M16. Chuẩn bị story M04–M09 trước ngày 5; xác định dữ liệu test và UAT.

Story và AC M01–M03; yêu cầu tuần 2.

UX/UI

Hoàn tất sitemap, design system, onboarding, knowledge và goal; bàn giao loading/empty/error/permission. Chuẩn bị wireframe board, brief và editor cho tuần 2.

Prototype M01–M03, design system và wireframe tuần 2.

FE

Khởi tạo app, layout và component dùng chung; làm login/workspace, onboarding, knowledge upload và goal form. Tích hợp API M01–M03; đặt tracking skeleton trên website pilot.

UI M01–M03 tích hợp API và lưu dữ liệu thật.

BE

Khởi tạo DB, migration, tenant/RBAC, storage, queue, audit và staging/CI. Làm APIs M01–M03; probe quyền CMS và GA4/GSC; bật event collection tối thiểu, chốt job contracts với AI.

DB/API M01–M03; jobs; kết quả kiểm tra quyền tích hợp.

AI

Xây adapter LLM, schema validation, context và cost logging; ingestion PDF/text/URL, RAG có dẫn nguồn. Chuẩn hóa goal/context; chốt evaluation set và contract research/content.

Knowledge/RAG có nguồn; bộ eval ban đầu.

Tester 1

Lập traceability 16 module; viết test onboarding, upload, source review, goal và role UI. Kiểm thử lát đã tích hợp mỗi ngày; chuẩn bị E2E research → content.

Test case và kết quả nghiệp vụ M01–M03.

Tester 2

Tạo fixtures hai workspace; test tenant/RBAC, file/source lifecycle và vector filtering. Đối chiếu event thử; cùng AI kiểm tra missing facts, prompt injection và nguồn bị xóa.

Báo cáo API, quyền dữ liệu và đánh giá RAG.

Nhịp bàn giao và cổng nghiệm thu

Ngày 1–2 chốt phạm vi/estimate; ngày 3–4 tích hợp M01–M03; ngày 5 QA và demo. Gate: tạo workspace → nạp và duyệt nguồn → lưu goal → truy xuất có nguồn trên staging; các kiểm tra truy cập chéo workspace phải đạt.



8 Tuần 2 Xây luồng research đến nội dung

Trọng tâm: M04–M08; phần SEO cơ bản M09

Vị trí

Nhiệm vụ cụ thể

Đầu ra cuối tuần

PM

Sắp hàng research → opportunity → strategy → brief → content, theo dõi WIP FE/BE/AI mỗi ngày. Review giữa kỳ vào ngày 10, xác nhận còn đủ năng lực cho publish, analytics và M14–M16.

Demo luồng nội dung; cập nhật forecast tuần 3–4.

BA

Chốt rubric score, strategy action fields, brief và content lifecycle. Viết AC M09–M13 và transition duyệt; xác nhận phạm vi CMS, tracking, timezone và handoff community.

Story/AC M04–M08; đặc tả SEO, duyệt, publish và tracking.

UX/UI

Bàn giao research run, opportunity board, strategy/task list, brief và editor. Chuẩn bị review queue, calendar, SEO audit, intent radar và dashboard cho tuần 3.

Thiết kế M04–M08; màn tuần 3 sẵn sàng.

FE

Dùng list/detail/form chung để làm research status, opportunity board và plan review. Tích hợp brief/editor, generation progress, content version; thêm trường title/meta/headings cơ bản.

Research → strategy → brief → draft tích hợp API.

BE

Triển khai research jobs, opportunity/strategy/action/brief/content APIs, relations và versions. Dùng queue chung cho AI; xử lý timeout/retry/quota và concurrent edit; tiếp tục analytics ingestion nền.

API/jobs M04–M08; quan hệ goal và nguồn đầy đủ.

AI

Làm research có evidence, opportunity scoring, strategy theo effort, brief từ facts và generation article/FAQ/social variant. SEO check cơ bản dùng rule trước, LLM gợi ý sau; chạy eval mỗi pipeline.

Pipeline research/content và kết quả eval từng bước.

Tester 1

Kiểm thử research → board → duyệt plan → brief → draft, filter và autosave/version. Test lỗi/empty/cancel theo phần hỗ trợ; giữ test hồi quy M01–M03.

Báo cáo E2E M04–M08; hồi quy nền tảng.

Tester 2

Kiểm tra schema, score components, job timeout/provider errors, tenant và concurrency. Đánh giá factuality/brand rules, source grounding; kiểm tra chi phí và trạng thái job thất bại.

Báo cáo API/jobs và chất lượng nội dung AI.

Nhịp bàn giao và cổng nghiệm thu

Ngày 6–7 research/opportunity; ngày 8 strategy/brief; ngày 9 content/SEO cơ bản; ngày 10 tích hợp và demo. Gate: một opportunity tạo được brief và draft có nguồn, CTA và version; các số liệu không có nguồn được để thiếu.



9 Tuần 3 Đăng nội dung và đo lường

Trọng tâm: Hoàn thiện M09; M10–M13; chuẩn bị M14–M16

Vị trí

Nhiệm vụ cụ thể

Đầu ra cuối tuần

PM

Ưu tiên approval/CMS là đường găng; đảm bảo tracking trước bài đăng đầu tiên. Khóa chức năng mới M01–M13 vào ngày 15; review readiness của experiment widget và metric snapshots.

Demo publish/dashboard; lỗi và backlog tuần 4.

BA

Chốt rubric SEO, local template, luật refresh; UTM, attribution và metric mapping. Viết AC chi tiết M14–M16, kịch bản report thiếu dữ liệu và experiment chưa đủ mẫu; chuẩn bị UAT.

Đặc tả M09–M13; AC M14–M16 và UAT.

UX/UI

Hoàn thiện SEO audit, calendar, review queue, intent radar và dashboard; kiểm tra lỗi publish/sync. Bàn giao màn report, experiment form/result và learning insights trước ngày 15.

Thiết kế M09–M16; danh sách lỗi design QA.

FE

Tích hợp SEO suggestions/local draft, approve/reject/resubmit, calendar/publish result. Xây radar và handoff; dùng bảng/dashboard chung cho UTM, traffic, analytics; chuẩn bị widget hai biến thể.

UI SEO, approval, CMS, radar, UTM và analytics.

BE

Làm CMS adapter/scheduler/idempotency và approval/version audit. Triển khai community records, UTM mapping, analytics sync/API; chuẩn bị snapshot và assignment schema cho M14–M16.

CMS publish thật; tracking và metric API có dữ liệu nguồn.

AI

Hoàn thiện cluster/link/SEO/refresh; local draft có dữ liệu riêng. Làm community intent/response và channel adaptation; chuẩn hóa metric input, prototype report/learning trên snapshot test có nhãn.

SEO/community có evidence; metric schema cho analyst.

Tester 1

E2E draft → reject → sửa → approve → publish → xem URL/dashboard. Test calendar, radar/handoff, filters, sync states; test content sửa sau duyệt phải được duyệt lại.

E2E M09–M13; hồi quy nội dung và duyệt.

Tester 2

Test duplicate publish, timeout, restart, token revoke và quyền reviewer. Đối chiếu GA4/GSC, UTM và conversion; kiểm tra zero/missing/timezone và rule refresh/link trên fixtures.

Báo cáo CMS/analytics; đối chiếu metric và quyền.

Nhịp bàn giao và cổng nghiệm thu

Ngày 11 SEO/approval; ngày 12 CMS; ngày 13 community/UTM; ngày 14 analytics; ngày 15 regression/demo. Gate: một nội dung duyệt được đăng lên CMS thật, có URL và tracking; dashboard đối chiếu được metric nguồn. Handoff kênh ngoài có nhãn thủ công.



10 Tuần 4 Khép vòng growth và bàn giao

Trọng tâm: M14–M16; UAT và hồi quy toàn bộ 16 module

Vị trí

Nhiệm vụ cụ thể

Đầu ra cuối tuần

PM

Ngày 16–18 điều phối hoàn tất analyst/experiment/learning; đóng feature ngày 18. Ngày 19 UAT/triage; ngày 20 go/no-go với PO, phát hành giới hạn và bàn giao owner/rollback.

Biên bản nghiệm thu; release decision; owner vận hành.

BA

Đối chiếu 16 module với AC và evidence; điều phối UAT vòng goal → learning. Kiểm tra metric definitions, giới hạn pilot, manual handoff và hướng dẫn sử dụng; chốt backlog mở rộng.

UAT checklist/evidence; hướng dẫn và backlog mở rộng.

UX/UI

Kiểm tra thiết kế report/experiment/learning và toàn bộ luồng chính; sửa vấn đề usability ưu tiên cao. Bàn giao design system, màn hình và hướng dẫn cho người dùng pilot.

Design QA cuối; design system được cập nhật.

FE

Hoàn thiện report/actions, experiment setup/result và learning review. Tích hợp widget assignment/exposure; sửa lỗi E2E, production build/config và smoke bản phát hành.

UI đủ 16 module; production build và smoke.

BE

Hoàn thiện report snapshots, stable assignment/events, result và learning APIs; strategy update sau duyệt. Sửa lỗi quyền/jobs; thử migration, backup/restore, monitoring, deploy và rollback.

API M14–M16; deploy và runbook restore/rollback.

AI

Hoàn thiện report theo snapshot, experiment hypothesis và learning rules. Chạy bộ eval cuối, khóa prompt/schema/model config; kiểm tra số liệu, evidence, thiếu mẫu và giới hạn cost/timeout.

Analyst/learning có evidence; báo cáo eval cuối.

Tester 1

Chạy E2E và UAT cả 16 module; xác minh report → tạo action và insight → duyệt → update strategy. Retest lỗi, regression giao diện và smoke môi trường phát hành.

Test report toàn hệ thống và evidence UAT.

Tester 2

Hồi quy API/tenant/RBAC/CMS/analytics; kiểm tra assignment ổn định, dedup events và AI numeric consistency. Xác minh secrets, retry, restore và evidence release; đối chiếu dữ liệu test với dữ liệu thật.

Báo cáo kỹ thuật và kết quả release checks.

Nhịp bàn giao và cổng nghiệm thu

Ngày 16 report; ngày 17 experiment; ngày 18 learning và freeze; ngày 19 UAT; ngày 20 release pilot. Gate: chạy đủ vòng khép kín, không còn blocker/critical, có bằng chứng từng AC và runbook. Mẫu thử nghiệm ít không cản nghiệm thu chức năng nhưng chưa chứng minh hiệu quả growth.



11 Tiêu chí hoàn tất và quyết định phát hành

Chất lượng chung của mỗi module

Story chỉ Done khi code đã review, API/FE tích hợp trên staging, AC đạt, QA có evidence và đủ loading/empty/error/permission states. Có audit/version khi cần, không lộ secrets; tài liệu API và hướng dẫn được cập nhật. Mock hoặc dữ liệu mẫu không được coi là tích hợp dịch vụ thật.

Các kiểm tra bắt buộc: truy cập chéo tenant bị chặn; nguồn xóa không còn vào RAG; sửa sau duyệt phải duyệt lại; publish retry không trùng; event không đếm trùng; metric zero/missing phân biệt; report không bịa số; mọi đề xuất learning thay đổi strategy cần được duyệt.

Kiểm định AI và dữ liệu

AI và Tester 2 chốt một bộ tối thiểu 30 ca trong tuần 1 gồm retrieval/facts, nội dung, scoring và báo cáo; bổ sung ca từ M15–M16 khi contract chốt. Đề xuất gate: 100% ca critical đạt, ít nhất 90% ca facts/retrieval chuẩn đạt; số trong report mẫu khớp input. BA/PO xác nhận rubric, không dùng AI tự chấm làm bằng chứng duy nhất.

PM chốt ngân sách/token/timeout theo từng job và tải pilot trong ngày 2; QA đo theo mức đã chốt. Dùng dữ liệu mẫu để test edge cases, có nhãn rõ. Nghiệm thu analytics connector cần dữ liệu nguồn thật; có event thật hoặc dữ liệu lịch sử được cấp quyền, không lấy bảng mẫu thay cho kết nối.

Rủi ro và cách xử lý

Rủi ro

Owner

Hành động

FE/BE/AI vượt capacity

PM

Ước lượng ngày 2 và review ngày 10; giảm độ sâu hoặc điều chỉnh nguồn lực/mốc.

CMS/OAuth chưa có quyền

BE + PM

Kiểm tra T1; PO quyết định đổi connector hoặc ghi chưa đạt gate tích hợp.

Analytics trễ hoặc chưa đủ mẫu

BA + BE

Bật T1; dùng lịch sử hợp lệ; hiển thị thiếu dữ liệu, không bịa kết luận.

Chất lượng AI thấp

AI + Tester 2

Giới hạn format, yêu cầu nguồn và duyệt; chặn publish khi critical case thất bại.

Lỗi release hoặc dữ liệu

BE + QA

Backup/restore đã thử; rollout pilot; rollback theo runbook.

Phạm vi mở rộng và bàn giao

Sau pilot: mở rộng social publishing, nhiều CMS, OCR/media, keyword/rank data trả phí, crawling lớn, tự động discovery cộng đồng, multi-touch attribution, experiment thống kê nâng cao và learning tự động. Billing, AI credits, notifications và agent orchestration là hạng mục nền tảng hỗ trợ, không đổi danh mục 16 module; pilot chỉ có quota/cost logging, task status và audit cần thiết, chưa gồm thanh toán production hay hệ đa agent độc lập.

Bàn giao: backlog/AC đủ 16 module, design, source/config mẫu, migration/API/schema, prompt/eval, test report và UAT evidence, support matrix tích hợp/thủ công, runbook deploy/rollback/restore, known issues và owner vận hành. PO nghiệm thu chức năng; PM quyết định release cùng PO dựa trên QA evidence. Traffic hoặc revenue tăng không phải cam kết nghiệm thu trong 4 tuần.