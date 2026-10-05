# Demo ngày 5 — kế hoạch và biên bản chờ thực hiện

**Trạng thái: planned, chưa diễn ra; verdict: chưa đánh giá.** Ngày làm việc 5 từ kickoff, timezone Asia/Bangkok; ngày lịch chưa chốt. Chủ trì/nghiệm thu: Quang Quang; BA Dương, FE Tiến/Huyền, BE Thiệu Quang/Mỹ, UI Trường, QA Thanh tham gia. Đây là agenda/checklist, không phải thư mời đã gửi.

## Điều kiện trước demo

Rehearsal ngày 4 có staging commit/env thật, hai tenants, Owner/Editor/Viewer, một source đã duyệt và một source test revoke/delete. Public form/API đã persistence; access/properties có evidence hoặc blocker được ghi. Thanh chuẩn bị cases và evidence, Dương kiểm chứng AC; không đưa secrets/email vào screen/log/analytics.

## Agenda và scenarios

| Thứ tự | Trình bày | Owner | Kết quả cần chứng minh |
| --- | --- | --- | --- |
| 1 | Readiness và blockers | Quang Quang | Commit/env, rights status, mục tiêu gate; chưa có staging thì ghi gate blocked |
| 2 | Workspace/onboarding/goals | Tiến + Mỹ/Thiệu Quang | Tạo/lưu/mở lại TripC profile/goal; Viewer không sửa; tenant A không đọc B |
| 3 | Knowledge/RAG | Huyền + Quang Quang | Source review/approved context/citation; delete/revoke không còn retrieval; missing facts không được bịa |
| 4 | Public pilot blog/landing/form | Tiến + Mỹ | Chỉ published content public; validation và retry, server persist success mới báo thành công/conversion |
| 5 | Tracking/Google readiness | Mỹ | UTM mapping và event evidence thật; property/GSC delayed/empty được ghi đúng; local mock không thay Google probe |
| 6 | QA/design và gate decision | Thanh + Dương/Trường | Negative cases/defects/evidence; Quang Quang chốt pass/blocked/fail và owner/hạn follow-up |

Chưa yêu cầu hoàn thành toàn bộ publish calendar M10 ở T1; CMS wiring/auth/public visibility được probe T1, publish flow đầy đủ theo mốc M10 T3. Human approval và version checks vẫn bắt buộc với mọi bài publish trong demo.

## Biên bản điền sau demo

- Demo date / staging URL / commit / env: chưa có.
- QA evidence location: qa/evidence/<build>/W1-DEMO/ (chưa được tạo bằng chứng).
- 30 AI eval cases/version/result: chưa có; smoke local không thay eval.
- Tenant/source/form/tracking cases và defect IDs: chưa có.
- Gate W1-GATE-01/02/03: chưa đánh giá, chưa tick.
- PO verdict / follow-up owner / due / decision: chưa có.

Gate pass cần services thật/AC/evidence; có blocker thì ghi blocked hoặc fail theo từng gate, không ký pass vì slide/mock. W1-PM-03 chỉ đóng toàn bộ sau actual access/probe/demo evidence.

[W1-PM-03](W1-PM-03.md) · [RISKS](RISKS.md) · [SCOPE gates](../ba/SCOPE.md).


Readiness đã có: Ollama JSON/embeddings, PostgreSQL/vector và SearXNG query local passed. Đây là dependency probes, không phải demo app/nghiệm thu W1-GATE. GA4/GSC người dùng xác nhận chưa có.
