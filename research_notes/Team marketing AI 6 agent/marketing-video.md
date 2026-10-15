# Marketing team sáu AI agent và video tham chiếu

## Video xác minh được những gì?

### Takeaway
Chưa xem được video TikTok ID 7686718534386322695, chưa nghe audio và chưa có transcript xác minh. Kế hoạch phải ghi là dựa trên yêu cầu người dùng, không gán thiết kế sáu agent cho video.

### Cited Findings
- Website chính thức ReStructure AI mô tả đội agent vận hành phòng ban trên dữ liệu riêng của doanh nghiệp; phần content gồm nghiên cứu, bản nháp và xuất bản đa kênh. Đây là mô tả website, không phải bằng chứng của video cụ thể. — [ReStructure AI](https://re-structure.ai/)
- Link người dùng cung cấp: [TikTok](https://www.tiktok.com/@restructureai/video/7686718534386322695?is_from_webapp=1&sender_device=pc).

### Inferences
- Thiết kế theo yêu cầu trực tiếp đã đủ rõ để lập kế hoạch sửa dự án ngay; video là tài liệu tham khảo bổ sung sau khi có quyền truy cập hoặc file.
- Không nên dùng video khác cùng creator làm bằng chứng thay thế.

### Gaps
- Root web open không đọc được video. Subagent tìm exact ID/link trên web không có transcript phù hợp; cua.createBrowserTab iab trả Browser unavailable, cua.getState trả browsers=[] và apps=[]. Không có login/CAPTCHA được thao tác, không tải hoặc xuất bản dữ liệu bên ngoài.

## Sáu agent nên chịu trách nhiệm và bàn giao thế nào?

### Takeaway
Người dùng yêu cầu đội marketing gồm năm chuyên môn rõ ràng; đề xuất agent thứ sáu là Growth Lead/Analyst để điều phối, đo lường và cải thiện. Đây là quyết định thiết kế đề xuất, chưa phải chốt từ user hoặc nội dung video.

### Cited Findings
- Yêu cầu trực tiếp trong chat: SEO blog thân thiện AI; content marketing sản phẩm/đa nền tảng; performance marketing; nghiên cứu trend/thị trường/nhu cầu tìm kiếm; community trả lời câu hỏi; tổng sáu agent hiển thị kết quả trong một dashboard. Nguồn: user message của phiên 09/10/2026, không có URL công khai.

### Inferences

| Agent đề xuất | Đầu vào | Kết quả có cấu trúc | Tools cần có | Bàn giao |
|---|---|---|---|---|
| Growth Lead / Analyst | Brand profile, goals, budget limits, kết quả năm agent, metrics thực | Campaign brief, task graph, ưu tiên, weekly report, recommendations có bằng chứng | Internal campaign/task/ledger/analytics tools; GA4/GSC/ads read tools | Giao task cho chuyên môn; trình người phụ trách duyệt chiến lược và kế hoạch spend |
| Research / Trend | Audience, sản phẩm, market, topics đã làm | Research brief với URLs/timestamps, nhu cầu, insight, trend fit, ý tưởng, confidence | Web search/fetch MCP, source registry, GSC queries khi có; trend provider có xác thực | Ý tưởng được chọn cho SEO và content; insight cho lead và performance |
| SEO Worker | Research brief, brand knowledge, existing content, query intent | Blog draft, title/meta, sources, internal links, QA checklist, CMS publication record | Knowledge/ledger tools, search/GSC, CMS draft/publish adapter | Duyệt; xuất bản blog; chia insight sang content; trả metrics cho lead |
| Content Marketing | Campaign brief, sản phẩm, audience, brand voice, approved assets | Platform-specific copy, image/video assets hoặc script rõ loại, creative variants, calendar, publish records | Ledger/knowledge, media generation provider, asset storage, social publishing APIs/MCP | Duyệt; xuất bản nền tảng; gửi creative ID/version cho performance |
| Performance Marketing | Approved creatives, channel metrics, timezone, audience, campaign goal, ngân sách | Đề xuất lịch, ảnh/video test, budget scenario, campaign draft, report spend/CPC/CPA/ROAS khi đủ data | Ads read/write adapter, analytics, experiment ledger; budget reservation/spend guard | Xin duyệt creative/version/channel/schedule/budget; executor chạy trong phạm vi duyệt; feedback sang content/lead |
| Community | Questions/comments hợp lệ, channel context, approved product/FAQ knowledge | Reply drafts có nguồn, escalation, approved reply record, unanswered-demand signals | Community read/reply adapter, knowledge retrieval, ledger | Người duyệt hoặc chính sách reply được cấp; signal về research; vấn đề nhạy cảm chuyển người |

- Tất cả agent đọc cùng Content Ledger trước khi tạo bài: content_id, campaign_id, owner_agent, audience, intent, topic/semantic key, source refs, body summary, asset/version, platform, approval, publication URL, UTM, metrics, timestamps.
- Content history không chỉ là memory trong prompt: lưu DB theo tenant; agent truy vấn theo chủ đề/intent/campaign; reserve topic trước tạo; similarity check cho trùng chủ đề, uniqueness/idempotency cho retry; các biến thể platform có parent_content_id.
- Handoff dùng job/task có schema, source refs và IDs. Lead orchestration tạo dependencies và budgets; specialized agents có bounded run/tool budget, retry và error state. Không chạy cả sáu song song mọi lần; chỉ song song task độc lập.
- Dashboard thống nhất: tổng KPI + dữ liệu cập nhật lúc nào; sáu agent cards (idle/running/awaiting approval/blocked/error) + nhiệm vụ đang làm; ledger/bài đã tạo; editorial calendar; approval inbox; published URLs; creative/ad plan + approved/actual spend; research sources; community queue; outcome per content/campaign. Thiếu connector phải hiện disconnected/no data, không metrics giả.
- MVP chứng minh một campaign: research có nguồn → lead chọn → SEO blog + social creative song song → duyệt → publishing một website và một social channel → real/fixture-labelled metrics → community draft → performance proposal → lead review. Fixture demo không tính là live integration.
- Performance không khẳng định giờ tối ưu, định dạng thắng hay giá chính xác khi chưa có dữ liệu; cold-start là giả thuyết thử nghiệm có ngân sách. Giá là dự kiến/giới hạn, chi thực lấy platform API.

### Gaps
- Root thông báo user đã chốt website + Facebook/Instagram, Meta ads. SEO xuất bản website; Content Marketing tạo post/creative quảng bá riêng cho Facebook/Instagram; Performance dùng Meta ads. Account permissions, media providers, dữ liệu ads, ngân sách, reply autonomy và agent thứ sáu còn cần chốt; paid live activation là giai đoạn có connector và ngân sách được duyệt.

## SEO thân thiện AI cần thực hiện thế nào?

### Takeaway
SEO Worker cần tạo bài hữu ích có nguồn, dễ đọc và crawl được. Không hứa bảo đảm được AI trích dẫn, không coi AEO/GEO hack là tiêu chí nghiệm thu.

### Cited Findings
- Google nói SEO nền tảng vẫn phù hợp cho generative AI search, khuyến nghị nội dung nguyên bản và hữu ích; không yêu cầu markup đặc biệt hay viết kiểu riêng chỉ cho AI. — [Google AI optimization](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- Google nhấn mạnh chất lượng, độ chính xác và mức phù hợp khi dùng generative AI; tạo hàng loạt trang thiếu giá trị có thể vi phạm scaled content abuse. — [Using generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- Nội dung cần thêm giá trị nguyên bản thay vì chỉ viết lại nguồn; nguồn rõ và chuyên môn giúp người đọc đánh giá độ tin cậy. — [Helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

### Inferences
- QA SEO blog: đáp ứng intent; facts truy về nguồn đã duyệt; điểm nhìn riêng của doanh nghiệp; title/headings rõ; nội dung có thể index; internal links; schema chỉ khi phù hợp và khớp nội dung hiển thị; source/license checks; similarity với ledger; review trước publish.
- Nghiên cứu trend chỉ chọn ý tưởng phù hợp audience và sản phẩm, không chạy theo mọi trend.
- Dashboard nên đo organic/qualified traffic và conversion thực; visibility/citation trong AI cần nguồn measurement được hỗ trợ, ghi rõ coverage và limitations.

### Gaps
- Không có dữ liệu xác minh website TripC hiện được AI engines cite hoặc agent proposal làm tăng traffic. Cần baseline, triển khai và đo theo thời gian.
