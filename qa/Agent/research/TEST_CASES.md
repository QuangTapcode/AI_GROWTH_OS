# Research Agent — testcase tích hợp 4 kỹ thuật

Các testcase discovery bên dưới kết hợp cả bốn kỹ thuật trong cùng một kịch
bản. Bộ AI pipeline bổ sung các phân vùng, điều kiện quyết định và chuyển
trạng thái theo đúng chức năng của Research Agent; kỹ thuật áp dụng được ghi
rõ trong từng nhóm.

- **EP (Equivalence Partitioning):** phân lớp kết quả thành có liên quan và đủ căn cứ, không có kết quả, tiêu đề sai, nguồn không tin cậy, hoặc thiếu căn cứ dữ kiện.
- **BVA (Boundary Value Analysis):** trong cùng testcase kiểm tra số query quanh giới hạn 3, số kết quả quanh giới hạn 10, và thứ hạng quanh ngưỡng top 5.
- **Decision Table:** chỉ chấp nhận kết quả khi đồng thời đúng trang/tiêu đề, nằm trong top 5, nguồn được cho phép và nội dung nguồn hỗ trợ dữ kiện.
- **State Transition:** kiểm tra discovery chạy khi chưa có signal hoặc signal đã stale (>=24 giờ), và không chạy lại khi signal còn mới.

| ID | Kết quả tìm kiếm / lớp EP | BVA trong testcase | Điều kiện quyết định | Trạng thái signal | Kỳ vọng |
|---|---|---|---|---|---|
| AC-01 | Trang sân bay chính xác, dữ kiện IATA DAD được hỗ trợ | 1 dịch vụ, 1 kết quả, hạng 1 | Nguồn hợp lệ + tiêu đề khớp + dữ kiện đúng | Chưa có signal | Chấp nhận; chạy discovery |
| AC-02 | Trang sân bay chính xác tại biên top 5 | 3 dịch vụ, 5 kết quả, hạng 5 | Nguồn hợp lệ + tiêu đề khớp + dữ kiện đúng | Đúng 24 giờ | Chấp nhận; refresh |
| AC-03 | Trang liên quan nhưng nằm sau top 5 | 4 dịch vụ, 6 kết quả, hạng 6 | Không đạt điều kiện thứ hạng | Signal mới 1 giờ | Từ chối; không refresh |
| AC-04 | Không có kết quả | 0 dịch vụ biên, 0 kết quả | Không tìm thấy trang kỳ vọng | Signal cũ 25 giờ | Từ chối; refresh |
| AC-05 | Trang đúng ở kết quả thứ 11 bị cắt | 11 dịch vụ biên, 11 kết quả đầu vào (giới hạn còn 10) | Trang kỳ vọng không còn trong kết quả | Signal cũ 25 giờ | Từ chối; refresh |
| AC-06 | Kết quả có vẻ liên quan nhưng domain giả mạo | 1 dịch vụ, 1 kết quả, hạng 1 | Nguồn không nằm trong allowlist | Signal mới 23 giờ | Từ chối; không refresh |
| AC-07 | URL đúng nhưng tiêu đề không liên quan | 2 dịch vụ, 1 kết quả, hạng 1 | Không đạt điều kiện tiêu đề | Signal mới 1 giờ | Từ chối; không refresh |
| AC-08 | Trang liên quan nhưng không chứng minh dữ kiện yêu cầu | 1 dịch vụ, 1 kết quả, hạng 1 | Nội dung nguồn không hỗ trợ dữ kiện | Signal mới 23 giờ | Từ chối; không refresh |
| AC-09 | Trang đúng ở hạng 10 | 3 dịch vụ, 10 kết quả, hạng 10 | Ngoài top 5 | Signal mới 1 giờ | Từ chối; không refresh |
| AC-10 | URL dùng FTP, bị bộ tìm kiếm loại | 4 dịch vụ biên, 1 kết quả đầu vào | Không có URL nguồn hợp lệ để xác nhận | Chưa có signal | Từ chối; chạy discovery |

Thông tin truy vấn, profile, thứ hạng, nguồn chuẩn, dữ kiện và tuổi signal
của từng testcase được lưu trong
[`search_accuracy_cases.json`](search_accuracy_cases.json). Mã chạy tích hợp
cả bốn kỹ thuật nằm trong
[`test_research_integrated.py`](tests/test_research_integrated.py).

## AI Research pipeline — 32 testcase

Các testcase này gọi endpoint nội bộ thật, chạy `research.run`, dùng nguồn
approved tổng hợp và provider giả lập xác định. Provider chỉ giả lập câu trả
lời của mô hình; kiểm tra chọn nguồn, trích dẫn, guardrail, chất lượng, trend,
inventory và handoff vẫn chạy qua code production.

