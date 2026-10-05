# Phạm vi pilot 4 tuần — 16 module

Baseline thực thi: [kế hoạch 4 tuần ngày 05/10/2026](../sources/README.md) do người dùng cung cấp. PRD v1.0 là định hướng sản phẩm; mức chức năng/nghiệm thu pilot lấy theo bản kế hoạch mới.

**M01–M16 được đánh số lại theo kế hoạch 4 tuần**, không dùng bảng M01–M30 cũ. Các tài liệu baseline cũ lưu tại `docs/sources/archive-8-weeks/` chỉ để tham khảo lịch sử. BA/PO chốt độ sâu pilot sau estimate ngày 2, không tự mở rộng thành full SaaS.

## 1. Module, lịch và acceptance tối thiểu

| Mã | Module / tuần | Chức năng tối thiểu và AC | Owner triển khai |
| --- | --- | --- | --- |
| M01 | Workspace · T1 | Business onboarding/brand/audience/language/products; Owner/Editor/Viewer; profile lưu thật, Viewer không sửa, tenant A không đọc B. Growth Map đề xuất cần duyệt. | FE workspace/onboarding; BE identity/workspaces/business; AI context |
| M02 | Business Knowledge Base · T1 | Text/PDF có text/URL được phép; review/process/version/delete; RAG chỉ nguồn hợp lệ có citations; thiếu facts báo thiếu; xóa nguồn không còn truy hồi. | FE knowledge; BE storage/source/jobs; AI RAG |
| M03 | Growth Goal Manager · T1 | Goal/baseline/KPI/period/audience/conversion/budget/channels và action links; lưu/mở lại đúng; thiếu baseline không hiển thị %; progress theo metric chọn. | FE goals; BE goals; AI objective/KPI suggestions |
| M04 | Market Intelligence Engine · T2 | Một search/API nguồn chọn + URLs được phép; signal title/URL/time/evidence/type, dedup và job states; provider lỗi rõ, không giả demand. | FE research; BE research/jobs; AI research |
| M05 | Opportunity Engine · T2 | Keyword/topic/intent/relevance/freshness/business value/priority; rubric công khai; score recompute đúng, chuyển strategy/brief giữ IDs/nguồn; heuristic không là search volume. | FE board; BE opportunities; AI scoring |
| M06 | Growth Strategy Engine · T2 | Plan 30 ngày, action owner/effort/deadline/channel/KPI; edit/version/approve; duyệt mới tạo tasks; không tự thực thi action chưa duyệt. | FE strategy/tasks; BE strategies/tasks; AI strategy |
| M07 | Content Intelligence Engine · T2 | Brief keyword/intent/audience/angle/unique value/facts/source/CTA/destination/format/channel; edit/approve trước generation, unverified facts gắn cờ. | FE briefs; BE briefs/source bindings; AI brief |
| M08 | AI Content Factory · T2 | Article/FAQ/meta/social draft + một variant; editor/save/history/restore/regenerate; sửa approved version phải duyệt lại. Video là script, image là prompt. | FE editor/variants; BE contents/version/jobs; AI generation |
| M09 | SEO Intelligence Engine · T2–T3 | Keyword/cluster cơ bản; title/meta/headings audit; internal links/broken links tập URL nhỏ; một local template có unique data; refresh dựa metric M13, lưu version. | FE SEO; BE keyword/audit/page jobs; AI SEO/refresh |
| M10 | Distribution Engine · T3 | Approval/reject/resubmit, calendar và một CMS publish/schedule; approved version only, retry không trùng, edit vô hiệu approval; một pilot timezone, timestamps UTC. | FE review/calendar; BE approval/CMS worker; AI format check |
| M11 | Community Growth Engine · T3 | Nhập URL/content hoặc nguồn được phép→intent→response→approve→manual post link; không đăng bình luận hàng loạt, không auto discovery đa nền tảng. | FE radar/handoff; BE community records; AI intent/response |
| M12 | Traffic Engine · T3, tracking từ T1 | UTM campaign/content/channel, click/conversion mapping và aggregation; URL đúng, test events nối campaign/content; attribution đơn giản, không multi-touch. | FE traffic/pilot tracking; BE tracking/events; AI channel suggestions |
| M13 | Analytics Engine · T1–T3 | Tracking T1, GA4/GSC giới hạn/dashboard T3; range/traffic/click/CTR/conversion/sync; số liệu khớp nguồn thật, zero khác missing, delay rõ. | FE integrations/dashboard; BE OAuth/sync/metrics; AI metric normalization |
| M14 | AI Growth Analyst · T4 | Growth Brief theo yêu cầu so sánh hai kỳ, source/metric/evidence/actions; number/% đúng snapshot, baseline 0/missing xử lý đúng; duyệt action mới tạo task. | FE report/review; BE snapshots/reports; AI analyst |
| M15 | Experiment Engine · T4 | Hypothesis + hai title/CTA variants, primary metric/period/grouping; một trang pilot; stable visitor assignment, exposure/conversion dedup và trace; thiếu mẫu không tuyên bố winner. | FE setup/widget/results; BE assignment/events/results; AI hypothesis/explanation |
| M16 | Learning Engine · T4 | Content/channel/performance/experiment snapshots; rules rank topic/format; insight có evidence/version→approve→strategy update; dữ liệu ít báo thiếu, không khẳng định nhân quả. | FE insights/review; BE learning/strategy versions; AI learning rules |

