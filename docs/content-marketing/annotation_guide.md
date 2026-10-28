# HƯỚNG DẪN GÁN NHÃN SỰ THẬT & TIÊU CHUẨN DUYỆT BÀI (ANNOTATION GUIDELINE)
## Agent số 4: Content Marketing — AI Growth OS (v2.0)

> **Tài liệu chuẩn hóa:** `CM-19` | **Phiên bản:** 2.0 (Chính thức)  
> **Đối tượng áp dụng:** Chuyên viên nội dung (Content Specialist / Annotator), Content Lead, AI/ML Evaluation Engineer  
> **Phạm vi dữ liệu:** 50 mẫu Seed Golden Set của TripC Da Nang (30 mẫu Dev Set + 20 mẫu Held-out Test Set)

---

## 1. MỤC ĐÍCH VÀ NGUYÊN TẮC CỐT LÕI

Tài liệu này cung cấp quy chuẩn gán nhãn dữ liệu chuẩn mực (Ground Truth Data) để xây dựng **Golden Set** và thiết lập thước đo đánh giá chất lượng tự động cho **Agent Content Marketing**. 

### 3 Nguyên tắc Bất biến (Core Principles):
1. **Sự thật đóng băng (Grounded Facts Only):** Mọi thông tin mang tính khẳng định thực tế phải bắt nguồn trực tiếp từ bài viết SEO gốc. Tuyệt đối không bổ sung kiến thức bên ngoài, không suy đoán và không bịa đặt số liệu/giá cả.
2. **Luật Zero-Claim cho câu phi sự thật:** Câu mở đầu (Hook) và Kêu gọi hành động (CTA) không được chứa số liệu, giá tiền, phần trăm, cam kết ưu đãi hoặc tính từ tuyệt đối nếu không được fact hậu thuẫn.
3. **Phân lập Đa tầng Dữ liệu:** Không được làm rò rỉ dữ liệu (Data Leakage) giữa tập phát triển (Dev Set) và tập kiểm thử độc lập (Held-out Test Set).

---

## 2. QUY ĐỊNH PHÂN LOẠI CÂU (`sentence_type`)

Mỗi câu trong bài đăng mạng xã hội (Facebook Caption) hoặc kịch bản video ngắn (TikTok Script) phải được phân loại chính xác vào 1 trong 3 nhóm sau:

```
+-----------------------------------------------------------------------------------------+
|                                    PHÂN LOẠI CÂU                                        |
+---------------------------+-----------------------------+-------------------------------+
|      factual (Sự thật)    |       hook (Dẫn nhập)       |      cta (Kêu gọi hành động)  |
+---------------------------+-----------------------------+-------------------------------+
| • Chứa khẳng định thực tế | • 3 giây đầu TikTok / mở đầu| • Câu cuối bài hướng dẫn      |
| • Bắt buộc Fact ID hợp lệ | • Khơi gợi nhu cầu, vấn đề  |   hành động cụ thể            |
| • Kiểm tra NLI Entailment | • Gán fact_id: "NONE"       | • Gán fact_id: "SYSTEM_CTA"   |
| • supported/partial/unsupp| • Tuân thủ luật Zero-Claim  | • Lấy nguyên văn từ yêu cầu   |
+---------------------------+-----------------------------+-------------------------------+
```

### 2.1. Câu sự thật (`factual`)
- **Định nghĩa:** Câu chứa bất kỳ phát biểu nào về thuộc tính, giá thuê, chi phí, địa điểm, khoảng cách, thông số kỹ thuật, tiện nghi, trang thiết bị, chính sách dịch vụ hoặc thời gian hoạt động.
- **Ràng buộc:**
  - Bắt buộc phải gắn với ít nhất một `fact_id` hợp lệ có trong `extracted_facts` của bài viết gốc (ví dụ: `["f01"]`, `["f01", "f02"]`).
  - Phải kiểm tra trạng thái suy diễn logic (**Entailment Status**):
    - `supported`: Nội dung câu được fact bảo chứng hoàn toàn, các con số/tên riêng khớp chính xác.
    - `partial`: Nội dung câu đúng một phần nhưng tự ý thêm tính từ phóng đại, mở rộng phạm vi hoặc thêm hệ quả chưa kiểm chứng. *(Phải sửa lại thành supported)*.
    - `unsupported`: Nội dung câu hoàn toàn không có trong facts hoặc mâu thuẫn với facts. *(Phải loại bỏ)*.

