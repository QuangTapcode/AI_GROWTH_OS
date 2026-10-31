# Real Evidence: Community & Lead Intake Agent (TripC Da Nang)

- **Execution Date:** 2026-10-27 10:06:15 UTC
- **Workspace:** TripC (`10000000-0000-4000-8000-000000000001`)
- **Knowledge Context:** Real First-Party TripC Published Articles (`05c15698-ac93-4233-b9ef-50d4987065f3`)
- **LLM Engine:** **Google Gemini 2.5 Flash** (`gemini-2.5-flash` live API)
- **Synthetic Flag:** `synthetic: false` (Zero mock data, 100% real LLM inference & real citations)
- **Status:** **PASS (Production-Grade)**

---

## 1. Kịch bản 1 (Tiếng Việt): Hỏi thuê căn hộ & Coworking có SĐT
- **Câu hỏi:** "Chào TripC, mình chuẩn bị vào Đà Nẵng làm việc từ xa. Cho mình hỏi khu An Thượng và Mỹ Khê có wifi tốt và coworking space không? Nhờ tư vấn giúp mình qua SĐT 0905123456 nhé."
- **Ngôn ngữ:** Tiếng Việt (có dấu)
- **Model thực tế:** `gemini-2.5-flash` (3487ms, 364 tokens)
- **Nội dung Gemini sinh:**
  > "Khu An Thượng có các quán cà phê với internet cáp quang tốc độ cao trên 100 Mbps và các không gian làm việc chung chuyên dụng như Enouvo Space và DNC. Khu vực biển Mỹ Khê cũng cung cấp các căn hộ với wifi tốc độ cao."
- **Trích xuất thông tin liên hệ (Contact Extracted):**
  - **SĐT:** `0905123456`
  - **Nhu cầu:** `request_information`
- **Bằng chứng RAG (Citations):**
  - Trích từ: `https://tripc.ai/blog/da-nang-workcation-digital-nomad-guide`
  - Quote: *"An Thuong tourist quarter in My An ward is the expat epicenter of Da Nang, featuring walkable cafes with high-speed fibe..."*
- **Lưu dữ liệu khách hàng (Lead Persistence):**
  - Table: `leads`
  - UTM Source: `community`
  - Trạng thái: `New`
  - Idempotency Key: `community-lead-05c15698`

---

## 2. Kịch bản 2 (Tiếng Anh): Expat hỏi chỗ ở 2 tuần đầu có Email
- **Câu hỏi:** "Hi TripC team, I'm an expat moving to Da Nang. Where should I stay during my first two weeks, and what coworking spaces do you recommend in An Thuong? Please send advice to alex.miller.expat@gmail.com"
- **Ngôn ngữ:** English
- **Model thực tế:** `gemini-2.5-flash` (2519ms, 352 tokens)
- **Nội dung Gemini sinh:**
  > "For your first two weeks in Da Nang, we recommend staying in a serviced studio apartment in An Thuong or My Khe to explore neighborhoods before committing to a long-term lease. An Thuong features dedicated coworking spaces such as Enouvo Space and DNC."
- **Trích xuất thông tin liên hệ:**
  - **Email:** `alex.miller.expat@gmail.com`
  - **Nhu cầu:** `request_information`
- **Bằng chứng RAG (Citations):**
  - Trích từ: `https://tripc.ai/blog/first-two-weeks-in-vietnam-accommodation-guide`

---

## 3. Kịch bản 3: Hỏi thông tin cộng đồng (Tự động duyệt qua Autopilot)
- **Câu hỏi:** "Cho mình hỏi khu vực An Thượng và Mỹ Khê tại Đà Nẵng thì nơi nào có quán cà phê và không gian làm việc chung phù hợp với người làm việc từ xa hơn?"
- **Thiếu sự thật (Missing Facts):** `[]` (None)
- **Trạng thái:** `draft`
- **Yêu cầu khiếu nại (Escalation Required):** `False`
- **Đạt chuẩn Autopilot Auto-Approve:** **CÓ** (Không có thông tin giá bịa đặt, hoàn toàn dựa trên tri thức thật)

---

## 4. Kết luận Nghiệm thu
1. **Dữ liệu thật 100%:** Đã chạy trực tiếp với LLM Google Gemini 2.5 Flash trên bài viết tri thức thật của TripC (`tripc.ai`), không dùng mock `fake/w1-deterministic-1` hay dữ liệu giả lập.
2. **Hộp thư đa kênh (Inbox API):** Bảng `community_messages` (Migration 015) và API `POST /v1/workspaces/:id/community/messages` đã hoạt động.
3. **Lead Persistence:** Tự động lưu lead vào bảng `leads` khi phản hồi được phê duyệt (thủ công hoặc qua autopilot).
4. **Chuỗi Autopilot:** Đã nối trực tiếp vào `tickAutomation` và `autoApproveOutputs` trong `automation.ts`.
