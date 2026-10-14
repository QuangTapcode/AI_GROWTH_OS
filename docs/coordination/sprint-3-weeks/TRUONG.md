# TODO — Trường / 3 tuần

Vai trò: **UI/UX**. Khu vực: `design/`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [ ] TR-01 · D2 · M · Chốt hành trình và sitemap tối giản

- **Làm / đầu ra / Done:** Goal→workflow→artifact→approval→published→lead→report; có error/blocked/awaiting approval/not_connected.
- **Phụ thuộc:** DU-01.
- **Reviewer:** Tiến + Dương.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TR-02 · D3 · M · Bàn giao component dùng chung

- **Làm / đầu ra / Done:** Spec list/detail, status badge, source/version panel, approval actions; loading/empty/error/permission. Ưu tiên một FE triển khai.
- **Phụ thuộc:** TR-01, DU-02.
- **Reviewer:** Tiến.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TR-03 · D5 · M · Bàn giao dashboard và editor văn bản

- **Làm / đầu ra / Done:** Wireframe có fields từ contract, task/run trace, version và duyệt/từ chối; không rich editor hoặc kéo thả.
- **Phụ thuộc:** TR-02, TQ-01.
- **Reviewer:** Tiến + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 2 — 22–28/10/2026

### [ ] TR-04 · D6 · M · Bàn giao Content Ledger và lịch dạng danh sách

- **Làm / đầu ra / Done:** Blog/social/asset lineage; phân biệt approved/scheduled/published và manual pack; hiển thị nguồn/ảnh/UTM.
- **Phụ thuộc:** DU-04.
- **Reviewer:** Tiến.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TR-05 · D8 · M · Bàn giao Community, Leads và Performance

- **Làm / đầu ra / Done:** Dùng lại list/detail; lead owner/status/note; reply draft; metric missing khác zero; proposal evidence và timezone.
- **Phụ thuộc:** DU-05.
- **Reviewer:** Tiến + Mỹ.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TR-06 · D10 · M · Design QA vòng website và form

- **Làm / đầu ra / Done:** Review giao diện thực, responsive, validation và thành công sau backend persist; defect có ảnh và AC liên quan.
- **Phụ thuộc:** TI-06.
- **Reviewer:** Thiệu + Tiến.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 3 — 29/10–04/11/2026

### [ ] TR-07 · D11 · M · Bàn giao exceptions và báo cáo cuối

- **Làm / đầu ra / Done:** Lỗi có owner/reason/retry/resume; report có snapshot refs và task tiếp; tận dụng component sẵn.
- **Phụ thuộc:** TR-05.
- **Reviewer:** Tiến.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TR-08 · D13 · M · Design QA sáu role và accessibility cơ bản

- **Làm / đầu ra / Done:** Rà focus/keyboard/contrast, lỗi/empty/permission và phân biệt mock/live; ưu tiên lỗi cản UAT.
- **Phụ thuộc:** TI-08.
- **Reviewer:** Thiệu + Tiến.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TR-09 · D15 · S · Bàn giao spec/assets và backlog UX

- **Làm / đầu ra / Done:** Spec khớp UI đã giao; asset provenance; hoãn lịch kéo thả/editor nâng cao/dashboard tùy biến.
- **Phụ thuộc:** TR-08.
- **Reviewer:** Tiến + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
