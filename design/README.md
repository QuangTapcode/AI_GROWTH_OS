# UI/UX — Thiết kế và handoff

Owner: UI/UX. Vùng sửa: `design/**`; source React/CSS implementation nằm ở FE, không cùng sửa.

## Làm độc lập

Đọc story/AC và contract fields; dựng flow/prototype bằng dữ liệu synthetic. BA review nghiệp vụ, FE review khả năng triển khai, QA1 review states/accessibility. Bàn giao trước FE ít nhất một tuần.

- `prototypes/`: links/version/export của prototype; chỉ lưu assets có quyền chia sẻ.
- `specs/<feature>.md`: một file theo feature, gồm story IDs, screen states, fields/validation, interactions, responsive và accessibility.
- `tokens/`: JSON trung lập cho colors/spacing/type/radii; FE sinh/ánh xạ implementation trong vùng FE.
- `assets/`: SVG/icons/images/fonts đã chọn, nguồn/quyền sử dụng rõ.
- `tasks/`: task UI/UX riêng và design QA findings.

Mọi feature có default/loading/empty/error/permission/success; async có progress/cancel/retry; editor có autosave/stale conflict; analytics phân biệt zero/missing/delayed. Không để label nói đã connected/published nếu dữ liệu chỉ là mock.

Tokens và specs có version. Đổi token lớn tạo PR riêng, FE review trước merge và chạy visual checks sau implementation. UI/UX không tự tạo API fields ngoài contract; đề nghị BA/BE chốt nếu thiếu.
