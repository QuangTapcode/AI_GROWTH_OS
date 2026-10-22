# TODO kiá»ƒm tra vÃ  phÃ¡t triá»ƒn 6 agent

NgÃ y cáº­p nháº­t: **21/10/2026**
Má»¥c tiÃªu: xÃ¡c nháº­n sÃ¡u pipeline cháº¡y Ä‘Ãºng qua AI service, sau Ä‘Ã³ ná»‘i tá»«ng pipeline vÃ o workflow tháº­t vá»›i artifact, approval, tenant/version vÃ  evidence Ä‘áº§y Ä‘á»§.

## Tráº¡ng thÃ¡i kiá»ƒm tra hiá»‡n táº¡i

| Pháº¡m vi | Káº¿t quáº£ gáº§n nháº¥t | Ã nghÄ©a |
| --- | --- | --- |
| AI service unit/integration | **183 passed** | Guardrail, RAG, provenance, retry vÃ  contract Ä‘ang xanh á»Ÿ fake mode |
| Six-role fake eval | **30/30 passed** | Cáº£ Research, Growth Lead, SEO, Content, Community, Performance/Learning táº¡o Ä‘Æ°á»£c output contract |
| API automation | **4 passed** | Scheduler vÃ  handoff logic local Ä‘ang xanh |
| Worker | **110 passed, 1 skipped** | Skip lÃ  cÃ¡c test cáº§n PostgreSQL local |
| Web smoke | **1 passed** | Staging page vÃ  process health hoáº¡t Ä‘á»™ng |
| AI `/healthz`, `/readyz` fake | **200/200** | Service khá»Ÿi Ä‘á»™ng Ä‘Æ°á»£c á»Ÿ fake mode |
| Facebook/TikTok live | **Connector Ä‘Ã£ cÃ³, credential chÆ°a cáº¥p** | Cáº§n OAuth token tháº­t, account probe vÃ  TikTok app review trÆ°á»›c khi báº­t direct post |
| Live model/campaign tháº­t | **ChÆ°a xÃ¡c nháº­n** | Cáº§n Ollama, `embeddinggemma:latest`, PostgreSQL, approved source vÃ  knowledge context |

CÃ¡c káº¿t quáº£ trÃªn lÃ  báº±ng chá»©ng code vÃ  fake-mode. Muá»‘n Ä‘Ã¡nh dáº¥u má»™t agent Ä‘Ã£ cháº¡y tháº­t cáº§n thÃªm run qua worker/API, artifact trong Ä‘Ãºng workspace, audit log vÃ  reviewer xÃ¡c nháº­n.

## Lane chung DÆ°Æ¡ng + TrÆ°á»ng

- [ ] **DU-TR-01 â€” Chá»‘t AC vÃ  UX chung cho sÃ¡u agent.** DÆ°Æ¡ng viáº¿t business rule, fact/KPI, consent, escalation vÃ  Ä‘iá»u kiá»‡n `insufficient_data`; TrÆ°á»ng chuyá»ƒn thÃ nh flow dashboard, tráº¡ng thÃ¡i draft/blocked/awaiting approval, citation vÃ  stale-version.
- [ ] **DU-TR-02 â€” Láº­p ma tráº­n kiá»ƒm thá»­ 6 Ã— 4.** Má»—i agent cÃ³ happy path, thiáº¿u dá»¯ liá»‡u, sai tenant/version vÃ  human approval; gáº¯n má»—i case vá»›i artifact/evidence vÃ  ngÆ°á»i review.
- [ ] **DU-TR-03 â€” Walkthrough má»™t campaign giáº£ láº­p.** Äi tá»« Research â†’ Growth Lead â†’ SEO/Content â†’ approval â†’ Community/Performance; xÃ¡c nháº­n UI khÃ´ng cho publish/send khi chÆ°a cÃ³ approval.
- [ ] **DU-TR-04 â€” Handoff cho Tiáº¿n vÃ  Thiáº¿u.** BÃ n giao component/state contract cho FE vÃ  fixture/evidence cho QA; má»i thay Ä‘á»•i schema pháº£i Ä‘Æ°á»£c Thiáº¿u Quang review.

- [x] **DU-TR-05 â€” Connector contract.** Matrix/gateway/scheduler Ä‘Ã£ cÃ³ Facebook + TikTok; publish production fail-closed khi thiáº¿u credential vÃ  Content máº·c Ä‘á»‹nh táº¡o pack Facebook + TikTok.

Done khi AC vÃ  wire/spec Ä‘Æ°á»£c DÆ°Æ¡ng + TrÆ°á»ng kÃ½, Tiáº¿n cÃ³ Ä‘á»§ state Ä‘á»ƒ hiá»ƒn thá»‹, Thiáº¿u cÃ³ fixture cháº¡y Ä‘Æ°á»£c vÃ  Quang Quang xÃ¡c nháº­n mapping operation.

## SÃ¡u agent vÃ  nhiá»‡m vá»¥ riÃªng

### 1. Research & Trend â€” owner Quang Quang