### 2.2. Câu dẫn nhập / Hook (`hook`)
- **Định nghĩa:** Câu mở đầu bài viết (Facebook) hoặc lời thoại trong 3 giây đầu tiên của video (TikTok) nhằm thu hút sự chú ý của người xem.
- **Ràng buộc:**
  - Gán `fact_id = "NONE"`.
  - **Luật Zero-Claim Rule:** Tuyệt đối KHÔNG chứa số liệu (ví dụ: `8.500.000`, `300 Mbps`, `200m`), không chứa tỷ lệ `%`, không chứa giá tiền (dưới mọi biến thể `8tr`, `50k`, `$200`), không chứa tên riêng ngoài thực thể chính của bài, và không chứa từ ngữ tuyệt đối (`100%`, `luôn luôn`, `tốt nhất`).

### 2.3. Câu kêu gọi hành động (`cta`)
- **Định nghĩa:** Câu kết thúc bài đăng hoặc lời thoại cảnh kết kịch bản hướng dẫn người dùng thực hiện chuyển đổi (đặt phòng, nhắn tin, tải app, xem website).
- **Ràng buộc:**
  - Gán `fact_id = "SYSTEM_CTA"`.
  - Phải giữ **nguyên văn từng chữ (verbatim)** từ yêu cầu đầu vào hoặc Brand Profile (ví dụ: *"Liên hệ Fanpage để đặt lịch xem phòng thực tế."*).
  - Nghiêm cấm tự ý chèn thêm các ưu đãi ngầm như *"để nhận voucher 100k"*, *"miễn phí ngay hôm nay"*.

---

## 3. BẢNG PHÂN LOẠI 8 LOẠI LỖI (ERROR TAXONOMY)

Khi gán nhãn và rà soát bản nháp, chuyên viên nội dung ghi nhận lỗi vào trường `violations_found` theo mã chuẩn sau:

