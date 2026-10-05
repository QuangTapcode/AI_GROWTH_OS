# Đội thực tế và phân công — 05/10/2026

Nguồn: người dùng cung cấp trong phiên làm việc W1-PM-01. Phân công theo tên thay baseline staffing trong kế hoạch gốc; không sửa tài liệu nguồn để đổi lịch sử.

| Người | Vị trí | Khu vực chính | Review/bàn giao |
| --- | --- | --- | --- |
| Quang Quang | AI + PM + PO | `services/ai/`, `docs/coordination/`, `TODO.md`; nghiệm thu nghiệp vụ | Dương hỗ trợ AC/UAT; Thanh kiểm chứng AI độc lập; BE review interface |
| Dương | BA | `docs/ba/`, quản `docs/sources/` | Quang Quang duyệt scope; Thanh review testability |
| Thiệu Quang | BE, đầu mối API/contract | `apps/api/` core/router/config, `database/migrations/`, `database/policies/`, `contracts/`, `.github/`, `infra/`, `docs/architecture/` | Mỹ peer-review BE; FE/AI review contracts |
| Mỹ | BE, jobs/integrations/data | `apps/worker/`, các API modules tích hợp/metrics/jobs, `database/seed/`, `docs/runbooks/` | Thiệu Quang review boundary/migrations; Thanh test jobs/metrics |
| Tiến | FE, đầu mối app shell/common | `apps/pilot/` toàn bộ website công khai; `apps/web/src/app/`, `components/`, `lib/`, FE config/manifest; các features phân bên dưới | Huyền peer-review FE; Trường design review |
| Huyền | FE, content flows và UI tests | Các features phân bên dưới, `apps/web/src/mocks/`, `tests/` | Tiến peer-review FE; Trường/Thanh review UI/AC |
| Trường | UI/UX | `design/` | Tiến/Huyền review handoff; Dương review flows |
| Thanh | Tester: cả lane 1 và lane 2 | `qa/tester-1/`, `qa/tester-2/`, `qa/fixtures/`, `qa/evidence/` | Chuyên môn review defects; Quang Quang nhận QA evidence |

## Ranh giới hai FE

- Tiến sở hữu apps/pilot (blog/landing/form/tracking), app quản trị routes/layout/session, components/lib và cấu hình package; features dự kiến `workspace`, `onboarding`, `goals`, `strategy`, `tasks`, `traffic`, `integrations`, `analytics`, `experiments`.
- Huyền sở hữu features dự kiến `knowledge`, `research`, `opportunities`, `briefs`, `content`, `variants`, `seo`, `approval`, `calendar`, `community`, `reports`, `learning`, cùng mocks/UI tests.
- Feature source nằm riêng; route registry/app config/common component do Tiến tích hợp sau review. Huyền không phải chờ API thật để làm feature: dùng contract/mock và common-component interfaces đã chốt.
- Khi test/common UI cần đổi, gửi PR có owner khu vực review; không chia hai lockfile trong cùng `apps/web/` package. Tiến là đầu mối lockfile FE.

## Ranh giới hai BE

- Thiệu Quang sở hữu API root/router/common libs và domains `identity`, `workspaces`, `business`, `knowledge`, `opportunities`, `strategies`, `tasks`, `briefs`, `contents`, `approval`; đầu mối contract và migrations/policies.
- Mỹ sở hữu domains `goals`, business-profile slice M01, `research`, `seo`, `publishing`, `leads` (form submission), `community`, `tracking`, `metrics`, `reports`, `experiments`, `learning`, `integrations`, worker jobs/adapters, seed và runbooks.
- Domain handlers nằm ở file/module riêng; root routing/common configuration do Thiệu Quang tích hợp. Mỹ đề xuất migration qua PR, Thiệu Quang cấp thứ tự/review/merge; worker package do Mỹ quản manifest/lockfile riêng.
- Đây là phân công thực thi ban đầu theo ranh giới hiện có, được PM/PO đổi bằng decision record khi estimate cho thấy mất cân bằng.

## Ngôn ngữ và giao tiếp

- FE: **TypeScript**, HTML/CSS; Next.js/React/Tailwind theo cấu trúc đã chọn.
- BE/API và worker: **TypeScript + SQL**. CMS pilot đã chốt Next.js/TypeScript; cách tổ chức API Next.js và worker chốt ở W1-BE-01; task này không bootstrap hoặc cài framework.
- AI: **Python**, SQL cơ bản; FastAPI là lựa chọn cơ sở theo bảng người dùng gửi, SDK LLM; LangGraph chỉ thêm khi pipeline cần.
- Thanh lane 1: TypeScript/Playwright; lane 2: Python/pytest/HTTP client/SQL, Postman nếu cần.
- FE/BE/AI trao đổi HTTP/JSON qua OpenAPI/JSON Schema có version; không dùng source/type TypeScript nội bộ làm contract bắt buộc cho Python.

## Capacity và tách vai trò nghiệm thu

Đội có **8 người**, 2 FE, 2 BE, 1 BA, 1 UI/UX, 1 Tester; Quang Quang là một người kiêm AI/PM/PO. Không có PM riêng hoặc hai Tester riêng trong roster này.

W1-PM-02 dùng task S/M/L và mốc bàn giao theo chỉ đạo mới; không yêu cầu bảng giờ chi tiết. WIP dùng chung cho vai trò kiêm nhiệm, giữ review/tích hợp/QA. Không tính Quang Quang thành ba người/60 ngày, không tính Thanh thành hai người. 20 ngày danh nghĩa/người trong kế hoạch là tổng thời gian các vai trò dùng chung, chưa có phân bổ được xác nhận; không tự tăng feature capacity bởi thay roster.

Quang Quang có thể nghiệm thu với tư cách PO theo phân công của người dùng. Kết quả pipeline do Quang Quang viết phải có Thanh kiểm chứng và BE review interface; không lấy AI tự chấm hoặc tác giả tự xác nhận làm bằng chứng chất lượng duy nhất. AI agent vẫn không tự thực hiện human approval; thao tác duyệt của PO/người dùng cần identity/audit cụ thể.

Git usernames/team và kickoff date chưa có; W1-BE-05/PM sẽ bổ sung. Theo chỉ đạo mới không yêu cầu kê số giờ từng vai trò; W1-PM-02 quản theo task/mốc. Bảng tên không phải CODEOWNERS đã được cấu hình.


Cập nhật W1-PM-02: Mỹ nhận M03 goals và business-profile slice M01 để cân bằng BE; Thiệu Quang vẫn review root API/auth/contracts/migrations. Local AI Ollama và hosting server theo người dùng; PostgreSQL/pgvector và SearXNG là baseline đề xuất đã đưa vào kế hoạch. Xem [W1-PM-02](W1-PM-02.md) và [W1-PM-03](W1-PM-03.md).
