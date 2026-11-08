"""A useful article needs more than one excerpt: on real TripC runs articles were 104-153 words from one chunk."""
import json

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, request
from src.app.schemas import Usage

PRIMARY = "The guide compares living areas for newcomers."


class RecordingSections:
    model_version = "test/seo"
    embedding_model_version = "test/embed"

    def __init__(self, sections=None):
        self.sections, self.user = sections, None

    async def chat_json(self, *, user, **kwargs):
        self.user = json.loads(user)
        sections = self.sections or [{"heading": "Living areas", "body": PRIMARY},
                                     {"heading": "Next steps", "body": "Compare the living areas before choosing."}]
        return json.dumps({"title": "Living areas guide", "meta_description": "A cited guide to living areas.",
                           "sections": sections}), Usage(llm_calls=1)


def seo_job(client, extra_chunks):
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"] += extra_chunks
    research = run_job(client, base)["result"]
    return request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"})


def chunk(chunk_id, text):
    return {"chunk_id": chunk_id, "text": text, "locator": f"mock:{chunk_id}"}


def test_the_article_is_written_from_several_approved_excerpts_about_the_topic(client, make_client):
    provider = RecordingSections()
    job = seo_job(client, [chunk("related", "Living areas near the river suit newcomers who want quiet streets and short walks to shops."),
                           chunk("unrelated", "The port handles container ships from three continents each week."),
                           chunk("priced", "Living areas for newcomers cost $300 per month on average.")])
    out = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert out["status"] == "completed", out
    passage = provider.user["source_passage"]
    assert passage.startswith(PRIMARY) and "quiet streets" in passage
    assert "container ships" not in passage and "$300" not in passage
    result = out["result"]["result"]
    assert [c["chunk_id"] for c in result["citations"]] == ["mock-guide", "related"]
    assert all(c["quote"] for c in result["citations"])
    # Two excerpts of one page are one source for the reader.
    assert result["body_markdown"].count("[source:") == 1


def test_list_numbers_and_update_stamps_from_listing_pages_do_not_reach_the_article(client, make_client):
    # Real run: "11 Cơm Nhà Linh, located at 35 An Thượng 26 ... Updated January 2023."
    sections = [{"heading": "Living areas", "body": "11 Living areas house, located at 35 An Thuong 26, suits newcomers. Updated January 2023."},
                {"heading": "Next steps", "body": "The guide compares living areas for newcomers. 12 Quiet living areas suit newcomers too."}]
    provider = RecordingSections(sections)
    job = seo_job(client, [chunk("listing", "11 Living areas house, 35 An Thuong 26. Suits newcomers (updated Jan 2023). 12 Quiet living areas suit newcomers too.")])
    out = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert out["status"] == "completed", out
    body = out["result"]["result"]["body_markdown"]
    assert "Living areas house, located at 35 An Thuong 26, suits newcomers." in body
    assert "11 Living" not in body and "12 Quiet" not in body and "Updated" not in body


def test_a_sentence_drifting_into_another_script_does_not_reach_the_article(client, make_client):
    sections = [{"heading": "Living areas", "body": f"{PRIMARY} Newcomers compare living areas 机会"},
                {"heading": "Next steps", "body": "Compare the living areas before choosing."}]
    out = run_job(make_client(provider=RecordingSections(sections), provider_mode="live"), seo_job(client, []))
    assert out["status"] == "completed", out
    assert "机会" not in out["result"]["result"]["body_markdown"]
    assert PRIMARY in out["result"]["result"]["body_markdown"]


def test_list_numbers_are_removed_from_the_excerpts_the_model_reads(client, make_client):
    # Real run: "Other notable spots include 12 Thìa Gỗ Restaurant": mid-sentence, so only the source can be cleaned.
    provider = RecordingSections()
    job = seo_job(client, [chunk("listing", "11 Living areas house, 35 An Thuong 26. Suits newcomers (updated Jan 2023). 12 Quiet living areas suit newcomers too.")])
    assert run_job(make_client(provider=provider, provider_mode="live"), job)["status"] == "completed"
    passage = provider.user["source_passage"]
    assert "Living areas house, 35 An Thuong 26." in passage
    assert "11 Living" not in passage and "12 Quiet" not in passage and "updated Jan" not in passage


def test_title_and_meta_are_shortened_on_a_word_boundary_not_cut_by_the_model_limit(client, make_client):
    # Ollama enforces schema limits while generating, so maxLength=160 stopped the meta mid-phrase on real runs.
    class LongHeadProvider(RecordingSections):
        async def chat_json(self, **kwargs):
            text, usage = await super().chat_json(**kwargs)
            draft = json.loads(text)
            draft["title"] = "Living areas guide comparing living areas for newcomers and the quiet streets near the river"
            draft["meta_description"] = ("The guide compares living areas for newcomers. " * 5).strip()
            return json.dumps(draft), usage
    out = run_job(make_client(provider=LongHeadProvider(), provider_mode="live"), seo_job(client, []))
    assert out["status"] == "completed", out
    result = out["result"]["result"]
    assert len(result["title"]) <= 70 and not result["title"].endswith(("the", "and", "for", "near"))
    assert len(result["meta_description"]) <= 160 and result["meta_description"].endswith(".")


