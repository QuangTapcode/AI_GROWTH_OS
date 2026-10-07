# TODO triển khai sâu — AI Growth OS / TripC

05/10/2026 · 4 tuần, 8 người · FE/BE TypeScript, AI Python. Đây là các gói việc để bắt tay triển khai, cụ thể hóa [99 task gốc](../../../TODO.md) và [bảng việc cá nhân](../weekly-todos/README.md), dựa trên PRD và kế hoạch 4 tuần đã lưu trong `docs/sources/`.

| Tuần | Mở checklist triển khai | Kết quả phải nhìn thấy |
| --- | --- | --- |
| 1 / ngày 1–5 | [W1 — nền tảng, M01–M03, pilot/form](W1.md) | TripC workspace/profile/source/goal lưu thật; nguồn duyệt được truy hồi; website shell/form hoạt động |
| 2 / ngày 6–10 | [W2 — M04–M08 và lát đầu M09](W2.md) | Từ một research run tạo opportunity, strategy/brief được duyệt và draft có nguồn/version |
| 3 / ngày 11–15 | [W3 — M09–M13](W3.md) | Duyệt đúng phiên bản → bài public có URL → UTM/form events → dashboard đối chiếu nguồn |
| 4 / ngày 16–20 | [W4 — M14–M16, UAT/release](W4.md) | Report hai kỳ đúng số; experiment hai CTA/title; insight được duyệt tạo strategy version mới |

Đọc [dữ liệu, API và luồng chuẩn dùng chung](DATA-AND-FLOWS.md) trước khi code. Mỗi tuần có 8 mục theo tên, các task con có mã để đưa lên branch/PR và theo dõi thực thi. Mã `QQ` = Quang Quang, `DU` = Dương, `TQ` = Thiệu Quang, `MY` = Mỹ, `TI` = Tiến, `HY` = Huyền, `TR` = Trường, `TH` = Thiệu.

[EXAMPLES](EXAMPLES.md) có payload profile/goal/source/brief/form/report/experiment/learning và expected result cho retry, stale version, baseline thiếu/0; BA→BE→FE/AI→QA dùng chung để bắt đầu mock/stub/tests.

## Phân biệt yêu cầu và thiết kế đề xuất

- **Đã chốt:** roster/ngôn ngữ, TripC/expat Đà Nẵng/English/housing-first, Next.js website và CMS, Ollama/máy Windows, human approval, form persisted là conversion; 16 module và AC theo backlog.
- **Đề xuất thực thi trong tài liệu này:** tên bảng/field/route/component, role-action matrix chi tiết, validation/method/error codes và rubric chi tiết chưa có trong PRD. BA/BE/FE/AI review theo lô ở ngày 1–2 rồi cập nhật schemas/examples. Đây chưa phải contract đã freeze hay code đã có.
- **Chưa có:** domain/public URL, Google properties/quyền/data và app product đang chạy. Giữ blockers; task “tạo kế hoạch” khác task “đã deploy/verify”. Không tự thêm paid API, domain purchase hoặc autonomous publishing.

## Cách dùng checklist

Task con được tick ở W1–W4 sau khi có đầu ra và bằng chứng. Task cha trong TODO chỉ tick khi **tất cả phần FE/BE/AI/BA/UX/QA liên quan** đạt theo phạm vi và gate; task kế hoạch đã Done không bị mở lại vì thêm chi tiết. Các task con lập trình mới đều chưa Done. Đây là phân rã cùng backlog, không thêm tuần thứ 5 hoặc tính các vai trò kiêm nhiệm thành người mới.

Mỗi PR ghi task con + task cha + epic AC IDs; một lát feature chính mỗi người. Source đề xuất dưới đây do owner tạo khi bootstrap, không phải mô tả file đã tồn tại. Migrations/contracts/router chung chỉ Thiệu Quang merge; FE routes/common/manifest/lockfile chỉ Tiến merge sau review. Không cam kết merge không có lỗi: mock/schema checks cho phép làm độc lập, staging/AC mới xác nhận ghép đúng.

## Bộ dữ liệu xuyên suốt để đội không làm lệch nhau

Các ID dưới đây là **nhãn fixture**, triển khai dùng UUID theo schema. Thiệu/Mỹ tạo synthetic seed; dữ liệu demo thật dùng nguồn đã được PO duyệt riêng.

| Nhãn | Nội dung | Dùng kiểm điều gì |
| --- | --- | --- |
| `WS-A` / `WS-B` | TripC demo và workspace khác | Tenant A không đọc/sửa B |
| `USR-OWNER/EDITOR/VIEWER` | Ba role trong WS-A | Role-action matrix; actor lấy từ session |
| `SRC-HOUSING-v1` | Synthetic fact “Example Residence”, address/price để null, approved | RAG/citation không bịa giá/địa chỉ |
| `SRC-REVOKED-v1` | Synthetic fact có giá minh họa, revoked/deleted | Không còn retrieve/publish claim dựa nguồn này |
| `GOAL-A` | Form leads, English expat housing, range 30 ngày, baseline null | Missing baseline không biến thành 0 hay % tăng |
| `OPP-HOUSING` | “Where to live in Da Nang as an expat” | Lineage research→strategy→brief→content |
| `CONTENT-A-v1/v2` | “Choosing an area to live in Da Nang” | Approve v1 rồi sửa v2 phải duyệt lại |
| `LANDING-A` | `/living-in-da-nang`, form nhận thông tin | Public read/tracking/experiment một trang |
| `METRIC-P1/P2` | Hai kỳ sessions 100/120; form leads 5/6 | +20% sessions và leads; tỷ lệ cả hai kỳ = 5% |
| `EXP-CTA-A/B` | “Get the Da Nang living guide” / “Get local living updates” | Assignment/exposure/form persisted/dedup, không winner khi thiếu mẫu |

## Một vòng demo phải hoàn thành

1. Owner tạo WS-A, profile TripC và GOAL-A; Editor nhập source, Owner review; Viewer chỉ đọc.
2. Research topic housing English Đà Nẵng, lưu URLs/timestamps; select opportunity → generate strategy → human approve → brief approve → draft.
3. Editor chỉnh draft v1→v2, Owner review v2; schedule/publish đúng v2. Public `/blog/{slug}` chỉ thấy bản đã đăng.
4. Visitor đến LANDING-A bằng UTM, thấy một CTA variant cố định; gửi form. Backend lưu một submission và outcome, FE mới báo success/gửi event hợp lệ.
5. Metrics snapshots có nguồn/range/timezone; report so sánh hai kỳ, PO approve action mới tạo task. Learning insight được duyệt mới tạo strategy version tiếp theo.
6. Thiệu lặp negative cases: Viewer mutate, tenant B access, source revoked, stale edit/approval, publish retry, submit retry, zero/missing, ít mẫu. Failure nào cũng có expected result và evidence.
