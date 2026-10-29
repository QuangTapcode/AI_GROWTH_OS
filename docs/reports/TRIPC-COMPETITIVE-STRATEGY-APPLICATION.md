# Áp dụng phân tích đối thủ và chủ đề ưu tiên TripC

Ngày áp dụng: 29/10/2026. Nguồn: tài liệu người dùng
`TripC_Phan_tich_doi_thu_va_Chu_de_uu_tien.docx`, ngày rà soát trong tài liệu 28/10/2026.
Đây là cấu hình chiến lược ban đầu, không phải kết luận nghiên cứu thị phần hoặc KPI đo được.

## Đã áp dụng vào runtime

| Chủ đề | Ưu tiên | Hành trình | Chỉ số định hướng; chưa đặt target |
| --- | --- | --- | --- |
| PT-01 · Du lịch và trải nghiệm địa phương | Cao | Khám phá | Clicks, qualified visits |
| PT-02 · Sinh sống và làm việc tại Việt Nam | Cao | Ổn định cuộc sống | Qualified visits, leads |
| PT-03 · Soft Landing | Cao | Mới đến | Leads; chỉ quảng bá dịch vụ đã xác nhận |
| PT-04 · Hướng dẫn thực tế | Trung bình | Chuẩn bị | Clicks, qualified visits; kiểm tra nguồn chính thức cho nội dung nhạy cảm |
| PT-05 · Cộng đồng | Trung bình | Kết nối | Qualified visits, leads; xác minh thông tin sự kiện |

Các metric trên là hướng đo cho MVP hiện có. Lượt đăng ký, quay lại, form completion,
saves và conversion theo chủ đề trong tài liệu vẫn cần instrumentation riêng; không
được tự coi là đã có dữ liệu hoặc đã triển khai đo lường. Priority không thay thế goal/KPI/thời hạn.

- Business profile lưu `research_strategy` và danh sách URL đối thủ; knowledge context ghim cùng profile version.
- Discovery tạo tối đa ba query mỗi run, bắt đầu bằng nhóm cao rồi luân phiên qua cả năm nhóm. Không chỉ tìm ba sản phẩm đầu như trước. Vị trí và audience vẫn lấy từ profile đã xác nhận.
- Research `research-v8` dùng chủ đề để ưu tiên nguồn phù hợp, giữ các giả thuyết tách khỏi dữ liệu đo được và gắn `strategy_alignment` vào finding.
- Growth Lead xếp nhóm ưu tiên biên tập trước, sau đó dùng điểm cơ hội ước lượng trong nhóm. Điểm và cơ sở cấu hình được giữ riêng; không gọi priority là demand/search volume.
- Plan và brief ghi topic ID, giai đoạn hành trình, metric định hướng và yêu cầu xác minh. SEO/Content giữ alignment trong output; publisher vẫn sử dụng CTA/approval hiện có.
- Câu hỏi nhạy cảm thiếu nguồn chính thức, quảng bá dịch vụ chưa xác nhận hoặc tuyên bố sự kiện hiện hành chưa kiểm tra tạo missing-data gate; Growth Lead trả `blocked` cho cơ hội được chọn.
- Trang Workspace hiển thị chủ đề ưu tiên và các bài học tham khảo cạnh tranh.

## Đối thủ được lưu dưới dạng tham chiếu

| Website | Bài học được đưa vào cấu hình |
| --- | --- |
| Expats Da Nang | Một hành động tiếp theo rõ ràng cho nhu cầu mà TripC thực sự đáp ứng |
| NEST Living | Tổ chức thông tin theo hành trình mới đến và tiếp nhận nhu cầu có cấu trúc |
| Living Da Nang | Tổ chức dữ liệu địa phương để so sánh, có vị trí và thông tin cập nhật |

Các tham chiếu mang trạng thái `document_observation_requires_recheck`. Không nhập
giá, số khách đã phục vụ, rating, số căn hộ hoặc thống kê người dùng TripC thành
approved facts, baseline hoặc KPI. Không thêm domain đối thủ vào policy tự ingest;
không sao chép nội dung website đối thủ. Bản text nguồn lưu trong
[TRIPC_COMPETITORS_AND_PRIORITY_TOPICS.txt](../sources/TRIPC_COMPETITORS_AND_PRIORITY_TOPICS.txt).

Phạm vi địa lý, audience và dịch vụ đã xác nhận của profile local vẫn giữ nguyên.
Nội dung mới có thể đề xuất cơ hội mở rộng, nhưng không tự bổ sung năng lực thương mại.

## Cấu hình và triển khai

Preset: [tripc-research-strategy.json](../../config/workspaces/tripc-research-strategy.json).
API profile cho phép owner/editor sửa `research_strategy` với optimistic concurrency
`expected_version`; lỗi source/goal/tenant/approval vẫn được kiểm tra ở pipeline.

Áp dụng migration `017_business_research_strategy.sql`, rồi từ `apps/api`:

```powershell
node --env-file-if-exists=.env.local node_modules/tsx/dist/cli.mjs scripts/apply-tripc-research-strategy.ts
```

Lệnh mặc định chỉ áp dụng workspace TripC local, xác nhận company name, tăng version,
ghi audit `business_profile.strategy_imported`, vô hiệu context cũ và cấp context mới.
Import lại preset không đổi sẽ không tăng version hoặc đổi context. Nếu cấp context
mới thất bại, task cũ không chạy với profile mới; chạy lại lệnh để hoàn tất cấp context.
Không sửa nguồn đã duyệt, products/services, audience, goal hoặc target KPI.

Local đã áp dụng: profile version **2**, context
`5754edab-4a48-4f8f-bfb0-ff1b4e69d6f8`.
[Evidence kiểm tra DB](../../qa/evidence/tripc-strategy-2026-10-29/application.json).
Đây là kiểm chứng cấu hình và tích hợp, chưa phải một campaign production hay xác minh đối thủ.

## Backlog sản phẩm rút ra từ tài liệu

Các mục dưới đây giữ là đề xuất sản phẩm, không đánh dấu đã xây dựng trong lượt tích hợp agent:

| Mốc đề xuất | Công việc | Điều kiện đo trước khi đánh giá |
| --- | --- | --- |
| 0–30 ngày | Kiểm kê nguồn/ngày cập nhật/trạng thái xác minh; rà một CTA chính trên trang | Định nghĩa mẫu số cho tỷ lệ bản ghi đạt chuẩn và tracking CTA |
| 31–60 ngày | Form nhu cầu Soft Landing, hành trình nhiều bước, bản đồ/bộ lọc thử nghiệm | Tracking form start/submit, đủ thông tin lead, filter use, bước tiếp theo |
| 61–90 ngày | Báo cáo theo topic/channel, đăng ký và lead đủ điều kiện; thử nghiệm tiếp tục/dừng | Attribution và snapshot cùng phạm vi/thời gian, baseline hợp lệ |

Không tự đặt ngày bắt đầu, target số hoặc cam kết response-time từ các đề xuất này.
