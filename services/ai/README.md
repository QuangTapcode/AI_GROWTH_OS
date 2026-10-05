# AI engineer — Agents, RAG và evaluation

Owner: Quang Quang (AI, kiêm PM/PO). Ngôn ngữ: **Python**; FastAPI là lựa chọn cơ sở, HTTP/JSON là boundary với BE TypeScript. Vùng sửa: `services/ai/**`. Đây là skeleton chưa chạy; W1-AI-01/W1-AI-03 là việc mở đầu trong [TODO](../../TODO.md).

## Cách làm độc lập

1. Nhận business context/approved facts và schema từ contract, không lấy trực tiếp toàn bộ DB nghiệp vụ.
2. Fixtures synthetic có nhãn, approved nguồn/version và tenant A/B; fake provider trả output xác định để unit/schema tests lặp lại được.
3. Làm research/scoring/brief/content/report theo operation; mỗi agent có objective, tools, constraints, output schema và eval criteria.
4. Chạy frozen evaluation với real provider trong môi trường riêng có ngân sách; QA2 kiểm chứng độc lập.
5. Đối chiếu output qua BE worker thật, lưu artifact/evidence và kiểm tra source revoke/stale context.

## Source và artifact

- `src/agents/`: research, opportunity/strategy, brief/content/quality, SEO/community, analyst/experiment hypothesis/learning rules theo 16 module pilot; không tạo hệ đa agent độc lập.
- `src/rag/`: extraction/chunk/retrieval với tenant/source filters và provenance.
- `src/providers/`: fake/live adapters; không rải provider SDK khắp agent.
- `src/guardrails/`: schema/facts/brand/cost/timeout policies.
- `prompts/`: tách agent và version; ghi prompt/model versions vào run.
- `evals/datasets/`: golden + adversarial fixtures có rubric và dataset version.
- `evals/reports/`: kết quả kiểm chứng có model/prompt/schema/dataset/seed nếu áp dụng.
- `tests/`: unit/schema/deterministic tests; QA2 suite độc lập.

## Boundary và bàn giao

HTTP nội bộ theo [contracts](../../contracts/README.md); service auth và run durability/recovery phải được chốt cùng BE. AI không publish, không sửa business DB và không quyết định approval. Retrieval được BE giới hạn tenant bằng query/snapshot adapter, không chỉ prompt.

Không có facts thì ghi thiếu dữ liệu. Source documents là untrusted data; chống prompt injection. Report dùng metric snapshots; số học tính bằng code xác định trước khi diễn đạt, không tự tạo số.

Bootstrap W1-AI-01: `pyproject.toml` + `requirements.lock` riêng, env validation, fake/live modes, FastAPI health/readiness và internal run contract đã có. Service chạy port 5000; fake mode dùng cho contract/schema tests, live mode chỉ gọi Ollama local. Output validate trước khi BE persist; structured logs chỉ ghi job/tenant/operation/model/prompt/tokens/timeout/latency, không ghi payload/prompt/secret. Bộ 30 eval cases và durable worker vẫn là các bước tiếp theo, không được coi đã hoàn thành bởi bootstrap.

## Chạy local

Từ thư mục repo, dùng Python 3.12–3.14 đã có FastAPI:

```powershell
$env:PYTHONPATH = (Resolve-Path services/ai).Path
$env:LLM_PROVIDER_MODE = "fake"
& "C:\Users\ADMIN\AppData\Local\Python\bin\python.exe" -m uvicorn src.app.main:app --app-dir services/ai --host 127.0.0.1 --port 5000
```

Kiểm tra `GET http://127.0.0.1:5000/healthz` và `GET http://127.0.0.1:5000/readyz`. Fake mode không gọi model. Để probe local Ollama, đặt `LLM_PROVIDER_MODE=live`; service dùng `OLLAMA_BASE_URL`, `LLM_MODEL=qwen3:4b-instruct`, JSON structured output và `temperature=0`. Không tải model mới hoặc chuyển sang cloud.

Tạo internal run bằng `POST /internal/v1/runs` theo schema trong `contracts/README.md`, nhận `202` với `run_id`, sau đó poll `GET /internal/v1/runs/{run_id}`. Bootstrap registry chỉ ở RAM để kiểm tra contract; worker/queue durable và retry/recovery thuộc W1-BE-01/W1-BE-03. Nếu đặt `INTERNAL_AI_AUTH_TOKEN`, cả hai internal endpoint yêu cầu `Authorization: Bearer ...`.

```powershell
& "C:\Users\ADMIN\AppData\Local\Python\bin\python.exe" -m pytest services/ai/tests -q
```

`requirements.lock` là baseline môi trường đã kiểm tra; khi dựng môi trường mới cài theo lockfile và không commit `.env`/credentials.


Baseline W1-PM-02: Ollama local đã smoke trên workstation, qwen3:4b-instruct và embeddinggemma; không tự chuyển cloud hoặc download model. [Giới hạn](../../docs/coordination/PILOT_LIMITS.md) và [evidence](../../docs/coordination/LOCAL_READINESS.json) ghi caps/digests; concurrency AI 1, embedding/generation tuần tự. Smoke không thay bộ 30 eval cases.
