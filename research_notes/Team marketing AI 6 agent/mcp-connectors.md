# MCP và connector cho team marketing AI 6 agent

Ngày khảo sát: 09/10/2026. Phạm vi MVP đã được người dùng chọn: website + Facebook/Instagram; Meta Ads trước. Đây là ghi chú nghiên cứu và đề xuất triển khai, không phải xác nhận các tài khoản đã kết nối.

## 1. Có thể dùng MCP nào và hiện đã kết nối gì?

### Takeaway
Đã thực sự gọi discovery read-only của plugin-management trong phiên này. Có các ứng viên phù hợp nhưng tất cả ứng viên marketing được kiểm tra đều `installed=false`; phải tách khả năng có trong directory khỏi khả năng có thể gọi vào tài khoản thật. MCP là lớp công cụ, không tự thay thế orchestration, database, queue, quyền tài khoản hoặc chính sách nền tảng.

### Cited Findings
- MCP tools có schema đầu vào/đầu ra và được server cung cấp cho client; tài liệu yêu cầu làm rõ thao tác với người dùng và kiểm soát quyền khi gọi tool. — [MCP Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- Với HTTP transport, MCP có cơ chế authorization theo OAuth; không dùng một credential xuyên mọi tenant. — [MCP Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- Google có MCP server Analytics chính thức; server chỉ hỗ trợ đọc, không chỉnh configuration/settings Analytics. — [Google Analytics MCP](https://developers.google.com/analytics/devguides/MCP)
- GA4 API yêu cầu enable API, credential có scope thích hợp và quyền vào property; quickstart sử dụng `analytics.readonly`. — [GA4 Quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)
- Search Console API hỗ trợ scope `webmasters.readonly` và authorization vào dữ liệu người dùng; connector vẫn phải có quyền property. — [Search Console Authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)
- Directory discovery thực tế ngày khảo sát: Metricool (`plugin_asdk_app_69d73fc8aa5c8191bec1583760b130c7`), Supermetrics Marketing Agent (`plugin_asdk_app_69a1247fceb88191a0fde719fd50920d`), Exa (`plugin_asdk_app_69ea4ed2cf7c8191b742ef3622479ddd`) đều ENABLED/AVAILABLE nhưng `installed=false`. Catalog mô tả Metricool có social analytics/scheduled content/post create-update, Supermetrics có ads/analytics và campaign actions, Exa có web research. Cũng tìm thấy Windsor.ai, GSC Wizard, Ahrefs, Semrush. — Nguồn: kết quả trực tiếp `plugin_management.search_plugins`, không có URL nguồn công khai tương đương; đây là bằng chứng discovery trong phiên, không phải xác minh API/schema/hợp đồng dịch vụ.

### Inferences
- Runtime sản phẩm nên dùng MCP client trong Python AI service qua connector gateway của BE, kết hợp connector adapters code-first. Plugin cài vào cuộc hội thoại không tự trở thành integration của B2B SaaS.
- MVP: internal `growth-cms` MCP gọi API own Next.js; research MCP chọn một nhà cung cấp; GA4 MCP chính thức; GSC read connector; `meta-social` và `meta-ads` MCP wrapper tự xây trên API chính thức hoặc đánh giá vendor MCP sau khi có schema/scope thực tế.
- Không đề xuất đổi CMS sang WordPress/Webflow chỉ để có plugin; own CMS có thể expose tool schema, gọi business service hiện tại và giữ tenant/approval/audit.
- Chỉ đề xuất 1–3 ứng viên khi thật sự cần kết nối; không cài, suggest hàng loạt hay thay permission trong lượt nghiên cứu này.

### Gaps
- Chưa có tài khoản OAuth/provider connection được chứng minh; chưa thể lấy số liệu hoặc publish/launch thật.
- Chưa kiểm chứng pricing, rate limit, SLA, embedding commercial terms và chính xác write capabilities của các vendor. Catalog descriptions không đủ để cam kết chúng hỗ trợ tất cả loại ảnh/video/reels/comment/ads.

## 2. Facebook/Instagram và Meta Ads triển khai được đến đâu?

### Takeaway
Facebook Page/Instagram Professional là MVP social; Meta Ads triển khai đọc số liệu → đề xuất có preview → execution đã duyệt. Quyền publishing/social insights và ads phải được kiểm tra theo login flow, account ownership và app review; không giả định quyền phát hành chỉ vì có MCP server.

### Cited Findings
- Meta có bộ Postman chính thức cho Marketing API, bao gồm tạo/sửa campaign, adset/ads và insights. Khi quản lý ad accounts của người khác cần Advanced Access `ads_read` và/hoặc `ads_management`. — [Meta Marketing API official collection](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi)
- Meta official Instagram collection phân biệt Instagram Login và Facebook Login; Instagram Login phục vụ professional accounts và có `instagram_business_content_publish`, không yêu cầu liên kết Facebook Page. — [Meta Instagram collection](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00)
- Trang chính thức về publishing và auth tồn tại, nhưng fetch trực tiếp trong phiên trả Internal Error. Không dùng bài blog bên thứ ba để khẳng định đầy đủ scope/review hiện hành. — [Pages publishing](https://developers.facebook.com/docs/pages-api/posts/), [Instagram publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing), [Marketing API auth](https://developers.facebook.com/docs/marketing-api/overview/authentication)

### Inferences
- Chọn Facebook Login integration cho pilot cùng Facebook Page + linked Instagram Professional nếu thực tế tài khoản phù hợp; không trộn scope của Instagram Login vào Facebook Login. Verify scopes bằng app dashboard/token inspection trước nghiệm thu.
- Checklist cần đối chiếu trong app thật: Page discovery/post/read engagement/insights; IG basic/content publish/insights; comment manage nếu Community cần trả lời; Meta Ads `ads_read` trước và `ads_management` khi mở thao tác đã duyệt. Scope names và dependency cụ thể phải xác nhận theo flow/version API.
- Với SaaS cho khách hàng ngoài app roles, dành công việc riêng cho App Review, access level và business verification khi Meta yêu cầu; không cam kết thời gian phê duyệt cố định.
- Facebook/Instagram publishing tool: create draft → validate media/permissions → show account + exact asset version + caption + scheduled time/timezone → approve → publish → poll status → record remote ID/URL. Persist outbox, request identity và remote result; timeout sau request phải reconcile trước retry để tránh bài trùng.
- Meta Ads tool: read campaign/creative/insights; propose campaign in paused state; preview objective, audience, placements, asset version, currency, daily/lifetime budget, dates, caps; approved creation → separate approved activation. Budget/creative/targeting changes require approval của đúng version hoặc policy envelope đã duyệt.
- Enforce caps server-side: account/campaign/day/month spend ceiling, maximum increase per action, allowed ad account, allowed campaign, expiry, kill switch; daily budget nền tảng không phải hard lifetime cap. Theo dõi spend lag và reservation cho concurrent operations.
- AI không được bịa "giờ tốt nhất", CPC hoặc ngân sách tối ưu. Hiển thị hypothesis/range, sample size, time window, timezone, attribution window và confidence; ít data thì đề xuất thử nghiệm có giới hạn.
- Community MVP: nhập câu hỏi và tạo answer có nguồn/duyệt. Mở comment reply trên owned Page/IG sau khi connector chứng minh quyền. Không hứa auto-read/post mọi Facebook group; không tự dùng browser để vượt API giới hạn.

### Gaps
- Không có dữ liệu lịch sử của TripC về giờ đăng, creative, conversions, cost/spend để xác định optimal schedule/budget.
- Chưa biết Page/IG/ad account IDs, quyền người kết nối, app review status và format media cụ thể.
- Chính xác Pages permission dependencies và IG insights scopes chưa xác minh đầy đủ từ primary docs fetch; đây phải là integration spike có nghiệm thu, không phải một checkbox giả Done.

## 3. Kết nối theo giai đoạn và điều kiện mở rộng

### Takeaway
Không nối tất cả nền tảng cùng lúc. Ưu tiên website → Facebook/Instagram + Meta read-only → Meta approved execution; TikTok/Google Ads chỉ mở sau vòng đo lường đầu tiên và access prerequisites.

### Cited Findings
- TikTok Direct Post chưa audit chỉ đăng private; muốn bỏ hạn chế phải audit. Chính sách không chấp nhận utility chỉ phục vụ upload cho tài khoản nội bộ của đội, yêu cầu preview, user control và explicit consent trước gửi nội dung. — [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- TikTok business docs hiện có endpoint exchange MCP authorization code, nhưng điều này không chứng minh phiên hiện tại đã có TikTok MCP được kết nối hoặc mọi publishing/ads action đều được hỗ trợ. — [TikTok MCP OAuth](https://business-api.tiktok.com/portal/docs/exchange-an-mcp-authorization-code-for-tokens/v1.3)
- Google Ads API production access có access levels và quotas; Explorer có chức năng planning bị hạn chế, Basic/Standard có prerequisites. Trang updated 30/09/2026 phân biệt Test/Explorer/Basic/Standard; không lấy page summary cũ làm toàn bộ kết luận. — [Google Ads access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- Google Ads authorization phụ thuộc OAuth identity và account access; OAuth scope không thay quyền/role tài khoản. — [Google Ads access model](https://developers.google.com/google-ads/api/docs/oauth/access-model)

### Inferences
1. Foundation: six-agent roles + shared asset registry/memory + dashboard; MCP connection registry hiển thị connected/missing/expired/restricted và read/write capabilities. Agent giao tiếp bằng artifact IDs/event schema, không chỉ gửi prompt tự do.
2. First vertical slice: Research brief → SEO article → approved website publish → tracked form → dashboard. Content Marketing agent sinh FB/IG variants từ cùng campaign/knowledge; mỗi bản lưu parent asset/version.
3. Meta social: connect own Page/IG, read + approved test publish; normalize media formats; lịch đăng lấy timezone Asia/Bangkok trong pilot; content worker nhìn registry để biết đã tạo gì, ở kênh nào, trạng thái và hiệu quả.
4. Meta Ads: read-only connector + dashboard spend/clicks/leads/CPL → draft recommendations → approved paused campaign/activation với caps. Không chạy quảng cáo hoặc chi tiền trong lượt lập kế hoạch này.
5. Expansion: TikTok public posting cần feasibility/audit proof; Google Ads cần production access/approved features; community channels phải chứng minh API permission. Import/manual handoff là fallback minh bạch.
- Acceptance cần mock contract tests và live read-only proof, token expiry/revoke tests, tenant isolation, denied publish/over-cap tests, exact-version approval rejection, timeout/reconcile duplicate prevention và webhook authenticity. Không coi unit fake tests là bằng chứng connector live.

### Gaps
- Chưa đo cost theo agent/provider/tool/run; cần bảng chi phí thực tế và quota để vận hành chứ không đặt giá cố định từ suy đoán.
- Việc tìm trend trên public web không đồng nghĩa API được quyền đọc mọi nội dung social; cần provider/source license và evidence URLs/time.
