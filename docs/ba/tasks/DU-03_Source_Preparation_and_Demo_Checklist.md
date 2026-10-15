### TÀI LIỆU CHUẨN BỊ NGUỒN \& CHECKLIST DEMO NỀN TẢNG — DU-03

#### Dự án: AI Growth OS (Pilot: TripC — Đà Nẵng)





\## 1. DANH SÁCH NGUỒN VÀ HÌNH ẢNH ĐƯỢC PHÉP DÙNG (APPROVED SOURCES \& ASSETS)



Để tuân thủ tuyệt đối nguyên tắc \*\*Không tự coi web research là approved business fact\*\*, toàn bộ thông tin đưa vào hệ thống RAG và các bài viết demo phải qua quy trình kiểm chứng nguồn gốc (`Verified`).



\### 1.1. Danh sách Nguồn Tri thức Được Phép Dùng (Verified Sources)

\* \*\*`SRC-01` (Brand \& Core Offer Profile):\*\* Tài liệu nội bộ công ty TripC về danh mục dịch vụ tư vấn lưu trú, cẩm nang sinh sống tại Đà Nẵng (Trạng thái: `Verified`).

\* \*\*`SRC-02` (Official Pricing \& Policy):\*\* Bảng giá dịch vụ và chính sách hỗ trợ khách hàng expat/digital nomad chính thức của TripC (Trạng thái: `Verified`).

\* \*\*`SRC-03` (Local Partner FAQs):\*\* Bộ câu hỏi thường gặp về thủ tục thuê nhà, đăng ký tạm trú tại các quận Hải Châu, Sơn Trà, Ngũ Hành Sơn, Đà Nẵng (Trạng thái: `Verified`).



\### 1.2. Danh sách Tài nguyên Hình ảnh Được Phép Dùng (Approved Visual Assets)

\* \*\*`IMG-01` (`/assets/tripc-danang-coworking.jpg`):\*\* Ảnh chụp thực tế không gian làm việc chung tại quận Hải Châu, Đà Nẵng (Đã có bản quyền / quyền sử dụng thương mại).

\* \*\*`IMG-02` (`/assets/tripc-expat-housing-guide.jpg`):\*\* Infographic tổng hợp các khu vực căn hộ dịch vụ phổ biến cho người nước ngoài tại Mỹ Khê, Đà Nẵng.

\* \*\*`IMG-03` (`/assets/tripc-brand-logo-kit.png`):\*\* Bộ nhận diện thương hiệu logo chính thức của TripC.



\---



\## 2. DANH MỤC FACTS ĐÃ XÁC NHẬN VÀ THÔNG TIN CÒN THIẾU



\### 2.1. Facts Đã Xác Nhận (`Verified Facts`)

\* \*\*Thị trường mục tiêu:\*\* Người nước ngoài sinh sống và làm việc (Expats) và Digital Nomads tại Đà Nẵng.

\* \*\*Core Offer chính:\*\* Cẩm nang định cư/sinh sống miễn phí kết hợp dịch vụ tư vấn tìm kiếm chỗ ở trọn gói tại Đà Nẵng.

\* \*\*CTA chính (Top-of-funnel):\*\* "Tải Cẩm nang sinh sống tại Đà Nẵng miễn phí".

\* \*\*Khu vực tập trung:\*\* Các quận trung tâm và ven biển Đà Nẵng (Hải Châu, Sơn Trà, Ngũ Hành Sơn).



\### 2.2. Thông Tin Còn Thiếu / Cần Bổ Sung (`Missing Information`)

\* \*\*Chính sách hoa hồng đối với các đối tác căn hộ (B2B Partners):\*\* Chưa có số liệu chính thức để tích hợp vào RAG tài chính.

\* \*\*Lịch trình tour trải nghiệm mẫu:\*\* Đang chờ đội ngũ vận hành thực tế cung cấp tài liệu chi tiết.

