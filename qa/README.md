# Tester — Hai lane trong pilot 4 tuần

Thiệu phụ trách hai lane: `tester-1/**` cho UI/nghiệp vụ/E2E/accessibility/UAT; `tester-2/**` cho API/data/contract/security/integration/performance/AI verification. Mỗi lane có suite và môi trường riêng.

## QQ_test — regression khi tích hợp BE

[QQ_test](QQ_test/README.md) lưu automation và [test case](QQ_test/TEST_CASES.md) của Quang Quang dùng khi merge BE vào `Quang-Quang`: migration/PostgreSQL, workspace/member/tenant, source lifecycle, API response, lead/public content và worker retry/recovery. Suite có manifest/lockfile riêng, database tạm và evidence từng lần chạy. Xem [baseline](QQ_test/BASELINE.md) để phân biệt kết quả đạt với gate cấu hình hoặc coverage còn thiếu.

## Làm độc lập

- Nhận AC/contracts tuần 1, viết scenarios trước code và test lát tích hợp hằng ngày.
- QA1 dùng prototype/UI mock rồi staging E2E; QA2 dùng schema/examples/API local + stubs rồi live adapters/providers.
- Developer giữ unit tests cạnh source; Tester không sửa product source để test pass.
- `fixtures/`: QA2 đầu mối với BE; payload khớp canonical examples/contracts, dữ liệu synthetic có nhãn.
- `evidence/<build>/<task>/`: environment/commit/schema/model/prompt/dataset/time/steps/expected/actual/defect links; redacted, không credentials.

Mock là local evidence, không thay CMS/GA4/GSC integration thật. Artifact lớn lưu ngoài repo với link; runner/manifest/lockfile/run commands cần bootstrap W1-QA1-01/W1-QA2-01, hiện chưa có suite chạy được.

## Ghi chú theo tuần

- Tuần 1: M01–M03, tenant/RBAC/source/RAG và tracking; chốt ≥30 eval cases cùng AI.
- Tuần 2: M04–M08, research→strategy→brief→draft, score/concurrency/provider errors và grounding.
- Tuần 3: M09–M13, SEO/CMS/community/UTM/GA4/GSC, stale approval/duplicate publish/zero/missing/timezone.
- Tuần 4: M14–M16 và regression 16 module, report numerics, stable assignment/event dedup, learning approval, UAT/restore/release smoke.

Ngưỡng eval đề xuất: 100% critical, ≥90% facts/retrieval chuẩn, report số khớp input trên frozen dataset/rubric được BA/PO chốt. Không dùng AI tự chấm làm bằng chứng duy nhất; thêm M15–M16 cases khi contract chốt.

Không còn blocker/critical trước release; mọi critical tenant/source/approval/publish/event/numeric check phải đạt. QA cung cấp evidence, BE readiness, PM/PO go/no-go. Đọc [TODO](../TODO.md) và [SCOPE](../docs/ba/SCOPE.md). Không chạy destructive tests trên production.


## Roster và ngôn ngữ đã chốt

Thiệu phụ trách cả hai lane trong cùng capacity: lane 1 TypeScript/Playwright (qa/tester-1/, package/lockfile riêng); lane 2 Python/pytest/HTTP client/SQL (qa/tester-2/, pyproject/lockfile/venv riêng). BA Dương và service owner review suite/evidence; không giả định có Tester thứ hai. [TEAM](../docs/coordination/TEAM.md) quy định phân công.
