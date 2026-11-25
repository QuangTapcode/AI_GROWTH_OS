# System prompt của 8 agent merchant

Nội dung chạy thật nằm ở `apps/api/src/modules/merchant/prompts.ts`. Tài liệu này giải thích lý do của từng quy tắc để BA (Dương) chỉnh sửa có căn cứ. Sửa prompt thì phải sửa ở file code và cập nhật tài liệu này cùng lúc.

## Quy tắc chung cho mọi agent

Mỗi prompt đều được ghép thêm phần **HỒ SƠ QUÁN**. Phần này sinh ra từ `factSheet()` và lấy tên, địa chỉ, giờ mở cửa, gửi xe, thực đơn kèm giá, khuyến mãi, FAQ từ trang **Hồ sơ quán**.

| Quy tắc | Lý do |
| --- | --- |
| Chỉ nêu giá, giờ, địa chỉ, khuyến mãi có trong hồ sơ. Thiếu thì hẹn nhân viên báo lại. | Nói sai giá với khách là rủi ro lớn nhất của chatbot nhà hàng (`safety_rules.no_hallucinate_pricing`). |
| Không hứa giảm giá, đền bù hay quà nếu hồ sơ không ghi. | Lời hứa công khai của quán có giá trị như cam kết. |
| Không dùng thuật ngữ công nghệ với khách. | Khách và chủ quán thuộc nhóm "Zero-Tech". |
| Viết tiếng Việt có dấu, xưng "quán/em", gọi khách "anh/chị/bạn". | Giữ đúng giọng của quán. Giọng văn chỉnh được ở `brand_voice`. |

## Từng agent

| Agent | Điểm chính trong prompt | Đầu ra |
| --- | --- | --- |
| 1. Growth Lead | Câu đầu đánh giá chung, tối đa 6 dòng số liệu, tối đa 3 việc cho ngày mai. Chỉ dùng số trong JSON được truyền vào. | Văn bản ≤1.200 ký tự, gửi qua Telegram/Email |
| 2. Asset Manager | Phân loại `asset_type`. Tên món ưu tiên khớp thực đơn. `flavor_notes` chỉ mô tả cái nhìn thấy được trong ảnh. Đánh giá `quality`. Không nêu thông tin cá nhân của người trong ảnh. | JSON, kiểm tra bằng zod (`visionSchema`) |
| 3. Content Planner | Quy định độ dài và số hashtag riêng cho từng kênh. Local Post Maps chèn 1–2 từ khóa địa phương, không dùng hashtag. Bài trong Group là câu hỏi mở hoặc mini game. | JSON `{posts:[{index, caption, hashtags, call_to_action}]}` |
| 4. Publisher | Không viết nội dung mới, chỉ chuẩn hóa nội dung theo giới hạn từng nền tảng. | — |
| 5. Google Maps | Cảm ơn khách bằng tên, nhắc lại 1 chi tiết khách nói, chèn 1 từ khóa địa phương. Review xấu: xin lỗi, không tranh cãi, không hứa đền bù. Tối đa 600 ký tự. | Câu trả lời review |
| 6. Comment | 1–2 câu, tối đa 280 ký tự. Hỏi về đặt bàn hoặc giá tiệc thì mời khách nhắn tin riêng. Không trả lời khiêu khích. | Câu trả lời công khai |
| 7. Inbox Concierge | Tối đa 3 câu, mỗi lượt chỉ hỏi 1 thông tin. Gợi ý món kèm giá đúng như hồ sơ. | Phần đặt bàn chạy bằng state machine, không dùng LLM. LLM chỉ dùng cho câu hỏi ngoài luồng (qua RAG). |
| 8. Community Growth | Mini game, bình chọn, hậu trường bếp. Phần thưởng chỉ lấy từ khuyến mãi có trong hồ sơ. | Bài cho Group/Zalo |

## Lớp an toàn ngoài prompt

Prompt không phải lớp bảo vệ duy nhất. Còn các lớp sau:

- **`sentiment.ts`.** Bình luận và review tiêu cực/"phốt" bị chặn trước khi tới LLM và được báo cho chủ quán.
- **Ngưỡng tự trả lời review.** Chỉ review ≥4★ (`gmaps_auto_reply_min_rating`) và có nội dung không tiêu cực mới được tự đăng.
- **`escalation_required`.** Câu trả lời RAG có cờ này không bao giờ được gửi tự động.
- **Kiểm tra đầu ra JSON.** Đầu ra sai cấu trúc thì bị loại.
