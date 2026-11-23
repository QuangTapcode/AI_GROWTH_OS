"""Community finds a source by meaning, so a customer need not use the source's own words."""
import json

from conftest import run_job
from examples.six_role_requests import mock_research_request, request
from src.app.providers import ProviderError
from src.agents.community.pipeline import GENERAL_PROMPT
from src.app.schemas import Usage

GROUNDED = "The guide compares living areas for newcomers."
HANDOFF = "The verified information needed for this question is unavailable. A human needs to review it."
PARAPHRASE = "Which neighbourhood suits someone moving here?"
DIM = 768


def unit(*weights):
    return [*weights, *[0.0] * (DIM - len(weights))]


class EmbeddingProvider:
    """Live-like provider whose vectors put the question on `angle` to every source chunk."""
    model_version = "test/community"
    embedding_model_version = "test/embed"

    def __init__(self, similarity):
        self.similarity, self.chat_calls, self.embedded = similarity, 0, []

    async def chat_json(self, **kwargs):
        if kwargs.get("system") == GENERAL_PROMPT:  # general knowledge has nothing either (tested on its own)
            return json.dumps({"reply": "NO_ANSWER", "kind": "info"}), Usage(llm_calls=1)
        self.chat_calls += 1
        return json.dumps({"reply": GROUNDED}), Usage(llm_calls=1)

    async def embed(self, texts):
        self.embedded += texts
        return [unit(self.similarity, (1 - self.similarity ** 2) ** 0.5) if text.startswith("task: search result") else unit(1.0)
                for text in texts], Usage(embedding_calls=1)


def ask(make_client, provider, question=PARAPHRASE, base=None):
    job = request(base or mock_research_request(), "community.response", {"question": question})
    body = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    return body["result"]["result"]


def test_a_question_in_other_words_is_answered_from_the_source_with_that_meaning(make_client):
    result = ask(make_client, EmbeddingProvider(similarity=0.7))
    assert result["reply"] == GROUNDED and result["escalation_required"] is False
    assert result["citations"]


def with_stored_vectors(model="test/embed"):
    base = mock_research_request()
    for chunk in base["payload"]["snapshot"]["sources"][0]["chunks"]:
        chunk.update(embedding=unit(1.0), model=model)
    return base


def test_stored_chunk_vectors_are_reused_so_only_the_question_is_embedded(make_client):
    provider = EmbeddingProvider(similarity=0.7)
    assert ask(make_client, provider, base=with_stored_vectors())["reply"] == GROUNDED
    assert len(provider.embedded) == 1 and provider.embedded[0].startswith("task: search result")


def test_vectors_from_another_model_are_not_compared(make_client):
    # Cosine across embedding models is noise: it would "find" sources by accident.
    provider = EmbeddingProvider(similarity=0.7)
    ask(make_client, provider, base=with_stored_vectors(model="other/embed"))
    assert len(provider.embedded) == 2


class EmbeddingDown(EmbeddingProvider):
    async def embed(self, texts):
        raise ProviderError("EMBEDDING_UNAVAILABLE", "Local Ollama embedding request failed", retryable=True)


def test_an_embedding_outage_falls_back_to_keywords_and_says_so(make_client):
    job = request(mock_research_request(), "community.response", {"question": "Can you explain living areas for newcomers?"})
    body = run_job(make_client(provider=EmbeddingDown(similarity=0.0), provider_mode="live"), job)
    assert body["status"] == "completed", body
    assert body["result"]["result"]["reply"] == GROUNDED
    assert "RETRIEVAL_KEYWORDS_ONLY:EMBEDDING_UNAVAILABLE" in body["result"]["warnings"]


def test_a_corpus_without_stored_vectors_is_not_embedded_while_the_customer_waits(make_client):
    # 430 chunks at 8 per call would keep a question busy for minutes on the local model.
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"] += [
        {"chunk_id": f"filler-{i}", "text": "Living areas near the river have shops, cafes and quiet streets.", "locator": f"mock:{i}"} for i in range(120)]
    provider = EmbeddingProvider(similarity=0.7)
    ask(make_client, provider, base=base)
    assert len(provider.embedded) == 1


def test_a_question_far_from_every_source_goes_to_a_person_even_if_it_shares_a_word(make_client):
    # Measured: "How do I file my US taxes?" peaks at 0.23 yet shares words with a relocation guide.
    provider = EmbeddingProvider(similarity=0.2)
    result = ask(make_client, provider, question="How do newcomers file their taxes?")
    assert provider.chat_calls == 0
    assert result["reply"] == HANDOFF and "grounded_answer" in result["missing_facts"]
