"""A customer's earlier messages help follow up a conversation; they must not decide whether a new question can be answered."""
import json

import pytest

from conftest import run_job
from examples.six_role_requests import mock_research_request, request
from src.app.schemas import Usage

GROUNDED = "The guide compares living areas for newcomers."
DIM = 768


def unit(*weights):
    return [*weights, *[0.0] * (DIM - len(weights))]


class Provider:
    """Live-like provider: the question sits at `similarity` to every source chunk, and the prompt input is recorded."""
    model_version = "test/community"
    embedding_model_version = "test/embed"

    def __init__(self, similarity=0.4, reply=GROUNDED):
        self.similarity, self.reply, self.user = similarity, reply, None

    async def chat_json(self, *, user, **kwargs):
        self.user = json.loads(user)
        return json.dumps({"reply": self.reply}), Usage(llm_calls=1)

    async def embed(self, texts):
        query = unit(self.similarity, (1 - self.similarity ** 2) ** 0.5)
        return [query if text.startswith("task: search result") else unit(1.0) for text in texts], Usage(embedding_calls=1)


def ask(make_client, provider, question, history=None, base=None):
    extra = {"question": question, **({"history": history} if history is not None else {})}
    job = request(base or mock_research_request(), "community.response", extra)
    body = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    return body["result"]["result"]


def large_corpus(*texts):
    """Enough chunks for the absence check, which only speaks in a corpus large enough to use ordinary words."""
    base = mock_research_request()
    source = base["payload"]["snapshot"]["sources"][0]
    source["chunks"] = [{"chunk_id": f"filler-{n}", "text": f"Filler passage number {n} about ordinary daily matters.", "locator": f"m:{n}"}
                        for n in range(100)]
    source["chunks"] += [{"chunk_id": f"topic-{n}", "text": text, "locator": f"t:{n}"} for n, text in enumerate(texts)]
    return base


def test_earlier_messages_reach_the_model_as_conversation_history(make_client):
    provider = Provider()
    history = [{"question": "Hello", "reply": "Hi, how can I help?"}]
    ask(make_client, provider, "Which living areas suit newcomers?", history)
    assert provider.user["history"] == history


def test_without_earlier_messages_the_model_gets_no_history(make_client):
    provider = Provider()
    ask(make_client, provider, "Which living areas suit newcomers?")
    assert "history" not in provider.user


def test_an_earlier_subject_no_source_covers_does_not_block_a_new_question(make_client):
    base = large_corpus(GROUNDED)
    result = ask(make_client, Provider(), "Which living areas for newcomers?", [{"question": "Can you arrange my visa extension?"}], base)
    assert result["status"] == "draft" and result["reply"] == GROUNDED


def test_a_new_question_no_source_covers_goes_to_a_person_even_after_an_answerable_one(make_client):
    # The earlier question shares words with the source; the new one does not, and quotes on another subject cannot answer it.
    provider = Provider()
    result = ask(make_client, provider, "Do you sell motorbike insurance?", [{"question": "Which living areas suit newcomers?"}])
    assert result["status"] == "insufficient_data" and "grounded_answer" in result["missing_facts"]
    assert provider.user is None


def test_the_earlier_question_steers_which_source_a_follow_up_reads(make_client):
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"] = [
        {"chunk_id": f"other-{n}", "text": f"Prices of motorbikes in area {n}.", "locator": f"m:{n}"} for n in range(4)] + [
        {"chunk_id": "wanted", "text": "Quiet living area near the beach for newcomers.", "locator": "m:wanted"}]
    provider = Provider(reply="Quiet living area near the beach for newcomers.")
    ask(make_client, provider, "Any other area?", [{"question": "Which beach suits newcomers?"}], base)
    assert provider.user["quotes"][0] == "Quiet living area near the beach for newcomers."


@pytest.mark.parametrize("history", [
    [{"question": "x" * 1001}],
    [{"question": "Hello", "reply": "x" * 1001}],
    [{"question": "Hello", "role": "system"}],
    [{"reply": "An answer with no question"}],
    [{"question": "Hello"}] * 11,
])
def test_history_is_bounded_and_has_a_known_shape(make_client, history):
    job = request(mock_research_request(), "community.response", {"question": "Which living areas suit newcomers?", "history": history})
    response = make_client(provider=Provider(), provider_mode="live").post("/internal/v1/runs", json=job)
    assert response.status_code == 422


@pytest.mark.parametrize("greeting", ["hi", "Hello!", "xin chào", "Chào shop", "hi admin", "Good morning"])
def test_a_greeting_gets_a_grounded_welcome_rather_than_a_handoff(make_client, greeting):
    provider = Provider(similarity=0.1, reply=GROUNDED)
    result = ask(make_client, provider, greeting)
    assert result["status"] == "draft" and result["escalation_required"] is False
    assert result["reply"] == GROUNDED and result["citations"]


