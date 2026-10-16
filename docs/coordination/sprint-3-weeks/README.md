# Kế hoạch 7 người / 6 agent / 3 tuần

Baseline mới: **14/10/2026**. Nguồn: AI_Growth_OS_Final_Updated.docx (7 người), sơ đồ 6 agent và yêu cầu mới 3 tuần. Checklist phân công 4 tuần/8 người đã xóa vì được thay thế; audit và đặc tả hữu ích tiếp tục làm căn cứ. Không chuyển checkbox Done sang baseline này.

Lịch dự kiến: **15/10–04/11/2026**, 15 ngày làm việc, thứ Hai–thứ Sáu; chưa tính ngày nghỉ riêng. Tuần 1 D1–D5: 15,16,19,20,21/10; tuần 2 D6–D10: 22,23,26,27,28/10; tuần 3 D11–D15: 29,30/10 và 02,03,04/11. Nếu kickoff đổi, giữ thứ tự D và dịch ngày.

## Nhận việc

| Người | Vai trò | Khu vực chính |
| --- | --- | --- |
| [Quang Quang](QUANG-QUANG.md) | AI + PM + PO | `services/ai/; docs/coordination/; TODO.md` |
| [Dương](DUONG.md) | BA | `docs/ba/; docs/sources/` |
| [Trường](TRUONG.md) | UI/UX | `design/` |
| [Thiệu Quang](THIEU-QUANG.md) | Backend API + dữ liệu + contracts | `apps/api/; database/migrations/; database/policies/; contracts/; .github/; infra/` |
| [Mỹ](MY.md) | Backend worker + tích hợp | `apps/worker/; apps/api/src/modules/integrations/; publishing/metrics/community slices; docs/runbooks/` |
| [Tiến](TIEN.md) | Frontend duy nhất: admin + pilot | `apps/web/; apps/pilot/` |
| [Thiệu](THIEU.md) | QA: hai lane trong cùng capacity | `qa/tester-1/; qa/tester-2/; qa/fixtures/; qa/evidence/` |

Tiến là FE duy nhất. Công việc cũ của Huyền chuyển sang Tiến và phải giảm độ sâu giao diện. Quang Quang dùng chung capacity AI/PM/PO; Thiệu dùng chung capacity hai lane QA. Trường bàn giao component/spec để giảm tải Tiến, không tính thêm lập trình viên FE.

## Phạm vi bắt buộc

TripC, một campaign, 6 pipeline tối thiểu; nguồn và hồ sơ approved/version; shared ledger; website publish qua human approval; social pack có ảnh thật; form lead DB/owner/status; grounded reply; Performance proposal; report/learning tạo task kế tiếp. Level 2: tạo và bàn giao nội bộ tự động, nội dung ra ngoài cần người duyệt. Orchestrator/executor là hạ tầng.

FB/IG live theo capability xác minh trước D3; thiếu quyền xuất manual pack có nhãn. GA4/GSC/Meta read khi có quyền; thiếu dữ liệu hiển thị missing, không fake số. Ads chỉ đọc/đề xuất. Hoãn video render, CRM/calendar ngoài, auto follow-up, live spend, engine experiment nâng cao, editor phong phú và lịch kéo thả.

## Gate và critical path

| Mốc | Gate | Chủ trì |
| --- | --- | --- |
| D2 | Scope/AC/contract nền + estimate/WIP; chốt profile/facts/CTA | Dương, Thiệu Quang, Quang Quang |
| D3 | AI HTTP adapter bản đầu + quyết định social live/manual | Mỹ |
| D5 | Một AI run thật: snapshot → worker → AI → artifact → dashboard; workflow lưu/resume | Mỹ, Quang Quang, Tiến; Thiệu kiểm |
| D10 | Blog approved live → form lead DB; 6 role có output/schema/scope/eval/handoff tối thiểu | Cả đội; Thiệu kiểm |
| D11 | Freeze contract/dataset và hạn thêm feature | Thiệu Quang, Dương, Quang Quang |
| D13 | Freeze code candidate; vòng report → learning → task tiếp chạy được | Quang Quang, Mỹ |
| D14 | UAT, regression, tenant/version/retry/recovery/restore verdict | Thiệu, Dương |
| D15 | Demo và bàn giao; PO quyết định release theo evidence | Quang Quang |

Critical path: DU-01 → TQ-01 → TQ-02/MY-01 → TQ-03/MY-03 → QQ-03/QQ-04 → QQ-05 → TQ-04/MY-04/TI-04 → TQ-05/TI-06 → QQ-06/MY-06 → QQ-07/MY-07 → TH-07/TH-08 → bàn giao. Chuẩn bị spec/schema/mock có thể chạy trước; nghiệm thu tích hợp phải đủ dependency thật.

## Nhịp và cách nghiệm thu

- Hằng ngày cập nhật task + blocker, tích hợp lát nhỏ; một feature chính/người và một lane sửa lỗi.
- Handoff ghi task ID, contract version, PR/commit/build, môi trường, artifact/run refs và evidence; reviewer trong một ngày làm việc.
- Backend API quản migration/contract/root wiring; Mỹ review integration. Tiến quản cả hai app FE/lockfiles; Trường review UI.
- Done = AC đạt + reviewer + tích hợp + evidence. Fake/local khác live/integrated. Các số test trong audit 09/10 là lịch sử.
- D5 và D10 đánh giá lại capacity; nếu gate trượt, ghi tác động và giảm các mục tùy chọn trước. Lịch 3 tuần là mục tiêu pilot có điều kiện, không chứng nhận production readiness.

## Tái sử dụng và nguồn chuẩn

Thư mục này giữ bảy file nhiệm vụ cá nhân và README kế hoạch chung. Báo cáo, biên bản, handoff và bản đồ tham chiếu nằm trong [bao-cao/](bao-cao/), đặt tên `YYYY-MM-DD-TEN-BAO-CAO.md` theo ngày lập báo cáo để dễ sắp xếp và theo dõi.

[Kiến trúc/cấu trúc mới](../../architecture/SIX-AGENT-RESTRUCTURE.md) · [Bản đồ tái sử dụng và task cũ](bao-cao/2026-10-14-REUSE-MAP.md) · [Roster](../TEAM.md) · [TODO tổng](../../../TODO.md).

Mỗi task trong 7 file cá nhân là nguồn trạng thái chi tiết duy nhất; TODO tổng chỉ giữ gate để tránh cập nhật hai bảng khác nhau.
