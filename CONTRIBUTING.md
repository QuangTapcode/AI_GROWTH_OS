# Làm việc độc lập, review và merge

## 1. Tổ chức branch

Sau khi đội tạo remote repository và commit baseline, dùng `main` làm nhánh tích hợp được bảo vệ. Mỗi task một branch ngắn; không dùng nhánh FE/BE/AI tồn tại suốt 4 tuần vì sẽ dồn conflict và lệch contract.

Tên branch: `<role>/<task-id>-<mo-ta>`, ví dụ `fe/ST-M08-001-content-editor`, `be/ST-M08-001-content-api`, `ai/ST-M08-001-generate-draft`, `qa1/ST-M08-001-editor-tests`, `ba/ST-M08-001-acceptance`, `ux/ST-M08-001-editor-spec`.

Repository dùng nhánh main và origin https://github.com/QuangTapcode/AI_GROWTH_OS.git. CI, required reviews và branch protection còn cần cấu hình ở W1-BE-05. Các lệnh sau là quy trình làm việc với remote:

```powershell
git switch main
git pull --ff-only origin main
git switch -c fe/ST-M08-001-content-editor
# Chỉnh sửa, chạy checks trong README của đơn vị sau khi bootstrap
git add apps/web
git commit -m "feat(web): add content editor for ST-M08-001"
git push -u origin fe/ST-M08-001-content-editor
```

Để cập nhật branch trước review, khi working tree sạch:

```powershell
git fetch origin
git merge origin/main
```

Giải quyết conflict cùng owner của file, rồi chạy lại checks. Không force-push `main`. Review diff trước commit; không commit secrets, dataset thật chứa thông tin nhạy cảm, artifacts lớn hoặc `.env`.

## 2. Pull request

PR nhỏ theo một task/đầu ra; review hằng ngày, demo hằng tuần. Đính kèm story ID, module Mxx, contract version, feature flag nếu cần, test evidence, ảnh UI/eval/migration tương ứng.

Thứ tự cho một feature: **story/AC → contract → implementation song song → integration evidence**. Design có thể làm song song với contract, nhưng field/state bàn giao phải khớp bản chốt.

- Contract PR không đi kèm thay đổi code lớn. BE merge sau khi provider và consumer bị tác động review.
- Source PR chỉ sửa khu vực được phân công; root config/shared fixtures có PR riêng của đầu mối.
- Unit/component tests ở cạnh source và do developer cập nhật. Tester duy trì suite độc lập dưới `qa`.
- Cập nhật task riêng trong `tasks/` của role. PM/đầu mối tổng hợp TODO tổng để tránh cả đội cùng sửa file đó.
- Khi API thật chưa sẵn sàng, FE PR có thể merge với feature flag tắt; trạng thái task là `local_verified`, không phải `done`.

## 3. Contract có version và chuyển đổi an toàn

Trong MVP freeze contract `1.0.0` sau review tuần 1. OpenAPI/JSON Schema là nguồn chuẩn sau khi được tạo, examples/mocks được validate theo đó. Bản hiện tại là đề xuất để đội review, chưa freeze.

Thêm field optional hoặc endpoint mới có thể là minor khi consumer thực sự chịu được. Đổi tên/xóa field, đổi type/enum/state/authorization/ý nghĩa metric là breaking; phải đánh giá consumer, tăng major khi cần.

Áp dụng **mở rộng → chuyển consumer → thu gọn**:

1. BA mô tả nhu cầu; gửi `contracts/changes/CR-xxx.md` với ảnh hưởng và các bên liên quan.
2. BE cập nhật contract, giữ behavior cũ và thêm đường mới; cập nhật examples + changelog.
3. Deploy provider hỗ trợ cả hai; FE/AI/QA chuyển dần và chạy consumer tests.
4. Chỉ xóa phiên bản cũ sau khi không còn consumer dùng, có kế hoạch release và rollback.

Schema migration cũng theo cách này: thêm nullable field/column trước, backfill có kiểm soát, đổi consumer, rồi mới xóa. Migration đã áp dụng không được sửa nội dung; tạo file mới. BE cấp tên thứ tự và review trên DB trống lẫn DB có dữ liệu phiên bản trước.

## 4. Checks cần dựng trên Git host

| Thay đổi | Checks bắt buộc sau bootstrap | Reviewer |
| --- | --- | --- |
| FE | Lint, typecheck, UI tests, build, contract consumer tests | FE reviewer được chỉ định; UI/UX/QA1 khi phù hợp |
| BE/worker/DB | Lint/typecheck, API/job tests, tenant/RLS, migration | BE reviewer được chỉ định, QA2; AI/FE cho boundary |
| AI Python | Python lint/typing/pytest, schema/fake tests, frozen eval | Thanh kiểm chứng, BE review interface, Dương review facts |
| Contract | OpenAPI/schema validate, breaking diff, examples + consumer checks | BE + mọi consumer bị ảnh hưởng |
| Design | Specs/tokens validate và FE review | UI/UX + FE |
| BA | Markdown links, traceability và AC review | PO/QA + owner kỹ thuật |
| QA | Playwright/TypeScript lane 1; pytest/Python lane 2; suite config, smoke, evidence | Service owner + Dương; Thanh không tự tạo reviewer thứ hai |

Tiến/Huyền peer-review FE; Thiệu Quang/Mỹ peer-review BE. Quang Quang kiêm AI/PM/PO nhưng kết quả AI cần Thanh kiểm chứng, BE review interface và Dương review facts/AC. Phân công theo [TEAM](docs/coordination/TEAM.md); review chéo không tự tăng capacity.

CI dùng path filters để chạy nhanh, nhưng thay đổi contract phải chạy checks của mọi consumer; source change có ảnh hưởng boundary phải chạy integration subset. Trước merge checks phải chạy trên trạng thái đã kết hợp với `main` mới nhất; dùng merge queue nếu Git host hỗ trợ, nếu không thì đầu mối tuần tự merge và revalidate PR còn lại.

Thiết lập required status checks, approvals, cấm push trực tiếp, và owner enforcement thực tế. `.github/OWNERSHIP.md` chưa có username/team nên chưa được dùng thay cho CODEOWNERS hợp lệ.

## 5. Trạng thái task và Definition of Done

`backlog → ready → in_progress → local_verified → integrated → done`; thêm `blocked` khi thiếu quyết định/quyền/dữ liệu, luôn ghi owner và cách tháo gỡ.

**Ready:** có AC, owner, estimate, reviewer, dependencies và contract hoặc design cần thiết. **Local verified:** chạy đạt với mock/stub và unit tests. **Integrated:** staging dùng services thật của feature và QA có evidence. **Done:** AC đạt, review/checks đạt, docs cập nhật; với release phải có readiness của PM/PO.

Story mẫu nằm ở [docs/ba/stories/TEMPLATE.md](docs/ba/stories/TEMPLATE.md). Blocker quá một ngày phải có người xử lý và phương án; PM điều phối. Release gate không được bỏ QA để giữ deadline.

## 6. Bốn kiểu xung đột và cách xử lý

| Loại | Cách xử lý |
| --- | --- |
| Hai người sửa một file | Chia file theo feature/task; owner tích hợp; không tự chọn `ours/theirs` cho toàn bộ file |
| Merge sạch nhưng API sai | Consumer contract tests + staging E2E; đổi interface qua contract PR |
| DB migrate làm bản cũ hỏng | Expand/backfill/migrate/contract; rollback app vẫn cần schema tương thích |
| Mock chạy, integration thật lỗi | Test real credentials/adapters/provider riêng; mock evidence không tính nghiệm thu thật |