| Mã lỗi | Tên loại lỗi | Mô tả chi tiết & Dấu hiệu nhận biết | Ví dụ vi phạm |
| :--- | :--- | :--- | :--- |
| `ERR_01` | **Bịa số / giá tiền** (`UNSUPPORTED_PRICE_OR_NUMBER`) | Xuất hiện số lượng, diện tích, khoảng cách, tỷ lệ %, ngày tháng hoặc giá tiền không hề có trong `extracted_facts`. | Fact không có giá nhưng bài viết ghi: *"Giá thuê chỉ 7.990.000đ/tháng"*, hoặc biến thể *"chỉ 8 củ"*, *"giảm 20%"*. |
| `ERR_02` | **Suy diễn / Mở rộng vô căn cứ** (`UNSUPPORTED_INFERENCE`) | Tự suy diễn kết quả, công dụng hoặc bảo chứng chưa được bài SEO khẳng định. | Fact: *"Có bàn làm việc"*; Bài viết: *"Giúp bạn tăng 200% năng suất làm việc cả ngày không mỏi mệt"*. |
| `ERR_03` | **Thêm tính từ mức độ / Tuyệt đối** (`SUPERLATIVE_OR_EXAGGERATION`) | Tự thêm các từ ngữ phóng đại, so sánh nhất hoặc khẳng định tuyệt đối vi phạm Zero-Claim. | *"Hiện đại bậc nhất Đà Nẵng"*, *"Căn hộ hoàn hảo 100%"*, *"Dịch vụ rẻ nhất thị trường"*, *"Luôn luôn thông suốt"*. |
| `ERR_04` | **Lệch giọng thương hiệu** (`BRAND_VOICE_MISMATCH`) | Dùng từ ngữ cợt nhả, văn phong giật gân rẻ tiền, hoặc quá nặng nề hành chính, không đúng định vị TripC (hiện đại, tinh tế, năng động). | *"Bà con cô bác ơi vào chốt đơn ngay kẻo lỡ"*, hoặc *"Căn cứ theo công văn chỉ thị lưu trú..."*. |
| `ERR_05` | **Sai độ dài / Cấu trúc kênh** (`CHANNEL_STRUCTURE_VIOLATION`) | Kịch bản TikTok không nằm trong khoảng **120 – 180 từ**; bài Facebook thiếu 1 trong 3 phần (Hook, Body bullet points, CTA). | Kịch bản TikTok đọc thoại chỉ có 85 từ (quá ngắn) hoặc 220 từ (quá dài, trôi thời lượng 60s). |
| `ERR_06` | **CTA sai nguyên văn / Ưu đãi ngầm** (`CTA_VIOLATION`) | Tự ý sửa đổi câu CTA gốc hoặc gài bẫy khuyến mãi/quà tặng không có trong bài viết. | Yêu cầu: *"Tải app TripC"*; Bài viết: *"Tải app TripC ngay để nhận ngay quà tặng 500k miễn phí"*. |
| `ERR_07` | **Vi phạm chính sách ảnh kép** (`DUAL_ASSET_VIOLATION`) | Dùng ảnh AI để mô tả phòng/căn hộ thật; ảnh AI có chữ/giá/logo/mặt thật; hoặc thiếu ảnh thật mà không báo `needs_assets`. | Bài giới thiệu Studio TripC Da Nang cụ thể nhưng lại đính kèm ảnh vẽ AI giả lập phòng ngủ. |
| `ERR_08` | **Hashtag vi phạm Zero-Claim** (`HASHTAG_ZERO_CLAIM_VIOLATION`) | Số lượng hashtag ngoài khoảng 3–5; hashtag chứa chữ số, giá tiền, hoặc từ ngữ ưu đãi/cam kết. | `#TripC_Giam50k`, `#PhongGiaReNhat`, `#Free1Dem`, `#UuDai100PhanTram`. |

---

## 4. BẢNG VÍ DỤ MINH HỌA CHI TIẾT (ĐẠT VS. KHÔNG ĐẠT)

### 4.1. Câu Dẫn nhập (Hook)
*Ngữ cảnh: Bài viết về Căn hộ Studio TripC Da Nang gần biển Mỹ Khê. Facts gồm: `f01` (giá 8.5tr/tháng), `f02` (cách biển Mỹ Khê 200m), `f03` (phủ sóng mạng 5G).*

| Trường hợp | Nội dung câu Hook | Phân loại | Đánh giá | Lý do & Cách khắc phục |
| :--- | :--- | :---: | :---: | :--- |
| **Không đạt** | *"Bạn đang tìm kiếm căn hộ chỉ 8.500.000 VNĐ cách biển 200m tại Đà Nẵng?"* | `hook` | ❌ **FAIL** (`ERR_01`) | **Vi phạm Zero-Claim:** Câu Hook không được đưa số liệu `8.500.000` và `200m`. Các số này phải để dành cho câu `factual`. |
| **Không đạt** | *"Khám phá căn hộ dịch vụ tốt nhất và rẻ nhất vịnh Đà Nẵng!"* | `hook` | ❌ **FAIL** (`ERR_03`) | **Vi phạm phóng đại:** Chứa từ so sánh nhất *"tốt nhất"*, *"rẻ nhất"*. |
| **ĐẠT CHUẨN** | *"Bạn đang tìm kiếm một không gian sống và làm việc linh hoạt gần biển tại Đà Nẵng?"* | `hook` | ✅ **PASS** | Gán `fact_id: "NONE"`. Khơi gợi nhu cầu mượt mà, văn phong truyền cảm hứng, 0 chứa số liệu hay khẳng định tuyệt đối. |

