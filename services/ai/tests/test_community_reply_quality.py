"""What reaches a customer must be a finished, grounded answer. Cases seen on real runs with the local model."""
import json

import pytest

from test_community_history import Provider
from conftest import run_job
from examples.six_role_requests import mock_research_request, request
from src.app.schemas import Usage

GROUNDED = "The guide compares living areas for newcomers."
HANDOFF = "The verified information needed for this question is unavailable. A human needs to review it."


class ReplyProvider:
    model_version = "test/community"
    embedding_model_version = "test/embed"

    def __init__(self, reply):
        self.reply = reply

    async def chat_json(self, **kwargs):
        return json.dumps({"reply": self.reply}), Usage(llm_calls=1)

    async def embed(self, texts):
        # Related to the question, but not so close that it overrides the absence check.
        query, chunk = [0.4, 0.84 ** 0.5, *[0.0] * 766], [1.0, *[0.0] * 767]
        return [query if text.startswith("task: search result") else chunk for text in texts], Usage(embedding_calls=1)


def ask(make_client, reply, question="Can you explain living areas for newcomers?"):
    job = request(mock_research_request(), "community.response", {"question": question})
    body = run_job(make_client(provider=ReplyProvider(reply), provider_mode="live"), job)
    assert body["status"] == "completed", body
    return body["result"]["result"]


def test_a_sentence_cut_off_in_another_script_is_not_sent(make_client):
    result = ask(make_client, f"{GROUNDED} One great spot is near the living areas for newcomers, and the机会")
    assert result["reply"] == GROUNDED
    assert result["status"] == "draft" and result["escalation_required"] is False


def test_a_sentence_stopping_mid_way_is_not_sent(make_client):
    assert ask(make_client, f"{GROUNDED} Newcomers compare living areas and the")["reply"] == GROUNDED


def test_a_customer_writing_in_that_script_can_be_answered_in_it(make_client):
    reply = f"{GROUNDED} 指南比较了新来者的居住区域。"
    assert ask(make_client, reply, question="Can you explain living areas for newcomers? 居住区域")["reply"] == reply


def test_nothing_left_after_cleaning_goes_to_a_person(make_client):
    result = ask(make_client, "机会")
    assert result["reply"] == HANDOFF
    assert result["escalation_required"] is True and "grounded_answer" in result["missing_facts"]
    assert result["citations"] == []


@pytest.mark.parametrize("reply", [
    "There is no mention of living areas for newcomers in the provided information.",
    "The quotes do not say anything about living areas for newcomers.",
    "NO_ANSWER",
    "Không có thông tin về khu vực sống cho người mới.",
])
def test_a_reply_saying_the_sources_have_no_answer_goes_to_a_person(make_client, reply):
    result = ask(make_client, reply)
    assert result["reply"] == HANDOFF
    assert result["escalation_required"] is True and "grounded_answer" in result["missing_facts"]
    assert result["citations"] == []


def test_a_sentence_the_sources_do_not_support_is_not_sent(make_client):
    result = ask(make_client, f"{GROUNDED} Modular furniture and rooftop gyms delight wealthy international tenants everywhere.")
    assert result["reply"] == GROUNDED


def test_missing_facts_name_the_sensitive_fact(make_client):
    result = ask(make_client, "unused", question="How much does a private food tour cost?")
    assert "verified_fact:price" in result["missing_facts"]
    assert not any("SensitiveFact" in fact for fact in result["missing_facts"])


def test_a_full_answer_is_not_cut_at_the_old_500_character_limit(make_client):
    # Ollama enforces the schema while generating, so maxLength=500 stopped the model mid-sentence.
    reply = " ".join([GROUNDED] * 15)
    assert 500 < len(reply) < 900
    assert ask(make_client, reply)["reply"] == reply


class CountingProvider(ReplyProvider):
    calls = 0

    async def chat_json(self, **kwargs):
        CountingProvider.calls += 1
        return await super().chat_json(**kwargs)


def test_a_question_about_something_no_source_mentions_goes_to_a_person_without_asking_the_model(make_client):
    # Real run: nothing in the sources mentions vegetarian food, yet the model guessed "there may be vegetarian options".
    CountingProvider.calls = 0
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"] += [
        {"chunk_id": f"filler-{i}", "text": "Living areas near the river have shops, cafes and quiet streets.", "locator": f"mock:{i}"} for i in range(120)]
    job = request(base, "community.response", {"question": "Is there a vegetarian place in the living areas?"})
    body = run_job(make_client(provider=CountingProvider("Yes."), provider_mode="live"), job)
    result = body["result"]["result"]
    assert CountingProvider.calls == 0
    assert result["reply"] == HANDOFF and result["escalation_required"] is True
    assert "grounded_answer" in result["missing_facts"] and result["citations"] == []


def test_a_reply_guessing_beyond_the_quotes_goes_to_a_person(make_client):
    result = ask(make_client, f"{GROUNDED} There may be other living areas for newcomers nearby.")
    assert result["reply"] == HANDOFF and result["escalation_required"] is True


def test_common_question_words_missing_from_the_sources_do_not_stop_an_answer(make_client):
    result = ask(make_client, GROUNDED, question="Please help me find good living areas for newcomers, what do you recommend?")
    assert result["reply"] == GROUNDED and result["escalation_required"] is False


@pytest.mark.parametrize("opener", [
    "cảm ơn ad nhiều nha",
    "bạn là ai vậy? giúp mình gì được?",
    "giới thiệu cộng đồng facebook giúp mình",
    "chào bot nha, bạn khỏe không?",
    "bot ơi nói chuyện với mọi người đi",
    "bạn tên gì vậy?",
])
def test_conversational_openers_get_a_grounded_reply_even_when_similarity_is_low(make_client, opener):
    job = request(mock_research_request(), "community.response", {"question": opener})
    body = run_job(make_client(provider=Provider(similarity=0.1, reply=GROUNDED), provider_mode="live"), job)
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert result["status"] == "draft" and result["escalation_required"] is False
    assert result["reply"] == GROUNDED and result["citations"]
