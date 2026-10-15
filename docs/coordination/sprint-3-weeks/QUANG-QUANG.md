# TODO — Quang Quang / 3 tuần

Vai trò: **AI + PM + PO**. Khu vực: `services/ai/; docs/coordination/; TODO.md`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [ ] QQ-01 · D2 · M · Chốt baseline 7 người, 6 role và pipeline contracts

- **Làm / đầu ra / Done:** Duyệt phạm vi với Dương; chốt schema input/output, role/tool matrix, budget và một LLM job tại một thời điểm. Có decision và estimate sau D2.
- **Phụ thuộc:** DU-01, TQ-01.
- **Reviewer:** Dương + Mỹ.
- **Theo dõi:** `local_verified` · PR/build: working tree, chưa commit · Evidence: [CR-002](../../../contracts/changes/CR-002-six-agent-pipelines.md), [handoff](QQ01-03-HANDOFF.md) · Chờ Dương/Mỹ review baseline/schema/estimate; chưa ghi nhận approval.

### [ ] QQ-02 · D4 · M · Nối knowledge snapshot và registry với một AI run thật

- **Làm / đầu ra / Done:** Tái sử dụng ingest/answer/growth_map; input chỉ chứa nguồn approved đúng workspace/version; run có artifact, evidence và model/prompt version.
- **Phụ thuộc:** TQ-02, MY-01.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `local_verified` · PR/build: working tree, chưa commit · Evidence: [live HTTP + persistence](../../../qa/evidence/qq01-03/live-report.json), [handoff](QQ01-03-HANDOFF.md) · AI boundary đã đạt; MY-01/TQ-02 còn cần nối worker/business DB, không tự tick dependency.

### [ ] QQ-03 · D5 · M · Xây Research & Trend tối thiểu

- **Làm / đầu ra / Done:** research.run có handler/schema riêng; brief có URL, fetched_at, audience/offer fit và missing facts; handoff cho Growth Lead.
- **Phụ thuộc:** QQ-02, DU-02.
- **Reviewer:** Dương + Thiệu.
- **Theo dõi:** `local_verified` · PR/build: working tree, chưa commit · Evidence: [Research pipeline](../../../services/ai/src/agents/research/pipeline.py), [tests/live](QQ01-03-HANDOFF.md) · Dedicated handler/schema/prompt và brief live đã có; chờ Dương/Thiệu review, checkbox giữ trống.

## Tuần 2 — 22–28/10/2026

### [ ] QQ-04 · D7 · M · Xây Growth Lead campaign/task plan

- **Làm / đầu ra / Done:** Chọn cơ hội từ research; brief SEO và social; dependencies và artifact refs rõ; backend xác thực kế hoạch trước enqueue.
- **Phụ thuộc:** QQ-03, TQ-03.
- **Reviewer:** Thiệu Quang + Thiệu.
- **Theo dõi:** `local_verified` (QQ-04, mock) · PR/build: working tree, chưa commit · Evidence: [QQ04 handoff + phần còn thiếu](QQ04-HANDOFF.md), [AI mock](../../../qa/evidence/qq04/mock-report.json), [backend mock](../../../qa/evidence/qq04/backend-mock-report.json) · 120 AI tests + 21 QQ-04 backend tests đạt; chờ Thiệu Quang/Thiệu review. TQ-03 DB/API/outbox/worker chưa nối, dữ liệu mock có synthetic=true; chưa nghiệm thu tích hợp.

### [ ] QQ-05 · D8 · L · Xây SEO Worker và Content Marketing tối thiểu

- **Làm / đầu ra / Done:** SEO tạo blog/title/meta/citations; Content tạo caption/CTA + ảnh doanh nghiệp hợp lệ; giữ parent/version. Tách thành PR SEO rồi PR Content, không dùng handler generic để nghiệm thu.
- **Phụ thuộc:** QQ-04, DU-04, MY-04.
- **Reviewer:** Dương + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] QQ-06 · D10 · M · Xây Community và Performance tối thiểu

- **Làm / đầu ra / Done:** Community grounded reply + escalation/lead proposal; Performance nhận snapshot và trả evidence hoặc insufficient_data, chỉ đề xuất. Mỗi role có schema/tool scope/eval riêng.
- **Phụ thuộc:** QQ-05, MY-06, DU-05.
- **Reviewer:** Thiệu + Mỹ.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 3 — 29/10–04/11/2026

### [ ] QQ-07 · D12 · M · Đóng vòng báo cáo → learning → task kế tiếp

- **Làm / đầu ra / Done:** Growth Lead tổng hợp lead + metrics bằng refs; tạo task vòng tiếp có dedup key, quota, max iterations và lý do; thiếu metrics không bịa kết luận.
- **Phụ thuộc:** QQ-06, MY-07, TQ-07.
- **Reviewer:** Dương + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] QQ-08 · D13 · M · Đánh giá sáu role và sửa lỗi chất lượng

- **Làm / đầu ra / Done:** Tái sử dụng bộ 30 ca và bổ sung coverage cho 6 role; freeze dataset/rubric/model/prompt; báo cáo fake tách live, có QA kiểm chứng.
- **Phụ thuộc:** TH-06, DU-07.
- **Reviewer:** Thiệu + Dương.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] QQ-09 · D15 · M · Nghiệm thu và bàn giao pilot

- **Làm / đầu ra / Done:** Demo end-to-end với trace; quyết định release dựa evidence QA, giới hạn connector và blocker; ghi backlog sau pilot. Chỉ tick sản phẩm khi AC đạt.
- **Phụ thuộc:** TH-09, TQ-09, MY-09, TI-09.
- **Reviewer:** Dương + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
