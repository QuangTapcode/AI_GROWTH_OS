# Dương — BA

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). Sửa `docs/ba/`, quản bản sao nguồn `docs/sources/`; task tại `docs/ba/tasks/`. Viết story/AC trước người code theo lô, không sửa implementation. Quang Quang duyệt nghiệp vụ, Thiệu review khả năng kiểm thử, owner FE/BE/AI xác nhận field/state khả thi.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — duong](../execution/W1.md#duong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Task gốc:** W1-BA-01/02/03. Đầu vào: PRD, kế hoạch 4 tuần, [pilot TripC](../PILOT.md), [17 epic/72 AC baseline](../backlog/README.md); không chờ API hoặc Figma để viết AC.

1. **Ngày 1–2:** viết stories M01–M03: workspace/profile/brand/audience/language, membership Owner/Editor/Viewer; source upload/review/approve/revoke/delete/version; goal, baseline/KPI/unit/budget/conversion. Mỗi story có happy path, validation và negative permissions.
2. Chốt blog/landing/form tiếng Anh cho expat Đà Nẵng; field bắt buộc/tùy chọn, consent, lỗi và thành công sau server lưu. Conversion là form submission, không account signup. Business facts khác research facts; sources chưa review không coi là facts đã duyệt.
3. Soạn AC sơ bộ **đủ M04–M16**; tạo bảng module → story → epic AC → test IDs → evidence. Chốt qualified traffic, metric unit, UTC/pilot timezone, zero/missing/delay với PO; chưa chốt thì ghi decision pending, không tự suy diễn thành KPI đã thống nhất.
4. **Ngày 3–4:** mô tả format text/PDF có text/URL được phép, source lifecycle/provenance, dữ liệu UAT hai tenant; cùng AI/Thiệu chốt rubric của 30 eval cases.
5. **Trước ngày 5:** bàn giao stories/fields M04–M09 cho tuần 2; dự demo W1, đối chiếu AC và chuyển gaps thành defect/story rõ owner.

**Bàn giao:** `stories/`, `acceptance/`, `processes/`, `data-dictionary/` dưới `docs/ba/`; traceability và decision records. **Đạt khi:** mỗi M01–M03 story có field/state/role/negative AC kiểm thử được, 16 module có trace baseline, KPI/form/source rules không mâu thuẫn. Reviewer: PO và Thiệu; FE/BE/AI review phần mình dùng.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — duong](../execution/W2.md#duong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Task gốc:** W2-BA-01/02. Phụ thuộc: contract baseline W1, feedback demo; có thể viết bằng schema/examples trước API live.

1. **Ngày 6–7:** chốt M04–M05: research source/timestamp/failure, opportunity rubric/từng thành phần/thiếu demand/filter/select. Có ví dụ score tính tay để Thiệu đối chiếu, phân biệt heuristic với search volume.
2. **Ngày 8:** chốt M06–M07: strategy 30 ngày/task/KPI/owner/effort/deadline/budget và approval; brief facts/CTA/source/destination, lineage và sửa sau duyệt.
3. **Ngày 9:** chốt M08/editor/variant/version/autosave/restore/regenerate, lỗi concurrent edit, job timeout/cancel/quota. Restore tạo version mới; social chỉ draft/export.
4. **Trước ngày 10:** bàn giao AC M09–M13 cho tuần 3: SEO rubric/local unique data/refresh, approval/reject/resubmit/version/hash, CMS retry/calendar/timezone, community manual link, UTM/event/dedup/metric mapping. Chuẩn bị sample SEO/local page có nguồn.
5. Demo W2: trace một opportunity đến draft, ghi acceptance gaps và bổ sung test IDs/evidence vào bảng trace.

**Bàn giao:** story/AC M04–M13, score example, state transitions, fixtures nghiệp vụ có provenance. **Đạt khi:** cả happy/negative paths định nghĩa được kết quả mong đợi, không yêu cầu hành vi ngoài pilot; PO duyệt và Thiệu xác nhận có thể test, kỹ thuật review fields/jobs.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — duong](../execution/W3.md#duong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Task gốc:** W3-BA-01/02. Phụ thuộc: publish/connector support matrix của Mỹ, thực tế Google/public URL; metric missing được đặc tả dù connector chưa live.

1. **Ngày 11–12:** cùng FE/BE rà SEO/approval/CMS/community rules: ai duyệt, version nào được đăng, edit/revoke làm approval hết hiệu lực, unknown publish outcome và handoff thủ công.
2. Chốt UTM/channel/campaign/content mapping và attribution đơn giản, GA4/GSC property/range/unit/timezone; form failure/CTA click không tính conversion, event retry không trùng. Dữ liệu trễ và không có quyền có trạng thái riêng.
3. **Ngày 13–14:** AC M14: hai kỳ, số/% khớp snapshot, baseline 0/missing, action chỉ tạo task sau duyệt. M15: hypothesis/2 variants/metric/period, stable assignment, exposure/outcome dedup, thiếu mẫu. M16: insight/evidence/version, duyệt trước tạo strategy version.
4. **Trước ngày 15:** viết UAT đủ 16 module theo vòng goal → research → content → publish → metrics → report → experiment → learning; có expected results, dữ liệu, role và negative cases. Review cùng Thiệu/PO; không đợi ngày 19 mới soạn.

**Bàn giao:** AC M09–M16, metric/attribution dictionary và UAT scripts tại `docs/ba/acceptance/`/`processes/`. **Đạt khi:** expected result không phụ thuộc việc traffic phải tăng, zero/missing/thiếu mẫu đúng, AC không mâu thuẫn với source/version/approval. Reviewer: PO, Thiệu, Mỹ/Thiệu Quang.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — duong](../execution/W4.md#duong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Task gốc:** W4-BA-01/02. Phụ thuộc: build và evidence Thiệu, support matrix/runbooks BE, final design và AI limits.

1. **Ngày 16–18:** cập nhật trace của tất cả 16 module, liên kết story/AC với test/build/evidence; rà report numeric/experiment thiếu mẫu/learning approval cùng Thiệu.
2. **Ngày 19:** điều phối UAT với PO, chạy kịch bản đã duyệt trên staging thật; ghi pass/fail/blocker, expected/actual và retest. Không ký đạt những phần chỉ có mock hoặc chưa có Google data.
3. Tạo hướng dẫn nghiệp vụ: nhập source → review → goal → draft → duyệt đúng version → publish → xem metrics → duyệt action/learning. Nêu rõ community manual handoff, metric delay và experiment limits.
4. **Ngày 20:** bàn giao data dictionary, AC/UAT/known gaps/support matrix; tách backlog mở rộng sau pilot như OCR/social auto/billing/thống kê nâng cao. Hỗ trợ PO ghi acceptance có điều kiện/không đạt theo evidence, không dùng tăng traffic/revenue thay AC chức năng.

**Bàn giao:** bảng trace/UAT cuối, hướng dẫn và backlog sau pilot trong `docs/ba/`. **Đạt khi:** mỗi module có AC verdict + evidence hoặc blocker cụ thể, hướng dẫn khớp app hiện hành và PO/Thiệu đã review.
