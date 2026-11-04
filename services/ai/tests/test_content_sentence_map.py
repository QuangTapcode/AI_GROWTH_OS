"""The sentence map a reviewer checks a post against: real runs showed true sentences flagged as unsourced."""
import json

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, request
from src.app.schemas import Usage

LATER_SENTENCE = "Quiet river districts suit families who want shops within walking distance."


class PostProvider:
    model_version = "test/facebook"
    embedding_model_version = "test/embed"

    def __init__(self, body):
        self.body = body

    async def chat_json(self, *, schema, **kwargs):
        draft = {"caption": "Living areas guide\n\nRequest the guide", "alt_text": "Living room photo"}
        if "facebook" in schema.get("properties", {}):
            draft["facebook"] = {"hook": "Choosing a living area?", "body": self.body, "discussion_question": None, "hashtags": []}
        return json.dumps(draft), Usage(llm_calls=1)


def mapped(client, make_client, body):
    """Post `body` over a cited chunk longer than the quote cited from it."""
    base = mock_research_request()
    research = run_job(client, base)["result"]
    seo = run_job(client, request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"}))["result"]
    chunk = base["payload"]["snapshot"]["sources"][0]["chunks"][0]
    chunk["text"] = f"{chunk['text']} {LATER_SENTENCE}"
    job = request(base, "content.repurpose", {"source_article": artifact_input(seo), "cta": "Request the guide", "assets": [], "target_channels": ["facebook"]})
    out = run_job(make_client(provider=PostProvider(body), provider_mode="live"), job)
    assert out["status"] == "completed", out
    result = out["result"]["result"]
    assert LATER_SENTENCE not in [e["quote"] for e in result["citations"]]
    return result


def test_a_sentence_stated_elsewhere_in_the_cited_chunk_is_linked_to_that_sentence(client, make_client):
    result = mapped(client, make_client, LATER_SENTENCE)
    row = next(r for r in result["sentence_fact_map"] if r["sentence_type"] == "factual")
    facts = {f["fact_id"]: f for f in result["extracted_facts"]}
    assert row["entailment_status"] == "supported"
    assert [facts[i]["text"] for i in row["fact_id"]] == [LATER_SENTENCE]


def test_each_fact_says_which_source_it_came_from(client, make_client):
    result = mapped(client, make_client, LATER_SENTENCE)
    urls = {c["source_url"] for c in result["citations"]}
    assert urls and {f["source_url"] for f in result["extracted_facts"]} == urls


def test_a_question_to_the_reader_is_not_reported_as_an_unsourced_claim(client, make_client):
    # Real run: "What's your go-to place for social connection in Da Nang?" was flagged, drowning out real gaps.
    result = mapped(client, make_client, f"{LATER_SENTENCE}\nWhich districts do you like?")
    assert [r["text"] for r in result["sentence_fact_map"] if r["sentence_type"] == "factual"] == [LATER_SENTENCE]
