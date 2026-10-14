# Xây đội marketing AI sáu agent

**AI GROWTH OS cần chuyển sang một đội marketing gồm sáu agent, dùng chung dữ liệu nội dung và thể hiện công việc, đầu ra, kết quả trên một dashboard.** Pilot tiếp tục dùng TripC; kênh đầu tiên là website, Facebook/Instagram và quảng cáo Meta theo lựa chọn của người dùng. SEO và Content Marketing là hai chuyên môn riêng; Performance Marketing là năng lực mới cần xây. Giữ Python/TypeScript và nền tảng hiện có, tổ chức lại theo chiến dịch và công việc của đội marketing. **Chưa xem được video TikTok do trình duyệt không khả dụng và công cụ web không đọc được nội dung video; kế hoạch này dựa trên yêu cầu người dùng và các nguồn đã xác minh, không diễn giải nội dung video.** Báo cáo ngày 09/10/2026 là kế hoạch sửa dự án; chưa kết nối tài khoản, đăng bài hoặc chi tiền quảng cáo.

## Sáu chuyên môn cùng chịu trách nhiệm cho một chiến dịch

Người dùng đã nêu năm chuyên môn và yêu cầu tổng sáu agent. **Agent thứ sáu được đề xuất là Growth Lead & Analyst**, chịu trách nhiệm lập kế hoạch, phân việc, đo kết quả và đưa learning vào vòng tiếp theo. Bộ điều phối workflow là code hạ tầng, không thêm một agent sản phẩm thứ bảy. Mỗi vai trò phải có pipeline, schema đầu ra, công cụ được phép và bộ đánh giá riêng; sáu tên trên dashboard chưa chứng minh hệ multi-agent hoạt động.

| Agent | Mục tiêu và đầu vào | Đầu ra lưu chung | KPI và bàn giao |
| --- | --- | --- | --- |
| **Research & Trend** | Tìm nhu cầu và trend phù hợp sản phẩm, khách hàng, thị trường; đọc web và nội dung đã làm | Research brief, URL/thời gian nguồn, insight, ý tưởng và lý do phù hợp | Tỷ lệ ý tưởng có bằng chứng/được chọn; giao cho Lead, SEO, Content; nhận tín hiệu từ Community |
| **SEO Worker** | Tạo blog/FAQ đáp ứng search intent; dùng brief, kiến thức đã duyệt và inventory | Bài có nguồn, title/meta, internal links, phiên bản và bản ghi xuất bản website | Organic traffic, query/click và form từ nội dung; bàn giao duyệt/xuất bản, cho Content tái sử dụng |
| **Content Marketing** | Quảng bá sản phẩm bằng nội dung theo Facebook/Instagram; dùng chiến dịch, brand và assets | Caption, hook, CTA, concept/ảnh/video hoặc script được ghi rõ, creative variants, lịch đăng | Kết quả từng post/creative và chuyển đổi có tracking; bàn giao publisher và Performance |
| **Performance Marketing** | Đề xuất bài, giờ, định dạng, audience và ngân sách thử nghiệm từ dữ liệu Meta và creatives đã duyệt | Kế hoạch ads, giả thuyết ảnh/video, dự kiến chi, báo cáo chi thực/CPL/CPA; ROAS khi đủ doanh thu | Chi tiêu, chuyển đổi, CPA và chất lượng thử nghiệm; trình duyệt, trả insight cho Content/Lead |
| **Community** | Trả lời câu hỏi bằng thông tin doanh nghiệp đã duyệt và nội dung đã xuất bản | Reply có nguồn, trạng thái chờ duyệt/escalation, external reply ID nếu đăng được | Độ đúng có nguồn, thời gian phản hồi, câu hỏi còn tồn; gửi nhu cầu mới về Research |
| **Growth Lead & Analyst** | Gắn mục tiêu doanh nghiệp với công việc năm agent và số liệu thật | Campaign brief, task graph, ưu tiên, báo cáo, learning và đề xuất vòng tiếp theo | Traffic/leads phù hợp mục tiêu, kết quả chiến dịch; phân việc, trình người phụ trách duyệt chiến lược |

SEO “thân thiện với AI” cần nội dung hữu ích, facts có nguồn, cấu trúc rõ và website crawl/index được. Google khẳng định SEO nền tảng vẫn phù hợp với tìm kiếm AI, không yêu cầu markup đặc biệt; vì vậy không cam kết được AI trích dẫn chỉ nhờ schema hoặc số bài. ([Google: AI optimization](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)) Content Marketing có thể chuyển một blog thành post hoặc video qua liên kết nội dung gốc, nhưng mục tiêu, format và creative vẫn được quản lý riêng. Research phải thêm giá trị phù hợp doanh nghiệp, tránh chỉ viết lại nguồn; Google nhấn mạnh nội dung nguyên bản và có ích. ([Google: helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content))

## Mọi worker biết nội dung đã tạo qua dữ liệu bền vững

