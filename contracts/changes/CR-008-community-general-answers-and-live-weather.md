# CR-008 — Community bot: trả lời kiến thức chung khi cẩm nang không có, và thời tiết thật

- Owner/consumer reviewers: owner TripC (người quyết định ngày 2026-11-11), API community autopilot, Telegram/Facebook reply runners.
- Story/module và lý do: Community agent. Bot Telegram "Cộng đồng du lịch Việt Nam" từ chối các câu hỏi thường ngày ("quán phở ngon ở Ngũ Hành Sơn", "mua nhà 3 tỷ ở Đà Nẵng", tán gẫu) bằng câu "cẩm nang đang cập nhật"; câu chào lại liệt kê chủ đề ngẫu nhiên từ cẩm nang; "Đà Nẵng hôm nay bao nhiêu độ" được trả bằng nhiệt độ trung bình cả năm. Owner chọn: trả lời bằng kiến thức chung có ghi rõ, và lấy thời tiết thật.
- Contract hiện tại → bản đề xuất:
  - Trước: không có đoạn nguồn nào trả lời thì `reply` là câu dự phòng (VI) hoặc `HANDOFF_REPLY` (EN); chào hỏi dùng 3 đoạn nguồn đứng đầu.
  - Sau: không có đoạn nguồn nào trả lời, câu hỏi không về doanh nghiệp (không nêu tên TripC/company, không hỏi kiểu "do you sell…", "bên bạn có bán…") và không nhạy cảm (giá, phí…) → một lời gọi `community-general-v1` trả `{reply, kind: chat|info}`.
    - `info`: thêm dòng "(Thông tin tham khảo chung, chưa có trong cẩm nang của TripC.)", vẫn có `missing_facts: ["grounded_answer"]` để câu hỏi vào danh sách knowledge gap.
    - `chat`: không ghi chú, không thiếu fact.
    - Câu nào có giá, link, số điện thoại hoặc con số khách không nêu thì bị bỏ. Model không giúp được thì giữ câu dự phòng cũ.
  - Câu hỏi thời tiết hôm nay/ngày mai cho một thành phố đã biết (17 thành phố) → Open-Meteo, chỉ gửi tọa độ thành phố. Không nêu thành phố thì hỏi lại. Dịch vụ lỗi thì trả `LIVE_REPLY_*` như trước.
- Endpoint/schema/error/state/authorization/metric bị đổi: không đổi schema `CommunityReply`. Thêm prompt `services/ai/prompts/community-general-v1.md`, schema nội bộ `GeneralDraft`, module `src/agents/community/weather.py`.
- Breaking hay additive: thay đổi hành vi (additive về schema). Một reply không trích nguồn giờ có thể là câu trả lời thật (`citations: []`, có ghi chú `info`). `escalation_required` vẫn `true` khi thiếu `grounded_answer`.
- Examples trước/sau và validation: `tests/test_community_general_answers.py`, `tests/test_community_live_weather.py`. Các test cũ "không có nguồn thì không hỏi model" nay đếm riêng lời gọi soạn từ trích dẫn; test chào hỏi/opener nay kỳ vọng lời chào của trợ lý thay vì trích cẩm nang.
- FE/BE/AI/QA cần đổi gì: AI only. API/worker gửi reply như trước.
- Kế hoạch: AI deploy (container `ai`) 2026-11-11.
- Compatibility, migration và rollback: không có migration. Rollback = revert pipeline/prompt/weather và build lại container `ai`.
- Evidence/checks/decision: AI suite 1154 pass (2 đỏ có từ trước: `test_a_reply_guessing_beyond_the_quotes_goes_to_a_person`, `test_blocked_release_has_no_git_tag`). Chạy thật với model `gemini-2.5-flash` (hybrid) trên 7 câu hỏi Telegram: đúng ghi chú, không nói thay doanh nghiệp, thời tiết lấy từ Open-Meteo. Mỗi câu không có nguồn tốn thêm 1 lời gọi model (Gemini free tier; hết quota thì chuỗi hybrid tự chuyển sang Ollama).
