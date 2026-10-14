# TODO — Tiến / 3 tuần

Vai trò: **Frontend duy nhất: admin + pilot**. Khu vực: `apps/web/; apps/pilot/`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [ ] TI-01 · D3 · M · Tái sử dụng shell/API client và component chung

- **Làm / đầu ra / Done:** Giữ Next.js/packages/lockfiles; routes/login/workspace và list/detail/status/source panel; mocks đúng contract có nhãn.
- **Phụ thuộc:** TQ-01, TR-02.
- **Reviewer:** Trường + Thiệu Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TI-02 · D4 · M · Goal/profile/knowledge tối thiểu

- **Làm / đầu ra / Done:** Form đọc/lưu API thật, nguồn approved/status/version, lỗi/permission; không làm UI quản trị nâng cao.
- **Phụ thuộc:** TI-01, DU-02.
- **Reviewer:** Trường + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TI-03 · D5 · M · Dashboard workflow và artifact drill-down

- **Làm / đầu ra / Done:** Hiển thị campaign/tasks, 6 role, run/output/source/version và blocked; một AI output thật đúng workspace.
- **Phụ thuộc:** TQ-03, TR-03.
- **Reviewer:** Trường + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 2 — 22–28/10/2026

### [ ] TI-04 · D7 · M · Editor và Approval Queue

- **Làm / đầu ra / Done:** Text editor/version list, source evidence, approve/reject đúng hash/version; sửa nội dung hiển thị cần duyệt lại.
- **Phụ thuộc:** TQ-04, TR-03.
- **Reviewer:** Trường + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TI-05 · D8 · M · Content Ledger/social pack/publication list

- **Làm / đầu ra / Done:** Dùng list/detail chung; parent/version/ảnh/CTA, published URL và manual/live label; lịch dạng danh sách.
- **Phụ thuộc:** TI-04, TR-04, MY-04.
- **Reviewer:** Trường + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TI-06 · D10 · M · Blog/form pilot và UTM

- **Làm / đầu ra / Done:** Public blog từ snapshot published; form chỉ success sau DB commit; retry giữ idempotency, validation/consent; UTM/context không lộ PII lên analytics.
- **Phụ thuộc:** TQ-05, MY-04.
- **Reviewer:** Dương + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 3 — 29/10–04/11/2026

### [ ] TI-07 · D12 · M · Community/lead/proposal/report bằng mẫu chung

- **Làm / đầu ra / Done:** Reply draft + approval; lead owner/status/notes; report/proposal snapshot refs; missing/zero, not_connected và timezone.
- **Phụ thuộc:** TR-05, TQ-07, MY-06.
- **Reviewer:** Trường + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TI-08 · D13 · M · Exceptions và sửa lỗi E2E

- **Làm / đầu ra / Done:** Owner/reason/retry/resume đúng API; responsive/accessibility cơ bản; ưu tiên lỗi chặn đường chính, không thêm biểu đồ nâng cao.
- **Phụ thuộc:** TR-07, TI-07.
- **Reviewer:** Trường + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TI-09 · D15 · M · Build candidate và hướng dẫn UI

- **Làm / đầu ra / Done:** Sửa defects critical; kiểm production build admin/pilot; evidence journeys và tài liệu môi trường/API; phối hợp demo.
- **Phụ thuộc:** TH-08, TI-08.
- **Reviewer:** Thiệu + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
