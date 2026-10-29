# Tiêu chí nghiệm thu Research

Cập nhật: 28/10/2026. Runtime: `research-v7`; rubric: `research-quality-v1`.

## Một finding tốt

| Tiêu chí | Bằng chứng cần xem | Điều kiện đạt |
| --- | --- | --- |
| Chủ đề | `topic`, `keywords`, quote | Đoạn trích nói về chủ đề, không chỉ chung địa danh |
| Đúng khách hàng | `audience_fit`, business profile | Gọi đúng nhóm khách hàng; nhu cầu của nhóm vẫn là giả thuyết nếu chưa đo |
| Đúng dịch vụ | `offer_fit`, products/services | Không bổ sung dịch vụ ngoài hồ sơ đã xác nhận |
| Vấn đề cụ thể | `user_need` | Có vấn đề/quyết định cụ thể; không chỉ “tìm hiểu chủ đề” |
| Truy vết | source/version/chunk/locator/quote/URL/fetched_at | Quote nằm nguyên văn trong nguồn được duyệt, cùng tenant và version |
| Phân loại nhận định | `source_facts`, `hypotheses`, `missing_data` | Trích dẫn là phát biểu của nguồn; audience/offer/need/rationale là giả thuyết. Phát biểu của nguồn không tự chứng minh sự thật ngoài đời |
| Không suy ra tăng trưởng | confidence, demand_estimate, metrics | Rank/title không chứng minh tăng trưởng hay search volume; `demand_estimate` giữ null |
| Không trùng | inventory title và evidence quotes | Không đề xuất lại bài/chứng cứ đã dùng dưới một tên khác; refresh là operation riêng |

`quality_checks` là bộ lọc từ vựng, không chứng minh ngữ nghĩa. Các finding luôn mang
`quality_status=requires_semantic_review`. Reviewer kiểm tra cả trade-off, phủ định,
ý nghĩa của quote và độ phù hợp với hồ sơ trước khi nghiệm thu. Không dùng số điểm
hoặc test xanh thay chữ ký nghiệm thu của business owner.

Ví dụ lỗi: nguồn nói Son Tra yên tĩnh nhưng ít coworking hơn. Nhu cầu hợp lệ có thể là
“chọn khu vực yên tĩnh để làm việc từ xa”; không biến bất lợi “ít coworking” thành
mong muốn của người dùng. Prompt v7 nêu rõ giới hạn này.

## Nguồn và dữ liệu thiếu

- Nguồn revoked/deleted/sai version bị loại; thiếu URL hoặc thời điểm lấy hợp lệ không được dùng.
- Năm cập nhật trong nội dung cũ hơn ba năm được gắn cờ theo policy hiện có.
- Lần fetch cũ hơn 90 ngày thêm `source_freshness_requires_reverification`: đây là cảnh báo bảo thủ, không phải chứng nhận nội dung đã hết hiệu lực.
- Chủ đề không có đoạn nguồn được ghi `source_gap:<topic>` khi có discovery query tương ứng.
- Không có finding hợp lệ trả `insufficient_data`; không tự tạo finding để đạt chỉ tiêu.

## Dữ liệu GSC trong Research

API `POST /v1/workspaces/{workspace_id}/research-metrics` nhận
`context_snapshot_id`, `from`, `to` (hai ngày tùy chọn). Cần owner/editor và context
hiện tại. Backend chỉ dùng property đã verified trong workspace, khớp cấu hình
server; token không đi vào job, prompt hoặc evidence.

Snapshot đo được lưu như artifact bất biến `research.search_metrics`, có hash,
workspace/context/version, property, cửa sổ và thời điểm quan sát. Query, clicks,
impressions, CTR và position được gắn vào finding bằng code, không do LLM viết.
Không có credential/connection/snapshot thì giữ dữ liệu thiếu. Không có query rows
không có nghĩa search volume bằng 0; số 0 chỉ giữ nguyên khi provider thực sự trả 0.

Dữ liệu chỉ phản ánh property đó và các query hàng đầu, không phải toàn thị trường.
GSC quy định ngày theo Pacific time, CTR theo tỷ lệ 0–1 và không bảo đảm trả đủ mọi
query. [Nguồn chính thức Google](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
Adapter dùng tối đa 100 query, dữ liệu final, cửa sổ mặc định 28 ngày kết thúc cách
ngày Pacific hiện tại ba ngày. Chưa tích hợp nhà cung cấp market-wide keyword volume.

Scheduler làm mới snapshot trước Research; lỗi GSC ghi warning và không ngăn nghiên
cứu từ nguồn đã duyệt. Worker lấy inventory trong workspace, snapshot đo đã verified
trước thời điểm tạo task, tối đa bảy ngày tuổi. AI kiểm lại hash, tenant, context và
cửa sổ. Kết nối GSC live và hướng dẫn cấu hình được để sau theo yêu cầu người dùng.

## Chạy lại đánh giá

Từ `services/ai`, dùng interpreter Python đã cài dependencies:

```powershell
python -m evals.research_quality --request ../../qa/evidence/research-quality-2026-10-28/backend-request.json --out ../../qa/evidence/research-quality-2026-10-28
python -m pytest tests/test_research.py tests/test_research_trends.py tests/test_research_quality.py tests/test_qq01_03_review.py -q
```

Runner gọi model thật, lưu đầy đủ request/output và kiểm replay. `--mode gemini`
có thể dùng khi đã cấu hình; mặc định là Ollama. Run store tạm, không publish và
không ghi finding vào business DB. Profile chỉ bổ sung focus để đánh giá; snapshot
nguồn và approval refs lấy từ backend. File request là snapshot lịch sử: khi nghiệm
thu vận hành phải export context hiện tại và kiểm lại trạng thái nguồn tại worker.

[Báo cáo review ngày 28/10](RESEARCH-QUALITY-REVIEW-2026-10-28.md).
