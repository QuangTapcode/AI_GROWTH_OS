# TODO — Dương / 3 tuần

Vai trò: **BA**. Khu vực: `docs/ba/; docs/sources/`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [ ] DU-01 · D1 · M · Chốt nghiệp vụ 6 agent và phạm vi TripC

- **Làm / đầu ra / Done:** Lập AC cho research→campaign→SEO→Content→Community→Performance→learning; xác nhận offer, CTA, reviewer và owner nhận lead.
- **Phụ thuộc:** Không.
- **Reviewer:** Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] DU-02 · D2 · M · Chuẩn hóa facts, KPI và trạng thái

- **Làm / đầu ra / Done:** Field dictionary cho profile/offer, sources, content/approval, lead; qualified traffic; zero/missing; timezone; rule thu hồi nguồn và sửa bài.
- **Phụ thuộc:** DU-01.
- **Reviewer:** Thiệu Quang + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] DU-03 · D4 · M · Chuẩn bị nguồn và checklist demo nền tảng

- **Làm / đầu ra / Done:** Danh sách nguồn/ảnh được phép dùng; facts đã xác nhận, thông tin còn thiếu; AC tenant/auth/ingest và role handoff. Không tự coi web research là approved business fact.
- **Phụ thuộc:** DU-02.
- **Reviewer:** Quang Quang + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 2 — 22–28/10/2026

### [ ] DU-04 · D6 · M · Bàn giao AC blog, social pack, duyệt và publisher

- **Làm / đầu ra / Done:** Ví dụ input/output, checklist facts/SEO/brand/asset; sửa version hủy duyệt; không publish draft hoặc approval cũ.
- **Phụ thuộc:** DU-03.
- **Reviewer:** Tiến + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] DU-05 · D8 · M · Bàn giao AC Community, lead và Performance

- **Làm / đầu ra / Done:** Lead dedup theo workspace/contact, consent, owner/status/notes; reply draft khác sent; proposal có snapshot, timezone, hypothesis; ads read-only.
- **Phụ thuộc:** DU-04.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] DU-06 · D10 · M · Review nội dung và chạy UAT lát website

- **Làm / đầu ra / Done:** Đối chiếu research→blog→approval→URL→form DB với AC, ghi defects có task/run/version; chuẩn bị tình huống cho vòng 6 role.
- **Phụ thuộc:** TI-06, MY-05.
- **Reviewer:** Thiệu + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 3 — 29/10–04/11/2026

### [ ] DU-07 · D11 · M · Freeze rubric và kịch bản UAT toàn vòng

- **Làm / đầu ra / Done:** Bộ 30 ca có mapping 6 role, critical rules, source revoke, injection, retry và insufficient_data; freeze version với QA/AI.
- **Phụ thuộc:** DU-05, TH-06.
- **Reviewer:** Thiệu + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] DU-08 · D13 · M · UAT campaign, lead handoff và báo cáo

- **Làm / đầu ra / Done:** Xác nhận số liệu khớp snapshot, lead có owner/kết quả, task mới có lý do; ghi pass/fail và known limitations theo AC.
- **Phụ thuộc:** QQ-07, TI-08.
- **Reviewer:** Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] DU-09 · D15 · M · Bàn giao nghiệp vụ và hướng dẫn người duyệt

- **Làm / đầu ra / Done:** Hướng dẫn tạo goal, duyệt/reject, nhận lead, xem report, xử lý blocked; danh sách tính năng thực đạt và hoãn.
- **Phụ thuộc:** DU-08.
- **Reviewer:** Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
