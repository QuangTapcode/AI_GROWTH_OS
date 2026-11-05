# Nghiệm thu 6 agent so với yêu cầu ban đầu

Cập nhật 05/11: đã deploy và test bằng trình duyệt, xem [AGENT-BROWSER-TEST-2026-11-05.md](AGENT-BROWSER-TEST-2026-11-05.md). Mục "hệ thống thật đang chạy bản cũ" dưới đây không còn đúng.

Ngày 04/11/2026, trên code `main` tại `637e5a2`. Đối chiếu với [DU-01](../ba/acceptance/DU-01_TripC_Acceptance_Criteria.md) (16 tiêu chí), [SCOPE](../ba/SCOPE.md) (M01–M16) và kế hoạch Content v2 (15 ca TC).

## 1. Kết luận

**Chưa đạt yêu cầu ban đầu.** Phần tạo nháp trong hệ thống chạy tốt, nhưng **chưa có gì từng đến được khách hàng**: 0 bài trên website, 0/129 bài lên Facebook, 0 tin nhắn khách, 0 lượt xem.

| Thước đo | Kết quả |
| --- | --- |
| Tiêu chí DU-01 | 8 đạt, 8 đạt một phần, 0 chưa có (75%) |
| Workflow, code trên `main` | 65% (8,5/13 bước) |
| Workflow, hệ thống thật | 7/7 bước nội bộ từng chạy; 1/6 bước ra ngoài (62% trên tổng 13 bước, nhưng kết quả ra ngoài bằng 0) |

Cách tính: đạt = 1, một phần = 0,5, chưa = 0. Điểm "một phần" là đánh giá của người test, không phải số đo.

**Hai việc phải sửa trước khi bật lại tự động:**

- Khi knowledge context đổi, khách đang chờ người trả lời bị huỷ mà không báo ai (15/25 tin trong lần thử, có 3 lead đã xin liên hệ).
- Câu "Can I book a room now?" được trả lời "You can book a room now..." và được tự duyệt nếu bật `auto_approve_outputs`.

## 2. Đã test những gì

| Lớp | Cách làm | Kết quả |
| --- | --- | --- |
| Test có sẵn và test mới, trên database dùng một lần | AI, API, worker, cả các test cần database | AI 1069 đạt, 1 bỏ qua. API 327 đạt, 1 lỗi do chính test (xem ưu tiên 4). Worker 194 đạt. Pilot 4/4 |
| Test nghiệm thu mới theo mã tiêu chí | 92 ca, gọi qua cổng thật | 55 đạt, **37 đỏ** (26 khoảng trống) |
| Six-role, chế độ fake | Bộ 30 ca | 30/30 |
| Chạy thật toàn quy trình | Bản sao database thật, model `qwen3:4b-instruct`, không có token kênh | 3 chu kỳ, 2 bài viết, 2 pack |
| Community với model thật | 25 tin nhắn, kỳ vọng ghi trước khi có kết quả | 21/25 đúng hoàn toàn |
| Tấn công đối kháng, tập tune, không dùng held-out | 160 ca, model giả định làm theo lời tấn công | Content chặn 89%, SEO 71%, Community 71% |
| Đọc dữ liệu thật, chỉ đọc | Task, artifact, publishing job, lead | Xem mục 3 |

Test đỏ được đánh dấu `xfail(strict)` hoặc `it.fails`: bộ test vẫn xanh, và khi sửa xong test sẽ báo để gỡ dấu. Database thật không có dòng nào đổi trong lúc test (đã quét lại sau khi chạy).

Bằng chứng: [qa/evidence/agent-acceptance-2026-11-04/](../../qa/evidence/agent-acceptance-2026-11-04/). Test: `services/ai/tests/test_acceptance_*.py`, `apps/api/tests/acceptance/`.

## 3. Workflow và chỗ đang cấn

