# CR-009 — Community bot: hiểu câu hỏi nối tiếp, mở rộng nguồn/chunk, và dùng phần quota Gemini/Groq/OpenRouter còn dư

- Owner/consumer reviewers: owner TripC (yêu cầu ngày 2026-11-12), API community autopilot, AI service, Telegram reply runner.
- Story/module và lý do: Community agent. Trong nhóm Telegram "Cộng đồng du lịch Việt Nam", câu "Khi nào thì nên đi du lịch" được bot hỏi lại "Bạn muốn biết thêm về khu vực nào không?". Câu tiếp theo "MyLe ơi, Khu vực Đà Nẵng" lại nhận một đoạn giới thiệu chung về Đà Nẵng (dân số, diện tích), không phải thời điểm nên đi. Có 3 nguyên nhân:
  1. Trong nhóm, `author_contact` là id của cả nhóm, nên lịch sử trộn tin của mọi thành viên, kể cả lệnh và thông báo có người vào nhóm.
  2. "Khu vực Đà Nẵng" không có dấu hiệu nối tiếp và lại khớp mạnh với các đoạn về Đà Nẵng, nên bị đọc như một câu hỏi mới.
  3. Kho tri thức chỉ phủ Đà Nẵng và miền Trung.
  Owner cũng muốn tính phần quota API còn dư và dùng phần đó để trả lời.
- Contract hiện tại → bản đề xuất:
  - **Lịch sử (API, `conversationHistory`)**: trước đây lấy 6 tin gần nhất của cùng `author_contact`. Nay chỉ lấy tin của đúng người gửi (`metadata.sender_id`), chỉ những tin đã có AI task, trong 30 phút (nhóm) hoặc 180 phút (chat riêng), tối đa 4 lượt, không lặp.
  - **Câu cụt (AI, `standalone_question`)**: câu ngắn (≤ 6 từ) không tự hỏi gì ("Khu vực Đà Nẵng", "còn Huế thì sao?", "what about Hue") sẽ được đọc thành câu hỏi gần nhất của người đó, thu hẹp lại theo câu cụt ("Khi nào thì nên đi du lịch - Khu vực Đà Nẵng"). Chỉ áp dụng khi bot vừa hỏi lại (reply kết thúc bằng "?") hoặc câu bắt đầu bằng từ thu hẹp như "khu vực", "ở", "còn", "what about". Câu ghép này dùng cho tìm kiếm, soạn trả lời và các bước kiểm tra. Run có cảnh báo `FOLLOW_UP_READ_AS_STANDALONE`.
  - **Tìm kiếm**: so khớp từ khóa có tính cả tên trang ("Hoi An"). "đ" được đổi thành "d" ("Đà Nẵng" khớp "Da Nang"). Thêm khoảng 45 từ đồng nghĩa Việt→Anh theo chủ đề, chỉ mở rộng khi gõ có dấu (ăn, đảo, chợ, bão, lũ, lễ, Tết, lừa đảo, xe, bệnh viện…). Thêm khoảng 30 tên địa danh (Hà Nội→Hanoi, Sài Gòn→Ho Chi Minh City, Cầu Rồng→Dragon Bridge, Ngũ Hành Sơn→Marble Mountains…).
  - **Chunk (`chunking.py`)**: chunk nằm giữa một mục được gắn tên mục ở đầu ("Climate\n\n…"). Chỉ áp dụng cho các lần ingest mới.
  - **Nguồn**: `apps/api/scripts/seed-coverage-sources.ts` thêm 32 trang Wikivoyage/Wikipedia: 13 điểm đến ngoài miền Trung, 3 vùng, ẩm thực, câu tiếng Việt thông dụng, khí hậu, chính sách visa, Trung thu, áo dài, các món và điểm tham quan ở Đà Nẵng/Hội An/Huế. Các trang đi theo luồng thường: ingest → `needs_review` → **chỉ owner duyệt**.
  - **Quota Gemini (`src/app/gemini_quota.py`)**: sổ ghi từng request theo model và ngày Pacific, lưu trong file SQLite của run store.
    - Giới hạn thật của mỗi model học từ lỗi 429 theo ngày (`quotaValue`). Trước khi có 429, giới hạn ước tính là `GEMINI_DAILY_LIMIT` (20), hoặc mức cao nhất từng phục vụ được trong một ngày không phải fallback (đang là 28).
    - Phần giữ cho các agent là ngày bận nhất trong tuần của các thao tác không phải Community, tối thiểu `GEMINI_AGENT_RESERVE` (15).
    - Phần còn lại là phần dư. `community.response` chỉ gọi Gemini khi phần dư > 0; hết thì gọi thẳng Ollama, run có cảnh báo `GEMINI_SPARE_SPENT_AGENTS_SHARE_KEPT`.
    - Model đã đóng trong ngày (429 theo ngày, hoặc 404) bị bỏ qua cho tới nửa đêm Pacific.
    - Xem tình trạng qua `GET /internal/v1/quota/gemini` (cần internal auth).
  - **Groq và OpenRouter (`src/app/free_providers.py`, `src/app/free_quota.py`)**: hai key này đã có trong `.env.local` cho script video (Video3D/tripc-playbook). Nay chúng trả lời câu hỏi Community theo thứ tự: phần dư Gemini → Groq `openai/gpt-oss-120b` → OpenRouter (chỉ model `:free`: gemma-4-31b, gemma-4-26b, nemotron-3.5-super-vl) → Ollama. Các agent khác không dùng hai nguồn này (`FREE_API_OPERATIONS`, mặc định `community.response`).
    - Số lượt còn lại lấy từ chính nhà cung cấp, đã gồm lượt của script video. Groq trả về `x-ratelimit-limit/remaining-requests` sau mỗi câu trả lời (đo ngày 2026-11-12: 1.000 lượt/ngày, 8.000 token/phút). OpenRouter trả về `free_model_daily_requests` qua `GET /api/v1/key`, endpoint này không tốn lượt (50 lượt/ngày, vì key free không có credit).
    - Mỗi ngày giữ lại một phần cho script video: Groq `GROQ_RESERVE` (mặc định bằng `VIDEO_GROQ_DAILY_CAP`, tức 300), OpenRouter `OPENROUTER_RESERVE` (15).
    - Gặp 429 theo phút, hoặc chỉ còn dưới 3.500 token trong phút, thì nguồn đó bị bỏ qua cho tới khi hồi lại. Gặp 429 theo ngày thì đóng nguồn đó tới hết ngày UTC.
    - Câu trả lời không phải JSON hợp lệ thì chuyển sang model kế tiếp. Prompt dài hơn `GROQ_MAX_INPUT_TOKENS` (5.000) thì bỏ qua Groq.
    - Khi Groq/OpenRouter trả lời, run không gắn cảnh báo `QUALITY_MODEL_UNAVAILABLE_LOCAL_MODEL_USED`; cảnh báo này chỉ dành cho lúc Ollama viết. `model_version` ghi đúng model đã trả lời.
    - Đo ngày 2026-11-12: Gemini dư 9, Groq dư 699, OpenRouter dư 33, tổng khoảng 741 câu trả lời cloud/ngày cho bot. Thử thật với prompt Community: Groq mất khoảng 1 giây, OpenRouter 7–10 giây, cả hai trả lời đúng tiếng Việt và theo đoạn trích.
