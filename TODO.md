# TODO — 7 người / 6 agent / 3 tuần

Baseline 14/10/2026 theo file Word và yêu cầu mới. Lịch dự kiến **15/10–04/11/2026**, 15 ngày làm việc. Tất cả gate mới chưa nghiệm thu; tận dụng code cũ theo bản đồ reuse.

**Nhận việc tại [kế hoạch 3 tuần](docs/coordination/sprint-3-weeks/README.md)**. Mỗi người cập nhật file cá nhân; file này chỉ tổng hợp gate.

| Người | Vai trò | TODO |
| --- | --- | --- |
| Quang Quang | AI + PM + PO | [QUANG-QUANG](docs/coordination/sprint-3-weeks/QUANG-QUANG.md) |
| Dương | BA | [DUONG](docs/coordination/sprint-3-weeks/DUONG.md) |
| Trường | UI/UX | [TRUONG](docs/coordination/sprint-3-weeks/TRUONG.md) |
| Thiệu Quang | Backend API/data/contracts | [THIEU-QUANG](docs/coordination/sprint-3-weeks/THIEU-QUANG.md) |
| Mỹ | Backend worker/integrations | [MY](docs/coordination/sprint-3-weeks/MY.md) |
| Tiến | Frontend admin + pilot | [TIEN](docs/coordination/sprint-3-weeks/TIEN.md) |
| Thiệu | QA cả hai lane | [THIEU](docs/coordination/sprint-3-weeks/THIEU.md) |

## Gate tổng

- [ ] D2 — Chốt scope, AC, contracts, source/offer/CTA và capacity.
- [ ] D3 — Spike connector; chốt social live/manual và AI HTTP adapter bản đầu.
- [ ] D5 — Một AI run thật bền vững qua worker, artifact và dashboard đúng tenant.
- [ ] D10 — Website/blog qua duyệt, form lead lưu DB; 6 role có output/schema/scope/eval/handoff riêng.
- [ ] D11 — Freeze contracts và dataset; dừng thêm feature.
- [ ] D13 — Vòng lead/metrics → report/learning → task tiếp; freeze candidate.
- [ ] D14 — UAT/regression/security/recovery/restore có verdict.
- [ ] D15 — Demo, evidence pack, runbooks và release decision.

## Phạm vi

Giữ Level 2, human approval trước publish/send, tenant isolation, approved facts/version, idempotency và retry hữu hạn. Ads read-only; social live và Google metrics theo quyền. Video render, CRM/calendar ngoài, live spend và UI nâng cao sau pilot.

[Kiến trúc](docs/architecture/SIX-AGENT-RESTRUCTURE.md) · [Reuse/task cũ](docs/coordination/sprint-3-weeks/REUSE-MAP.md) · [Roster](docs/coordination/TEAM.md).

[Biên bản dọn bản cũ](docs/coordination/sprint-3-weeks/CLEANUP.md): checklist trùng đã xóa; dùng bảy file cá nhân hiện hành để nhận việc.
