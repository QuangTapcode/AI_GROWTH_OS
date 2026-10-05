# Thanh — Một Tester phụ trách hai lane

[Bảng toàn đội](README.md) · [Checklist trạng thái](../../../TODO.md). Lane 1 TypeScript/Playwright tại `qa/tester-1/` (UI/E2E/UAT); lane 2 Python/pytest/HTTP client/SQL tại `qa/tester-2/` (API/data/security/AI); fixtures `qa/fixtures/`, evidence `qa/evidence/<build>/<task>/`. Đây là **một kế hoạch chung**, không phải hai Tester chạy đầy capacity. Ưu tiên tenant/source/approval/form/numeric critical trước; thiếu capacity báo PM điều chỉnh scope/mốc, không bỏ critical tests.

<a id="tuan-1"></a>

**Task con để bắt tay làm:** [Tuần 1 — thanh](../execution/W1.md#thanh) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 1 — Ngày 1–5

**Task gốc:** W1-QA1-01/02/03 và W1-QA2-01/02/03; evidence W1-GATE-01/02/03. Phụ thuộc: BA AC/roles, schema/examples, FE mock trước live staging, AI pipeline/dataset. Review test nghiệp vụ bởi Dương/FE; review API/eval bởi BE/AI, kết quả pipeline do Thanh đối chiếu độc lập.

1. **Ngày 1–2:** test plan/trace 16 module, test IDs/expected results/priority; hai tenant và Owner/Editor/Viewer fixtures với Mỹ. Bootstrap Playwright package/lockfile riêng và pytest project/lockfile riêng, lệnh run/check và CI smoke; không cần Postman nếu HTTP suite đủ.
2. Lane 2 kiểm contract examples và negative tenant API/DB/storage/vector; Viewer không sửa, workspace A không đọc B. Chạy sớm khi BE đưa lát auth/source, không đợi ngày 5.
3. **Ngày 3–4:** lane 1 login/workspace/profile/goals/source upload/review/revoke/delete/provenance; validation/loading/empty/error/read-only, persist/reload. Pilot form chỉ success sau server lưu; failure/double-submit/retry không conversion trùng.
4. Lane 2 kiểm source safety/version/revoke/delete, public read không lộ draft, form DB/idempotency; analytics không tên/email. Live event/Google có evidence thật khi quyền sẵn sàng, thiếu thì ghi blocker.
5. Cùng AI lập **ít nhất 30 ca** retrieval/facts/content/scoring/report có dataset version; Dương/PO duyệt rubric. Kiểm missing facts, injection, approved-only/tenant/deleted sources, invalid JSON; kết quả không chỉ dựa AI tự chấm.
6. **Ngày 5:** E2E staging nền tảng, responsive/keyboard/accessibility cơ bản, retest defects và demo W1; lưu build/commit/environment/AC/test IDs/model/prompt/dataset versions. Gửi gate verdict pass/fail/blocked, không tick feature bằng mock.

**Bàn giao:** runners/fixtures/test plan/cases + W1 API/UI/eval evidence/defects. **Đạt khi:** tests chạy lại được, critical negative paths có expected/actual, 30 ca có rubric/version/result, gates có bằng chứng live hoặc blocker rõ. Dương review AC trace; BE/FE review reproducibility, PO nhận verdict.

<a id="tuan-2"></a>

**Task con để bắt tay làm:** [Tuần 2 — thanh](../execution/W2.md#thanh) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 2 — Ngày 6–10

**Task gốc:** W2-QA1-01/02 và W2-QA2-01/02; evidence W2-GATE-01/02/03. Phụ thuộc: research/queue của Mỹ, core content API Thiệu Quang, FE/AI increments.

1. **Ngày 6–7:** lane 2 schema/source/timestamp/dedup, score components tính lại theo BA example, missing demand không search volume giả; tenant/lineage. Lane 1 research progress/evidence/board/filter/select.
2. **Ngày 8:** strategy/brief role/approval/version và lineage; E2E opportunity→approved strategy→approved brief. Generation brief chưa duyệt phải bị chặn cả API, không chỉ disabled button.
3. **Ngày 9:** editor/autosave/history/restore/regenerate/variant và stale concurrent conflict; source/CTA/missing fact UX. Job timeout/provider error/quota/restart/retry/cancel capability, result không trùng/call cap không reset.
4. Chạy frozen AI eval từng pipeline cho grounding/brand/factuality/invalid JSON/token/cost/timeout; đối chiếu input/output/sources. Regress auth/source/goals/form W1 theo risk, không lặp mọi test không liên quan mỗi ngày.
5. **Ngày 10:** một E2E staging research→draft, retest blockers, báo gate verdict và thiếu dữ liệu/capacity tuần 3–4 cho PM.

**Bàn giao:** W2 E2E/API/queue/AI evidence và defects có owner/build/repro steps. **Đạt khi:** score/approval/version/caps đúng, journey live đủ lineage/source/CTA, eval có versions và critical results. Review: Dương, hai BE/FE và AI cho cases; PO nghiệm thu theo evidence.

<a id="tuan-3"></a>

**Task con để bắt tay làm:** [Tuần 3 — thanh](../execution/W3.md#thanh) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 3 — Ngày 11–15

**Task gốc:** W3-QA1-01/02 và W3-QA2-01/02; evidence W3-GATE-01/02/03. Phụ thuộc: approval/publishing/metrics live, public URL và Google quyền; missing quyền là blocker, synthetic data chỉ test logic.

1. **Ngày 11–12:** E2E draft→reject→edit→approve→schedule/publish→public URL. Negative stale version/source revoked/reviewer revoked, edit-after-approval; execution recheck, calendar/timezone/cancel.
2. Lane 2 publish retry/timeout/unknown outcome/restart/token revoked, idempotency/reconcile/audit; không có bài trùng và không lộ secrets/PII/drafts qua public endpoint.
3. **Ngày 13:** SEO/link/local/refresh rules theo fixtures/source refs; community nhập→response có nguồn→approve→manual post link; UTM/campaign/content mapping.
4. **Ngày 14:** GA4/GSC range/property/timezone/source đối chiếu dashboard; click khác form conversion, zero/missing/delay đúng. Event thật hoặc lịch sử hợp lệ có quyền mới nghiệm thu connector; Google thiếu thì ghi blocked.
5. **Ngày 15:** regression M01–M13 theo risk, retest critical, demo publish→dashboard; xác minh snapshots và widget schemas để W4 tiếp tục.

**Bàn giao:** publish recovery/security/tracking/metric/SEO/community evidence, nguồn đối chiếu và W3 verdict. **Đạt khi:** human approval/version không bypass, retry/event không trùng, metrics khớp nguồn thật, manual handoff rõ; blockers còn mở được báo PO trước freeze.

<a id="tuan-4"></a>

**Task con để bắt tay làm:** [Tuần 4 — thanh](../execution/W4.md#thanh) · [Fields/API/luồng chuẩn](../execution/DATA-AND-FLOWS.md).

## Tuần 4 — Ngày 16–20

**Task gốc:** W4-QA1-01/02 và W4-QA2-01/02/03; evidence W4-GATE-01/02/03/04. Phụ thuộc: report/assignment/learning code, BA UAT scripts, BE restore/rollback setup và frozen eval AI.

1. **Ngày 16:** hai kỳ/report metric/số/% khớp snapshot, baseline 0/missing, evidence; recommendation chưa duyệt không tạo task, approve retry không trùng.
2. **Ngày 17:** visitor giữ variant theo policy, exposure thực tế và persisted form outcome trace assignment→exposure→outcome; dedup/reload/retry/no Owner token in pilot, result tách variant và thiếu mẫu không winner.
3. **Ngày 18:** learning insight/evidence/version, reject/stale/concurrent approval, update strategy chỉ sau duyệt và không apply trùng. AI frozen eval cuối gồm M15–M16: 100% critical, ≥90% facts/retrieval chuẩn theo rubric đã duyệt, numeric report đúng input.
4. **Ngày 19:** cùng Dương/PO full closed-loop E2E/UAT 16 module, retest critical; cùng BE kiểm migration/backup→restore→smoke/rollback và tải pilot theo caps. Lưu observed results/limits, tách synthetic tests khỏi nguồn live.
5. **Ngày 20:** QA release verdict gồm AC pass/fail/blocked, open issues/severity, build/versions/evidence; release smoke sau PO go, kiểm form/publish/metrics/AI health. Bàn giao runners/fixtures/UAT/evidence, không tự ghi PO acceptance.

**Bàn giao:** final QA/UAT/eval/security/performance/restore/release evidence và known issues. **Đạt khi:** critical tenant/source/approval/publish/event/numeric paths đều pass, 16 module có trace evidence, restore/rollback đã thử; missing prerequisites được báo no-go/blocked chứ không bỏ qua để release.