| # | Bước | Code trên `main` | Hệ thống thật |
| --- | --- | --- | --- |
| 1 | Yêu cầu, hồ sơ, mục tiêu | Đạt | Đã chạy |
| 2 | Nguồn đã duyệt, context | Đạt | Đã chạy (30 nguồn) |
| 3 | Research | Đạt | Đã chạy |
| 4 | Growth Lead lập kế hoạch | Một phần (GAP-GL-1) | Đã chạy |
| 5 | SEO viết bài | Một phần | Đã chạy (15 bài được duyệt) |
| 6 | Người duyệt | Một phần: chỉ duyệt hoặc từ chối, không sửa được | Đã chạy |
| 7 | Content viết pack | Một phần | Đã chạy (14 pack được duyệt) |
| 8 | Đăng website | Đạt trên bản sao: đăng, hiển thị, sitemap | **0 bài**, site chưa deploy |
| 9 | Đăng Facebook | Một phần: chặn an toàn khi thiếu quyền, chưa đăng thật | **0/129**: 125 `FACEBOOK_PERMISSION_DENIED`, 4 dev token |
| 10 | Community nhận và trả lời | Một phần (GAP-COM-9, 10) | **0 tin**, chưa nối kênh |
| 11 | Lead | Một phần: chống trùng tốt, chưa có người nhận | **0 lead thật** (3 lead hiện có là dữ liệu seed) |
| 12 | Đo lường | Một phần (GAP-PERF-1) | Một phần: 0 lượt xem site; GSC đang trỏ site staging |
| 13 | Performance, Learning, vòng sau | Một phần | Một phần: chạy trên số 0, dừng từ 30/10 |

**Đang cấn, theo thứ tự gặp phải:**

1. **Hệ thống thật đang chạy bản cũ.** API build từ 30/10, chưa có logic đóng draft hết hạn. Chu kỳ đứng từ 30/10 vì một bài SEO `insufficient_data` chờ duyệt. Trên bản sao, code mới đóng 22 task cũ và mở vòng mới sau khoảng 25 giây.
2. **Không có đường ra ngoài.** Website chưa deploy, Facebook thiếu quyền, chưa nối Messenger hoặc Telegram. Đây là chỗ chặn lớn nhất và cần chủ dự án.
3. **Không có số liệu.** Không có site thì không có lượt xem, nên Performance và Learning chỉ làm việc trên số 0.
4. **Có traffic là kẹt ngay.** Trên bản sao, khi giả lập 12 lượt xem, kế hoạch chuyển sang chế độ `conversion`, chọn một phát hiện có nguồn 2018 rồi `PLAN_BLOCKED`, dù bên cạnh có phát hiện điểm 1152 so với 192. 8 vòng liên tiếp không ra bài nào (GAP-GL-1).
5. **Báo cáo lùi về quá khứ.** Bản baseline cũng lưu là `metrics.snapshot` và mới hơn, nên "bản mới nhất" là tuần trước. Dữ liệu thật ngày 29/10 đã lùi tới 27/08–03/09 (GAP-PERF-1).

Phần chạy đúng khi có số liệu: lượt xem và lead giả lập đi vào báo cáo, Learning ghi "Readers clicked the CTA on: Mì Quảng...", và kế hoạch đổi ưu tiên theo số đo.

## 4. Từng agent

% là số yêu cầu đạt trên tổng yêu cầu liệt kê cho agent đó. Đây là ước lượng của người test để so sánh giữa các agent, không phải số đo.

| Agent | Mức đạt | Tóm tắt |
| --- | --- | --- |
| Research | 90% | Đạt cả AC-RES; nguồn, thời gian, lý do đầy đủ; không bịa nhu cầu |
| Learning | 75% | Có bài học khi có số đo, dừng khi không có; vẫn mở vòng dù kế hoạch bị chặn |
| Growth Lead | 70% | Đạt cả AC-CAM, công thức điểm đúng; lỗi chọn nguồn cũ; không sửa được kế hoạch |
| Content | 65% | TC trên đường thật khoảng 13,5/15; phần lớn bộ chấm chất lượng chưa được nối |
| Performance | 50% | Phân biệt 0 và thiếu đúng; lỗi lùi cửa sổ; GA4 chưa nối; chưa có A/B thật |
| Community | 50% | Trả lời tốt khi có nguồn; làm mất khách; không có hộp thư |
| SEO | 45% | Viết bài được; `seo.audit` và `content.refresh` chưa đúng nghĩa; không sửa được bài |

### SEO

