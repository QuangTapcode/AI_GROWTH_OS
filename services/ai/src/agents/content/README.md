# Content Marketing

Owner: Quang Quang. Task: QQ-05 trong [TODO cá nhân](../../../../../docs/coordination/sprint-3-weeks/QUANG-QUANG.md). Reviewer chất lượng: Thiệu; business rules: Dương; HTTP boundary: Mỹ/Thiệu Quang.

**Trạng thái:** dedicated pipeline/schema/prompt cho `content.generate`, `content.repurpose`, `content.quality_check` đã đăng ký. Social pack target mặc định là Facebook + TikTok và luôn ở draft/manual approval cho đến khi connector được verify.

**Facebook (xong):** khi target có `facebook`, cùng một lần gọi model trả thêm `facebook` (prompt `prompts/content-v3-facebook.md`): hook trước "See more", thân bài 2-4 ý từ bài SEO, câu hỏi thảo luận tùy chọn, tối đa 2 hashtag. Code tự ghép CTA chính xác thành `facebook.text`, chặn link/URL và số/giá không có nguồn. Bài Facebook text không cần ảnh. Automation đăng Page dùng `facebook.text`, fallback `caption`. **TikTok:** chưa có variant riêng (đang dùng `caption` chung).

- Input: social brief + parent blog/version + approved assets.
- Output/handoff: caption/CTA/file ảnh/variants có parent refs → human approval → executor.
- Tool scope dự kiến: content/asset draft; publish qua executor. Gateway backend phải enforce; prompt không cấp quyền.
- Thêm `pipeline.py` và `schemas.py` khi làm task; đăng ký handler/schema/prompt version tại `src/app/operations.py`. Dùng shared RAG/guardrails/providers/run store đã có.
- Done: dedicated handler, schema validated, citations/version/tenant đúng, role eval có QA review, output persist và downstream nhận đúng artifact refs. Prompt/eval cập nhật cùng PR.

[Kiến trúc](../../../../../docs/architecture/SIX-AGENT-RESTRUCTURE.md).
