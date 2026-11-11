# SEO Worker QA

The suite exercises the deployed `seo.local_draft` pipeline through the AI
service's internal run API. It creates a real synthetic Research artifact,
then supplies a deterministic provider response so source selection,
grounding, validation, article assembly, and handoff rules still run through
production code without contacting a model, search engine, or database.

Run the offline QA suite from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\seo\pyproject.toml qa\Agent\seo\tests -v
```

Run the existing SEO pipeline regressions:

```powershell
.\.venv\Scripts\python.exe -m pytest -c services\ai\pyproject.toml services\ai\tests\test_acceptance_seo.py services\ai\tests\test_seo_depth.py services\ai\tests\test_seo_headings.py -v
```

See [TEST_CASES.md](TEST_CASES.md) for the combined EP, BVA, Decision Table,
and State Transition scenarios, plus known operation gaps.
