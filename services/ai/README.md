# AI engineer — Agents, RAG và evaluation

Owner: Quang Quang (AI, kiêm PM/PO). Ngôn ngữ: **Python**; FastAPI là lựa chọn cơ sở, HTTP/JSON là boundary với BE TypeScript. Vùng sửa: `services/ai/**`. Task: [W1 Quang Quang](../../docs/coordination/execution/W1.md#quang-quang), [TODO](../../TODO.md).

## Cách làm độc lập

1. Nhận business context/approved facts và schema từ contract, không lấy trực tiếp toàn bộ DB nghiệp vụ.
2. Fixtures synthetic có nhãn, approved nguồn/version và tenant A/B; fake provider trả output xác định để unit/schema tests lặp lại được.
3. Làm research/scoring/brief/content/report theo operation; mỗi agent có objective, tools, constraints, output schema và eval criteria.
4. Chạy frozen evaluation với real provider trong môi trường riêng có ngân sách; QA2 kiểm chứng độc lập.
5. Đối chiếu output qua BE worker thật, lưu artifact/evidence và kiểm tra source revoke/stale context.

## Source và artifact

- `src/app/`: FastAPI, config, error envelope, run store SQLite, provider adapters, operation registry.
- `src/rag/`: parse text/PDF/URL → chunk có locator → embed; retrieval chỉ trên snapshot tenant/approved; answer có evidence.
- `src/agents/`: `growth_map.py` (audience/topic/channel/KPI/goal proposal, không tự áp dụng).
- `src/guardrails/`: fact nhạy cảm (rent/deposit/price/address/availability) chỉ lấy từ fact đã verify; câu trả lời từ chunk không được nêu giá và mọi số phải có trong chunk được cite.
- `prompts/`: prompt theo operation, tên file = `prompt_version` ghi vào run.
- `evals/`: `fixtures.py` (synthetic), `build_dataset.py`, `run_eval.py`, `datasets/` (30 case + rubric), `reports/`.
- `examples/`: request mẫu cho BE; `scripts/smoke_http.py`: gọi service qua HTTP như worker.
- `corpus/`: script tạo corpus pilot từ nguồn có license (Wikivoyage, GOV.UK, OpenStreetMap, bảng phường 2025), `check_ingest.py` chạy chunk + embed thử, `templates/` mẫu fact sheet TripC và thư cho phép đối tác.
- `data/danang_wards_2025.json`: bảng phường sau 1/7/2025 (NQ 1659) dùng cho alias khi retrieval.
- `tests/`: unit/contract tests ở fake mode.

## Boundary và bàn giao

HTTP nội bộ theo [contracts](../../contracts/README.md) và đề xuất [CR-001](../../contracts/changes/CR-001-ai-internal-runs.md). AI không publish, không sửa business DB và không quyết định approval. Retrieval nhận snapshot BE đã giới hạn tenant; filter workspace/status/version nằm trong code, không chỉ trong prompt. Source documents là untrusted data; chống prompt injection. Không có facts thì ghi thiếu dữ liệu, không tự tạo số.

| Operation | Đầu vào chính | Kết quả |
| --- | --- | --- |
| `knowledge.ingest` | `source{kind: text\|pdf\|url}` | chunks + locator (paragraph/page/url) + embedding 768 (`embeddinggemma`), `searchable=false` để BE persist rồi duyệt. PDF không text → `UNSUPPORTED_PDF_NO_TEXT`, không OCR. URL ngoài allowlist → 422. |
| `knowledge.answer` | `question`, `snapshot` | English answer + evidence (source/version/chunk/locator/quote) + warnings; thiếu giá/địa chỉ/availability → `missing_fact_keys`. |
| `growth_map.suggest` | profile, approved facts, goal context | audiences/topics/channels/KPIs/goal suggestions, `applied=false`, `target=null`. |
| 13 mã còn lại của contract | `payload` tự do | Đường bootstrap generic, chưa có pipeline riêng. |

**Run bền vững:** khóa `job_id + operation + input_version`; run lưu ở `AI_RUN_STORE_PATH` (mặc định `services/ai/var/runs.sqlite3`, đã git-ignore). Restart → run dở thành `failed/RUN_INTERRUPTED/retryable`, worker gửi lại đúng request để chạy tiếp. Tối đa 2 LLM calls/job (kể cả repair, không reset khi retry/restart), 2 attempts/run, deadline tính từ lần accept đầu. Chỉ chạy **một process** uvicorn (concurrency AI = 1). Nơi lưu run chính thức còn chờ Mỹ chốt (CR-001).

**Lỗi:** mọi non-2xx là `{"error": {"code", "message", "request_id", "details"}}`; danh sách mã trong CR-001. Logs chỉ có job/tenant/operation/model/prompt/tokens/calls/latency, không payload/prompt/secret.

## Chạy local

Từ thư mục repo, Python 3.12–3.14, cài theo `requirements.lock`:

```powershell
$py = "C:\Users\ADMIN\AppData\Local\Python\bin\python.exe"
& $py -m pip install -r services/ai/requirements.lock
$env:LLM_PROVIDER_MODE = "fake"   # "live" = Ollama local, không cloud
& $py -m uvicorn src.app.main:app --app-dir services/ai --host 127.0.0.1 --port 5000
```

Kiểm tra: `GET /healthz`, `GET /readyz` (live: kiểm Ollama và hai model đã pull). Tạo run `POST /internal/v1/runs` → `202` + `run_id`, poll `GET /internal/v1/runs/{run_id}`. Đặt `INTERNAL_AI_AUTH_TOKEN` thì cần `Authorization: Bearer ...`. Biến môi trường và giới hạn: [.env.example](.env.example), [PILOT_LIMITS](../../docs/coordination/PILOT_LIMITS.md).

```powershell
& $py -m pytest services/ai/tests -q                                        # fake mode
& $py services/ai/scripts/smoke_http.py --base-url http://127.0.0.1:5000    # khi service đang chạy
cd services/ai
& $py -m evals.build_dataset                 # sinh lại dataset (đổi version nếu đổi expected)
& $py -m evals.run_eval --mode fake          # guardrail/contract
& $py -m evals.run_eval --mode live          # chất lượng thật, tuần tự trên Ollama, vài phút
```

Corpus pilot (cần mạng; output `corpus/out/` đã git-ignore):

```powershell
cd services/ai
& $py -m corpus.build                              # tải và chuyển nguồn thành tài liệu + manifest.json
& $py -m corpus.check_ingest --mode live --write-jobs   # chunk + embed thử, xuất request cho worker vào corpus/out/jobs/
```

Corpus là ngữ cảnh bên ngoài, chưa phải source đã duyệt: BE ingest và Dương review trước khi approve. Giá đã bị xóa khỏi Wikivoyage; thẻ OSM không có giờ mở cửa/số điện thoại; giá, giờ mở cửa và tình trạng còn phòng chỉ lấy từ fact sheet TripC/đối tác (`corpus/templates/`). Ghi nguồn bắt buộc theo `provenance.attribution` (OSM cũng cần giữ tách khỏi dữ liệu TripC theo ODbL).

Fake mode không gọi model và không phải evidence chất lượng AI; dùng report `live` cho nghiệm thu. Không tải model mới hoặc chuyển sang cloud. Không commit `.env`/credentials.

Baseline W1-PM-02: Ollama local đã smoke trên workstation, qwen3:4b-instruct và embeddinggemma; [giới hạn](../../docs/coordination/PILOT_LIMITS.md) và [evidence](../../docs/coordination/LOCAL_READINESS.json) ghi caps/digests; concurrency AI 1, embedding/generation tuần tự.
