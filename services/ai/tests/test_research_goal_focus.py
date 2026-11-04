"""Research stays on what the owner asked for (goal focus_offers), found on real TripC runs:
the goal said "food", yet none of the excerpts given to the model mentioned food."""
import json
from uuid import uuid4

from conftest import run_job
from src.app.schemas import Usage
from test_research_trends import long_source_job, signal


class RecordingProvider:
    """Live-like provider: remembers the prompt input and answers with the supplied ideas."""
    model_version = "test/research"
    embedding_model_version = "test/embed"

    def __init__(self, ideas=()):
        self.ideas, self.user = list(ideas), None

    async def chat_json(self, *, user, **kwargs):
        self.user = json.loads(user)
        return json.dumps({"ideas": self.ideas}), Usage(llm_calls=1)


FOOD_CHUNKS = [{"chunk_id": f"food-{i}", "locator": f"paragraph:{200 + i}",
                "text": f"Street food stalls in Da Nang serve expats local dishes number {'abcdefgh'[i]} near the river every evening."}
               for i in range(8)]


def food_goal_job():
    job = long_source_job()
    payload = job["payload"]
    payload["business_profile"]["products"] = ["coworking", "food"]
    payload["snapshot"]["sources"][0]["chunks"] += FOOD_CHUNKS
    payload["goal_context"] = {"objective": "Quảng bá ẩm thực Đà Nẵng cho khách nước ngoài", "focus_offers": ["food"]}
    payload["trend_signals"] = [signal("Coworking spaces in Da Nang for expats"),
                                {**signal("Street food guide for Da Nang expats", rank=2), "query": "Da Nang food expats"}]
    return job


def test_excerpts_about_the_goal_reach_the_model_before_other_topics(make_client):
    provider = RecordingProvider()
    body = run_job(make_client(provider=provider, provider_mode="live"), food_goal_job())
    assert body["status"] == "completed", body
    excerpts = [e["chunk_id"] for e in provider.user["excerpts"]]
    assert excerpts and all(chunk.startswith("food-") for chunk in excerpts[:3]), excerpts


def test_excerpts_an_article_is_already_built_on_do_not_use_up_the_budget(make_client):
    job = food_goal_job()
    cited = [c["chunk_id"] for c in FOOD_CHUNKS[:3]]
    job["payload"]["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": job["workspace_id"], "version": 1,
                                            "title": "Street food in Da Nang", "evidence_chunk_ids": cited}]
    provider = RecordingProvider()
    body = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    excerpts = [e["chunk_id"] for e in provider.user["excerpts"]]
    assert excerpts[:3] == ["food-3", "food-4", "food-5"], excerpts


def food_idea(chunk="food-0", topic="Street food stalls for expats", **changes):
    text = next(c["text"] for c in FOOD_CHUNKS if c["chunk_id"] == chunk)
    return {"topic": topic, "audience_fit": "English-speaking expats want to eat locally.",
            "offer_fit": "TripC can point expats to its food guides.", "rationale": "The excerpt names street food stalls near the river.",
            "chunk_id": chunk, "quote": text, "keywords": ["street food"],
            "user_need": "Find street food stalls near the river.", **changes}


def findings_for(make_client, job, ideas):
    body = run_job(make_client(provider=RecordingProvider(ideas), provider_mode="live"), job)
    assert body["status"] == "completed", body
    return body["result"]


def test_a_model_idea_that_only_misses_its_full_stop_is_kept(make_client):
    # The small model often writes fragments: "English-speaking expats living in Da Nang", with no full stop.
    idea = food_idea(audience_fit="English-speaking expats living in Da Nang", user_need="Find street food stalls near the river")
    out = findings_for(make_client, food_goal_job(), [idea])
    assert "INCOMPLETE_BRIEF_DROPPED" not in out["warnings"] and "GROUNDED_FALLBACK_USED" not in out["warnings"]
    finding = out["result"]["findings"][0]
    assert finding["audience_fit"] == "English-speaking expats living in Da Nang."
    assert "complete_research_explanation" not in out["result"]["missing_facts"]


