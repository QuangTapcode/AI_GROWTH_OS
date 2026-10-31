import json
from uuid import uuid4

from conftest import run_job
from src.app.schemas import Usage
from test_research import research_job


def signal(title, rank=1, observed_at="2026-10-01T00:00:00Z"):
    return {"signal_id": str(uuid4()), "query": "Da Nang coworking", "rank": rank, "title": title,
            "url": f"https://blog.example/{rank}", "domain": "blog.example", "observed_at": observed_at}


def long_source_job():
    job = research_job()
    profile = job["payload"]["business_profile"]
    profile.update(products=["coworking"], locations=["Da Nang"], audiences=["English-speaking expats"])
    chunks = [{"chunk_id": f"nav-{i}", "text": f"Jump to content. Contents section {i}. History of the river port.",
               "locator": f"paragraph:{i}"} for i in range(8)]
    chunks.append({"chunk_id": "work", "text": "Coworking spaces in Da Nang serve expats who work remotely near the beach.",
                   "locator": "paragraph:99"})
    job["payload"]["snapshot"]["sources"][0]["chunks"] = chunks
    return job


class LandscapeProvider:
    """Live-like provider that records the prompt input and cites the excerpt it was given."""
    model_version = "test/research"
    embedding_model_version = "test/embed"

    def __init__(self):
        self.user = None

    async def chat_json(self, *, user, **kwargs):
        self.user = json.loads(user)
        excerpt = next(x for x in self.user["excerpts"] if x["chunk_id"] == "work")
        idea = {"topic": "Coworking spaces for remote-working expats", "audience_fit": "Expats need a workspace.",
                "offer_fit": "TripC lists coworking options.", "rationale": "The excerpt says coworking spaces serve remote expats.",
                "chunk_id": "work", "quote": excerpt["text"], "keywords": ["coworking", "remote work"],
                "user_need": "Find a reliable place to work remotely."}
        return json.dumps({"ideas": [idea]}), Usage(llm_calls=1)


def test_relevant_excerpt_wins_budget_over_page_order(client, make_client):
    job = long_source_job()
    provider = LandscapeProvider()
    # Six excerpts fit the default budget; the relevant chunk is ninth in page order.
    body = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    assert provider.user["excerpts"][0]["chunk_id"] == "work"


def test_trend_signals_reach_prompt_and_attach_to_matching_findings(client, make_client):
    job = long_source_job()
    job["payload"]["trend_signals"] = [signal("Best coworking spaces in Da Nang for remote workers", rank=1),
                                       signal("Da Nang weather in October", rank=2)]
    provider = LandscapeProvider()
    body = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    landscape = provider.user["search_landscape"]
    assert [row["rank"] for row in landscape] == [1, 2] and set(landscape[0]) == {"query", "rank", "title", "domain", "movement"}
    assert landscape[0]["movement"] == "first_observation"
    finding = body["result"]["result"]["findings"][0]
    # Only the coworking result shares the finding's terms; the city name alone is not a match.
    assert [s["title"] for s in finding["trend_signals"]] == ["Best coworking spaces in Da Nang for remote workers"]
    assert finding["confidence"] == "hypothesis" and finding["demand_estimate"] is None


def test_future_trend_signal_is_rejected_before_provider(client):
    job = research_job()
    job["payload"]["trend_signals"] = [signal("Coworking", observed_at="2999-01-01T00:00:00Z")]
    response = client.post("/internal/v1/runs", json=job)
    assert response.status_code == 422 and "INVALID_TREND_SIGNAL" in response.text


def test_quote_matching_tolerates_case_and_spacing_but_stores_the_source_span():
    from src.agents.research.pipeline import exact_quote
    text = "Coworking  spaces in Da Nang\nserve expats who work remotely."
    assert exact_quote("coworking spaces in da nang serve EXPATS", text) == "Coworking  spaces in Da Nang\nserve expats"
    assert exact_quote("Coworking spaces in Hoi An", text) is None
    assert exact_quote("   ", text) is None


def test_movement_labels_rank_changes_between_runs():
    from src.agents.research.pipeline import movement
    from src.agents.research.schemas import TrendSignal
    base = signal("Coworking in Da Nang", rank=2)
    assert movement(TrendSignal(**base)) == "first_observation"
    assert movement(TrendSignal(**base, previous_rank=6)) == "up 4"
    assert movement(TrendSignal(**base, previous_rank=1)) == "down 1"
    assert movement(TrendSignal(**base, previous_rank=2)) == "same"
    assert movement(TrendSignal(**base, is_new=True)) == "new"