- Endpoint/schema/error/state/authorization/metric bị đổi: thêm `GET /internal/v1/quota/gemini` và `GET /internal/v1/quota` (gồm Gemini, Groq, OpenRouter, thứ tự thử, và số câu trả lời cloud còn lại hôm nay). Thêm các bảng SQLite trong run store: `gemini_calls`, `gemini_model_days`, `gemini_limits`, `free_api_calls`, `free_api_state`. Thêm biến môi trường `GEMINI_DAILY_LIMIT`, `GEMINI_DAILY_LIMITS` (dạng `model=n,…`), `GEMINI_AGENT_RESERVE`, `GEMINI_SPARE_OPERATIONS`, `FREE_API_OPERATIONS`, `GROQ_COMMUNITY_MODEL`, `GROQ_DAILY_LIMIT`, `GROQ_RESERVE`, `GROQ_MAX_INPUT_TOKENS`, `OPENROUTER_COMMUNITY_MODELS`, `OPENROUTER_DAILY_LIMIT`, `OPENROUTER_RESERVE`. Schema `CommunityReply` và payload giữ nguyên.
- Breaking hay additive: thay đổi hành vi, additive về schema.
- Examples trước/sau và validation:
  - Test: `tests/test_community_fragment_follow_up.py`, `tests/test_gemini_quota.py`, `tests/test_free_api_providers.py`, `tests/test_chunking_sections.py`, `apps/api/tests/community/conversationHistory.test.ts`.
  - Eval truy xuất trên kho thật (61 nguồn đã duyệt, 1.637 chunk), có so với code trước thay đổi:
    - v1 51/51 → 51/51. Regex gold câu "từ sân bay Đà Nẵng…" được nới, vì đoạn đúng (taxi/Grab ở cửa ga) có chữ "Taxis" cách "airport" quá 200 ký tự.
    - v2 mới (63 câu, ma trận điểm đến × chủ đề, `evals/datasets/community_retrieval_v2.json`): 58/63 → 62/63. Hai câu cụt kiểu Telegram chuyển từ trượt sang đúng. Câu còn trượt là "Phú Quốc mùa khô": kho chỉ có 1 đoạn về Phú Quốc, các nguồn mới sẽ bù khi được duyệt.
- FE/BE/AI/QA cần đổi gì: AI + API. Worker không đổi.
- Kế hoạch: container `ai` và `api` được build lại ngày 2026-11-12, `tunnel` được tạo lại. `ai` được build lại thêm một lần sau khi gắn Groq/OpenRouter.
- Compatibility, migration và rollback: không có migration Postgres. Rollback = revert các file trên và build lại `ai`/`api`. Muốn bỏ giới hạn phần dư thì đặt `GEMINI_SPARE_OPERATIONS=none`. Muốn tắt Groq/OpenRouter cho bot thì đặt `FREE_API_OPERATIONS=none`. 61 nguồn đã duyệt chưa được chia chunk lại: ingest lại sẽ đưa nguồn về `needs_review` và bot mất nguồn đó cho tới khi owner duyệt lại.
- Evidence/checks/decision: AI suite 1.192 pass (2 test đỏ có từ trước: `test_a_reply_guessing_beyond_the_quotes_goes_to_a_person`, `test_blocked_release_has_no_git_tag`).