Luồng chính đề xuất: **Hồ sơ + mục tiêu → Research → Lead chọn chiến dịch/giao việc → SEO và Content tạo đầu ra → kiểm tra → người duyệt → executor xuất bản → thu metrics → Performance/Lead phân tích → learning → nhiệm vụ tiếp theo.** Community dùng kho nguồn và nội dung xuất bản xuyên suốt. Đầu ra của agent trước được bàn giao bằng ID, phiên bản và schema cho agent sau, thay vì chỉ gửi lời nhắn tự do.

**Content Ledger trong PostgreSQL là nguồn sự thật.** Mỗi nội dung có `workspace_id`, `campaign_id`, `content_id`, `content_version_id`, agent/run tạo, chủ đề/intent/audience, nguồn và phiên bản facts, asset refs, `parent_content_id` cho biến thể, trạng thái, approval theo hash/phiên bản, lịch/timezone, URL/platform post ID và metric snapshot refs. Trước khi tạo bài, worker đọc inventory, xem bài đã có và giữ chỗ brief/chủ đề; sau khi tạo, lưu phiên bản rồi phát event cập nhật dashboard. Index pgvector hỗ trợ tìm tương tự và internal links; không thay database trạng thái hoặc số liệu.

Workflow typed trong API/worker TypeScript sở hữu quyền, dependencies, retries, lịch và chờ duyệt; AI Python trả kết quả có cấu trúc cho sáu vai trò. Tái sử dụng queue hiện có, bổ sung workflow steps, input snapshots, transactional outbox và HTTP adapter AI thật. Operation đăng bài, ghi form, đồng bộ metrics là handler nghiệp vụ riêng. Retry giữ identity theo hành động/phiên bản; timeout có kết quả chưa rõ phải đối chiếu platform trước khi gửi lại. Job `completed` nghĩa là đã lưu kết quả, khác trạng thái nghiệp vụ `published`.

**Sáu agent logic không cần sáu model chạy cùng lúc.** Baseline local giới hạn một LLM job; task đọc/fetch độc lập có thể song song theo hạn mức provider. Mỗi run có hạn mức calls, thời gian và chi phí; không tạo vòng hội thoại agent vô hạn. Đây là thiết kế đề xuất, cần benchmark sau khi có pipeline thật. ([Giới hạn pilot hiện tại](../docs/coordination/PILOT_LIMITS.md))

Dashboard duy nhất mở theo chiến dịch/kỳ, có sáu thẻ agent với task/output/lỗi; inventory nội dung với owner/nguồn/phiên bản/URL; approval inbox; lịch blog/social/ads; KPI theo organic/paid/community; bảng dự kiến và chi thực; research signals; community queue; connector health và thời điểm sync. Tất cả đọc API/DB đã lưu. Kết quả demo, dữ liệu thật, chưa kết nối và thiếu mẫu phải có nhãn; không hiển thị số 0 thay thiếu dữ liệu. Người dùng mở một bài phải truy được từ brief → agent run → phiên bản duyệt → bài đăng → metrics.

## MCP kết nối công cụ, quyền vẫn do server kiểm soát

Discovery trong phiên tìm thấy Exa, Metricool và Supermetrics cùng các ứng viên khác nhưng **đều chưa cài**; mô tả catalog chưa chứng minh tài khoản TripC có quyền hoặc connector đáp ứng mọi format. Plugin trong cuộc hội thoại cũng không tự trở thành integration SaaS. MCP cung cấp tool schemas và authorization; database, queue, credentials theo tenant và audit vẫn phải xây trong sản phẩm. ([MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization))

| Kết nối ưu tiên | Cách triển khai đề xuất | Điều kiện nghiệm thu |
| --- | --- | --- |
| Internal knowledge/content/CMS | MCP nội bộ gọi business service hiện có; tách read, draft và publish | Tenant isolation, nguồn hợp lệ, đúng phiên bản duyệt, retry không đăng trùng |
| Web research | Chọn một search/fetch provider có API/MCP; kiểm chi phí và điều khoản | Brief truy về URL/thời gian, xử lý lỗi và nguồn bị thu hồi |
| GA4/GSC | GA4 MCP chính thức read-only; GSC adapter đọc qua API | Quyền property, dữ liệu thật, snapshot và sync timestamp |
| Facebook/Instagram | Wrapper MCP trên API chính thức hoặc vendor sau khi kiểm schema | Đúng account/login flow/scopes; thử đăng được external ID/URL và đối chiếu |
| Meta Ads | Read insights trước; tools proposal/create/update/activate tách riêng | Quyền ad account, approval/budget controls, kiểm chi thực và audit |

