# Quyền sở hữu file — pilot 4 tuần

Bảng này là chính sách phối hợp, chưa phải CODEOWNERS hoạt động. W1-BE-05 ánh xạ role sang Git username/team và cấu hình required reviews/checks/branch protection.

| Pattern | Owner merge | Reviewer khi ảnh hưởng bên khác |
| --- | --- | --- |
| `/apps/web/**` | FE | UI/UX, QA1; BE cho API boundary |
| `/apps/pilot/**` | Tiến | Huyền, Trường, Thiệu; Mỹ/Thiệu Quang cho public API/form boundary |
| `/apps/api/**`, `/apps/worker/**`, `/database/**`, `/infra/**` | BE | QA2, FE/AI cho interface |
| `/services/ai/**` | AI | QA2, BE; BA cho facts/metrics |
| `/docs/ba/**` | BA | PO, QA, owner kỹ thuật |
| `/design/**` | UI/UX | FE, BA, QA1 |
| `/qa/tester-1/**` | Thiệu — lane 1 | Dương, Tiến/Huyền |
| `/qa/tester-2/**` | Thiệu — lane 2 | Thiệu Quang/Mỹ, Quang Quang; Dương review AC |
| `/qa/fixtures/**` | Tester 2 | BE + consumer fixture |
| `/qa/evidence/**` | Tester tạo evidence | QA lead; tên riêng theo build/task |
| `/contracts/**` | BE đầu mối | Tất cả provider/consumer bị tác động |
| `/docs/architecture/**`, `/docs/runbooks/**` | BE | FE/AI/QA khi áp dụng |
| `/docs/coordination/**`, `/TODO.md` | PM | BA + task owner |
| `/.github/**`, `/README.md`, `/CONTRIBUTING.md`, root configs | BE đầu mối, PM điều phối | Consumer bị ảnh hưởng |
| `/docs/sources/**` | BA | PO khi thay nguồn chuẩn |

Owner không được bỏ checks hoặc tự quyết nghiệp vụ. Khi ít người review, PM chỉ định reviewer chéo đủ năng lực; quyền dữ liệu và AI pipeline phức tạp không chỉ do tác giả tự xác nhận.


## Phân công hiện hành

Tên người và ranh giới hai FE/hai BE theo [TEAM](../docs/coordination/TEAM.md). apps/pilot thuộc Tiến, Huyền peer-review, Trường/Thiệu review UI và QA. Đầu mối contracts/root API/migrations là Thiệu Quang; worker/integrations là Mỹ. AI/PM/PO là Quang Quang; BA Dương; UI/UX Trường; cả hai lane QA là Thiệu. Git usernames chưa có nên bảng này chưa phải CODEOWNERS tự động.
