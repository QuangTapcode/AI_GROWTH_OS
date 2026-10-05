# Ví dụ request/response và bàn giao cho TripC

[Data/flows](DATA-AND-FLOWS.md) · [Checklist W1–W4](README.md). Tất cả dữ liệu dưới đây **synthetic**, field/API là draft để consumer review; chưa phải JSON Schema đã freeze. Không dùng giá/địa chỉ hay metrics minh họa làm facts/báo cáo pilot thật. UUID được dùng để các bên viết mock/stub/test cùng nhãn; cùng record phải giữ tenant/versions.

## 1. Profile và goal — Dương → Mỹ → Tiến → Thanh

Mỹ đặc tả GET/PATCH business profile; Tiến form có các fields bên dưới, không tự gán website URL khi chưa có. Thiệu Quang kiểm quyền/version; Dương chốt required/nullability. Example response:

```json
{
  "synthetic": true,
  "workspace_id": "10000000-0000-4000-8000-000000000001",
  "version": 1,
  "company_name": "TripC",
  "website_url": null,
  "industry": "Travel and local living services",
  "locations": ["Da Nang"],
  "content_area_labels": ["Son Tra", "Hai Chau", "My Khe"],
  "audiences": ["English-speaking expats living in or moving to Da Nang"],
  "language": "en",
  "topic_priorities": ["housing", "coworking", "fitness", "food", "events"],
  "brand_voice": "Helpful, clear and factual",
  "brand_claims_status": "needs_owner_review"
}
```

POST goals draft request, numeric target chưa được người dùng chốt:

```json
{
  "synthetic": true,
  "objective": "Generate information-request leads from English housing content",
  "primary_metric": "persisted_leads",
  "baseline": null,
  "target": null,
  "target_kind": "absolute",
  "period": {"from": "2026-10-05", "to": "2026-11-03"},
  "audience": "English-speaking expats",
  "location": "Da Nang",
  "conversion": "lead_form_persisted",
  "budget": {"paid_api_limit": 0, "currency": "USD"},
  "status": "draft"
}
```

Các ngày là range fixture, không xác nhận kickoff thực tế. Thanh assert Save→GET giữ null baseline/target; đổi period to trước from→422 field error, Viewer POST→403; UI không hiện 0 hay %+growth khi baseline null.

## 2. Source → RAG — Thiệu Quang/Mỹ → Quang Quang → Huyền/Thanh

Source record ở trạng thái reviewed, fact không có giá:

```json
{
  "synthetic": true,
  "id": "10000000-0000-4000-8000-000000000003",
  "workspace_id": "10000000-0000-4000-8000-000000000001",
  "kind": "text",
  "category": "housing",
  "version": 1,
  "status": "approved",
  "facts": [
    {"key": "residence_name", "value": "Example Residence", "source_version": 1, "locator": "paragraph:1"},
    {"key": "monthly_rent", "value": null, "unit": "VND/month", "verification": "missing"}
  ]
}
```

Question “How much is the monthly rent?” expected AI response draft:

```json
{
  "synthetic": true,
  "answer": "The available sources do not include a verified monthly rent.",
  "evidence": [],
  "warnings": ["MISSING_VERIFIED_PRICE"],
  "missing_fact_keys": ["monthly_rent"]
}
```

Hỏi residence name thì phải có source ID/version/locator, không đưa source của tenant B. Revoke/delete SRC-HOUSING rồi chạy lại: no citation to source3, stale embeddings cache không được trả; source endpoint404/removed state theo contract chốt. Huyền render warnings/source status, không ghi “rent is free” vì null.

## 3. Brief → draft → approval — Dương/AI → Thiệu Quang → Huyền

Approved brief payload tối thiểu generation:

```json
{
  "synthetic": true,
  "id": "10000000-0000-4000-8000-000000000007",
  "workspace_id": "10000000-0000-4000-8000-000000000001",
  "version": 2,
  "status": "approved",
  "opportunity_id": "10000000-0000-4000-8000-000000000005",
  "plan_id": "10000000-0000-4000-8000-000000000006",
  "title": "Choosing an area to live in Da Nang",
  "primary_keyword": "where to live in Da Nang",
  "audience": "English-speaking expats",
  "search_intent": "informational",
  "angle": "A checklist for choosing an area before requesting more information",
  "unique_value": "Verified local details and clear gaps requiring confirmation",
  "fact_source_versions": [{"source_id": "10000000-0000-4000-8000-000000000003", "version": 1}],
  "cta": "Get the Da Nang living guide",
  "destination": "/living-in-da-nang",
  "format": "guide",
  "channel": "website",
  "language": "en"
}
```

Generation dùng brief v2, source v1; user edits content v1→v2 sau generation. Approval request gửi `expected_version=2`, actor lấy từ session. Publishing job gửi approved_version2/hash không phải current_version tự đoán. Thanh run:

| Thao tác | Expected result |
| --- | --- |
| Brief draft v1 generate | Denied/not approved, không provider call |
| Hai PATCH content cùng expected_version1 | Một request thành v2, request sau409 giữ input để resolve |
| Approve content v2 rồi edit thànhv3 | Approval v2 invalid, contentv3 draft/needs review theo state chốt |
| Publish queuedv2 sau editv3/source revoke | Failed with stale/invalid approval code, không public snapshot mới |
| Restore bodyv1 khi currentv3 | New versionv4, historyv1/v2/v3 không sửa |
| Worker generationv1 trở về sau human editv4 | Stale result lưu riêng/discard theo policy, không overwrite v4 |

## 4. Visitor form — Mỹ → Tiến → Thanh

Proposed POST `/public/v1/sites/tripc-pilot/leads`, header `Idempotency-Key: synthetic-submit-001`. Site slug là routing fixture, không phải public domain đã hoạt động.

```json
{
  "synthetic": true,
  "email": "qa@example.test",
  "name": "Example Visitor",
  "interest_topic": "housing",
  "consent": {"accepted": true, "policy_version": "draft-1"},
  "context": {
    "visitor_id": "synthetic-visitor-001",
    "content_id": "10000000-0000-4000-8000-000000000008",
    "campaign_id": "synthetic-housing-001",
    "assignment_id": "10000000-0000-4000-8000-000000000015",
    "utm_source": "community",
    "utm_medium": "referral",
    "utm_campaign": "da-nang-living",
    "utm_content": "housing-guide"
  }
}
```

Response **sau DB transaction thành công**, create201 / same-payload retry200 là proposal cần schema chốt:

```json
{
  "synthetic": true,
  "submission_id": "10000000-0000-4000-8000-000000000020",
  "status": "persisted",
  "deduplicated": false
}
```

Không echo email/name trong analytics response/event. Same key+payload trả same submission_id/deduplicatedtrue; same key khác email/topic trả409, không tạo record khác. Consentfalse/invalidemail→422. DB failure→5xx, không submission/outcome/GA4 success event.

Tiến sau persisted response mới show “Thanks — your request has been received.”; event `generate_lead` chỉ fields allowlist như content/campaign/variant/event ID theo policy, không email/name. Thanh kiểm browser network/HTML/logs và SQL row count=1 sau double-submit/retry.

## 5. Report và experiment — Mỹ → AI → Tiến/Huyền → Thanh

Deterministic report input example:

```json
{
  "synthetic": true,
  "source": "fixture",
  "snapshot_ids": ["METRIC-P1", "METRIC-P2"],
  "sessions": {"baseline": 100, "current": 120, "delta": 20, "percentage_change": 20},
  "persisted_leads": {"baseline": 5, "current": 6, "delta": 1, "percentage_change": 20},
  "form_conversion_rate": {"baseline": 0.05, "current": 0.05, "unit": "ratio"},
  "limitations": ["SYNTHETIC_DATA_NOT_LIVE_PERFORMANCE"]
}
```

UI hiển thị rate5%, không 0.05%; “lead count +20%” đúng, “conversion rate +20%” sai. LLM report không chứng minh housing gây tăng traffic vì số fixture có sẵn; CTA experiment metrics/ranges độc lập phải có sample restrictions.

Experiment result fixture:

```json
{
  "synthetic": true,
  "primary_metric": "persisted_leads",
  "denominator": "eligible_exposures",
  "variants": [
    {"id": "A", "exposures": 10, "outcomes": 1, "rate": 0.1},
    {"id": "B", "exposures": 10, "outcomes": 2, "rate": 0.2}
  ],
  "conclusion": "insufficient_evidence",
  "winner": null,
  "limitations": ["SMALL_SAMPLE", "NO_SIGNIFICANCE_ENGINE_IN_PILOT"]
}
```

BA chốt eligible exposures/outcome window/consent policy; result không được tự đổi denominator thành GA4 sessions hay CTA clicks. Event duplicate không tăng exposures/outcomes. Consent/assignment unavailable có fallback default CTA và không claim experiment measurement đầy đủ.

## 6. Learning → strategy version — Mỹ/AI → Thiệu Quang → Huyền

Insight đề xuất “prioritize housing guides in next plan” phải giữ pinned evidence/samples/ranges và limitations, không tự apply. Approve draft request:

```json
{
  "synthetic": true,
  "expected_insight_version": 1,
  "expected_strategy_version": 2,
  "decision": "approve",
  "reason": "Accept this limited proposal; do not claim causal uplift."
}
```

Server lấy actor từ session, transaction tạo strategyv3 + application audit insight→v2→v3. Same approval replay trả cùngv3, khôngv4; nếu strategy đãv4 trước request→409 và cần review lại. Huyền show applied/newversion only server confirms; Thanh assert one application/audit/new strategy and no unauthorized AI direct mutation.