def test_ideas_repeating_one_quote_count_once(make_client):
    # Real run: three differently titled ideas all quoted the same sentence.
    ideas = [food_idea(topic="Street food stalls for expats"), food_idea(topic="Local dishes by the river"),
             food_idea(chunk="food-1", topic="Evening food markets")]
    out = findings_for(make_client, food_goal_job(), ideas)
    assert [f["topic"] for f in out["result"]["findings"]] == ["Street food stalls for expats", "Evening food markets"]
    assert "DUPLICATE_TOPIC_DROPPED" in out["warnings"]


def test_a_model_idea_whose_evidence_is_not_about_the_goal_is_dropped(make_client):
    # Real run: the model tagged a sentence about housing with the keyword "food" to fit the goal.
    work = next(c for c in food_goal_job()["payload"]["snapshot"]["sources"][0]["chunks"] if c["chunk_id"] == "work")
    idea = food_idea(topic="Coworking spaces for remote expats", keywords=["food"], chunk="food-0")
    idea.update(chunk_id="work", quote=work["text"], offer_fit="TripC can point expats to coworking.",
                rationale="The excerpt says coworking spaces serve remote expats.", user_need="Find coworking spaces for remote work.")
    job = food_goal_job()
    # A cited food chunk keeps "work" inside the excerpt budget of this small fixture.
    job["payload"]["snapshot"]["sources"][0]["chunks"] = [work, *FOOD_CHUNKS[:1]]
    out = findings_for(make_client, job, [idea])
    assert "OFF_GOAL_IDEA_DROPPED" in out["warnings"]
    assert all("oworking" not in f["topic"] for f in out["result"]["findings"])


def test_a_workspace_without_a_goal_focus_keeps_any_supported_idea(make_client):
    work = next(c for c in food_goal_job()["payload"]["snapshot"]["sources"][0]["chunks"] if c["chunk_id"] == "work")
    idea = food_idea(topic="Coworking spaces for remote expats", keywords=["coworking"])
    idea.update(chunk_id="work", quote=work["text"], offer_fit="TripC can point expats to coworking.",
                rationale="The excerpt says coworking spaces serve remote expats.", user_need="Find coworking spaces for remote work.")
    job = food_goal_job()
    job["payload"]["goal_context"] = {"objective": "Grow TripC", "focus_offers": []}
    job["payload"]["snapshot"]["sources"][0]["chunks"] = [work]
    out = findings_for(make_client, job, [idea])
    assert [f["topic"] for f in out["result"]["findings"]] == ["Coworking spaces for remote expats"]


def test_one_food_article_does_not_retire_the_food_topic(make_client):
    # Real run: "Spicy Food Guide" in the inventory made every other food excerpt unusable; Research moved to housing.
    job = food_goal_job()
    job["payload"]["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": job["workspace_id"], "version": 1,
                                            "title": "Spicy Food Guide for Expats", "evidence_chunk_ids": ["food-0"]}]
    out = findings_for(make_client, job, [])
    findings = out["result"]["findings"]
    assert [f["topic"] for f in findings] == ["food"], out["warnings"]
    assert findings[0]["evidence"]["chunk_id"] != "food-0"
    assert "GROUNDED_FALLBACK_USED" in out["warnings"]


def test_research_reports_exhausted_sources_instead_of_drifting_off_the_goal(make_client):
    job = food_goal_job()
    food_ids = [c["chunk_id"] for c in FOOD_CHUNKS]
    job["payload"]["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": job["workspace_id"], "version": 1,
                                            "title": "Street food in Da Nang", "evidence_chunk_ids": food_ids}]
    out = findings_for(make_client, job, [])
    assert out["result"]["findings"] == [], out["result"]["findings"]
    assert out["result"]["status"] == "insufficient_data"
    assert "goal_focus_sources_exhausted:food" in out["result"]["missing_facts"]


def test_an_offer_fit_that_only_names_the_offer_becomes_a_sentence(make_client):
    # Real run: offer_fit came back as the single word "food".
    job = food_goal_job()
    company = job["payload"]["business_profile"]["company"]
    out = findings_for(make_client, job, [food_idea(offer_fit="food")])
    assert out["result"]["findings"][0]["offer_fit"] == f"{company} can relate this topic to its food offering."


