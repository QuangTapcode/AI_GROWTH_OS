# Standalone agent report: seo

- **Generated:** 2026-10-21T16:53:44.075495+00:00
- **Mode:** `fake`
- **Operation:** `seo.local_draft`
- **Verdict:** `PASS`
- **Synthetic fixture:** `True`

## Input

- Workspace: `00000000-0000-4000-8000-000000000001`
- Context snapshot: `00000000-0000-4000-8000-000000000003`
- Prerequisites generated locally: `1`

## Output

- Artifact ID: `a806a2ea-3669-5dc3-a77b-47acc607033f`
- Version/hash: `1` / `a3bb281b34d26396fcd34ab4f82f031c680467f5148508a78735b6c9231bab23`
- Status: `draft`
- Applied: `False`
- Citations: `1`

## Acceptance checks

- [x] synthetic_is_explicit: Fixture output is marked synthetic
- [x] human_approval_required: Output cannot bypass owner approval
- [x] not_applied: Agent did not apply/send/publish changes
- [x] draft_only: status=draft
- [x] has_article_fields: Title, meta and body exist
- [x] has_citations: SEO claims include evidence citations
- [x] seo_checks_pass: SEO checks all pass

## Full payload

See the sibling `.json` file for the exact request, result, evidence, usage, prompt/model versions and artifact hash.
