# Content Agent QA

This suite runs the registered Content operation through the AI service's
`/internal/v1/runs` API. It uses a synthetic SEO artifact, approved-source
evidence, isolated SQLite run storage, and a deterministic fake provider. It
does not call an external model, search engine, social network, or image API.

Run the Content Agent QA suite from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\content\pyproject.toml qa\Agent\content\tests -v
```

Result: **33 passed**. Pytest reported one Starlette/httpx deprecation warning.

The existing Content regression tests were also run:

```powershell
.\.venv\Scripts\python.exe -m pytest -c services\ai\pyproject.toml services\ai\tests\test_acceptance_content.py services\ai\tests\test_content_generated_image.py services\ai\tests\test_content_generate_service.py services\ai\tests\test_content_input_validator.py services\ai\tests\test_content_facebook.py services\ai\tests\test_content_repurpose.py services\ai\tests\test_content_sentence_map.py services\ai\tests\test_content_tiktok_and_image.py -q
```

Result: **111 passed, 7 xfailed, 1 skipped**. The xfails are existing,
documented Content gaps; the skipped dedicated `generate_service` case records
that its handler is not wired to the internal API.

The complete list of executed scenarios, their test ids, techniques, and
expected outcomes is in [TEST_CASE.md](TEST_CASE.md).

## Implementation and coverage notes

- The registered `content.generate`, `content.repurpose`, and
  `content.quality_check` operations currently all route to
  `run_content` with `ContentPayload` in `services/ai/src/app/operations.py`.
  The separate `generate_service.py` and `quality_check_service.py` handlers
  are not exercised by these endpoint tests because they are not wired into
  that registry path. In particular, `content.quality_check` currently
  generates a pack rather than returning a dedicated quality verdict.
- Unsupported channel values were previously filtered out and an empty result
  silently defaulted to Facebook and TikTok. The registered pipeline validator
  now rejects unsupported targets with `INVALID_CHANNELS`; case 11 verifies
  that rejection occurs before provider invocation.
- These tests verify the registered Content pipeline's behavior. They do not
  claim that the separate, unregistered Content modules or external publishing
  integrations are covered.
