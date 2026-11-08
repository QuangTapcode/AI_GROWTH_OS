"""Which excerpts Research reads: rare offers are not crowded out, and no single page fills the prompt."""
import json
from uuid import uuid4

from conftest import run_job
from src.app.schemas import Usage
from src.rag.retrieval import bm25_scores
from test_research_trends import long_source_job


class Reader:
    model_version = "test/reader"
    embedding_model_version = "test/embed"

    def __init__(self):
        self.user = None

    async def chat_json(self, *, user, **kwargs):
        self.user = json.loads(user)
        return json.dumps({"ideas": []}), Usage(llm_calls=1)

    def shown(self):
        return [x["chunk_id"] for x in self.user["excerpts"]]


def test_bm25_ranks_a_short_passage_on_a_rare_word_above_a_long_generic_page():
    generic = "Vietnam travel guide. " * 40 + "Travellers in Vietnam can buy an eSIM."
    focused = "An eSIM for Vietnam is activated before the flight and works on arrival."
    others = ["Vietnam travel tips for the beach and the old town."] * 5
    scores = bm25_scores({"esim": 2.0, "vietnam": 1.0, "travel": 1.0}, [generic, focused, *others])
    assert scores[1] > scores[0]


def job_with(products, extra_sources):
    job = long_source_job()
    job["payload"]["business_profile"]["products"] = products
    base = job["payload"]["snapshot"]["sources"][0]
    for index, chunks in enumerate(extra_sources):
        source_id = str(uuid4())
        job["payload"]["snapshot"]["sources"].append({**base, "source_id": source_id, "chunks": chunks})
        job["approved_source_versions"].append({"source_id": source_id, "version": base["version"]})
    return job


def test_every_offer_gets_an_excerpt_even_when_another_offer_has_many(make_client):
    coworking = [{"chunk_id": f"cw-{i}", "locator": f"p:{i}",
                  "text": f"Coworking space {i} in Da Nang has desks, meeting rooms and coworking events for remote workers."}
                 for i in range(12)]
    esim = [{"chunk_id": "esim", "locator": "p:1",
             "text": "An eSIM bought before the flight gives English-speaking expats mobile data as soon as they land."}]
    reader = Reader()
    run_job(make_client(provider=reader, provider_mode="live"), job_with(["coworking", "esim"], [coworking, esim]))
    assert "esim" in reader.shown()


def test_one_long_page_does_not_fill_every_excerpt_slot(make_client):
    long_page = [{"chunk_id": f"guide-{i}", "locator": f"p:{i}",
                  "text": f"Coworking section {i}: coworking spaces in Da Nang suit expats who work remotely near the beach."}
                 for i in range(12)]
    other = [{"chunk_id": "other-page", "locator": "p:1",
              "text": "A smaller coworking space near the river offers quiet desks for expats working remotely."}]
    reader = Reader()
    run_job(make_client(provider=reader, provider_mode="live"), job_with(["coworking"], [long_page, other]))
    shown = reader.shown()
    assert "other-page" in shown
    assert sum(chunk.startswith("guide-") for chunk in shown) <= 3 or len(shown) > 6
