# Agent test cases

Tài liệu này ghi các kiểm thử tối thiểu cho sáu agent trong dashboard `/agents` và trạng thái kiểm thử gần nhất.

## Trạng thái tổng quan

| Phạm vi | Kết quả | Bằng chứng |
|---|---:|---|
| AI unit/integration tests | **PASS** | `183 passed` trong `services/ai/tests` |
| Fake six-role evaluation | **PASS** | `30/30` trong `evals.six_roles --mode fake` |
| API task/campaign tests | **PASS** | `30 passed, 3 skipped`; PostgreSQL automation `3 passed` |
| Worker tests | **PASS** | `105 passed, 1 skipped` |
| Dashboard smoke test | **PASS** | Authenticated dashboard, 6 roles, blocker, mobile layout, no JS errors |
| Live AI readiness | **BLOCKED** | `/readyz` trả `503`: thiếu `embeddinggemma:latest` |
| Real campaign automation | **BLOCKED** | Workspace hiện chưa có approved sources/knowledge context; dashboard đang hiển thị dữ liệu `Demo` |

## Testcase theo agent

| Agent | ID | Kiểm thử | Kết quả |
|---|---|---|---:|
| Research & Trend | `RES-01` | Tạo research handoff có artifact, provenance, hash và chạy lại không tạo bản trùng | **PASS** |
| Research & Trend | `RES-02` | Từ chối source khác tenant, revoked/deleted, sai version, thiếu URL, future date hoặc sensitive source | **PASS** |
| Growth Lead / Campaign | `GL-01` | Chấm opportunity, tạo strategy và brief từ research context hợp lệ; giữ score và dependency | **PASS** |
| Growth Lead / Campaign | `GL-02` | Chặn context stale/tampered, thiếu business data, deadline/factor không hợp lệ; giữ budget/restart an toàn | **PASS** |
| SEO Worker | `SEO-01` | Tạo title, meta, outline/article có citation từ research parent hợp lệ | **PASS** |
| SEO Worker | `SEO-02` | Từ chối parent khác tenant, stale, revoked hoặc tampered; không vượt approval gate | **PASS** |
| Content Marketing | `CNT-01` | Repurpose nội dung thành social pack, CTA và asset references đúng parent/version | **PASS** |
| Content Marketing | `CNT-02` | Với asset missing/pending/revoked/foreign, trả trạng thái cần asset và không tự bịa ảnh | **PASS** |
| Community | `COM-01` | Tạo phản hồi grounded, có citation và không tự ý apply/send | **PASS** |
| Community | `COM-02` | Câu hỏi nhạy cảm về thuê nhà, địa chỉ hoặc booking phải thiếu dữ liệu/escalate và yêu cầu consent | **PASS** |
| Performance | `PERF-01` | Đọc metrics snapshot; phân biệt metric bằng `0` với metric bị thiếu; không mutate ngân sách | **PASS** |
| Performance | `PERF-02` | Từ chối context/tenant không hợp lệ và giữ provenance của báo cáo | **PASS** |
| Learning / Growth Lead Analyst | `LRN-01` | Sinh next task trong quota; giới hạn max iterations và chống duplicate task | **PASS** |
| Learning / Growth Lead Analyst | `LRN-02` | Không bịa metric/contact data; replay cùng input phải idempotent | **PASS** |

## Testcase cho automation

| ID | Kiểm thử | Kết quả |
|---|---|---:|
| `AUTO-01` | Hai tick chạy đồng thời chỉ enqueue đúng một Research task/outbox event | **PASS** |
| `AUTO-02` | Research hoàn tất thì tạo đúng một Strategy task tiếp theo | **PASS** |
| `AUTO-03` | Owner disabled hoặc suspended thì không được enqueue task mới | **PASS** |

Các testcase AI của từng agent nằm chủ yếu trong `services/ai/tests/test_research.py`, `test_growth_lead.py` và `test_six_roles.py`. Automation PostgreSQL nằm trong `apps/api/tests/campaignPlans/automation.pg.test.ts`.

## Điều kiện để đánh dấu chạy thật là PASS

1. Pull model `embeddinggemma:latest` để `/readyz` trả `200`.
2. Tạo và approve ít nhất một source hợp lệ, sau đó build knowledge context cho workspace.
3. Chạy một campaign thật từ dashboard và kiểm tra task ID, outbox event, artifact và audit log; không dùng các dòng có nhãn `Demo` làm bằng chứng thực thi.
