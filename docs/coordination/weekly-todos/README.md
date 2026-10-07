# Việc của từng người trong 4 tuần

Cập nhật 05/10/2026. Đây là phân rã thực thi của [TODO gốc](../../../TODO.md), theo [roster và quyền sửa source](../TEAM.md), [scope 16 module](../../ba/SCOPE.md) và [17 epic/AC](../backlog/README.md). Tài liệu nguồn được dùng làm căn cứ; các lựa chọn mới của người dùng về roster, Next.js, Ollama, hosting và conversion là baseline hiện hành.

## Chọn bảng việc của mình

**Chi tiết đến mức triển khai:** mở [W1](../execution/W1.md), [W2](../execution/W2.md), [W3](../execution/W3.md), [W4](../execution/W4.md) rồi chọn tên mình. Các task con ghi hành động/API/data/UI/pipeline và ca kiểm tra cụ thể. [Data/flows dùng chung](../execution/DATA-AND-FLOWS.md) tránh mỗi người tự định nghĩa fields, permissions, version và metric khác nhau.

| Người | Vai trò | Tuần 1 | Tuần 2 | Tuần 3 | Tuần 4 |
| --- | --- | --- | --- | --- | --- |
| Quang Quang | AI + PM + PO | [Nền tảng/RAG, điều phối](QUANG-QUANG.md#tuan-1) | [Research → draft](QUANG-QUANG.md#tuan-2) | [SEO/community, dữ liệu analyst](QUANG-QUANG.md#tuan-3) | [Analyst/learning, nghiệm thu](QUANG-QUANG.md#tuan-4) |
| Dương | BA | [AC nền tảng, rules/KPI](DUONG.md#tuan-1) | [AC research/content/publish](DUONG.md#tuan-2) | [AC analytics/experiment/learning](DUONG.md#tuan-3) | [UAT, tài liệu bàn giao](DUONG.md#tuan-4) |
| Thiệu Quang | BE core/contract | [Auth/tenant/schema/CI](THIEU-QUANG.md#tuan-1) | [Opportunity/strategy/brief/content](THIEU-QUANG.md#tuan-2) | [Approval, source/quyền](THIEU-QUANG.md#tuan-3) | [Approved actions/strategy, release](THIEU-QUANG.md#tuan-4) |
| Mỹ | BE jobs/data/integrations | [Worker/profile/goals/form](MY.md#tuan-1) | [Research/AI jobs/metrics](MY.md#tuan-2) | [SEO/publish/community/tracking](MY.md#tuan-3) | [Reports/experiment/learning](MY.md#tuan-4) |
| Tiến | FE shell/public website | [Bootstrap/workspace/goals/pilot](TIEN.md#tuan-1) | [Strategy/tasks, ghép routes](TIEN.md#tuan-2) | [Traffic/analytics/public pages](TIEN.md#tuan-3) | [Experiment/widget, build/release](TIEN.md#tuan-4) |
| Huyền | FE content flows/mocks | [Knowledge, mock/test nền tảng](HUYEN.md#tuan-1) | [Research/board/brief/editor](HUYEN.md#tuan-2) | [SEO/approval/calendar/community](HUYEN.md#tuan-3) | [Report/learning, hồi quy](HUYEN.md#tuan-4) |
| Trường | UI/UX | [Tokens, thiết kế nền tảng/pilot](TRUONG.md#tuan-1) | [Thiết kế research/content](TRUONG.md#tuan-2) | [Thiết kế publish/analytics/W4](TRUONG.md#tuan-3) | [Design QA và handoff](TRUONG.md#tuan-4) |
| Thiệu | Một Tester, hai lane | [Runner/fixtures/nền tảng/eval](THIEU.md#tuan-1) | [E2E content/jobs/AI](THIEU.md#tuan-2) | [Publish/analytics regression](THIEU.md#tuan-3) | [UAT/eval/restore/release](THIEU.md#tuan-4) |

## Cách nhận và hoàn thành việc

1. Mở bảng của mình và tuần hiện tại; nhận **một lát tính năng chính** với đầu ra cụ thể. Lane sửa lỗi chỉ xử lý lỗi cần cho lát đó/gate. Các mục cùng tuần là thứ tự làm, không yêu cầu mở tất cả đồng thời.
2. Dùng mã task gốc để đặt tên file/branch/PR. Với task chung, thêm tên người, ví dụ `fe/W2-FE-01-huyen-research`, `be/W2-BE-01-my-research`. Hai phần vẫn cùng truy về W2-FE-01 hoặc W2-BE-01.
3. Bắt đầu bằng AC, schema/examples và design đã bàn giao. Chưa có service thật thì dùng mock/stub đúng version để tự làm; khi ghép phải thay bằng API/service thật. Không chờ toàn bộ epic nền tảng đóng ngày 20.
4. Mỗi bàn giao ghi: task, người thực hiện, reviewer, phạm vi đã làm, commit/PR, contract/AC IDs, môi trường, lệnh kiểm tra và evidence. Nếu dùng mock/synthetic ghi rõ. AI thêm dataset/model/prompt versions; metric thêm property/range/timezone/source.
5. Tick task con trong [checklist triển khai](../execution/README.md) khi đầu ra/evidence đạt; chỉ tick task cha trong [TODO](../../../TODO.md) khi **tất cả phần người được phân công** đạt AC, review và tích hợp. Các bảng cá nhân dưới đây là hướng dẫn/mốc, không giữ bản sao checklist trạng thái. PM tổng hợp task cha; từng người lưu task/evidence riêng trong vùng của mình.

## Mốc và điều kiện chung

Ngày 1–20 tính từ kickoff, 5 ngày làm việc/tuần; chưa gán ngày lịch. Các mốc trong bảng là mục tiêu bàn giao, không phải xác nhận tính năng đã tồn tại. Không yêu cầu kê giờ. Effort S/M/L và xử lý quá tải theo [W1-PM-02](../W1-PM-02.md); scope thay đổi phải có quyết định PM/PO, không âm thầm bỏ module/AC.

- Ngày 2: field/state/schema/jobs/event baseline; ngày 5: nền tảng và RAG; ngày 10: research → draft; ngày 15: publish → analytics; ngày 18: freeze toàn bộ tính năng; ngày 19: UAT; ngày 20: go/no-go.
- Dương/Trường bàn giao theo lô trước triển khai 1–2 ngày; không đợi thiết kế/spec hoàn chỉnh cả 16 module. Thiệu kiểm từng lát khi có build, không gom kiểm thử vào ngày cuối tuần.
- Thiệu Quang tích hợp contracts, API router/common, migrations/policies và CI. Tiến tích hợp FE routes/common/manifest/lockfile. Mỹ quản worker package. Huyền gửi nhu cầu route/common qua Tiến. Chưa tạo folder feature không có nghĩa được sửa tùy ý vùng khác.
- PostgreSQL/pgvector/SearXNG và Ollama đã có probe local; các app/worker/AI product vẫn cần bootstrap. Không đánh dấu task lập trình Done bằng probe hạ tầng.
- Public URL/domain và GA4/GSC đang thiếu. Quang Quang điều phối quyền/URL; Mỹ kết nối; Tiến gắn tracking; Thiệu kiểm chứng. Thiếu quyền thì ghi blocker, tiếp tục stub/local; gate live giữ mở.
- Human approval gắn đúng version trước publish. Conversion là **form được server lưu thành công**, không phải click CTA/account signup. Không đưa tên/email vào analytics. Experiment ít mẫu phải hiện thiếu bằng chứng.

## Mẫu cập nhật một lát công việc

```text
Task: W2-FE-01 / Huyền / research và opportunities
Trạng thái: local_verified
Reviewer: Tiến (FE), Trường (design); Thiệu kiểm AC
Đầu ra: feature + mock cùng contract version; loading/empty/error đủ
Phụ thuộc còn thiếu: live research API, owner Mỹ
Evidence: commit/build, AC IDs, lệnh kiểm tra và đường dẫn kết quả
Bước tiếp: ghép staging với Mỹ, chạy lại AC trước khi PM tick task chung
```
