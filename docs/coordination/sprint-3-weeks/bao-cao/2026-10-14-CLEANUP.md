# Dọn thành phần cũ — 14/10/2026

## Đã xóa: 24 file

- 9 file trong `docs/coordination/weekly-todos/`: phân công cũ 8 người, được thay bằng bảy TODO hiện hành.
- 4 checklist `docs/coordination/execution/W1.md` đến `W4.md`: lịch cũ 20 ngày, được thay bằng sprint 15 ngày.
- 3 snapshot trong `docs/coordination/archive/baseline-before-2026-10-14/`: README/TEAM/TODO trùng.
- 4 snapshot trong `docs/sources/archive-8-weeks/`: README/TODO/SCOPE/CONTRACTS trùng với tài liệu hiện hành.
- `MARKETING-TEAM-V2-TODO.md`, `BOARD-W1.md`, `DEMO-W1.md`: backlog/board/demo cũ được thay bằng sprint index và các gate mới.
- `package-lock.json` ở root: packages rỗng, không có package.json ở root; mỗi app/service giữ manifest/lockfile riêng đang dùng.

Các file được xóa bằng patch từng đường dẫn cụ thể. Lệnh xóa thư mục đệ quy ban đầu bị cơ chế duyệt tự động chặn; không có file bị xóa bởi lệnh đó. Các thư mục rỗng có thể còn trên máy, Git không lưu thư mục rỗng.

## Giữ vì còn dùng được

RAG/guardrails/providers/run store, Growth Map, API/schema/migrations, worker/adapters, FE shell, fixtures/tests/mocks/stubs và các lockfile package còn giá trị chạy hoặc chuyển đổi. Chưa xác minh được mã nguồn runtime nào là dead code có thể xóa an toàn trong lượt này; không xóa handler generic khi registry vẫn gọi nó.

Giữ `qa/tester-1/tsconfig.backup` vì khác cấu hình hiện hành và có thể dùng để phục hồi cấu hình; chưa có căn cứ coi là bản trùng. Giữ audit, PRD/tài liệu nguồn, research notes, epics/AC, DATA-AND-FLOWS và EXAMPLES vì có nghiệp vụ/evidence còn dùng lại. Lịch/roster trong tài liệu tham chiếu không thay baseline hiện hành.

## Kiểm tra

Sửa liên kết từ file còn giữ sang checklist mới, thay mô tả archive ở README/TODO/TEAM/REUSE-MAP. Lượt này không thay mã nguồn runtime; kiểm tra liên kết và trạng thái file, không chạy lại test sản phẩm.
