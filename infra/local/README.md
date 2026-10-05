# Local/server stack — phương án triển khai pilot

Baseline 05/10/2026; W1-BE-01/04 triển khai. Owner Thiệu Quang: DB/auth/migrations/runtime; Mỹ: worker/queue/search/CMS/analytics; Quang Quang: Ollama/model/source review. **Compose PostgreSQL/pgvector và SearXNG đã được chạy/probe trên Windows host được người dùng chọn. App/CMS/worker/AI product service chưa bootstrap.**

| Thành phần | Chọn cho pilot | Phạm vi mạng dự kiến |
| --- | --- | --- |
| Website public | apps/pilot, Next.js/TypeScript, port 3001 | Qua reverse proxy HTTPS |
| Quản trị/CMS UI | apps/web, Next.js/TypeScript, port 3000 | Qua HTTPS + auth |
| API/CMS | apps/api, Next.js/TypeScript, port 4000 | Browser qua reverse-proxy /v1; admin mutation RBAC |
| Worker | apps/worker, TypeScript | Internal; durable jobs qua PostgreSQL/pg-boss |
| AI | services/ai, Python/FastAPI, port 5000 | Internal HTTP/JSON + service auth |
| Ollama | Local installed models, port 11434 | Internal only, không publish cổng trực tiếp ra internet |
| Database/vector | PostgreSQL + pgvector, port 5432 | Internal, tenant policies, least privilege |
| Search | SearXNG riêng, port 8080 đề xuất | Internal, bật JSON format và allowed engines |

Server là máy Windows hiện tại theo xác nhận người dùng; Docker và hai dependency services đã chạy. Public routing/TLS/backup/app deployment chưa verify. BE chọn stable versions và pin image digest/lockfiles sau smoke, không dùng latest ngầm cho production.

## Trình tự triển khai

1. Quang Quang chốt server access và public hostname/URL; domain chưa có, không tự mua. BE kiểm tra routing/TLS và nơi lưu secrets ngoài Git.
2. Thiệu Quang dựng PostgreSQL/pgvector, migrations/seed hai tenants, tenant/storage/source policies và backup; embeddings dimension 768 là kết quả model hiện có, migration cần gắn model/digest và reindex policy khi đổi model.
3. Mỹ dựng pg-boss worker, search instance/JSON/query/error probe; AI service có fake/live-local mode và bounded Ollama calls. Không bắt Python dùng TypeScript source types.
4. Tiến/Huyền bootstrap hai Next.js apps và API client/contract mocks; BE core/public-published-content/form persistence với idempotency.
5. Ghép staging thật, source/RAG/role/form tests, tracking; Quang Quang/Mỹ tạo GA4/GSC với owner/API access, Tiến gắn GA4/UTM. GSC verify cần URL/property ownership thật.
6. Thanh kiểm chứng evidence ngày 5; publish/schedule M10 ngày 12; trước release thử restore/rollback và health monitoring. Không có kết quả thì ghi not_tested.

Nguồn: [Ollama local API](https://docs.ollama.com/api/introduction), [PostgreSQL](https://www.postgresql.org/docs/current/index.html), [pgvector](https://github.com/pgvector/pgvector), [SearXNG API](https://docs.searxng.org/dev/search_api.html), [pg-boss](https://github.com/timgit/pg-boss), [GA4 setup](https://support.google.com/analytics/answer/9304153?hl=en), [GSC ownership](https://support.google.com/webmasters/answer/9008080?hl=en).

[PM plan](../../docs/coordination/W1-PM-02.md) · [access/blockers](../../docs/coordination/W1-PM-03.md) · [limits](../../docs/coordination/PILOT_LIMITS.md).


## Chạy local dependencies

PostgreSQL: 127.0.0.1:15432 (container 5432); SearXNG: http://127.0.0.1:18081 (container 8080). Cổng 18080 đang dùng bởi dự án khác nên không dùng cho stack này. Hai dịch vụ chỉ bind loopback, project ai-growth-os-local và volume riêng. Images pin digest trong .env do bootstrap tạo; image đầu tiên được pull từ các tags dưới đây.

Từ root dự án:

```powershell
docker pull pgvector/pgvector:0.8.7-pg17-bookworm
docker pull searxng/searxng:latest
.\infra\local\bootstrap.ps1
docker compose -f infra/local/compose.yaml ps
# Dừng riêng services của dự án, giữ dữ liệu
docker compose -f infra/local/compose.yaml stop
```

bootstrap.ps1 tạo infra/local/.env chỉ khi chưa có, sinh password/secret ngẫu nhiên, giữ credential/volume khi chạy lại và không in secrets. File .env đã xác nhận bị Git ignore. ai_growth_dev là bootstrap DB admin local, không phải role ứng dụng production; BE phải thêm role hạn chế/tenant schema/migrations/backup trước integration gate. Xem [init.sql](init.sql), [compose.yaml](compose.yaml), [settings search](searxng-settings.yml).

Đã kiểm chứng PostgreSQL query + extension/vector cosine distance, SearXNG JSON và một query trả 10 results; dữ liệu nguồn chưa được crawl/approved. [Local evidence](../../docs/coordination/LOCAL_READINESS.json) · [Search evidence](../../docs/coordination/SEARCH_READINESS.json).
