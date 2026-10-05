# Backlog — 16 epic sản phẩm và một epic nền tảng

05/10/2026 · W1-PM-01 · Owner/reviewer theo roster đã xác nhận; PO/PM: Quang Quang. Website/CMS Next.js tối giản cho TripC đã chọn, conversion form thành công; năm seed nguồn đã khảo sát ở [SOURCES](../SOURCES.md), corpus chưa crawl. Epic planned, chưa triển khai hoặc Done.

[SCOPE](../../ba/SCOPE.md) · [TODO](../../../TODO.md) · [TEAM](../TEAM.md) · [PILOT](../PILOT.md) · [task W1-PM-01](../W1-PM-01.md) · [registry JSON](epics.json)

| Epic | Owner bàn giao | Reviewers | Ngày bắt đầu → mục tiêu | Build dependencies |
| --- | --- | --- | --- | --- |
| [EP-FOUNDATION — Nền tảng dùng chung và tích hợp](epics/EP-FOUNDATION.md) | Thiệu Quang (BE) | Tiến, Huyền, Quang Quang, Thanh, Mỹ | 1 → 20 | Không |
| [EP-M01 — Workspace](epics/EP-M01.md) | Thiệu Quang (BE) | Dương, Tiến, Huyền, Thanh, Mỹ | 1 → 5 | EP-FOUNDATION |
| [EP-M02 — Business Knowledge Base](epics/EP-M02.md) | Quang Quang (AI) | Thiệu Quang, Mỹ, Dương, Thanh | 2 → 5 | EP-FOUNDATION, EP-M01 |
| [EP-M03 — Growth Goal Manager](epics/EP-M03.md) | Mỹ (BE) | Dương, Tiến, Huyền, Thanh, Thiệu Quang | 2 → 5 | EP-FOUNDATION, EP-M01 |
| [EP-M04 — Market Intelligence Engine](epics/EP-M04.md) | Quang Quang (AI) | Thiệu Quang, Mỹ, Dương, Thanh | 6 → 7 | EP-FOUNDATION, EP-M01, EP-M02, EP-M03 |
| [EP-M05 — Opportunity Engine](epics/EP-M05.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 6 → 7 | EP-FOUNDATION, EP-M03, EP-M04 |
| [EP-M06 — Growth Strategy Engine](epics/EP-M06.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 7 → 8 | EP-FOUNDATION, EP-M03, EP-M05 |
| [EP-M07 — Content Intelligence Engine](epics/EP-M07.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 7 → 8 | EP-FOUNDATION, EP-M02, EP-M05, EP-M06 |
| [EP-M08 — AI Content Factory](epics/EP-M08.md) | Quang Quang (AI) | Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Thanh | 8 → 10 | EP-FOUNDATION, EP-M02, EP-M07 |
| [EP-M09 — SEO Intelligence Engine](epics/EP-M09.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 9 → 15 | EP-FOUNDATION, EP-M07, EP-M08 |
| [EP-M10 — Distribution Engine](epics/EP-M10.md) | Mỹ (BE) | Dương, Tiến, Huyền, Thanh, Thiệu Quang | 11 → 12 | EP-FOUNDATION, EP-M08, EP-M09 |
| [EP-M11 — Community Growth Engine](epics/EP-M11.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 12 → 13 | EP-FOUNDATION, EP-M02, EP-M05, EP-M08, EP-M10 |
| [EP-M12 — Traffic Engine](epics/EP-M12.md) | Mỹ (BE) | Dương, Tiến, Huyền, Thanh, Thiệu Quang | 1 → 13 | EP-FOUNDATION, EP-M03 |
| [EP-M13 — Analytics Engine](epics/EP-M13.md) | Mỹ (BE) | Dương, Tiến, Huyền, Thanh, Thiệu Quang | 1 → 14 | EP-FOUNDATION, EP-M01, EP-M03 |
| [EP-M14 — AI Growth Analyst](epics/EP-M14.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 16 → 16 | EP-FOUNDATION, EP-M03, EP-M06, EP-M13 |
| [EP-M15 — Experiment Engine](epics/EP-M15.md) | Mỹ (BE) | Dương, Tiến, Huyền, Quang Quang, Thanh, Thiệu Quang | 17 → 17 | EP-FOUNDATION, EP-M08, EP-M10, EP-M12, EP-M13 |
| [EP-M16 — Learning Engine](epics/EP-M16.md) | Quang Quang (AI) | Dương, Thiệu Quang, Mỹ, Thanh | 18 → 18 | EP-FOUNDATION, EP-M06, EP-M08, EP-M13, EP-M14, EP-M15 |

## Quy tắc dependency và lịch

- Build dependency cần để triển khai lát chính; integration dependency cần để đối chiếu AC đầy đủ, không khóa toàn bộ công việc trước đó.
- EP-FOUNDATION có milestones ngày 2/5/20. Module chỉ chờ interface/auth/DB/jobs cần dùng, không chờ release nền tảng ngày 20.
- M12/M13 cùng event/metric contract từ tuần 1: M13 probe/OAuth/sync, M12 UTM/mapping; tuần 3 ghép metrics/campaigns, không tạo vòng chờ hai epic.
- M09 rule/cluster/link/local draft bàn giao sớm; refresh đối chiếu metric ngày 14–15. M10 làm approval/CMS với lát SEO đủ AC, không chờ cả refresh.
- M03 lưu goal tuần 1; progress nguồn thật đối chiếu lại khi M13 sync. Thiếu số liệu hiện missing.
- Ngày 15 freeze chức năng mới M01–M13; ngày 18 freeze M14–M16; ngày 19 UAT, ngày 20 release. Ngày tính từ kickoff, chưa gán lịch thực tế.

## Ready, effort và review

Story Ready cần AC chi tiết/estimate/reviewer/contract/design/quyền dữ liệu. BA phân rã epic thành stories sau; effort tương đối/local budget/limits đã lập tại [W1-PM-02](../W1-PM-02.md), engineering estimates cần rà theo lát triển khai, probes/quyền thuộc W1-PM-03/W1-BE-04. Không coi epic file là feature đã xây hoặc PO đã nghiệm thu code.

Đội thực tế 8 người; Quang Quang kiêm AI/PM/PO, Thanh là một Tester làm hai lane, hai FE và hai BE có phân vùng trong TEAM. Không dùng capacity kế hoạch 7 người + PM riêng để cam kết. Reviewer của từng epic đã có tên; khi chia task, code review cần owner chuyên môn theo đúng vùng file.

Đổi module/AC/giới hạn pilot phải cập nhật registry + epic + SCOPE và decision record. Quality evidence gồm commit/environment/test IDs/source/schema/prompt/model/dataset versions; mock không thay staging/live connector evidence.
