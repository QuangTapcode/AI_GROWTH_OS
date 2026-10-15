# TODO — Thiệu / 3 tuần

Vai trò: **QA: hai lane trong cùng capacity**. Khu vực: `qa/tester-1/; qa/tester-2/; qa/fixtures/; qa/evidence/`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [ ] TH-01 · D2 · M · Test plan và fixtures 6 role

- **Làm / đầu ra / Done:** Tái sử dụng runners/fixtures, bỏ placeholder khỏi release checks; map AC→case→task; hai tenants/Owner/Editor/Viewer; chốt critical gates.
- **Phụ thuộc:** DU-01, TQ-01.
- **Reviewer:** Dương + Thiệu Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TH-02 · D4 · M · Kiểm contract/auth/tenant và AI adapter

- **Làm / đầu ra / Done:** Request/schema/version/errors, role deny/cross-tenant, job→HTTP AI→artifact; fake chỉ chứng minh plumbing, live chứng minh output thật.
- **Phụ thuộc:** MY-01, TQ-02.
- **Reviewer:** Thiệu Quang + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TH-03 · D5 · M · Gate tuần 1 và regression phần tái sử dụng

- **Làm / đầu ra / Done:** Một run thật có nguồn trên dashboard; recovery cơ bản; publish/lead chưa có phải báo pending. Verdict có build/commit/env và blockers.
- **Phụ thuộc:** TI-03, QQ-03, MY-03.
- **Reviewer:** Dương + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 2 — 22–28/10/2026

### [ ] TH-04 · D8 · M · Kiểm content/version/approval/publisher

- **Làm / đầu ra / Done:** Sửa sau duyệt, nguồn revoked, wrong hash/tenant, concurrent publish và timeout/reconcile; public boundary không lộ draft/private.
- **Phụ thuộc:** TQ-04, MY-04, TI-04.
- **Reviewer:** Dương + Mỹ.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TH-05 · D9 · M · Kiểm lead DB/idempotency và form

- **Làm / đầu ra / Done:** DB rollback, gửi lại key, cùng key khác payload, dedup cùng workspace/cách ly workspace, owner/status và backend-confirmed success.
- **Phụ thuộc:** TQ-05, TI-06 (bản form review D9).
- **Reviewer:** Dương + Thiệu Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TH-06 · D10 · M · Gate sáu role và rubric coverage

- **Làm / đầu ra / Done:** Mỗi role có schema/output/tool scope/handoff; đối chiếu fake/live, facts và injection; report thiếu data đúng nhãn. Chuẩn bị frozen eval D11.
- **Phụ thuộc:** QQ-06, DU-05.
- **Reviewer:** Dương + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 3 — 29/10–04/11/2026

### [ ] TH-07 · D12 · M · E2E vòng khép kín và failure injection

- **Làm / đầu ra / Done:** Campaign→blog→approve→URL→lead→report→task tiếp; kill/restart/human wait, duplicated events, revoked permission và retry budget.
- **Phụ thuộc:** QQ-07, MY-07, TI-07.
- **Reviewer:** Mỹ + Thiệu Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TH-08 · D14 · M · UAT/regression/security và restore verdict

- **Làm / đầu ra / Done:** Retest defects, tenant/public boundary/tool deny; kiểm migration rollback/restore; critical không được miễn vì nhiều test pass.
- **Phụ thuộc:** DU-08, TQ-08, MY-08, TI-08.
- **Reviewer:** Dương + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TH-09 · D15 · M · Evidence pack và go/no-go

- **Làm / đầu ra / Done:** AC/case/build/env/task/run/version/evidence, known limitations và blocker owners; QA verdict độc lập, PO quyết định release.
- **Phụ thuộc:** TH-08, QQ-08.
- **Reviewer:** Dương + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
