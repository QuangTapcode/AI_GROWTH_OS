# HELD-OUT TEST SET (20 MẪU KIỂM THỬ ĐỘC LẬP)

> [!WARNING]
> **CHẾ ĐỘ CHỈ-ĐỌC CHO AI (READ-ONLY FOR AI) — CẤM TUYỆT ĐỐI KHI TUNE / FEW-SHOT**
> 
> Thư mục này chứa **20 mẫu kiểm thử độc lập (Held-out Test Set)** của TripC Da Nang (`gs_test_001` đến `gs_test_020`).

---

## 1. QUY TẮC BẤT BIẾN CHỐNG RÒ RỈ DỮ LIỆU (ZERO DATA LEAKAGE)

Theo chuẩn Kỹ thuật Đánh giá ML (Mục 8.2 & 8.4 trong *Kế hoạch Agent Content Marketing v2.0*):

1. **CẤM DÙNG KHI TUNE:** Mọi trợ lý AI (AI Assistant), Agent hoặc kỹ sư prompt **TUYỆT ĐỐI KHÔNG ĐƯỢC**:
   - Sử dụng bất kỳ mẫu nào trong thư mục này làm ví dụ mẫu (Few-shot Exemplar) trong system prompt.
   - Nạp vào cơ sở dữ liệu Vector (pgvector/RAG) để sinh nội dung.
   - Phân tích lỗi trên tập này để tinh chỉnh Prompt (Prompt Tuning) hoặc sửa rules.
2. **PHẠM VI ĐƯỢC PHÉP DUY NHẤT:**
   - Dữ liệu này được giữ bí mật độc lập đối với quá trình phát triển.
   - **CHỈ ĐƯỢC CHẠY TỰ ĐỘNG** tại **Cổng Đêm (Nightly Gate)** và **Cổng Chốt Phiên bản (Release Gate CM-24)** để đánh giá độ tổng quát hóa khách quan trên dữ liệu chưa từng thấy (Unseen Evaluation).
3. **MỌI HOẠT ĐỘNG PHÁT TRIỂN & TINH CHỈNH:**
   - Bắt buộc chỉ được sử dụng các mẫu trong thư mục đối ứng: `data/golden/dev/` (30 mẫu Dev Set).

---

## 2. QUYỀN SỞ HỮU & CHỈNH SỬA
- **Chủ sở hữu dữ liệu:** Chuyên viên nội dung (Content Specialist) và Content Lead.
- **Chế độ truy cập:** Read-Only đối với AI Generator / Evaluation Loop trong pha phát triển.