| Yêu cầu | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Viết bài có title, meta, H2 từ nguồn duyệt | Đạt | 2 bài thật, 323 và 250 từ |
| AC-SEO-01 kiểm on-page | Một phần | `seo_checks` chỉ xem có hay không: title "Welcome" vẫn đạt (GAP-SEO-1). Link nội bộ duy nhất là `/contact`, trang này 404, dù site đổi nó thành nút. Trang công khai có title, meta, H1, sitemap, robots, nhưng không có canonical, Open Graph, JSON-LD |
| AC-SEO-02 khớp nguồn | Một phần | Không bịa số hay giá. Nhưng **14/37 câu trong 2 bài có chi tiết nguồn không nói**, đánh giá thủ công: "It pairs well with a side of rice", "unmatched". Một câu gán nhầm: "service may take longer" là của quán khác (GAP-SEO-3). Nguồn chỉ liệt kê cuối bài, không theo đoạn (GAP-SEO-2). Chặn đối kháng 71%, thấp hơn Content (GAP-SEO-7) |
| AC-SEO-03 phiên bản | Một phần | Chỉ đăng đúng bản đã duyệt, đổi nội dung thì bị từ chối. Nhưng không có đường sửa bài nên không có version mới (GAP-SEO-6) |
| M09 audit | Chưa | `seo.audit` chạy bộ viết bài (GAP-SEO-4) |
| M09 refresh theo số đo | Chưa | `content.refresh` không đọc số đo (GAP-SEO-5) |
| M09 từ khoá, cụm chủ đề, link nội bộ, link gãy | Chưa | Các bảng `keyword_clusters`, `internal_links` không được dùng; chỉ có "Related guides" ở cuối trang |

Thêm: bài "Authentic Pho at Thìa Gỗ" có 2/3 mục nói về quán khác và món tráng miệng (lệch chủ đề). Nút "Contact TripC on Facebook" thực ra mở form, không phải Facebook.

### Content

| Yêu cầu | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Viết post Facebook và kịch bản TikTok | Đạt | 2 pack thật; TikTok 147 và 184 từ |
| AC-CNT-01 giọng văn, liên kết bài gốc | Một phần | Liên kết bài gốc đạt. Tham số `brand_voice` bị bỏ qua và không có lựa chọn tone (GAP-CNT-3) |
| AC-CNT-02 đủ thành phần | Đạt | Có caption, CTA, định dạng, gợi ý ảnh, kịch bản. Gợi ý ảnh chung chung: bài ẩm thực vẫn ra "coastal cityscape" |
| TC-01..15 trên đường thật | Khoảng 13,5/15 | Giá, %, biến thể tiếng Việt, injection, lệch version, hash, tenant, kênh đều chặn. Lọt: lời chứng không có từ khoá (GAP-CNT-6); Facebook về sản phẩm thật không có ảnh vẫn là `draft` (GAP-CNT-1) |
| Mỗi câu truy được về nguồn | Một phần | Map có đánh dấu, nhưng **không ai dùng**: pack thật có 2 câu `unsupported`, trong đó có "A trusted local option", vẫn `draft` và **vẫn được tự duyệt** (GAP-CNT-2) |
| Chấm độc lập, tự sửa | Chưa | `content.quality_check` gọi nhầm bộ viết (GAP-CNT-4); người duyệt không thấy điểm (GAP-CNT-5) |
| Cổng phát hành | Một phần | Có dữ liệu, nhưng lần đo 31/10 trượt: Zero-Claim 90%, chặn đối kháng 52,86%. Chưa có nhãn người (CM-20) và Kappa (CM-14) |
| Ảnh thật và ảnh AI | Một phần | Ảnh AI đã có code nhưng chỉ test với HTTP giả, đang tắt. Không có đường nạp ảnh thật (`content_assets` 0 dòng). Khi tắt tự đăng, pack luôn `needs_assets` vì có TikTok |

**Điểm cần sửa trong tài liệu:** [PROGRESS](../content-marketing/PROGRESS.md) ghi 29/32 hạng mục hoàn thành, nhưng `generate_service`, `repurpose_router`, `fb_repurposer`, `reflection_loop`, `llm_judge`, `quality_check_service`, `few_shot_store`, `gateway_recheck`, `audit_service` **không nằm trên đường bài thật đi qua**. Chúng có test riêng và đạt, nên số test xanh không chứng minh agent thật đạt.

Thời gian chạy: Content 73–86 giây, SEO 69–97 giây, so với mục tiêu 20 giây của kế hoạch. Kế hoạch giả định model trả phí; model 4B chạy local không đạt được mức này.

### Community

