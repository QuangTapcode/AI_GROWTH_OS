# Giới hạn pilot local — baseline W1-PM-02

05/10/2026 · Quang Quang quản AI/PM/PO, Mỹ quản queue/search/metrics, Thiệu Quang quản DB/auth, Thanh kiểm chứng. Các giới hạn là quyết định thiết kế, **chưa được áp dụng trong app hoặc benchmark**.

## Dữ liệu, token và thời gian

| Hạng mục | Giới hạn ban đầu |
| --- | --- |
| AI backend | Ollama local; ưu tiên model đang có, không tự download hoặc gọi cloud |
| Model thử nghiệm | qwen3:4b-instruct; embeddinggemma:latest hiện có, pin digest và eval trước dùng thật |
| Model fallback | qwen2.5:3b-instruct-q4_K_M đang có; chỉ dùng sau eval, không giả cùng chất lượng |
| Concurrency | Một job AI tổng đang chạy, một active job/workspace; embedding và generation không chạy đồng thời trên GPU |
| Context | 4096 tokens; input gồm system/schema/evidence <=2800, output <=1024 |
| Calls/attempts | Tối đa hai LLM calls/job, bao gồm retry/repair; không reset khi worker restart |
| LLM timeout | HTTP 240s; job execution 600s; queue wait 900s |
| Embedding | Chunk <=512 tokens, batch <=8; HTTP 120s, job execution 300s, tổng hai attempts |
| Search | HTTP 30s, <=3 queries/run, <=10 results/query, một SearXNG adapter |
| Crawl | Năm seed domains, <=50 URLs/run, depth <=1, concurrency 1; allowlist/access checks trước fetch |
| Workspace/source | Một TripC + QA tenant tách biệt; <=100 sources/workspace, <=5 MiB/file |
| SEO/content | <=20 URLs/audit; <=10 generation jobs/workspace/ngày; một variant |
| Public/admin test load | 20 concurrent public visitors; 5 admin sessions; chưa phải dự báo traffic/SLA |
| Experiment | Một landing page, hai title/CTA variants, form persisted success là outcome |

Giới hạn input phải tính bằng tokenizer đúng model khi tích hợp; retrieval ưu tiên facts/evidence cần thiết, không cắt bỏ nguồn rồi giả đầy đủ. Article dài có thể chia section/version dưới cùng job/quota policy; không nới context tự động vì có thể tăng RAM/VRAM. Queue chứa job bền vững, request UI trả job ID sớm, không chờ local LLM trong request web.

## Chi phí

Paid AI/embeddings/search/cloud hosting/database mặc định 0 USD theo phương án tận dụng tài nguyên sẵn có; đây là mức chi dịch vụ mới cho các hạng mục này, không phải tổng cost pilot bằng 0. Domain/SSL routing/backup/electricity vẫn cần quyết định vận hành; không mua domain hoặc bật paid provider trong task PM.

Log model/digest, input/output tokens, attempts, runtime, queue wait và lỗi theo project/workspace/job. Với local ghi provider fee 0 và cost measurement incomplete cho điện/phần cứng. Paid fallback bị tắt; nếu sau này được duyệt, phải có bảng giá, ledger/reservation/worst-case cost và hard cap trước call. Không dùng dashboard warning thay hard cap.

## QA và failover

Smoke hiện tại chỉ chứng minh Ollama API và embeddings phản hồi; 30 frozen eval cases mới là gate chất lượng. Ollama không dùng được thì báo provider_unavailable/queued/timeout và giữ draft; fake mode chỉ local_verified, không giả nghiệm thu AI thật.

Thanh đo 10 phút trên local/staging với fake provider trước; live AI đo từng job tuần tự theo caps. Lưu commit/env/model digest, p50/p95/sample size/errors/tokens, không suy ra năng lực từ một smoke nhỏ. API/form mục tiêu p95 <=1s và public cached page <=2s tại tải test, chưa xác nhận đạt. Không bắn load vào website nguồn hoặc search engine ngoài.

Nguồn: [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [embeddings](https://docs.ollama.com/api/embed), [SearXNG JSON API](https://docs.searxng.org/dev/search_api.html). JSON format của SearXNG phải bật trên instance tự host; backend engines vẫn có hạn mức/quyền truy cập riêng, không được coi là search miễn phí không giới hạn.

[W1-PM-02](W1-PM-02.md) · [PILOT](PILOT.md) · [SOURCES](SOURCES.md).
