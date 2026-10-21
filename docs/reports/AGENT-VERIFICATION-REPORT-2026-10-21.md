# Báo cáo kiểm chứng 6 agent

**Ngày báo cáo:** 21/10/2026  
**Phạm vi:** Research, Growth Lead, SEO, Content, Community và Performance  
**Kết luận:** `TECHNICAL_PASS / PRODUCTION_HOLD`

## Báo cáo này chứng minh điều gì?

Báo cáo xác nhận pipeline có thể nhận context, chạy agent qua HTTP worker, tạo artifact có version/hash, lưu citation và áp dụng approval gate. Nó **chưa chứng minh** dữ liệu TripC thật đã được xử lý hoặc bài đã được đăng lên Facebook.

Run được ghi nhận là `live` ở tầng model/HTTP/PostgreSQL, nhưng toàn bộ business fixture có cờ `synthetic=true`. Vì vậy kết quả kỹ thuật là thật, còn kết quả kinh doanh vẫn phải chờ nguồn, credential và metrics thật.

## Bằng chứng máy chạy

| Hạng mục | Kết quả | Ý nghĩa |
| --- | --- | --- |
| Six-role live evaluation | 30/30 pass | Sáu role và các guardrail contract chạy đúng trong live model run |
| AI unit/contract | 183 passed | Schema, citation, tenant, approval, retry và output guard đạt |
| PostgreSQL + HTTP pipeline | Passed | Worker, AI service, artifact ledger, outbox và approval đi qua DB/HTTP |
| Production gate | `HOLD` | Không được coi là production vì fixture vẫn synthetic |

## Artifact của từng agent

Các ID dưới đây lấy từ `qa/evidence/qq-all-2026-10-17/live-db-pipeline.json`. Có thể mở file JSON để kiểm tra đầy đủ payload, evidence, hash và audit.

| Agent | Operation | Artifact ID | Output kiểm chứng được | Trạng thái |
| --- | --- | --- | --- | --- |
| Research & Trend | `research.run` | `442b6c48-5a7d-5a3f-b09d-8ce31ab49992` | Research brief, findings, quote, URL, fetched_at, citation, missing facts, handoff `growth_lead` | `ready_for_handoff`, chưa phải demand thật |
| Growth Lead | `strategy.generate` | `9c901c01-a493-5adc-9885-bb3bfb6979ba` | Campaign plan, objective, task DAG và dependency từ Research | `proposed`, cần owner approval |
| SEO Worker | `seo.local_draft` | `fb52f105-68fa-5035-a9a9-422fe349de64` | Title, meta, headings, article body, CTA, links và citation | `draft`, chưa publish |
| Content Marketing | `content.repurpose` | `6faae9aa-81e2-5978-9d7d-6de6bc139de8` | Caption, CTA, alt text, channel pack, parent/version và asset refs | `draft/manual_review_pack`, chưa gửi social |
| Community | `community.response` | `cc463016-cc82-5177-95a0-934a547b5136` | Grounded reply, citation, escalation và lead proposal | `draft`, lead chưa được gửi |
| Performance | `analytics.report` | `f686fde5-af90-50d4-bea5-6b0c3d5ef2bc` | Snapshot/window, observations, proposal và missing metrics | `draft`, `spend_mutation_allowed=false` |

JSON là nguồn chuẩn duy nhất; các artifact có thể được đối chiếu bằng `role`, `operation`, `id`, `content_hash`, `context_snapshot_id` và `payload`.

## Citation và nguồn

Các run có citation gồm source ID, source version, chunk ID, locator, quote và URL. Tuy nhiên evidence hiện ghi `Synthetic fixture only`; một số case dùng `https://example.org/guide`. Đây chưa phải citation được kiểm chứng từ TripC.vn.

## Approval, handoff và publish

- Research đã handoff qua artifact reference, không truyền lịch sử chat.
- Growth Lead tạo dependency nội bộ tới SEO/Content.
- SEO và Content dừng ở draft/approval gate.
- Approval chỉ mở bước kế tiếp trong hệ thống; không tự chứng minh bài đã live.
- Facebook/TikTok connector có trong code, nhưng credential/account probe production chưa được xác nhận trong evidence này.
- Chưa có `published_post_id` Facebook hoặc URL bài đăng live trong report.

## Điều kiện để chuyển report thành kết quả production

- [ ] Nguồn TripC đã ingest, approve và có version/context snapshot.
- [ ] Facebook Page OAuth đã probe thành công và có `verified_at`.
- [ ] Asset thật có license/approval.
- [ ] Chạy một task mới với `synthetic=false`.
- [ ] Có artifact mới với citation TripC thật và audit owner.
- [ ] Có `published_post_id`/URL Facebook sau publish.
- [ ] Có ảnh chụp hoặc API response xác nhận bài public.
- [ ] GA4/GSC hoặc connector metrics trả snapshot có window/timezone.

## Cách kiểm tra lại

```powershell
$report = Get-Content -Raw `
  qa/evidence/qq-all-2026-10-17/live-db-pipeline.json | ConvertFrom-Json

$report.passed
$report.synthetic
$report.artifacts | Select-Object role, operation, id
$report.audits
```

Một báo cáo chỉ được đánh dấu **PRODUCTION_PASS** khi `synthetic=false`, có nguồn TripC thật, audit approval, publish ID/URL và metrics snapshot. Báo cáo hiện tại cố ý giữ `PRODUCTION_HOLD` để không nhầm test thành kết quả thật.

## Nguồn evidence

- [Live DB pipeline](../../qa/evidence/qq-all-2026-10-17/live-db-pipeline.json)
- [Six-role live evaluation](../../qa/evidence/qq-all-2026-10-17/six-role-live-eval.json)
- [Release decision](../../qa/evidence/qq-all-2026-10-17/release-decision.json)
- [Six-agent TODO and remaining gates](../coordination/AGENT-TEST-DEV-TODO.md)