Reviewer: DÆ°Æ¡ng (business/source), Thiáº¿u Quang (HTTP/schema), Thiáº¿u (QA).

- [x] Cháº¡y `test_research.py` vÃ  contract review; kiá»ƒm tra artifact hash, citation, idempotency vÃ  restart.
- [ ] Cháº¡y má»™t request tá»« API/worker vá»›i source Ä‘Ã£ approve; kiá»ƒm tra Ä‘Ãºng `workspace_id`, profile/source/snapshot version vÃ  `research_artifact`.
- [ ] Bá»• sung regression cho revoke/delete/stale/future/sensitive source vÃ  thiáº¿u URL.
- [ ] Handoff research brief cho Growth Lead báº±ng artifact ref, khÃ´ng truyá»n lá»‹ch sá»­ chat thÃ´.

Done khi Research chá»‰ dÃ¹ng source Ä‘á»§ provenance, tráº£ `missing_facts` khi thiáº¿u dá»¯ liá»‡u vÃ  replay cÃ¹ng input khÃ´ng táº¡o artifact trÃ¹ng.

### 2. Growth Lead & Analyst â€” owner Quang Quang

Reviewer: Má»¹ (worker/dependency), Thiáº¿u Quang (campaign persistence), DÆ°Æ¡ng (KPI/AC), Thiáº¿u (QA).

- [x] Cháº¡y `test_growth_lead.py` vÃ  pháº§n learning trong `test_six_roles.py`.
- [ ] Kiá»ƒm tra opportunity â†’ strategy â†’ brief qua durable task/outbox, giá»¯ dependency tá»›i Research artifact.
- [ ] Kiá»ƒm tra `learning.analyze`: phÃ¢n biá»‡t metric 0 vá»›i missing, giá»›i háº¡n iteration/quota vÃ  dedup next task.
- [ ] XÃ¡c nháº­n khÃ´ng tá»± apply campaign/learning; má»i Ä‘á» xuáº¥t dá»«ng á»Ÿ draft hoáº·c human approval.

Done khi káº¿ hoáº¡ch cÃ³ score/rationale/dependency cÃ³ thá»ƒ truy váº¿t, khÃ´ng bá»‹a metric, vÃ  workflow resume sau restart.

### 3. SEO Worker â€” owner Quang Quang

Reviewer: DÆ°Æ¡ng + TrÆ°á»ng (AC/UX chung), Tiáº¿n (editor UI), Thiáº¿u Quang (API), Thiáº¿u (QA).

- [x] Cháº¡y scenario SEO trong `test_six_roles.py`; kiá»ƒm tra citation tá»« Research parent.
- [ ] Bá»• sung test parent khÃ¡c tenant, revoked/stale/tampered vÃ  thiáº¿u evidence.
- [ ] Kiá»ƒm tra title/meta/outline/article, version vÃ  CTA; approval cÅ© pháº£i máº¥t hiá»‡u lá»±c khi source/context Ä‘á»•i.
- [ ] Ná»‘i artifact SEO vÃ o editor vá»›i tráº¡ng thÃ¡i `draft` vÃ  nÃºt approval rÃµ rÃ ng.

Done khi SEO khÃ´ng vÆ°á»£t approval gate, má»i claim cÃ³ citation, vÃ  Content nháº­n Ä‘Æ°á»£c Ä‘Ãºng article/version ref.

### 4. Content Marketing â€” owner Quang Quang

Reviewer: DÆ°Æ¡ng + TrÆ°á»ng (brand/UX chung), Tiáº¿n (social/editor UI), Má»¹ (publisher boundary), Thiáº¿u (QA).

- [x] Cháº¡y scenario Content trong `test_six_roles.py`; kiá»ƒm tra repurpose vÃ  parent artifact.
- [ ] Bá»• sung test asset missing/pending/revoked/foreign; khÃ´ng tá»± táº¡o áº£nh thay cho asset tháº­t.
- [ ] Kiá»ƒm tra social pack, CTA, asset refs, channel variant vÃ  version history.
- [ ] XÃ¡c nháº­n publisher chá»‰ nháº­n ná»™i dung Ä‘Ã£ Ä‘Æ°á»£c ngÆ°á»i cÃ³ quyá»n duyá»‡t.

- [x] Content pack Ä‘Ã£ cÃ³ `target_channels` vÃ  máº·c Ä‘á»‹nh `facebook` + `tiktok`; TikTok thiáº¿u media cÃ´ng khai sáº½ tráº£ `TIKTOK_MEDIA_REQUIRED`.

Done khi Content giá»¯ provenance tá»« SEO/Research, tráº£ tráº¡ng thÃ¡i cáº§n asset khi thiáº¿u vÃ  khÃ´ng gá»i send/publish trá»±c tiáº¿p.

### 5. Community & Lead Intake â€” owner Quang Quang (RAG)

Reviewer: DÆ°Æ¡ng (business rule/consent), Má»¹ + Thiáº¿u Quang (HTTP/lead boundary), Thiáº¿u (QA).