def test_a_model_idea_on_the_goal_is_kept_when_an_older_article_shares_the_topic_word(make_client):
    job = food_goal_job()
    job["payload"]["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": job["workspace_id"], "version": 1,
                                            "title": "Spicy Food Guide for Expats", "evidence_chunk_ids": ["food-0"]}]
    out = findings_for(make_client, job, [food_idea(chunk="food-1", topic="food")])
    assert "GROUNDED_FALLBACK_USED" not in out["warnings"], out["warnings"]
    assert out["result"]["findings"][0]["evidence"]["chunk_id"] == "food-1"


def test_search_results_about_other_topics_do_not_use_up_the_prompt(make_client):
    job = food_goal_job()
    job["payload"]["trend_signals"] += [{**signal(f"Coworking list {i}", rank=i + 3)} for i in range(6)]
    provider = RecordingProvider()
    run_job(make_client(provider=provider, provider_mode="live"), job)
    assert {row["query"] for row in provider.user["search_landscape"]} == {"Da Nang food expats"}


FILLER = "The river port handled container ships from three continents during the colonial period and later years. " * 9


def long_food_chunks(count=6):
    return [{"chunk_id": f"long-{i}", "locator": f"paragraph:{300 + i}",
             "text": f"{FILLER}Hai Coi {'abcdef'[i]} is a local house on the main road. Street food stalls there serve expats grilled dishes every evening. {FILLER}"}
            for i in range(count)]


def test_long_excerpts_are_narrowed_to_the_sentences_about_the_goal_so_more_of_them_fit(make_client):
    # Real run: excerpts of ~1000 characters meant only one or two reached the model.
    job = food_goal_job()
    job["payload"]["snapshot"]["sources"][0]["chunks"] = long_food_chunks()
    provider = RecordingProvider()
    assert run_job(make_client(provider=provider, provider_mode="live"), job)["status"] == "completed"
    excerpts = provider.user["excerpts"]
    assert len(excerpts) >= 4, [len(e["text"]) for e in excerpts]
    for excerpt in excerpts:
        assert "Street food stalls there serve expats" in excerpt["text"]
        # The sentence before keeps the name of what the excerpt is about.
        assert "is a local house on the main road." in excerpt["text"]
        assert "container ships" not in excerpt["text"]


def test_a_quote_from_a_narrowed_excerpt_is_checked_against_the_whole_source(make_client):
    job = food_goal_job()
    chunks = long_food_chunks()
    job["payload"]["snapshot"]["sources"][0]["chunks"] = chunks
    quote = "Street food stalls there serve expats grilled dishes every evening."
    idea = {**food_idea(), "chunk_id": chunks[0]["chunk_id"], "quote": quote}
    out = findings_for(make_client, job, [idea])
    finding = out["result"]["findings"][0]
    assert finding["evidence"]["quote"] == quote and finding["evidence"]["chunk_id"] == chunks[0]["chunk_id"]


def test_the_goal_in_the_prompt_carries_only_what_guides_the_ideas(make_client):
    job = food_goal_job()
    job["payload"]["goal_context"]["kpis"] = []
    provider = RecordingProvider()
    run_job(make_client(provider=provider, provider_mode="live"), job)
    assert set(provider.user["goal"]) == {"objective", "focus_offers"}


def test_a_narrowed_excerpt_is_one_unbroken_span_of_the_source(make_client):
    # Real run: the model quoted across two sentences that were not adjacent in the source, so the quote matched nothing.
    job = food_goal_job()
    text = f"Street food stalls open at dusk near the river for expats. {FILLER}Street food carts close at midnight near the bridge. {FILLER}"
    job["payload"]["snapshot"]["sources"][0]["chunks"] = [{"chunk_id": "gap", "locator": "paragraph:1", "text": text}]
    provider = RecordingProvider()
    run_job(make_client(provider=provider, provider_mode="live"), job)
    excerpt = provider.user["excerpts"][0]["text"]
    assert excerpt in " ".join(text.split()) and "Street food" in excerpt