\* \*\*Kết nối API trực tiếp với Meta Ads / Google Ads:\*\* Đang ở trạng thái `planned`, chưa cấu hình live (phải gán nhãn `insufficient\_data` nếu hiển thị chỉ số quảng cáo).



\---



\## 3. ACCEPTANCE CRITERIA (AC) CHO TENANT, AUTH, INGEST \& ROLE HANDOFF



\### 3.1. Tenant Isolation \& Auth AC

\* \*\*AC-01 (Cô lập dữ liệu):\*\* Mọi câu truy vấn dữ liệu từ Workspace của TripC tuyệt đối không được rò rỉ sang workspace khác. Hệ thống phải bắt buộc lọc theo `workspace\_id`.

\* \*\*AC-02 (Xác thực người dùng \& RBAC):\*\* Người dùng đăng nhập qua email phải được kiểm tra bảng `memberships`. Vai trò `owner` hoặc `content\_manager` mới có quyền phê duyệt bài viết (`Approved`).



\### 3.2. Knowledge Ingestion AC

\* \*\*AC-03 (Chống ảo giác RAG):\*\* Khi AI tạo nội dung hoặc trả lời câu hỏi, mọi thông tin trích xuất từ bảng `source\_chunks` bắt buộc phải kèm theo `provenance\_tag` (ví dụ: `\[SRC-01]`). Nếu không tìm thấy nguồn `Verified`, hệ thống phải từ chối trả lời hoặc hạ điểm chất lượng (`Quality Score`).

\* \*\*AC-04 (Web Research Boundary):\*\* Dữ liệu thu thập từ web research bên ngoài chỉ được đưa vào bảng `growth\_opportunities` dưới dạng thô (`Trend` / `Search\_Opportunity`), \*\*tuyệt đối không được tự động coi là approved business fact\*\* cho đến khi được con người kiểm duyệt và chuyển trạng thái thành `Verified`.



\### 3.3. Role Handoff AC

\* \*\*AC-05 (Level 2 Human-in-the-Loop):\*\* Khi Agent (Content Marketing Agent) hoàn thành việc tạo bài viết, trạng thái bài viết ở bảng `contents` phải ở mức `In Review`. Nhân sự có quyền (`owner`/`editor`) phải thực hiện thao tác duyệt thủ công để chuyển sang `Approved` trước khi đưa sang hàng đợi xuất bản (`publishing\_jobs`).

\* \*\*AC-06 (Sales Lead Handoff):\*\* Khi khách hàng điền form nhận cẩm nang, dữ liệu được ghi nhận vào bảng `leads` thông qua cơ chế `idempotency\_key` (trả về HTTP 409 nếu trùng lặp) và tự động gán cho nhân sự Sales phụ trách (`lead\_owner`) theo quy tắc phân phối.



\---



\## 4. CHECKLIST DEMO NỀN TẢNG (DEMO READINESS CHECKLIST)



| STT | Hạng mục kiểm tra (Checklist Item) | Trạng thái | Ghi chú / Chủ trì |

| :---: | :--- | :---: | :--- |

| 1 | Khởi tạo thành công 17 bảng trong cơ sở dữ liệu PostgreSQL | Hoàn thành | Backend Team |

| 2 | Bật extension `vector` (768 chiều) cho `pgvector` | Hoàn thành | DevOps / DB Admin |

| 3 | Nạp sẵn bộ nguồn `SRC-01`, `SRC-02`, `SRC-03` vào bảng `sources` | Hoàn thành | Business Analyst |

| 4 | Kiểm tra quy tắc `insufficient\_data` khi chưa kết nối GA4/GSC | Đã cấu hình | Frontend / Analytics |

| 5 | Kiểm thử cơ chế `idempotency\_key` chống trùng lặp lead (HTTP 409) | Đã test | QA Engineer |

| 6 | Xác thực quy trình phê duyệt Level 2 (In Review -> Approved) | Đã sẵn sàng | Product Manager |

