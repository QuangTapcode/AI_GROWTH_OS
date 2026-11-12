"""When no approved guide answers, the bot still helps from general knowledge, says so, and never speaks for the business.

The owner chose this on 2026-11-11: ordinary questions ("phở ngon ở Ngũ Hành Sơn?", small talk) used to get only
"the guides are being updated". The question is still recorded as a knowledge gap so a source can be added.
"""
import json

import pytest

from test_community_history import ask, unit
from src.agents.community import pipeline
from src.app.schemas import Usage


class Provider:
    """The grounded draft finds nothing in the quotes; the general prompt answers with `general`."""
    model_version = "test/community"
    embedding_model_version = "test/embed"

    def __init__(self, general="", kind="info"):
        self.general, self.kind, self.general_calls, self.grounded_calls = general, kind, 0, 0

    async def chat_json(self, *, system, user, **kwargs):
        if system == pipeline.GENERAL_PROMPT:
            self.general_calls += 1
            return json.dumps({"reply": self.general, "kind": self.kind}), Usage(llm_calls=1)
        self.grounded_calls += 1
        return json.dumps({"reply": "NO_ANSWER"}), Usage(llm_calls=1)

    async def embed(self, texts):
        query = unit(0.4, (1 - 0.4 ** 2) ** 0.5)
        return [query if text.startswith("task: search result") else unit(1.0) for text in texts], Usage(embedding_calls=1)


PHO = "Ở Ngũ Hành Sơn bạn nên tìm quán phở đông khách địa phương vào buổi sáng."


def test_a_question_the_guides_do_not_cover_gets_a_general_answer_marked_as_such(make_client):
    result = ask(make_client, Provider(PHO), "Các quán phở ngon ở Ngũ Hành Sơn tại Đà Nẵng, bot ơi")

    assert result["reply"] == f"{PHO}\n\n{pipeline.GENERAL_NOTE_VI}"
    assert result["citations"] == []
    assert "grounded_answer" in result["missing_facts"]  # still listed for the owner to add a source


def test_a_general_answer_never_states_a_price_or_a_figure_the_customer_did_not_give(make_client):
    general = f"Một tô phở ở đó khoảng 40.000đ. Quán thường mở từ 6 giờ. {PHO}"
    reply = ask(make_client, Provider(general), "Tôi chuẩn bị mua nhà ở Đà Nẵng, kinh phí 3 tỷ thì nên ở khu nào?")["reply"]
    assert reply == f"{PHO}\n\n{pipeline.GENERAL_NOTE_VI}"


def test_small_talk_is_answered_naturally_without_the_general_information_note(make_client):
    chat = "Mình là trợ lý AI nên không thấy lạnh đâu! Bạn cần mình gợi ý gì cho chuyến đi không?"
    result = ask(make_client, Provider(chat, kind="chat"), "trời mưa rồi bạn có lạnh không")

    assert result["reply"] == chat
    assert result["missing_facts"] == [] and result["escalation_required"] is False


def test_a_greeting_is_welcomed_by_the_assistant_not_by_quoting_random_guides(make_client):
    hello = "Chào bạn! Mình là trợ lý TripC, bạn cứ hỏi về visa, eSIM, đi lại hay ăn uống nhé."
    provider = Provider(hello, kind="chat")
    result = ask(make_client, provider, "chào bot")

    assert result["reply"] == hello and result["citations"] == []
    assert provider.grounded_calls == 0


@pytest.mark.parametrize("question", ["TripC có bán tour ăn phở không?", "How much does a private food tour cost?"])
def test_nothing_is_guessed_about_the_business_or_its_prices(make_client, question):
    provider = Provider("TripC có tour phở mỗi sáng.")
    result = ask(make_client, provider, question)

    assert provider.general_calls == 0
    assert result["reply"] in (pipeline.VIETNAMESE_HELPFUL_FALLBACK, pipeline.HANDOFF_REPLY)


def test_when_the_model_cannot_help_either_the_old_fallback_is_kept(make_client):
    result = ask(make_client, Provider("NO_ANSWER"), "Các quán phở ngon ở Ngũ Hành Sơn?")
    assert result["reply"] == pipeline.VIETNAMESE_HELPFUL_FALLBACK