def test_a_quote_joining_separate_sentences_keeps_the_part_found_in_the_source(make_client):
    job = food_goal_job()
    chunks = long_food_chunks()
    job["payload"]["snapshot"]["sources"][0]["chunks"] = chunks
    real = "Street food stalls there serve expats grilled dishes every evening."
    idea = {**food_idea(), "chunk_id": chunks[0]["chunk_id"], "quote": f"Hai Coi a is a local gem. {real}"}
    out = findings_for(make_client, job, [idea])
    assert out["result"]["findings"][0]["evidence"]["quote"] == real
    assert "UNGROUNDED_IDEA_DROPPED" not in out["warnings"]


def test_evidence_gets_prompt_room_before_search_titles_and_old_article_titles(make_client):
    job = food_goal_job()
    payload = job["payload"]
    payload["snapshot"]["sources"][0]["chunks"] = long_food_chunks()
    payload["trend_signals"] = [{**signal(f"Street food guide number {i} for people moving to Da Nang this year", rank=i + 1), "query": "Da Nang food expats"} for i in range(20)]
    payload["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": job["workspace_id"], "version": 1,
                                     "title": f"An older article about something else entirely in the city, part {i}"} for i in range(12)]
    provider = RecordingProvider()
    assert run_job(make_client(provider=provider, provider_mode="live"), job)["status"] == "completed"
    assert len(provider.user["excerpts"]) >= 5, len(provider.user["excerpts"])


def test_lessons_from_learning_reach_the_model_and_steer_which_excerpts_it_reads(make_client):
    # Learning used to stop at a report: the next round started as if nothing had been measured.
    job = food_goal_job()
    market = {"chunk_id": "market", "locator": "paragraph:400", "text": "Evening seafood markets sell local food to expats near the bridge every weekend."}
    job["payload"]["snapshot"]["sources"][0]["chunks"].append(market)
    lessons = {"promising_titles": ["Evening seafood markets for expats"], "weak_titles": ["Coworking spaces in Da Nang"]}
    job["payload"]["lessons"] = lessons
    provider = RecordingProvider()
    assert run_job(make_client(provider=provider, provider_mode="live"), job)["status"] == "completed"
    assert provider.user["lessons"] == lessons
    assert provider.user["excerpts"][0]["chunk_id"] == "market"


def test_a_round_without_lessons_prompts_as_before(make_client):
    provider = RecordingProvider()
    run_job(make_client(provider=provider, provider_mode="live"), food_goal_job())
    assert "lessons" not in provider.user


def test_list_numbers_do_not_reach_the_excerpts_the_model_reads(make_client):
    # Real run: topic "...at 12 Thìa Gỗ Restaurant" and title "12 Thìa Gỗ Restaurant Da Nang: ...".
    job = food_goal_job()
    job["payload"]["snapshot"]["sources"][0]["chunks"] = [{"chunk_id": "list", "locator": "paragraph:1",
        "text": "12 Hai Coi Restaurant, 53 Phan Street. Street food stalls serve expats here (updated Jan 2023). 13 Quiet Corner serves local dishes."}]
    provider = RecordingProvider()
    run_job(make_client(provider=provider, provider_mode="live"), job)
    text = provider.user["excerpts"][0]["text"]
    assert text.startswith("Hai Coi Restaurant") and "13 Quiet" not in text and "updated Jan" not in text


def test_a_quote_from_a_cleaned_excerpt_still_matches_the_source(make_client):
    job = food_goal_job()
    source = "12 Hai Coi Restaurant, 53 Phan Street. Street food stalls serve expats grilled dishes every evening."
    job["payload"]["snapshot"]["sources"][0]["chunks"] = [{"chunk_id": "list", "locator": "paragraph:1", "text": source}]
    quote = "Street food stalls serve expats grilled dishes every evening."
    out = findings_for(make_client, job, [{**food_idea(), "chunk_id": "list", "quote": quote}])
    assert out["result"]["findings"][0]["evidence"]["quote"] == quote