| Yêu cầu | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Trả lời bám nguồn | Một phần | 21/25 đúng hoàn toàn. Chặn được visa, bảo hiểm, 2 ca injection. Sai: câu đặt phòng; chuyển người nhầm câu "Bê thui Cầu Mống" dù nguồn có; câu về chợ trả lời chung chung; mất số +44 |
| AC-COM-01 qua hàng duyệt | Một phần | Khi tắt tự duyệt: không gửi gì trước khi duyệt. Khi bật: lead có câu trả lời được tự gửi, trái chữ "luôn bắt buộc" trong AC (cần quyết định, mục 6) |
| Giá, địa chỉ, phòng trống, đặt phòng chuyển người | Một phần | Bộ lọc chỉ biết tiếng Anh và không có luật đặt phòng (GAP-COM-4). Tiếng Việt qua được nhờ không tìm thấy nguồn, không phải nhờ luật |
| **Không làm mất khách** | **Chưa** | 15/25 tin bị huỷ khi đổi context, kẹt `queued` vĩnh viễn, lead không được lưu (GAP-COM-9) |
| AC-COM-02 chống trùng lead | Đạt | Gửi lại trả đúng id; cùng email khác form được đánh dấu khách cũ |
| AC-COM-03 bàn giao lead | Một phần | Có id, UTM, trạng thái. Lead từ form không có người nhận, không có trang lead (GAP-COM-5). Lead không có liên hệ được gán email giả `community.xxx@tripc.internal`, chủ đề luôn "Housing" (GAP-COM-7). Số nước ngoài bị mất dù khách mục tiêu là người nước ngoài (GAP-COM-2) |
| M11 phân loại ý định, chấm điểm, hộp thư | Chưa | Không có phân loại hay điểm (GAP-COM-3). Không có trang hộp thư; người duyệt không tự viết được câu trả lời, nên tin chuyển người là **ngõ cụt** (GAP-COM-6) |
| Nhận và gửi qua kênh thật | Một phần | Code có, test với API giả. Thiếu token thì báo lỗi và không gửi (đã thử với Telegram). Thực tế: 0 tin |

### Research, Growth Lead, Performance, Learning

- **Research:** đạt AC-RES-01, 02. Mỗi lần 40–77 giây. Có 2–3 phát hiện mỗi lần trên kho nguồn hiện tại.
- **Growth Lead:** đạt AC-CAM-01 (điểm 576 = đúng công thức, gắn nhãn `estimated`) và AC-CAM-02. Lỗi chính là GAP-GL-1. M06 (kế hoạch 30 ngày, sửa, version) chưa có.
- **Performance:** đạt AC-PER-02. AC-PER-01 đúng về logic nhưng dính GAP-PERF-1. GA4 chưa nối, GSC trỏ `aigrowthos-staging.pages.dev` chứ không phải tripc.ai, Meta Ads không có dữ liệu. M15: `experiment.hypothesis` chỉ sinh giả thuyết chung, bảng experiments 0 dòng.
- **Learning:** đạt AC-LRN-02. AC-LRN-01 một phần vì dính lỗi cửa sổ đo.

## 5. Việc cần làm

### Ưu tiên 1: sửa code trước khi deploy và bật tự động

| ID | Việc | Test sẽ xanh khi xong |
| --- | --- | --- |
| GAP-COM-9 | Đổi context không được huỷ task Community; tin phải quay lại hàng đợi hoặc chạy lại trên context mới | `a customer waiting for a person is not dropped...` |
| GAP-COM-10, 4 | Thêm luật đặt phòng và tiếng Việt; câu trả lời cho lead chỉ tự gửi khi không đụng tới dịch vụ của TripC | `with auto-approval on, a reply about a booking...`, `test_m11_prices...` |
| GAP-CNT-2 | Pack có câu `unsupported` không được tự duyệt, và phải hiện rõ cho người duyệt | `test_tc_10_a_pack_with_an_unsupported...` |
| GAP-SEO-7, COM-11, CNT-6 | Dùng chung bộ guardrail của Content cho SEO và Community; mở rộng nhận diện lời chứng | `test_ac_seo_02_invented_offers...`, `test_ac_com_01_invented_offers...`, `test_tc_03_a_testimonial...` |
| GAP-GL-1 | Không chọn phát hiện có nguồn cũ khi còn phát hiện khác; Learning không mở vòng khi kế hoạch vừa bị chặn | `test_a_plan_does_not_block_on_a_stale...` |
| GAP-PERF-1 | Lưu baseline dưới operation riêng, hoặc lấy "mới nhất" theo `window_end` ở mọi nơi | `a measurement taken after its baseline...` |