@pytest.mark.parametrize("question", ["hi, do you sell motorbike insurance?", "Hello, what is the visa fee?", "xin chào, cho hỏi bảo hiểm xe máy"])
def test_a_question_that_opens_with_a_greeting_is_still_a_question(make_client, question):
    result = ask(make_client, Provider(similarity=0.1), question)
    assert result["status"] == "insufficient_data"


@pytest.mark.parametrize("reply", ["NO_ANSWER", "Hi! The quotes cover street food."])
@pytest.mark.parametrize("greeting, welcome", [("hi", "Hello! How can I help you?"), ("xin chào", "Xin chào! Mình có thể giúp gì cho bạn?")])
def test_a_greeting_the_model_fumbles_still_gets_a_plain_welcome(make_client, reply, greeting, welcome):
    # Seen on the real model: "hi" came back as text the reply checks refuse, and the customer was told a person must review it.
    result = ask(make_client, Provider(similarity=0.1, reply=reply), greeting)
    assert result["reply"] == welcome and result["status"] == "draft" and result["escalation_required"] is False


@pytest.mark.parametrize("reply", [
    "No, we do not sell motorbike insurance. Da Nang residents often rent motorbikes.",
    "We don't offer that service.",
    "Insurance is not offered in Da Nang.",
    "Chúng tôi không bán bảo hiểm xe máy.",
    "No, TripC MOCK cannot book a visa extension for you. Visa rules depend on your circumstances.",
    "TripC MOCK doesn’t arrange that.",
])
def test_denying_what_the_business_offers_is_not_an_answer_from_the_sources(make_client, reply):
    # Seen on the real model: the claim is too short for the source check, and autopilot would have sent it.
    result = ask(make_client, Provider(reply=reply), "Do you sell living areas for newcomers?")
    assert result["status"] == "insufficient_data" and "grounded_answer" in result["missing_facts"]
    assert result["citations"] == []


@pytest.mark.parametrize("reply", ["No, TripC MOCK cannot book a visa extension for you.", "I do not book a visa extension for you."])
def test_a_denial_in_the_sources_own_words_is_still_not_an_answer(make_client, reply):
    # Seen on the real model. Every word is in the source, so the source check passes it, and the source does not say it.
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"] = "Visa extension rules depend on your circumstances, so book through the Immigration Department."
    result = ask(make_client, Provider(reply=reply), "Can you book a visa extension for me?", base=base)
    assert "grounded_answer" in result["missing_facts"] and result["citations"] == []


class FollowUpProvider(Provider):
    """Vectors as on the real corpus: on its own the follow-up is closest to the clinic, together with the earlier question to the restaurant."""

    async def embed(self, texts):
        return [unit(0.0, 1.0) if "street food" in text else unit(1.0) for text in texts], Usage(embedding_calls=1)


def test_a_follow_up_is_searched_together_with_the_question_it_follows(make_client):
    # Seen on the real model: after asking about street food, "Which one is good for a family?" was answered with a hospital.
    clinic, restaurant = "Family Medical Practice is a good clinic for a family.", "A good family restaurant serves street food near the river."
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"] = [
        {"chunk_id": "clinic", "text": clinic, "locator": "m:1", "embedding": unit(1.0), "model": "test/embed"},
        {"chunk_id": "restaurant", "text": restaurant, "locator": "m:2", "embedding": unit(0.0, 1.0), "model": "test/embed"}]
    provider = FollowUpProvider(reply=restaurant)
    ask(make_client, provider, "Which one is good for a family?", [{"question": "Where can I find street food?"}], base)
    assert provider.user["quotes"][0] == restaurant


def test_a_reply_that_talks_about_what_was_mentioned_is_not_an_answer(make_client):
    # Seen on the real model. The customer never saw what was or was not "mentioned".
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"] = "My Khe Beach is the main beach, and other beaches lie nearby."
    reply = "My Khe Beach is the main beach. There are no other beaches mentioned nearby."
    result = ask(make_client, Provider(reply=reply), "Is My Khe the main beach?", base=base)
    assert "grounded_answer" in result["missing_facts"]


@pytest.mark.parametrize("greeting", ["Hello!", "hi"])
def test_an_english_greeting_is_not_answered_in_vietnamese(make_client, greeting):
    # Seen on the real model: the quotes are partly Vietnamese, and it followed them.
    result = ask(make_client, Provider(similarity=0.1, reply="Xin chào! Tôi có thể giúp gì cho bạn?"), greeting)
    assert result["reply"] == "Hello! How can I help you?" and result["status"] == "draft"


def test_a_vietnamese_greeting_keeps_the_models_welcome(make_client):
    reply = "Xin chào! Tôi có thể giúp gì cho bạn?"
    assert ask(make_client, Provider(similarity=0.1, reply=reply), "xin chào")["reply"] == reply