| Nhóm / IDs pytest | Kỹ thuật và điều kiện | Kết quả mong đợi |
|---|---|---|
| Finding hợp lệ | EP: finding có nguồn; Decision Table: quote, topic, offer, audience, user need cùng đạt; State: run chuyển sang handoff | Handoff có exact quote và nguồn truy vết; demand vẫn là giả thuyết |
| `decision-no-exact-grounding`, `bva-quote-below-minimum-evidence` | EP trích dẫn bịa; BVA quote dưới 6 từ | Bỏ finding với `UNGROUNDED_IDEA_DROPPED` hoặc `WEAK_QUOTE_DROPPED` |
| `decision-number-not-in-source`, `decision-unverified-price`, `decision-unverified-opening-hours` | Bảng quyết định cho số, giá và thông tin nhạy cảm không có căn cứ | Bỏ finding; không phát biểu fact chưa xác minh |
| `decision-ranking-is-not-source-evidence`, `decision-no-inferred-demand` | Bảng quyết định phân biệt search metadata, demand và bằng chứng nội dung | Bỏ claim về ranking/demand |
| `decision-topic-not-supported-by-quote`, `decision-offer-not-in-business-profile`, `decision-user-need-not-specific`, `decision-audience-not-in-business-profile` | Decision Table: mỗi testcase vi phạm riêng một tiêu chí topic/offer/need/audience | Bỏ finding và ghi warning tương ứng |
| `ep-revoked-source`, `ep-deleted-source`, `bva-source-version` | EP trạng thái nguồn; BVA version được approve so với version hiện tại | Không gửi nguồn tới model; brief insufficient |
| `ep-source-without-url`, `ep-invalid-source-url`, `bva-future-retrieval-time` | EP URL thiếu/sai; BVA thời điểm thu thập ở tương lai | Không tạo evidence/handoff từ nguồn không hợp lệ |
| `decision-sensitive-excerpt`, `decision-seo-metadata` | Decision Table lọc excerpt chứa giá/claim nhạy cảm hoặc danh sách keyword metadata | Excerpt bị loại trước model; warning được phát ra |
| Giữ excerpt hợp lệ khi lọc, duplicate chunk ID | Decision Table chỉ giữ evidence hợp lệ; BVA uniqueness ở biên ID trùng | Chọn đúng excerpt; ID trùng làm run fail rõ ràng |
| Giới hạn excerpt | BVA số chunk được đưa vào prompt: giới hạn cấu hình là 6 | Prompt chỉ nhận tối đa 6 excerpt |
| Trùng nội dung | EP inventory đã có chủ đề | Không đề xuất lại và brief insufficient |
| Trend signal khớp / không khớp | EP title liên quan và không liên quan; trend chỉ là metadata, không phải proof of demand | Chỉ signal liên quan được gắn; demand vẫn null |
| `bva-valid-past-boundary`, `bva-invalid-future-boundary` | BVA thời gian observation quá khứ so với tương lai; State: intake → processing hoặc rejected | Signal quá khứ đi tiếp; signal tương lai trả 422 trước provider |
| Fallback grounded | State: draft thiếu câu hoàn chỉnh → fallback xác định dựa trên signal + source → handoff | Chỉ phục hồi từ trích dẫn nguyên văn của nguồn approved |
| Freshness 91 ngày | BVA freshness vượt mốc 90 ngày | Finding vẫn giữ nhưng thêm yêu cầu re-verification |
| Input budget | BVA vượt `max_input_tokens` | Run fail `CONTEXT_BUDGET_EXCEEDED` trước provider |
| Thiếu offer/audience | EP trường hồ sơ rỗng | Báo `confirmed_offer` và `target_audience` trong `missing_facts` |
| Invalid structured output | State: output sai schema, không có trend để fallback | Run fail với lỗi structured output thay vì tạo kết quả giả |

Kịch bản được triển khai tại
[`test_research_agent.py`](tests/test_research_agent.py). Không thể liệt kê
mọi tổ hợp input vô hạn; bộ này nhắm vào các nhánh production, lớp tương
đương, ngưỡng, điều kiện quyết định và chuyển trạng thái đã xác định.

## Chạy test

Chạy offline từ thư mục gốc repo:

```powershell
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\research\pyproject.toml qa\Agent\research\tests -v
```

Hai testcase AC-01 và AC-02 có thêm bước truy vấn SearXNG thật và kiểm tra nội
dung trang nguồn. Bật bước live bằng PowerShell:

```powershell
$env:RESEARCH_LIVE_SEARCH = "1"
$env:SEARXNG_URL = "http://127.0.0.1:18081"
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\research\pyproject.toml qa\Agent\research\tests -v
```

Live checks cần SearXNG và Internet. Thứ hạng tìm kiếm có thể thay đổi; nếu
test live thất bại, kiểm tra kết quả/provider và nguồn thực tế trước khi sửa
ground truth.
