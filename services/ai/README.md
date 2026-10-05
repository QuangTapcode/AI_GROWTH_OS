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

Bootstrap W1-AI-01: pyproject.toml + Python lockfile riêng, venv riêng, Python lint/typing/pytest và lệnh FastAPI đã kiểm chứng; port dự kiến 5000, env validation, fake/live modes, run/eval commands đã kiểm chứng. Freeze bộ tối thiểu 30 eval cases và ngưỡng tuần 1, bổ sung M15–M16 khi contract chốt; critical cases phải đạt, factual threshold gắn phương pháp chấm. Ghi cost/latency/usage, secrets không vào log. Output phải validate trước BE persist.