### Ưu tiên 2: việc chỉ chủ dự án làm được

| Việc | Vì sao | Mở khoá bước |
| --- | --- | --- |
| Đồng ý deploy `main` | Hệ thống đang chạy bản 30/10. Làm sau ưu tiên 1, và bật tự động chỉ sau khi xem chu kỳ đầu | 1 |
| Chọn domain và deploy site công khai; đặt `PUBLIC_SITE_URL`, `PUBLIC_SITES_JSON`, `NEXT_PUBLIC_SITE_URL`, `SITE_INDEXABLE=true` | Không có site thì không có bài, lượt xem, lead | 8, 11, 12 |
| Sửa quyền Meta: lỗi `#200` trên 125 job | Facebook chưa đăng được bài nào | 9 |
| Cấp token Telegram hoặc env Messenger | Community chưa có tin thật | 10 |
| Thêm tài khoản GSC vào property tripc.ai, hoặc property của domain mới | GSC đang đọc `aigrowthos-staging.pages.dev`, nơi mọi trang gắn `noindex`. 04–27/10: 0 lượt hiển thị, 0 click, và sẽ luôn là 0 | 12 |
| Trả lời `hoc-46` về dọn dữ liệu e2e | 23 dòng đã sao lưu, chờ xác nhận | Dọn hàng duyệt |
| Bảng giá và thông tin dịch vụ đã xác minh | Câu hỏi giá hiện luôn chuyển người | 10 |
| Ảnh thật có bản quyền | TikTok và post về sản phẩm thật cần ảnh | 7 |

### Ưu tiên 3: để đủ yêu cầu ban đầu

| ID | Việc |
| --- | --- |
| GAP-COM-6, 5 | Trang hộp thư và trang lead: người duyệt tự viết câu trả lời, gán người nhận lead |
| GAP-COM-7, 2, 8 | Không tạo email giả; lấy chủ đề từ câu hỏi; nhận số nước ngoài; đường gửi trực tiếp cũng có lịch sử hội thoại |
| GAP-COM-3 | Phân loại ý định và chấm điểm (M11, Intent Radar) |
| GAP-SEO-6 | Sửa bài trước khi duyệt, tạo version mới, huỷ duyệt cũ (AC-SEO-03, M08) |
| GAP-SEO-1, 2 | Kiểm on-page thật: từ khoá, độ dài; ghi nguồn theo từng mục |
| GAP-SEO-3, COM-1 | Kiểm tra theo nghĩa, không chỉ theo từ. Đây là nguyên nhân của 14/37 câu thừa, cần NLI hoặc model chấm riêng |
| GAP-SEO-4, 5 | Viết `seo.audit` và `content.refresh` thành việc riêng |
| GAP-CNT-1, 3 | Ảnh thật cho Facebook; lựa chọn tone |
| GAP-CNT-4, 5 | Nối `quality_check` và judge vào đường thật, hoặc bỏ (mục 6) |

### Ưu tiên 4: làm sau

- SEO: cụm từ khoá, link nội bộ trong bài, kiểm link gãy, canonical, Open Graph, JSON-LD. Giữ bài đúng chủ đề.
- Content: gợi ý ảnh theo chủ đề; job đăng tay dùng link tới bài viết thay vì trang chủ `tripc.vn`.
- Community: "Bê thui Cầu Mống" có trong nguồn nhưng bị chuyển người; câu về chợ chưa nêu tên chợ.
- Performance: nối GA4; A/B thật (M15).
- Kỹ thuật: bỏ URL mặc định trỏ database thật trong `lib/db.ts`; `reportsConsistency.test.ts` dùng id workspace TripC thật và lỗi trên database có seed; cập nhật PROGRESS, SIGNOFF và README Community đang ghi "hoàn thành".

### Bổ sung 05/11: kiểm tra `aigrowthos-staging.pages.dev`

Địa chỉ này là giao diện quản trị (`apps/web`), không phải site công khai (`apps/pilot`). Nó chạy được: `/v1/*` tới API trên máy Windows qua tunnel, trang đăng nhập mở được trên máy tính và điện thoại.

