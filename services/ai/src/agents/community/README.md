# Community & Lead Intake Agent

**Owner:** Quang Quang (Lead) | **Core Engineer:** Thiệu Quang | **Task:** QQ-06 / TQ Community Upgrade (Sprint 3)

**Trạng thái:** **HOÀN THÀNH (Production-Grade)**
- Đã chạy kiểm chứng trên dữ liệu tri thức thật của TripC Đà Nẵng (`qa/evidence/community-real-2026-10-27/`).
- Đã tích hợp đầy đủ vào vòng lặp Autopilot (`tickAutomation`, `autoApproveOutputs`).
- Đã thiết lập Hộp thư đa kênh (Inbox API) và cơ chế tự động ghi nhận Khách hàng tiềm năng (`leads` table).

---

## 1. Kiến trúc & luồng xử lý (End-to-End Pipeline)

```
[Bình luận / Chat] (Facebook, Instagram, Web Chat)
         │
         ▼
[POST /v1/workspaces/:id/community/messages] (Inbox API)
         │
         ▼
[community_messages (PostgreSQL)] ──(Status: received)──┐
                                                         │
                                        (Autopilot / Auto-Enqueue)
                                                         │
                                                         ▼
[AI Service: community.response (v2)] ◄─── [Approved TripC Knowledge]
   - Tokenizer Unicode tiếng Việt
   - Trích xuất Intent & SĐT / Email
   - RAG Grounding & Chặn Hallucination
         │
         ▼
[Content Artifact (draft reply + citations + lead_proposal)]
         │
         ▼
[Phê duyệt: Auto-Approve / Human Approval Gate]
         │
         ├──────────────────────────────────────────┐
         ▼                                          ▼
[Cập nhật community_messages]               [Ghi nhận Lead]
   status: 'replied'                           table: leads
   task_id: <uuid>                             utm_source: 'community'
                                               lead_status: 'New'
```

---

## 2. Các thành phần đã triển khai

### A. Cơ sở dữ liệu & Migration 015
- **File:** `database/migrations/015_community_inbox.sql`
- **Bảng:** `community_messages`
  - Quản lý tin nhắn đến từ đa nền tảng: `facebook_comment`, `instagram_dm`, `messenger`, `website_contact`, `chat_widget`.
  - Liên kết chặt chẽ với `workflow_tasks.id` (`task_id`) và `leads.lead_id` (`lead_id`).

### B. REST API Hộp thư (Backend Core)
- `POST /v1/workspaces/:id/community/messages`: Tiếp nhận tin nhắn/bình luận mới và tự động đưa vào hàng đợi AI nếu bật `auto_enqueue`.
- `GET /v1/workspaces/:id/community/messages`: Tra cứu danh sách tin nhắn, lọc theo trạng thái (`received`, `queued`, `replied`, `escalated`, `ignored`) và nền tảng.
- `GET /v1/workspaces/:id/community/messages/:message_id`: Xem chi tiết tin nhắn cùng liên kết task và lead.
- `PATCH /v1/workspaces/:id/community/messages/:message_id`: Cập nhật trạng thái thủ công hoặc gắn lead.

### C. Nâng cấp AI Prompt & Pipeline (`community-v2`)
- **System Prompt:** `services/ai/prompts/community-v2.md` hỗ trợ song ngữ (Anh / Việt) với nguyên tắc grounding chống bịa đặt thông tin nhạy cảm (giá thuê, địa chỉ riêng tư).
- **Pipeline:** `services/ai/src/agents/community/pipeline.py`
  - Tokenizer từ vựng Unicode tiếng Việt (`[\w\u00C0-\u1EF9]+`) thay thế tokenizer ASCII cũ.
  - Từ khóa nhận diện nhu cầu tư vấn (`_INTENT_WORDS`) song ngữ: "thuê", "căn hộ", "tư vấn", "inbox", "rent", "housing", "interested"...
  - Bộ bóc tách thông tin liên hệ tự động: số điện thoại Việt Nam (`+84` / `09x, 08x, 07x, 05x, 03x`) và email.

### D. Tự động lưu Lead (`leads` table)
- **Module:** `apps/api/src/modules/community/leads.ts` (`persistCommunityLead`)
- Tự động ghi nhận lead vào bảng `leads` với `utm_source: 'community'`, `lead_status: 'New'`, và `idempotency_key` chống trùng lặp.
- Tự động đánh dấu tin nhắn trong hộp thư sang `status: 'replied'` và liên kết `lead_id`.
- Được gọi tự động trong cả 2 trường hợp:
  1. Phê duyệt thủ công qua `approvals/repository.ts`.
  2. Phê duyệt tự động qua Autopilot (`autoApproveOutputs`).

### E. Vòng lặp Autopilot (`automation.ts`)
- `tickAutomation` tự động quét các tin nhắn `community_messages` ở trạng thái `received` chưa có task và kích hoạt AI sinh phản hồi.
- `autoApproveOutputs` tự động hoàn thành task và lưu lead cho các phản hồi đạt chuẩn grounding.

---

## 3. Bằng chứng kiểm thử & Nghiệm thu (QA Evidence)

- **Unit & Integration Tests API:** `apps/api/tests/community/inboxAndLead.test.ts` (7/7 tests passed, 207/207 toàn API suite passed).
- **Unit & Regression Tests AI:** `services/ai/tests/test_community_v2.py` (3/3 tests passed, 224/224 toàn AI suite passed).
- **Evidence thực nghiệm:**
  - `qa/evidence/community-real-2026-10-27/community-pipeline.json`
  - `qa/evidence/community-real-2026-10-27/community-summary.md`