Google Analytics MCP chính thức chỉ đọc, không sửa cấu hình; GSC vẫn cần quyền property. ([GA4 MCP](https://developers.google.com/analytics/devguides/MCP), [GSC authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)) Meta hỗ trợ campaign/adset/ads và insights; tài khoản khách hàng cần kiểm access level và quyền phù hợp. Instagram có các login flow khác nhau; không lấy scope của flow này dùng cho flow khác. ([Meta Marketing API](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi), [Meta Instagram API](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00)) App Review, account prerequisites và format phải là integration spike có bằng chứng, chưa cam kết ngày hoàn thành.

Performance chưa có dữ liệu phải trả `insufficient_data`, đề xuất thử nghiệm và khoảng ngân sách có lý do; không bịa giờ tối ưu, CPC hay ảnh/video thắng. **Chi tiền chỉ thực hiện khi được duyệt đúng account, creative/phiên bản, targeting, số tiền/currency và thời hạn, hoặc trong envelope đã được cấp trước.** Server kiểm caps, reservation, expiry và kill switch trước mutation; số chi thực và dữ liệu trễ được theo dõi riêng. Pilot trước mắt read/propose; yêu cầu lập kế hoạch này không cấp quyền chạy ads. Community bắt đầu draft có nguồn; tự trả lời trên owned Page/IG chỉ sau khi chứng minh quyền API. Kênh chưa hỗ trợ hiện handoff thủ công rõ ràng.

## Chuyển đổi bằng các vòng nghiệm thu có đầu ra thật

Audit lưu trong repo ghi nền tảng có AI/RAG, worker và database nhưng API còn lỗi build/typecheck/lint, nhiều operation vẫn fake/generic và web mới là shell. Những kết quả test cũ là bằng chứng lịch sử, không phải kiểm tra lại trong báo cáo này. Giữ nguyên task Done cũ và audit; không chuyển chúng thành Done cho sáu agent. ([Audit 09/10](../docs/coordination/AUDIT-2026-10-09.md))

Tái sử dụng M01–M03 làm nền tảng doanh nghiệp/knowledge/goals; M04–M05 cho Research và ưu tiên của Lead; M06/M14/M16 cho Lead; M07–M09 cho SEO/Content; M10 publisher chung; M11 Community; M12–M13 tracking/analytics; M15 experiment. Bổ sung domain ads/chi tiêu, social publishing thật, MCP gateway và ledger/version đầy đủ. **16 module trở thành capabilities phục vụ đội marketing**, không là 16 màn hình phải xây xong trước.

| Giai đoạn | Việc chính | Gate chuyển tiếp |
| --- | --- | --- |
| **P0 — Chốt lại nền và phạm vi** | Sửa API/auth/tenant; role/AC/contracts; kiểm Meta và metrics permissions; estimate lại | CI đạt, schemas rõ, connector matrix xác minh; lịch mới theo capacity thật |
| **P1 — Ledger và dashboard** | Campaign/content/version/task/run; typed workflow, AI adapter thật; registry sáu role | Một live job lưu/version/handoff/restart được; output hiện dashboard; role chưa chạy ghi `not_enabled` |
| **P2 — Đóng vòng SEO website** | Research → Lead → SEO → duyệt → CMS; form DB và GA4/GSC | Một chiến dịch có nguồn, URL đúng phiên bản, form đã lưu, metrics; sửa sau duyệt bị chặn và retry không trùng |
| **P3 — Content và Community** | FB/IG creative/asset/publisher; replies có nguồn | Social publication ID thật nếu có quyền; lineage rõ; reply/handoff được audit |
| **P4 — Performance và learning** | Meta read/propose, experiments, budget ledger; Lead báo cáo sáu agent | Đề xuất truy về snapshot; thiếu data không suy đoán; caps chặn hành động trái phép; ads live chỉ khi có cấp quyền riêng |

Không ép toàn bộ nền tảng mới vào kế hoạch bốn tuần cũ. Sau P0, estimate task S/M/L và ngày demo theo năng lực tám người, chất lượng model và phụ thuộc account review. Ads permissions không chặn nghiệm thu phần proposal read-only, nhưng không được ghi live ads Done.

| Người | Trách nhiệm đề xuất |
| --- | --- |
| **Quang Quang** | Product/ưu tiên, sáu pipeline/prompt/eval, phối hợp routing; giới hạn WIP vì kiêm AI/PM/PO |
| **Dương** | Story/AC, nguồn, KPI dictionary, trạng thái và quyền/connector matrix |
| **Trường** | Dashboard chung, inventory/approval/calendar; thiết kế empty/missing/error |
| **Thiệu Quang** | API/build/auth/tenant, schema/contracts/CI và gateway authorization |
| **Mỹ** | Worker/AI adapter, MCP/platform adapters, publish/reconcile, metrics/form và budget executor |
| **Tiến** | Dashboard/KPI/agent cards/integrations, website blog/form/tracking |
| **Huyền** | Content editor/version/approval/calendar, research/community/ad proposal views |
| **Thiệu** | Contract/E2E, role evals, nguồn/tenant/retry/restart, numeric checks và budget/tool permissions |

Một agent chỉ Done khi có pipeline/tool scope/eval riêng và handoff đã lưu, thấy trên dashboard. Một capability tích hợp chỉ Done khi có review, staging/live evidence và AC; mock không thay connector thật. Bước tiếp theo là thực hiện P0 rồi demo P2 như một lát cắt khép kín, dùng kết quả để quyết định capacity mở social và paid. Backlog mới được tách tại [MARKETING-TEAM-V2-TODO](../docs/coordination/sprint-3-weeks/README.md); task cũ giữ làm lịch sử.