class ClaimProvider(LandscapeProvider):
    def __init__(self, **override):
        super().__init__(); self.override = override

    async def chat_json(self, *, user, **kwargs):
        content, usage = await super().chat_json(user=user, **kwargs)
        draft = json.loads(content)
        draft["ideas"][0].update(self.override)
        return json.dumps(draft), usage


def test_heading_quotes_and_demand_claims_are_dropped(client, make_client):
    weak = run_job(make_client(provider=ClaimProvider(quote="Coworking spaces in Da Nang"), provider_mode="live"), long_source_job())
    assert weak["result"]["result"]["findings"] == [] and "WEAK_QUOTE_DROPPED" in weak["result"]["warnings"]
    claim = run_job(make_client(provider=ClaimProvider(user_need="Serve the strong expat demand for coworking."), provider_mode="live"), long_source_job())
    assert claim["result"]["result"]["findings"] == [] and "DEMAND_CLAIM_DROPPED" in claim["result"]["warnings"]


def test_rationale_about_search_results_is_dropped(client, make_client):
    out = run_job(make_client(provider=ClaimProvider(rationale="Coworking guides rank first in search results."), provider_mode="live"), long_source_job())
    assert out["result"]["result"]["findings"] == [] and "LANDSCAPE_CLAIM_DROPPED" in out["result"]["warnings"]


def test_signal_matching_ignores_the_city_name_and_duplicate_urls():
    from src.agents.research.pipeline import matching_signals
    from src.agents.research.schemas import TrendSignal
    same = signal("Coworking spaces in Da Nang", rank=1)
    rows = [TrendSignal(**same), TrendSignal(**{**same, "signal_id": str(uuid4()), "rank": 6}),
            TrendSignal(**signal("Da Nang weather in October", rank=2))]
    matched = matching_signals(rows, "Coworking for remote expats", ["coworking"], ["Da Nang"])
    assert [(s.title, s.rank) for s in matched] == [("Coworking spaces in Da Nang", 1)]


def test_trend_topics_without_source_text_are_reported_as_gaps(client, make_client):
    job = long_source_job()
    job["payload"]["trend_signals"] = [{**signal("Best coworking spaces in Da Nang", rank=1), "query": "Da Nang coworking expats"},
                                       {**signal("Furnished apartment rentals", rank=1), "query": "Da Nang apartment expats"}]
    body = run_job(make_client(provider=LandscapeProvider(), provider_mode="live"), job)
    result = body["result"]["result"]
    coverage = {c["topic"]: c["covered_chunks"] for c in result["trend_coverage"]}
    assert coverage == {"coworking": 1, "apartment": 0}
    assert "source_gap:apartment" in result["missing_facts"] and "source_gap:coworking" not in result["missing_facts"]


def test_quote_words_link_a_finding_to_ranking_titles_only_with_two_shared_terms():
    from src.agents.research.pipeline import DEMAND_CLAIM, matching_signals
    from src.agents.research.schemas import TrendSignal
    rows = [TrendSignal(**signal("Furnished Apartment Da Nang: Long-Term Rental Guide (2026)", rank=7)),
            TrendSignal(**signal("Living in Da Nang: the ultimate expat guide", rank=3))]
    quote = "Conical Hats Homestay is a family-run, budget, long-term homestay also available for weekly rentals."
    matched = matching_signals(rows, "Budget homestays for expats", ["homestay"], ["Da Nang"], quote)
    assert [s.rank for s in matched] == [7]
    assert DEMAND_CLAIM.search("TripC housing matches the demand for homestays.")
    assert not DEMAND_CLAIM.search("The excerpt supports a hypothesis; demand is not measured.")


def test_old_listing_evidence_is_flagged_but_kept(client, make_client):
    job = long_source_job()
    work = job["payload"]["snapshot"]["sources"][0]["chunks"][-1]
    work["text"] += " Email them for details. (updated Jan 2018)"
    body = run_job(make_client(provider=LandscapeProvider(), provider_mode="live"), job)
    result = body["result"]["result"]
    assert result["findings"][0]["evidence_updated"] == 2018
    assert "stale_evidence:2018" in result["missing_facts"] and result["status"] == "ready_for_handoff"
