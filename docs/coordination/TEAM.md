# Đội thực thi — 7 người / baseline 14/10/2026

Theo phụ lục phân công file Word và yêu cầu 3 tuần mới. [Kế hoạch hiện hành](sprint-3-weeks/README.md). Roster 8 người trước đây đã được thay bằng roster này; Tiến nhận phần FE cũ theo scope tối giản.

| Người | Vai trò | Khu vực chính |
| --- | --- | --- |
| [Quang Quang](sprint-3-weeks/QUANG-QUANG.md) | AI + PM + PO | `services/ai/; docs/coordination/; TODO.md` |
| [Dương](sprint-3-weeks/DUONG.md) | BA | `docs/ba/; docs/sources/` |
| [Trường](sprint-3-weeks/TRUONG.md) | UI/UX | `design/` |
| [Thiệu Quang](sprint-3-weeks/THIEU-QUANG.md) | Backend API + dữ liệu + contracts | `apps/api/; database/migrations/; database/policies/; contracts/; .github/; infra/` |
| [Mỹ](sprint-3-weeks/MY.md) | Backend worker + tích hợp | `apps/worker/; apps/api/src/modules/integrations/; publishing/metrics/community slices; docs/runbooks/` |
| [Tiến](sprint-3-weeks/TIEN.md) | Frontend duy nhất: admin + pilot | `apps/web/; apps/pilot/` |
| [Thiệu](sprint-3-weeks/THIEU.md) | QA: hai lane trong cùng capacity | `qa/tester-1/; qa/tester-2/; qa/fixtures/; qa/evidence/` |

## Quyền sửa và review

- Thiệu Quang quản API root/auth/shared libs, contracts, migrations/policies, CI và deployment configuration. Mỹ review BE; consumer FE/AI/QA review schema trước freeze.
- Mỹ quản worker, publisher, connectors, metrics/intake integration, seed và runbooks; API root/migration thay đổi qua Thiệu Quang review. Lead persistence thuộc Thiệu Quang; intake thuộc Mỹ.
- Tiến sở hữu toàn bộ apps/web và apps/pilot, common components, API client, manifests/lockfiles. Trường review UX/spec, Thiệu kiểm E2E. Phần cũ của Huyền được tiếp nhận theo scope tối giản.
- Quang Quang quản AI pipeline/prompt/schema/eval và PM/PO; Mỹ review HTTP boundary, Thiệu kiểm chất lượng độc lập. Không tự coi AI tự chấm là nghiệm thu.
- Dương quản AC/business rules/facts/KPI/UAT; Trường quản design; Thiệu quản hai lane QA và evidence, cùng một capacity.

Ngôn ngữ giữ nguyên: FE/API/worker TypeScript, DB SQL, AI Python, giao tiếp HTTP/JSON. Không chia một người thành nhiều capacity vì kiêm nhiệm. Human approval có actor/audit; agent không tự duyệt. Mỗi task ghi reviewer trong file cá nhân.
