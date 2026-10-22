# Growth Lead & Analyst

Owner: Quang Quang. Task: QQ-04, QQ-07 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái QQ-04/07:** `opportunity.score`, `strategy.generate`, `brief.generate` và `learning.analyze` đều dùng dedicated handler/schema/prompt. Proposal downstream vẫn phải qua approval trước publish.

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
