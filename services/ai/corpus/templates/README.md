# Mẫu dữ liệu nghiệp vụ TripC và đối tác

Dành cho Quang Quang (PO) và Dương (BA). Đây là nguồn **duy nhất** để RAG trả lời giá, tình trạng còn phòng, địa chỉ và giờ mở cửa. Corpus mở trong `corpus/out/` chỉ là ngữ cảnh: AI chặn mọi câu trả lời về giá, giờ mở cửa hoặc tình trạng còn phòng lấy từ văn bản tự do.

## Fact sheet — `tripc_fact_sheet.csv`

Mỗi dòng là một fact. BE lưu vào `source_facts` (key/value/unit/verification/locator) gắn với một source version; AI đọc qua snapshot.

| Cột | Ý nghĩa |
| --- | --- |
| `owner` | `tripc` hoặc `partner:<partner_id>`; fact đối tác cần `source_ref` trỏ tới thư cho phép |
| `entity_type` | `company`, `service`, `policy`, `faq`, `listing`, `coworking`, `gym` |
| `key` | Key AI hiểu: `monthly_rent`, `deposit`, `price`, `address`, `availability`, `opening_hours`, `residence_name`, `min_term_months`, `furnished`, `utilities_included`, `pet_policy`, `foreigner_registration_support` |
| `value`/`unit` | Để **trống** nếu chưa biết. Trống nghĩa là thiếu, AI trả “không có thông tin đã xác minh”, không bao giờ là 0 |
| `as_of`/`valid_until` | Giá và tình trạng còn phòng hết hạn sau 7–14 ngày; quá hạn thì BE đổi `verification` về `unverified` |
| `verification` | `verified` chỉ khi Dương đã đối chiếu với nguồn; `unverified` hoặc `missing` thì AI không dùng cho câu hỏi nhạy cảm |
| `ward_2025` | Tên phường mới (sau 1/7/2025), ví dụ `An Hải`, `Ngũ Hành Sơn`; xem `data/danang_wards_2025.json` |

Phần mô tả dài (giới thiệu dịch vụ, FAQ, chính sách) viết thành tài liệu text/PDF tiếng Anh và ingest bằng `knowledge.ingest` với `provenance.license = "proprietary-tripc"`.

## Thư cho phép của đối tác — `partner_permission_letter.md`

Bản nháp, **cần pháp lý review** trước khi gửi. Đối tác ví dụ: Hiyori Garden Tower, Da Nang Villa Realty, Da Nang Homes, CVR, Monarchy, Enosta, California Fitness. Không scrape website đối tác; đối tác gửi dữ liệu qua file/Google Sheet theo mẫu CSV trên.
