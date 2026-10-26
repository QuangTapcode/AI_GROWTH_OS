# Growth Lead & Analyst

Owner: Quang Quang. Task: QQ-04, QQ-07 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái QQ-04/07:** `opportunity.score`, `strategy.generate`, `brief.generate` và `learning.analyze` đều dùng dedicated handler/schema/prompt. Proposal downstream vẫn phải qua approval trước publish.

**Chạy thật (26/10):** autopilot `Research → strategy.generate → plan accepted → seo.local_draft → content.repurpose` chạy trên dữ liệu TripC thật (qwen3:8b, `synthetic=false`).

- **Mục tiêu:** `PUT /v1/workspaces/:id/growth-goal` (owner) lưu goal + KPI vào `growth_goals`/`growth_kpis`; knowledge context mới tự ghim goal đang active (`goal_context`). Baseline để `null` cho tới khi có connector đo được — null không phải 0.
- **Điểm cơ hội:** nếu không có `score_factors` của người vận hành, [`scoring.py`](scoring.py) suy 6 yếu tố 0–5 từ tín hiệu Research (tiêu đề khớp/thứ hạng, biến động, số domain cạnh tranh, ngày bằng chứng, khớp offer/CTA) với `source=derived_from_research_signals_not_search_volume` và `basis` giải thích từng yếu tố. Không phải search volume hay dự báo chuyển đổi.
- **Chặn:** chỉ chặn khi thiếu dữ liệu của cơ hội được chọn; `source_gap:*` và `stale_evidence:*` của finding khác chỉ là ghi chú.
- **Chọn cơ hội:** Research v6 trả tối đa 3 ý (mỗi chủ đề xu hướng có nguồn một ý); khi không có điểm của người vận hành, Growth Lead xếp hạng tất cả bằng cùng điểm tự suy (`selection_method=derived_score_ranking`, `ranked_opportunities`) và SEO viết đúng ý được chọn.
- **Vòng rút kinh nghiệm (26/10):** bài SEO đã duyệt được đăng lên website TripC (`apps/pilot`, `auto_publish_website` hoặc `POST /site-posts`); website ghi page view / CTA click ẩn danh (`site_events`, truy cập nội bộ không tính). Autopilot tạo `metrics.snapshot` + `lead.aggregate` (`storage=postgres_ledger`) cho context hiện tại → `analytics.report` → `learning.analyze` → owner duyệt `POST /learning-tasks` → `research.run` vòng sau. Lượt hiển thị/click tìm kiếm khai báo `search_console_not_connected`, không ghi 0. Local đo được 0 khách thật cho tới khi website public.

- Input: research + goals + report artifacts.
- Output/handoff: campaign/task proposal, briefs, learning, next-task proposal → SEO, Content và worker validate plan.
- Tool scope dự kiến: campaign/task proposal + aggregate reads. Gateway backend phải enforce; prompt không cấp quyền.
- Implementation: [pipeline.py](pipeline.py), [schemas.py](schemas.py), [prompt](../../../prompts/growth-lead-v1.md); đăng ký tại `src/app/operations.py`, dùng shared providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).

## Chạy thử không cần database nghiệp vụ

Từ thư mục gốc repo (Python 3.12–3.14 đã cài dependencies trong `services/ai/requirements.lock`):

```powershell
python services/ai/scripts/smoke_qq04.py
cd apps/api
node_modules/.bin/tsx.cmd scripts/demo-qq04.ts
node_modules/.bin/vitest.cmd run tests/campaignPlans/submit.test.ts
```

Trên máy hiện tại, `python` là Windows Store alias. Interpreter đã chạy được là `C:/Users/ADMIN/AppData/Local/Python/pythoncore-3.14-64/python.exe`; PowerShell gọi bằng `& <đường dẫn> ...`. `npm.cmd` dùng được khi PowerShell chặn `npm.ps1`.

Smoke gọi HTTP qua ASGI TestClient, fake provider, SQLite tạm của AI service. Demo backend đọc report, seed `MockPlanRepository`, validate rồi commit plan/tasks/outbox trong bộ nhớ. Đây là mock nghiệp vụ; không có queue delivery thật. Kết quả nằm ở `qa/evidence/qq04/`.

## Handoff

Research artifact phải cùng workspace/profile/snapshot; hash và quote được đối chiếu trước run. Model chỉ chọn index của finding đã có; code tạo topic/fit/brief từ finding đó. Không có score demand hoặc search volume giả. Thiếu audience/offer/CTA/profile version hoặc research thì output `blocked` và ghi `missing_facts`.

Plan có đúng hai task: SEO draft không dependency, social draft phụ thuộc SEO. `input_artifact_refs` pin research ID/version/hash; `dependency_artifact_from` chỉ task sẽ sinh output, không bịa artifact chưa tồn tại. Backend chỉ ghi SEO vào outbox, giữ social `blocked`; runner sau này phải chờ và resolve output SEO đúng version trước khi dispatch social.

Backend module: `apps/api/src/modules/campaignPlans/`. `submitCampaignPlan` chỉ nhận artifact ref, tải content từ repository tin cậy và validate toàn plan trước `accept`. Mock bị chặn mặc định, demo mới bật `allowSynthetic: true`. Human approval vẫn bắt buộc trước publish.

[Bàn giao, evidence và phần còn thiếu](../../../../../docs/coordination/sprint-3-weeks/bao-cao/2026-10-15-QQ04-HANDOFF.md).