| ID | Vấn đề | Việc cần làm |
| --- | --- | --- |
| GAP-SITE-1 | Không thể dùng làm site công khai: `/posts` trả 404, và mọi trang gắn `noindex` | Deploy `apps/pilot` ở địa chỉ riêng, không bỏ `noindex` của trang quản trị |
| GAP-SITE-2 | Cả Pages Function và Worker chỉ chuyển tiếp `/v1/*`, nên `/public/v1/*` trả 404. Trình duyệt của khách sẽ không gửi được lượt xem và lead; site chạy ngoài máy này cũng không lấy được bài | Mở thêm `/public/v1/*`, vẫn chặn `/internal/*`; thêm domain của site vào `CORS_ALLOWED_ORIGINS`, nếu không sẽ gặp 403 `ORIGIN_NOT_ALLOWED` |
| GAP-SITE-3 | Trong 10 trang quản trị đã thử, `/workspace-integrations` là trang duy nhất không cần đăng nhập. Nội dung là dữ liệu mẫu trong code, không lộ dữ liệu thật, nhưng sai thực tế: 4 thành viên không có thật; GA4, CMS, LinkedIn, Gemini ghi "Connected" dù hệ thống không dùng; GSC ghi `sc-domain:tripc.ai` trong khi thực tế đọc site staging. Nút mời thành viên báo đã gửi nhưng không gọi API | Đưa trang vào sau đăng nhập, đọc `/integrations` thật hoặc gỡ trang |
| GAP-SITE-4 | Trang đăng nhập hiện số viết cứng (Điểm SEO 94,0, Nội dung 92,5, 63.240 lượt, +52,4%, 190 lượt), và dòng "TripC Da Nang · Đang chạy". Số thật là 0. Link Terms và Privacy trả 404 | Gỡ số hoặc ghi rõ là hình minh hoạ; thêm hai trang hoặc gỡ link |
| GAP-SITE-5 | Bản đang chạy cũ: giao diện deploy khoảng 5 ngày trước, thiếu phần đã merge ngày 04/11. API build 30/10, không có route `/v1/webhooks/telegram` nên Telegram chưa nhận được tin | Đã tính trong việc "Đồng ý deploy `main`" |
| GAP-SITE-6 | Giá trị mặc định `Asia/Bang_Chi_Minh` trong module báo cáo không phải múi giờ hợp lệ (Postgres từ chối). Hiện chỉ là nhãn, chưa làm lỗi truy vấn | Đổi thành `Asia/Ho_Chi_Minh` |

Lần kiểm tra này không đăng nhập vào địa chỉ công khai, không deploy và chặn GA4 để không tính thêm lượt xem. Các trang sau đăng nhập trên địa chỉ này chưa được xem trực tiếp.

## 6. Cần quyết định

1. **Community có được tự gửi không?** AC-COM-01 ghi "luôn bắt buộc" qua hàng duyệt, còn yêu cầu "tự động 100%" thì ngược lại. Đề xuất: chỉ tự gửi câu trả lời có nguồn và không phải lead; lead luôn chờ người.
2. **Giữ hay đổi mục tiêu Content v2?** Judge ≥90 và phản hồi 20 giây đòi hỏi model trả phí. Đề xuất: đổi mục tiêu theo model local, trừ khi có ngân sách.
3. **Các module Content chưa nối:** nối hay xoá? Đề xuất: nối `quality_check` và NLI của `fact_mapper`, xoá phần còn lại để tài liệu khớp thực tế.

## 7. Giới hạn của lần test

- Chỉ 2 bài và 2 pack thật, với một model; đánh giá câu thừa là thủ công và do người test tự chấm, chưa có người duyệt độc lập.
- Lượt xem và lead ở chu kỳ 2 là giả lập. Facebook và Telegram không gọi thật.
- Tấn công đối kháng giả định model làm theo lời tấn công, và chủ yếu bằng tiếng Việt trên nguồn tiếng Anh, nên tỷ lệ chặn là số so sánh giữa các agent, không phải dự báo thực tế.
- Trang công khai chỉ kiểm qua HTML trả về, chưa xem trên trình duyệt. Test e2e giao diện không chạy lại vì chúng ghi vào database thật.
- Không dùng bộ held-out; số Content 31/10 lấy từ PROGRESS.
- Bản sao chạy cùng dữ liệu nguồn với hệ thống thật; khi deploy sẽ có thêm nguồn từ blog sync.