- [x] Cháº¡y community scenario trong `test_six_roles.py`, gá»“m sensitive question vÃ  lead consent.
- [ ] XÃ¡c nháº­n `community.response` dÃ¹ng shared RAG: chá»‰ retrieve approved, published, cÃ¹ng tenant; má»—i cÃ¢u tráº£ lá»i pháº£i cÃ³ source/version/chunk/locator.
- [ ] Bá»• sung test revoke/delete/stale chunk, cÃ¢u há»i khÃ´ng cÃ³ evidence vÃ  prompt injection.
- [ ] Kiá»ƒm tra sensitive fact (giÃ¡, Ä‘á»‹a chá»‰, availability, booking) chuyá»ƒn sang `insufficient_data`/escalation; lead proposal luÃ´n `proposed`, cáº§n consent vÃ  khÃ´ng tá»± send.
- [ ] Cháº¡y end-to-end connector event vá»›i `event_id` dedup, artifact vÃ  audit log; khÃ´ng dÃ¹ng dá»¯ liá»‡u dÃ²ng `Demo` lÃ m evidence.

Done khi Quang Quang cÃ³ dedicated Community handler + RAG evidence, khÃ´ng hallucinate fact vÃ  khÃ´ng cÃ³ Ä‘Æ°á»ng gá»i send/persist lead ngoÃ i executor/approval.

### 6. Performance Marketing â€” owner Quang Quang

Reviewer: Má»¹ (metrics/connectors), Thiáº¿u Quang (snapshot/contract), DÆ°Æ¡ng (KPI), Thiáº¿u (QA).

- [x] Cháº¡y performance scenario trong `test_six_roles.py`; kiá»ƒm tra snapshot vÃ  read-only ads.
- [ ] Kiá»ƒm tra `analytics.report` nháº­n Ä‘Ãºng snapshot artifact, timezone/window vÃ  provenance.
- [ ] Bá»• sung test metric báº±ng 0, metric missing, stale/foreign snapshot vÃ  thiáº¿u lead aggregate.
- [ ] XÃ¡c nháº­n proposal/experiment chá»‰ lÃ  draft; khÃ´ng mutate budget vÃ  khÃ´ng gá»i live spend.
- [ ] Ná»‘i Performance output vÃ o Learning/Growth Lead báº±ng artifact ref vÃ  bounded next task.

Done khi report phÃ¢n biá»‡t zero/missing, khÃ´ng bá»‹a sá»‘, khÃ´ng thay Ä‘á»•i ngÃ¢n sÃ¡ch vÃ  downstream replay Ä‘Æ°á»£c.

## Gate tÃ­ch há»£p sau khi sÃ¡u lane xong

- [x] Cháº¡y full AI suite (**183 passed**), API (**155 passed, 9 skipped**) vÃ  worker (**110 passed, 1 skipped**).
- [x] API/worker/web smoke; migration `008_integration_connections.sql` Ä‘Ã£ Ã¡p dá»¥ng cho PostgreSQL local.
- [x] Worker Ä‘Ã£ cÃ³ `PublishingOutboxRunner`: consume `publishing.scheduled`, defer job tÆ°Æ¡ng lai, recheck approval/version/hash vÃ  ghi published/failed idempotently.
- [ ] Cáº¥p OAuth tháº­t cho Facebook Page/TikTok, probe quyá»n vÃ  ghi `verified_at`; Ä‘áº¿n khi xong cÃ¡c job social váº«n á»Ÿ `manual`.
- [ ] Táº¡o má»™t workspace test cÃ³ approved source, context, CTA vÃ  asset tháº­t; cháº¡y Research â†’ Growth Lead â†’ SEO/Content.
- [ ] Thá»­ Community RAG báº±ng cÃ¢u há»i grounded vÃ  cÃ¢u há»i sensitive; lÆ°u citation, escalation vÃ  consent evidence.
- [ ] Thá»­ Performance vá»›i snapshot cÃ³ `0` vÃ  snapshot missing; kiá»ƒm tra report vÃ  learning task.
- [ ] Ghi handoff gá»“m task ID, contract/prompt version, commit, artifact/run IDs, evidence, reviewer vÃ  blocker.
- [ ] Chá»‰ tick release khi DÆ°Æ¡ng + TrÆ°á»ng xÃ¡c nháº­n AC/UX, Thiáº¿u xÃ¡c nháº­n regression, vÃ  Quang Quang xÃ¡c nháº­n AI output.

## Lá»‡nh kiá»ƒm tra chuáº©n

```powershell
$py = "C:\Users\ADMIN\AppData\Local\Python\bin\python.exe"
& $py -m pytest services/ai/tests -q
Set-Location services/ai
& $py -m evals.six_roles --mode fake --out D:\Hoc\six-role-check.json
Set-Location ..\apps\api
npm.cmd test -- tests/campaignPlans/automation.test.ts
Set-Location ..\worker
npm.cmd test
Set-Location ..\web
npm.cmd test
```