---

### 4.2. Câu Sự thật (Factual)

| Trường hợp | Nội dung câu Factual | Fact ID | NLI Status | Đánh giá | Lý do & Cách khắc phục |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Không đạt** | *"Căn hộ trang bị mạng 5G tốc độ cao giúp kết nối thông suốt 100% không bao giờ gián đoạn."* | `f03` | `partial` | ❌ **FAIL** (`ERR_02`, `ERR_03`) | Fact chỉ nói *"phủ sóng mạng 5G tốc độ cao"*. Tự ý thêm *"thông suốt 100%"* và *"không bao giờ gián đoạn"* là suy diễn mở rộng. |
| **Không đạt** | *"Giá thuê ưu đãi mùa hè chỉ còn 8.500.000 VNĐ/tháng kèm quà tặng đặc biệt."* | `f01` | `partial` | ❌ **FAIL** (`ERR_01`, `ERR_06`) | Fact không nói *"ưu đãi mùa hè"* hay *"quà tặng đặc biệt"*. |
| **ĐẠT CHUẨN** | *"Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao phục vụ nhu cầu làm việc từ xa."* | `f03` | `supported` | ✅ **PASS** | Bám sát fact gốc 100%, diễn đạt tự nhiên, bảo toàn sự thật. |
| **ĐẠT CHUẨN** | *"Căn hộ Studio tại TripC Da Nang có mức giá thuê 8.500.000 VNĐ/tháng đã bao gồm phí quản lý."* | `f01` | `supported` | ✅ **PASS** | Giữ nguyên vẹn số tiền, đơn vị tính và điều kiện kèm theo từ fact. |

---

### 4.3. Kịch bản Video Ngắn TikTok (Độ dài & Storyboard)

| Tiêu chí | Kịch bản Không đạt (FAIL) | Kịch bản Đạt chuẩn (PASS) |
| :--- | :--- | :--- |
| **Độ dài đọc thoại** | 82 từ (quá ngắn, hụt thời lượng) hoặc 215 từ (nói dồn dập, quá 60s). | **156 từ** (nằm chuẩn trong khoảng `120 - 180 từ`, đọc vừa vặn trong 50-55s). |
| **Storyboard** | Chỉ có 1 khối văn bản trần trụi, không có phân cảnh visual, không có thời lượng. | **4 phân cảnh chi tiết:**<br>• Cảnh 1 (03s): Hook tracking shot hướng biển.<br>• Cảnh 2 (18s): Visual bàn làm việc + test sóng 5G.<br>• Cảnh 3 (20s): Không gian bếp từ + ban công thoáng.<br>• Cảnh 4 (09s): CTA kết màn hình tải app. |
| **Hashtags** | `#TripC #GiamGiaKhung #PhongChi8Tr #So1DaNang` *(Chứa số, giá, từ so sánh nhất)*. | `#TripCDaNang #CanHoDaNang #DigitalNomad #KhongGianSong #Workation` *(3-5 tags, Zero-Claim)*. |

---

## 5. QUY TRÌNH GÁN NHÃN 2 NGƯỜI ĐỘC LẬP (DOUBLE ANNOTATION PROTOCOL)

Để đảm bảo bộ dữ liệu Golden Set mang tính khách quan tuyệt đối và không bị thiên vị cá nhân, dự án áp dụng quy trình gán nhãn chéo 2 người độc lập (**Double Blind Annotation**):

