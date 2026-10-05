# Trường — UI/UX

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). Sở hữu `design/tokens/`, `assets/`, `prototypes/`, `specs/`, `tasks/`. Figma/prototype và spec trong repo phải chỉ rõ screen/state/version/link; screenshot đẹp không thay field/interaction specs. Tiến/Huyền review khả năng triển khai, Dương review nghiệp vụ, Thanh review testability.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — truong](../execution/W1.md#truong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Task gốc:** W1-UX-01/02/03. Phụ thuộc: BA field/roles/journey và contract examples; dùng synthetic data để thiết kế, không phải chờ API live.

1. **Ngày 1–2:** sitemap và core journey quản trị + public TripC; tokens màu/type/spacing, list/detail/form/modal/status/progress patterns và component/state matrix dùng lại toàn app.
2. Handoff login/workspace/profile/onboarding/member/role, knowledge upload/review/provenance/version/delete, goal/baseline/KPI/budget. Mỗi màn có loading/empty/error/validation/read-only/no-access; ghi field bắt buộc/tùy chọn theo BA.
3. **Ngày 3–4:** blog list/detail, landing/form tiếng Anh: CTA/consent/form submit/loading/error/success, responsive mobile/desktop. Success chỉ sau persist; không vẽ account signup thay conversion form đã chốt.
4. FE review handoff theo contract; ghi component props/interaction/permission states, assets export path và token version. Design QA build đầu tiên, chuyển gaps thành issue rõ screen/task.
5. **Trước ngày 5:** wireframes research/board/strategy/brief/editor tuần 2, bàn giao lô đầu research/board trước ngày 6.

**Bàn giao:** tokens/component matrix, prototype và `design/specs/` M01–M03/pilot/W2 wireframes. **Đạt khi:** FE triển khai được từ spec, state/field khớp BA/schema, pilot responsive có consent/error/success, handoff có review và version. Không chờ thiết kế xong 16 module mới giao FE.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — truong](../execution/W2.md#truong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Task gốc:** W2-UX-01/02. Phụ thuộc: AC M04–M13, feedback FE/live outputs.

1. **Trước/ngày 6–7:** research progress/sources/failure và opportunity board/filter/detail/score components/missing demand; reuse list/detail/status patterns.
2. **Trước ngày 8:** strategy/action approval/task list, brief source/facts/CTA/destination và review state; thể hiện lineage giữa goal/opportunity/strategy/brief.
3. **Trước ngày 9:** editor/variant/history/restore/regenerate/job progress/source panel; autosave success/error, stale conflict, thiếu facts, loading/failed/cancel capability.
4. Design QA FE theo từng lô; phản hồi screen/task cụ thể, không mở redesign ngoài scope. Giữ tokens/common để hai FE không làm hai style riêng.
5. **Trước ngày 10:** chuẩn bị W3 SEO audit/local draft, approval queue/calendar, community intent/handoff, traffic/integrations/analytics; bàn giao lô approval/publish trước ngày 11.

**Bàn giao:** specs/prototype M04–M08/SEO fields, W3 wireframes và design QA issues. **Đạt khi:** FE/BA xác nhận đủ state/fields, source/missing rõ và editor conflict không bị bỏ qua. Reviewer: Tiến/Huyền, Dương, Thanh.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — truong](../execution/W3.md#truong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Task gốc:** W3-UX-01/02. Phụ thuộc: CMS/approval/metrics state contract, BA M14–M16 AC.

1. **Ngày 11–12:** hoàn thiện SEO/cluster/link/local/refresh và approval/reject/resubmit/calendar/publish status/error/retry/unknown outcome/cancel. Sửa sau approve có cảnh báo cần duyệt lại, timezone hiển thị rõ.
2. **Ngày 13–14:** community response sources/approve/manual link và UTM/traffic/integrations/analytics; phân biệt zero/missing/delayed/no permission, show property/range/sync time.
3. **Trước ngày 15:** report hai kỳ/action review/evidence, experiment hypothesis/2 variants/primary metric/period/results và thiếu mẫu, learning insight/evidence/approve/strategy version. Bàn giao cho FE trước ngày 16.
4. Design QA live approval/publish/dashboard, kiểm readability/responsive/keyboard states với Thanh; issue theo priority/owner, không vẽ metric giả như số production.

**Bàn giao:** specs M09–M16 và QA findings. **Đạt khi:** published/failed/manual/missing/insufficient-data được hiểu đúng, FE đủ specs cho W4, BA/Thanh review state và labels.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — truong](../execution/W4.md#truong) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Task gốc:** W4-UX-01/02. Phụ thuộc: FE report/experiment/learning build, UAT feedback.

1. **Ngày 16–18:** design QA report/action/experiment/learning và core journeys; kiểm evidence links, missing/baseline 0, human approval và version changes. Chỉ sửa usability cần cho gate sau freeze.
2. **Ngày 19:** cùng Thanh/FE retest lỗi hiển thị/mobile/keyboard/focus/validation; chốt high-priority usability, không thêm màn/module mới.
3. **Ngày 20:** handoff final tokens/assets/screens/specs/prototype links/versions và hướng dẫn luồng pilot; ghi khác biệt còn lại giữa design và build trong known issues.

**Bàn giao:** design system/specs cuối và design QA verdict trong `design/`. **Đạt khi:** FE và BA xác nhận handoff khớp build, critical flows sử dụng được, các gaps có owner và severity, PO biết limits trước release.
