# Research Agent QA

The suite covers both the Research AI pipeline and API search discovery.
Scenarios combine Equivalence Partitioning, Boundary Value Analysis, Decision
Table Testing, and State Transition Testing where they apply; they are not
split into technique-specific files. See [TEST_CASES.md](TEST_CASES.md) for
the detailed scenario catalog.

`tests/test_research_agent.py` runs the real AI service API and Research
pipeline with a deterministic test provider. It does not call an external
model, database, or search provider.

Run the offline suite from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\research\pyproject.toml qa\Agent\research\tests -v
```

AC-01 and AC-02 also support an opt-in live search/source check. With the local
SearXNG service running, enable it in PowerShell:

```powershell
$env:RESEARCH_LIVE_SEARCH = "1"
$env:SEARXNG_URL = "http://127.0.0.1:18081"
.\.venv\Scripts\python.exe -m pytest -c qa\Agent\research\pyproject.toml qa\Agent\research\tests -v
```

The test calls the actual backend query, search, source-policy, and freshness
functions through the local `tsx` harness. Offline search responses are served
by a loopback-only stub. Live checks require SearXNG and Internet access; they
verify that the expected source is in the top five and that its page supports
the expected fact.

The existing Research AI regression tests can also be run from the repository
root:

```powershell
.\.venv\Scripts\python.exe -m pytest -c services\ai\pyproject.toml services\ai\tests\test_research.py services\ai\tests\test_research_quality.py services\ai\tests\test_research_trends.py services\ai\tests\test_research_goal_focus.py services\ai\tests\test_research_customer_signals.py -v
```