```
+-----------------------------------------------------------------------------------------+
|                               QUY TRÌNH DOUBLE ANNOTATION                               |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|       [50 Bản Nháp Seed Drafts] (30 Dev Set + 20 Held-out Test Set)                     |
|                                     |                                                   |
|                 +-------------------+-------------------+                               |
|                 |                                       |                               |
|                 v                                       v                               |
|       [Chuyên viên A (Rater A)]               [Chuyên viên B (Rater B)]                 |
|       - Độc lập sửa caption                   - Độc lập sửa caption                     |
|       - Chuẩn hóa fact mapping                - Chuẩn hóa fact mapping                  |
|       - Chấm nhãn PASS / FAIL                 - Chấm nhãn PASS / FAIL                   |
|                 |                                       |                               |
|                 +-------------------+-------------------+                               |
|                                     |                                                   |
|                                     v                                                   |
|               [Chạy script: compute_kappa.py --rater-a ... --rater-b ...]               |
|                                     |                                                   |
|                   +-----------------+-----------------+                                 |
|                   |                                   |                                 |
|                   v                                   v                                 |
|             Kappa >= 0.85                      Kappa < 0.85                             |
|          [KÝ DUYỆT CHỐT GOLDEN SET]          [PHIÊN HÒA GIẢI ADJUDICATION]              |
|                                              - Content Lead chủ trì                     |
|                                              - Hiệu chỉnh Guideline                     |
|                                              - Gán nhãn lại ca lệch                     |
+-----------------------------------------------------------------------------------------+
```

### Các bước thực hiện:
1. **Bước 1 - Phân tách độc lập:** Chuyên viên A và Chuyên viên B nhận danh sách 50 bản nháp dạng JSON. Trong suốt quá trình thực hiện, hai bên **tuyệt đối không trao đổi** về cách gán nhãn từng mẫu.
2. **Bước 2 - Thực hiện chuẩn hóa trên từng mẫu:**
   - Đọc kỹ bài SEO gốc và danh sách `extracted_facts`.
   - Kiểm tra từng câu trong caption/kịch bản. Tách câu đúng quy chuẩn.
   - Gán `sentence_type` và gán đúng `fact_id`.
   - Sửa lại câu từ nếu có lỗi suy diễn hoặc tính từ phóng đại. Đưa toàn bộ câu factual về trạng thái `supported`.
   - Đảm bảo kịch bản TikTok nằm trong 120–180 từ; bài Facebook có 3–5 hashtag Zero-Claim.
   - Ghi nhận trạng thái: `PASS` (bản nháp đạt chuẩn không lỗi) hoặc `FAIL` (bản nháp có lỗi phải chỉnh sửa).
3. **Bước 3 - Đo lường độ đồng thuận (Inter-Rater Reliability):**
   - Chạy script kỹ thuật:
     ```bash
     python scripts/compute_kappa.py --rater-a data/golden/annotator_a.json --rater-b data/golden/annotator_b.json --threshold 0.85
     ```
   - Script sẽ tính toán hệ số **Cohen's Kappa ($\kappa$)** trên nhãn chất lượng (`PASS` vs `FAIL`), nhãn phân loại câu (`sentence_type`), và nhãn gán `fact_id`.
4. **Bước 4 - Nghiệm thu hoặc Hòa giải (Adjudication):**
   - **Nếu $\kappa \ge 0.85$:** Độ đồng thuận đạt chuẩn khoa học xuất sắc. Hai chuyên viên cùng Content Lead ký chốt bản Golden Set chính thức.
   - **Nếu $\kappa < 0.85$:** Tồn tại mâu thuẫn nhận thức. Content Lead tổ chức phiên hòa giải trực tiếp, rà soát lại các ca đánh giá lệch nhau, làm rõ các trường hợp biên (edge cases) và yêu cầu cập nhật lại nhãn cho đến khi đạt $\kappa \ge 0.85$.

> [!IMPORTANT]
> Số liệu Cohen's Kappa trong mục 15.4 của tài liệu v1.0 ($\kappa = 1.0$) chỉ là con số giả định minh họa kỹ thuật. Nghiệm thu thực tế **bắt buộc phải thay bằng số đo thực tế** do script `compute_kappa.py` tính toán trên kết quả gán nhãn của 2 người thật.