BA/UX/QA tham gia cả 16 module. Nền tảng dùng chung gồm auth/tenant/jobs/audit/quotas/cost logs/evaluation/CI/operations; không đánh thành module M17 trở đi. Roster mới có hai FE, hai BE, một AI kiêm PM/PO, một BA, một UI/UX và một Tester phụ trách hai lane; xem [TEAM](../coordination/TEAM.md). Chia theo feature/domain và contract để làm song song; estimate theo người thực tế ở W1-PM-02.

## 2. Đường phụ thuộc

```text
M01 → M02/M03 → M04 → M05 → M06 → M07 → M08
                                             ↓
                                            M09 → M10 → M12 → M13
M02/M05/M08 + approval M10 → M11
M03/M06/M13 → M14
M08/M10/M12/M13 + pilot instrumentation → M15
M06/M08/M13/M14/M15 → M16 → approval → new strategy version
```

M13 bật tracking/đối chiếu quyền từ T1, không đợi publish T3. Content approval ở M10 được dùng chung cho M08/M11; strategy/brief/learning cũng có approval semantics riêng theo AC. Refresh M09 nhận metrics có nguồn từ M13; nếu chưa có thì hiện thiếu dữ liệu, không giả decay.

## 3. Giới hạn bắt buộc

- Một website/CMS tối giản Next.js/TypeScript cho TripC: blog tiếng Anh, landing page và form đăng ký nhận thông tin; xuất bản sau human approval. `apps/pilot/` công khai, `apps/web/` quản trị, `apps/api/` CMS/API. Một timezone, một trang experiment; GA4/GSC và UTM đo traffic/nguồn/form thành công. [PILOT](../coordination/PILOT.md) ghi lựa chọn hiện hành; chưa có domain/properties/dữ liệu lịch sử.
- Text/PDF có lớp văn bản/URL; không OCR/media extraction/Google Docs connector riêng.
- SEO giới hạn URL nhỏ/local template, không crawler lớn/rank tracker riêng hoặc paid keyword database bắt buộc.
- Community được nhập hoặc nguồn hợp lệ, đăng thủ công và lưu link. Social ngoài CMS chỉ draft/export/handoff có nhãn.
- Experiment đo assignment→exposure→outcome, chưa statistical engine nâng cao. Learning dùng rules và human approval, không tự huấn luyện hoặc autonomous strategy update.
- Pilot quota/cost logging, task status và audit; không billing production hoặc hệ đa agent độc lập.
- Traffic/revenue tăng không là cam kết nghiệm thu trong 4 tuần; mục tiêu là functionality/data integrity/closed-loop có evidence.

## 4. Quyết định ngày 1–2 cần ghi nhận

| ID | Đầu mối | Đầu ra |
| --- | --- | --- |
| D01 | PM/PO + chuyên môn | [W1-PM-02](../coordination/W1-PM-02.md) đã lập effort S/M/L/task, WIP chung cho kiêm nhiệm, giữ review/QA; không yêu cầu timesheet theo chỉ đạo mới; đổi độ sâu/nhân lực/mốc khi gate trễ |
| D02 | BE + PM/PO | CMS, GA4/GSC quyền/properties/history, website instrumentation permissions và connector support matrix |
| D03 | BA/PO + AI/BE | Pilot dataset/formats/limits, một search provider, allowed URLs và approved-fact/source policies |
| D04 | BE/FE/AI/QA2 | Runtime/queue/hosting, 16-module API/job schemas, strategy/brief/approval versions, event/assignment/metric snapshots |
| D05 | PM + BE/AI/QA2 | Budget/token/timeout/tải pilot và phương pháp đo hiệu năng/cost |
| D06 | BA/PO + AI/QA2 | Tối thiểu 30 eval cases tuần 1, rubric/critical classification, thresholds và dataset version |

Đây là công việc của đội trong TODO, không phải yêu cầu dừng soạn tài liệu để xin xác nhận. BA lưu decision records khi đội chốt, PM review forecast ngày 10.

## 5. Gates và chất lượng

- **W1 / ngày 5:** workspace→knowledge approve→goal→RAG trên staging; tenant/Viewer/source revoke/delete checks đạt; tracking/quyền connector có evidence.
- **W2 / ngày 10:** opportunity→strategy/brief approved→draft có source/CTA/version; score đúng rubric; không giả demand.
- **W3 / ngày 15:** approval→CMS thật→UTM/dashboard đối chiếu được; SEO/community đạt AC giới hạn; handoff có nhãn thủ công.
- **W4 / ngày 20:** analyst/experiment/learning và UAT 16 module, không blocker/critical; freeze ngày 18, release có backup/restore/rollback/monitoring/owner.

AI/QA2 đề xuất 100% critical cases, ≥90% facts/retrieval chuẩn, report numbers khớp snapshots; BA/PO xác nhận rubric. Dataset phải có version; thêm ca M15–M16 khi contract chốt. AI tự chấm không là bằng chứng duy nhất.

Cross-tenant bị chặn; source xóa không vào RAG; edit-after-approval phải duyệt lại; publish retry và event không trùng; zero/missing đúng; report không bịa số; mọi learning strategy update đều cần duyệt. Mỗi story chỉ Done khi review + API/FE staging integration + AC/evidence + UI states + docs đạt.
