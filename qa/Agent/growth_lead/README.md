# Growth Lead Agent QA

The QA pytest suite exercises the actual Growth Lead AI agent and API campaign
plan route. It covers input validation and grounding, scoring and KPI
priorities, finding selection, task dependencies, schema boundaries, stale or
unapproved inputs, and retry/error behavior. Test data comes from the
repository's synthetic QQ-04 fixture; no live model, database, external API, or
task queue is used.

Run from the repository root in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\growth_lead\pyproject.toml qa\Agent\growth_lead\tests -v
```

See [TEST_CASES.md](TEST_CASES.md) for the detailed testcase catalog. The
repository also has a separate Growth Lead AI regression suite under
`services/ai/tests/test_growth_lead.py`; its run command is documented there.
