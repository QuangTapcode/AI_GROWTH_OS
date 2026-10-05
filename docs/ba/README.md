# BA — Nghiệp vụ và nghiệm thu pilot 4 tuần

Owner: BA; PO duyệt scope/AC. Vùng sửa: `docs/ba/**`; quản tài liệu nguồn ở `docs/sources/`. Đọc [SCOPE](SCOPE.md) và task W1–W4-BA trong [TODO](../../TODO.md).

BA làm độc lập bằng Markdown, PRD/kế hoạch 4 tuần và prototype review; chuẩn bị theo lô trước 1–2 ngày, QA review AC trước code.

- `stories/`: một feature một file `ST-Mxx-xxx.md`, mã M01–M16 mới; dùng [template](stories/TEMPLATE.md).
- `acceptance/`: story→contract/design→test/evidence→weekly gate traceability.
- `processes/`: role-action matrix Owner/Editor/Viewer, state machines, approval và DEC records.
- `data-dictionary/`: field/KPI nghĩa gì, units/source/validation, missing/zero/range/timezone.
- `tasks/`: task riêng theo ID tuần; PM tổng hợp TODO, không cả đội cùng sửa.

Tuần 1 chi tiết M01–M03, AC sơ bộ 16 module; tuần 2 M04–M08 và chuẩn bị M09–M13; tuần 3 chốt M09–M13/M14–M16/UAT; tuần 4 đối chiếu 16 module, UAT/handover.

Story Ready cần persona/value/scope/AC/role/tenant/state/error/estimate/reviewer/dependencies. BA không sửa code/prompt/schema để thay nghiệp vụ; dùng CR cho BE merge, AI/QA2 review facts/metrics/rubric. UAT cần staging thật; mock không đủ nghiệm thu.