def test_a_title_does_not_start_with_a_list_number(client, make_client):
    class NumberedTitle(RecordingSections):
        async def chat_json(self, **kwargs):
            text, usage = await super().chat_json(**kwargs)
            return json.dumps({**json.loads(text), "title": "12 Living Areas House Da Nang: A Guide"}), usage
    out = run_job(make_client(provider=NumberedTitle(), provider_mode="live"), seo_job(client, [chunk("listing", "12 Living Areas House, 35 An Thuong.")]))
    assert out["result"]["result"]["title"] == "Living Areas House Da Nang: A Guide"


class ScriptedDrafts:
    """One draft per call; the last repeats if the service asks again."""
    model_version = "test/seo"
    embedding_model_version = "test/embed"

    def __init__(self, *bodies):
        self.bodies, self.systems = list(bodies), []

    async def chat_json(self, *, system, **kwargs):
        body = self.bodies[min(len(self.systems), len(self.bodies) - 1)]
        self.systems.append(system)
        half = len(body) // 2
        return json.dumps({"title": "Living areas guide", "meta_description": "A cited guide to living areas.",
                           "sections": [{"heading": "Living areas", "body": " ".join(body[:half]) or PRIMARY},
                                        {"heading": "Next steps", "body": " ".join(body[half:])}]}), Usage(llm_calls=1)


def sentences(words):
    # PRIMARY is seven words, and every one of them is in the approved source.
    return [PRIMARY] * (words // 7)


def article(client, make_client, provider, **settings):
    job = seo_job(client, [])
    job["constraints"] = {**job.get("constraints", {}), "timeout_seconds": 600}
    return run_job(make_client(provider=provider, provider_mode="live", **settings), job)


def spoken_words(result):
    # Counted as the public site counts them before it accepts an article.
    return sum(len(line.split()) for line in result["body_markdown"].splitlines()
               if line.strip() and not line.startswith(("#", "[source:", "[Request information]")))


def test_a_draft_of_good_length_takes_one_call_and_goes_to_review(client, make_client):
    provider = ScriptedDrafts(sentences(280))
    out = article(client, make_client, provider)
    assert len(provider.systems) == 1
    assert out["result"]["result"]["status"] == "draft" and out["result"]["result"]["missing_facts"] == []


def test_a_short_draft_is_asked_once_for_more_detail_and_the_longer_article_is_kept(client, make_client):
    provider = ScriptedDrafts(sentences(70), sentences(280))
    result = article(client, make_client, provider)["result"]["result"]
    assert len(provider.systems) == 2 and "70 words" in provider.systems[1]
    assert spoken_words(result) == 280 and result["status"] == "draft"


def test_a_second_draft_that_came_out_shorter_does_not_replace_the_first(client, make_client):
    provider = ScriptedDrafts(sentences(196), sentences(70))
    result = article(client, make_client, provider)["result"]["result"]
    assert spoken_words(result) == 196 and result["status"] == "draft"


def test_an_article_still_under_the_public_minimum_is_held_with_the_reason(client, make_client):
    provider = ScriptedDrafts(sentences(70), sentences(84))
    out = article(client, make_client, provider)["result"]
    assert spoken_words(out["result"]) == 84
    assert out["result"]["status"] == "insufficient_data" and out["result"]["missing_facts"] == ["article_too_short"]
    assert "ARTICLE_TOO_SHORT:84" in out["warnings"]


def test_a_longer_draft_with_an_invented_number_cannot_cost_the_first_article(client, make_client):
    provider = ScriptedDrafts(sentences(196), [*sentences(280), "Newcomers compare 24 living areas."])
    out = article(client, make_client, provider)["result"]
    assert spoken_words(out["result"]) == 196 and out["result"]["status"] == "draft"
    assert "SEO_EXPANSION_SKIPPED:UNSUPPORTED_CONTENT_CLAIM" in out["warnings"]


def test_no_more_calls_are_made_when_a_slow_one_would_hit_the_job_deadline(client, make_client):
    provider = ScriptedDrafts(sentences(70), sentences(280))
    out = article(client, make_client, provider, provider_timeout_seconds=900)["result"]
    assert len(provider.systems) == 1
    assert out["result"]["missing_facts"] == ["article_too_short"]


def test_a_too_short_article_holds_the_social_pack_written_from_it(client, make_client):
    # Reviewers see the reason on the pack too; neither can be approved automatically.
    job = seo_job(client, [])
    job["constraints"] = {**job.get("constraints", {}), "timeout_seconds": 600}
    seo = run_job(make_client(provider=ScriptedDrafts(sentences(70)), provider_mode="live"), job)["result"]
    pack = run_job(client, request(job, "content.repurpose", {"source_article": artifact_input(seo), "cta": "Request the guide",
                                                              "target_channels": ["facebook"]}))["result"]["result"]
    assert pack["status"] == "insufficient_data" and pack["missing_facts"] == ["article_too_short"]


class RecordingLimit(ScriptedDrafts):
    def __init__(self, *bodies):
        super().__init__(*bodies)
        self.limits = []

    async def chat_json(self, *, max_output_tokens, **kwargs):
        self.limits.append(max_output_tokens)
        return await super().chat_json(max_output_tokens=max_output_tokens, **kwargs)


def test_the_model_has_room_for_a_cited_article_of_good_length(client, make_client):
    # Real 05-06/11 runs: a cited article of this length came back cut at 1024 tokens as invalid JSON, twice.
    provider = RecordingLimit(sentences(280))
    article(client, make_client, provider)
    assert provider.limits == [2048]

