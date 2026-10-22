# Test cases QQ-01–09 — 17/10/2026

Fixtures đều synthetic. DB test tạo PostgreSQL riêng rồi xóa sau chạy; worker gọi HTTP AI thật. Fake và live có báo cáo riêng trong [evidence](../../../../qa/evidence/qq-all-2026-10-17/).

| ID | Task | Bước kiểm thử | Kết quả phải đạt | Tự động |
| --- | --- | --- | --- | --- |
| QQ-A01 | 01 | Đọc registry và bundle | 7 người, 6 role; handler/schema/tool scope khớp | `test_qq01_03_review.py`, `test_six_roles.py` |
| QQ-A02 | 01 | Gọi song song, output sai, retry/restart | Semaphore 1/process; tối đa 2 calls; không vượt budget | `test_service.py`, reviewer tests |
| QQ-A03 | 02 | DB-issued context → HTTP worker → Research → ledger | Workspace/snapshot/profile/source version/hash/evidence giữ nguyên | `QQ-E2E-01` |
| QQ-A04 | 02/03 | Tenant khác, nguồn revoke, snapshot/version cũ | Reject trước inference hoặc approval; không rò dữ liệu | AI tests; E2E revoke |
| QQ-A05 | 03 | Topic + keywords/user_need + fit + quote + URL/fetched_at | Có provenance; không bịa giá/metrics, loại câu dở/quote sai | Research/reviewer tests QQ03-A21 (4 trường câu dở); SIX-01 |
| QQ-A06 | 04 | Plan từ research + CTA/deadline/estimated factors | Đúng 2 task SEO → social; refs/hash/deadline hợp lệ | Growth Lead + API 21 tests; SIX-02 |
| QQ-A07 | 04 | Submit đồng thời cùng plan | Một campaign/DAG/outbox; replay không nhân task | E2E concurrent submit |
| QQ-A08 | 04 | Gây conflict task ID giữa transaction | Campaign và task tạo trước lỗi đều rollback | E2E rollback |
| QQ-A09 | 04/05 | Chạy SEO trước, thử chạy social trước duyệt | SEO awaiting_approval; social chưa enqueue | E2E dependency |
| QQ-A10 | 05 | Editor duyệt, hash cũ, payload ledger bị sửa | 403 / 409 / hash mismatch; không mở social | E2E approval negatives |
| QQ-A11 | 05 | Owner duyệt đúng version/hash, replay | Một audit/một outbox social; parent ID/version đúng | E2E owner/replay/restart |
| QQ-A12 | 05 | Ảnh missing/pending/revoked/foreign | needs_assets hoặc 422; không giả ảnh hợp lệ | `test_six_roles.py` |
| QQ-A13 | 06 | Community hỏi thường/giá/đặt phòng | Reply có citations hoặc escalation; lead chỉ proposal, không send | SIX-05/30; Community tests |
| QQ-A14 | 06 | Metrics đủ/thiếu/0/sai window/hash | Bảo toàn số và window; null khác 0; không chỉnh spend | SIX-06/25/26; Performance tests |
| QQ-A15 | 07 | Learning thiếu metrics/quota0/đạt max3/trùng refs | Không bịa kết luận; không task khi chạm giới hạn | SIX-07/27–29; learning tests |
| QQ-A16 | 07 | Persist report + lead aggregate; owner nhận task/replay | Input ledger refs thật, một task/outbox, chạy research vòng tiếp | E2E learning approval/dedup |
| QQ-A17 | 07 | Editor nhận task hoặc raw PII | Chặn quyền/PII; không enqueue | E2E + learning tests |
| QQ-A18 | 08 | Chạy frozen 30 ca cũ và 30 ca sáu role, fake/live riêng | Critical 100%; facts ≥90%; hash dataset/prompt/contract/model lưu | `evals.run_eval`, `evals.six_roles` |
| QQ-A19 | 09 | Kill/restart worker, expired lease, source revoke | Retry hữu hạn, job ID ổn định, draft lưu bền; revoke không gọi tiếp | Worker suite + E2E |
| QQ-A20 | 09 | Tổng hợp evidence/release gate | HOLD production khi thiếu QA độc lập/data/rights/connector | `qq_release_gate.py` |

## QA thủ công chưa có chữ ký

| ID | Người review | Test/acceptance |
| --- | --- | --- |
| QQ-M01 | Dương + Mỹ | Đối chiếu baseline/estimate và policy trong decision doc với DU-01/02/03; xác nhận mapping |
| QQ-M02 | Dương + Thiệu | Đọc Research/SEO/social model thật: fit, user_need, hữu ích, không câu dở/claim ngoài nguồn |
| QQ-M03 | Mỹ + Thiệu Quang | Migrate staging + chạy worker thật, kiểm recovery và artifact API/dashboard end-to-end |
| QQ-M04 | Dương + Thiệu | Thay source/ảnh mock bằng business data có quyền; test website publish qua approval và lead thật |
| QQ-M05 | Thiệu | Chạy độc lập hai bộ eval, UAT/backup/restore và kiểm test kill process từng timeout ở lượt chạy đầu |
| QQ-M06 | PO + reviewers | Xác nhận dependency TH-09/TQ-09/MY-09/TI-09 và quyết định release có chữ ký |

Không dùng auto-test PASS để thay chữ ký các mục QQ-M01–M06.
