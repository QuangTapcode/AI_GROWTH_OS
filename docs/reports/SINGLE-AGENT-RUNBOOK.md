# Chạy và kiểm tra từng agent riêng lẻ

Research có [rubric chất lượng](RESEARCH-QUALITY-RUBRIC.md) và
[review/evidence ngày 28/10/2026](RESEARCH-QUALITY-REVIEW-2026-10-28.md).
PASS contract không thay cho nghiệm thu chất lượng findings.

Mục tiêu của runbook này là kiểm tra một agent trước khi chạy pipeline sáu agent. Mỗi lần chạy chỉ có **một target role**; nếu target cần parent artifact, runner tạo parent fixture cục bộ và ghi parent vào phần `prerequisites` để có thể kiểm tra đầu vào.

## Lệnh chạy

Chạy từ thư mục `services/ai`:

```powershell
$py = "C:\Users\ADMIN\AppData\Local\Python\bin\python.exe"
$out = "D:\Hoc\AI-Growth-OS\qa\evidence\single-agent-run"

& $py -m evals.run_single_role --role research --mode live --out "$out\research.json"
& $py -m evals.run_single_role --role growth_lead --mode live --out "$out\growth_lead.json"
& $py -m evals.run_single_role --role seo --mode live --out "$out\seo.json"
& $py -m evals.run_single_role --role content --mode live --out "$out\content.json"
& $py -m evals.run_single_role --role community --mode live --out "$out\community.json"
& $py -m evals.run_single_role --role performance --mode live --out "$out\performance.json"
```

Mỗi lệnh tạo hai file cạnh nhau:

- `<role>.json`: input đầy đủ, prerequisite artifact, output result, evidence, hash, usage, model/prompt và acceptance checks.
- `<role>.md`: bản đọc nhanh cho người review.

`--mode fake` chạy nhanh và xác định để kiểm tra contract. `--mode live` gọi Ollama thật. Cả hai mode chỉ được gọi là kết quả production khi request có nguồn thật và `synthetic=false`.

## Output đạt chuẩn của từng role

| Role | Operation | Phải kiểm tra |
| --- | --- | --- |
| Research | `research.run` | `ready_for_handoff`; mỗi finding có keyword, user need, quote, URL, fetched_at và evidence |
| Growth Lead | `strategy.generate` | `proposed`; score/rationale; task SEO và Content có deadline; `applied=false` |
| SEO | `seo.local_draft` | `draft`; title/meta/body; citations; mọi `seo_checks` đều true |
| Content | `content.repurpose` | `draft`; caption/CTA/channel; parent article/version; asset refs |
| Community | `community.response` | `draft`; reply có citations; lead chỉ là proposal; không tự gửi |
| Performance | `analytics.report` | `draft`; snapshot/window; metrics được giữ nguyên; `spend_mutation_allowed=false` |

## Đọc kết quả

```powershell
$r = Get-Content -Raw ".\research.json" | ConvertFrom-Json
$r.verdict
$r.output.artifact
$r.output.result
$r.output.evidence
$r.checks
```

Chỉ chạy pipeline sáu agent sau khi từng file có `verdict=PASS`. `PASS` ở đây nghĩa là output đúng contract và guardrail; reviewer vẫn phải kiểm tra chất lượng nội dung và nguồn.

## Dùng input thật

Có thể truyền một JobRequest đã được backend cấp context:

```powershell
& $py -m evals.run_single_role `
  --role research `
  --mode live `
  --request .\real-research-request.json `
  --out "$out\research-real.json"
```

Request thật phải có `workspace_id`, `context_snapshot_id`, profile/source version và source đã approve. Không đưa access token hoặc mật khẩu vào file request. Runner kiểm tra operation khớp role, nhưng không tự nâng quyền hoặc bỏ qua approval gate.

## Bộ đã chạy

Bộ standalone live đã chạy ngày 21/10/2026:

- [Research](../../qa/evidence/single-agent-2026-10-21-live/research.md)
- [Growth Lead](../../qa/evidence/single-agent-2026-10-21-live/growth_lead.md)
- [SEO](../../qa/evidence/single-agent-2026-10-21-live/seo.md)
- [Content](../../qa/evidence/single-agent-2026-10-21-live/content.md)
- [Community](../../qa/evidence/single-agent-2026-10-21-live/community.md)
- [Performance](../../qa/evidence/single-agent-2026-10-21-live/performance.md)

Bộ này có `verdict=PASS` cho cả sáu role, model `ollama/qwen3:4b-instruct`, nhưng input vẫn là fixture synthetic (`example.org`). Nó xác minh từng agent độc lập; chưa phải bằng chứng TripC production.
