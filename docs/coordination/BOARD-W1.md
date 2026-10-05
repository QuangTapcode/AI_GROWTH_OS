# Board tuần 1 — chọn task kế tiếp, không chấm giờ

05/10/2026 · PM Quang Quang tổng hợp. Các lựa chọn dưới đây là **planned**, chưa khẳng định thành viên đã bắt đầu code. Mỗi người chỉ chuyển một feature chính sang in_progress, cùng tối đa một fix lane; nhiều vai trò của một người dùng chung capacity.

| Người | Task/lát chính tiếp theo | Trạng thái | Bàn giao đầu tiên | Phụ thuộc / review |
| --- | --- | --- | --- | --- |
| Quang Quang | W1-AI-01 Ollama adapter/schema/fake mode; PM03 điều phối | planned / PM03 in_progress | Provider contract + model/eval config | Thiệu Quang/Mỹ boundary; Thanh kiểm chứng |
| Dương | W1-BA-01 stories/roles/source/goals/form | planned | AC + field/state rules | PO scope; Thanh testability |
| Trường | W1-UX-01 tokens/core journeys | planned | Shared states/components và pilot form spec | Tiến/Huyền + Dương |
| Thiệu Quang | W1-BE-01 DB/auth/contracts/bootstrap core | planned | Tenant/schema/health contracts | Mỹ peer-review; server blocker B01 |
| Mỹ | W1-BE-01 worker/queue/integration bootstrap | planned | Durable job contract + public form/CMS boundary draft | Thiệu Quang; DB/query/provider interfaces |
| Tiến | W1-FE-01 Next.js admin shell + public pilot package | planned | Mock routes/client và blog/landing shell | Trường/BE; package config do Tiến tích hợp |
| Huyền | W1-FE-01 feature mocks/components/tests | planned | Knowledge/content form skeleton theo contract | Tiến shell interface; không sửa chung lockfile |
| Thanh | W1-QA2-01 fixtures/tenant/contract smoke plan | planned | Negative cases + fixtures; sau đó QA1 runner/journeys | BA/BE/AI; một queue QA chung |

W1-PM-01/02 done là đầu ra kế hoạch. W1-PM-03 còn access/probes/staging/demo như [RISKS](RISKS.md), không phải Done. Fix lane hiện chưa có defect đã ghi; khi có phải gắn ID/severity/owner/evidence. Dương hỗ trợ business UAT theo checklist Thanh khi M10 ready, không thay specialist QA.

Mỗi cập nhật board ghi task ID, next output, blocked reason/owner/due; không yêu cầu số giờ theo chỉ đạo người dùng. [TODO](../../TODO.md) là checklist tổng; [DEMO-W1](DEMO-W1.md) là gate ngày 5.
