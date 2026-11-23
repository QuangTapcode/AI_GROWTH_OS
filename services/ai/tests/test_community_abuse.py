"""An insult is not a question: the bot answers politely and quotes no source, whatever words it shares with a guide."""
import pytest

from test_community_history import Provider, ask, large_corpus

MARBLE = "Marble Mountains (Ngu Hanh Son) are five marble and limestone hills 9 km south of Da Nang."


@pytest.mark.parametrize("insult", ["Du lịch đồ ngu", "bot ngu quá", "mày ngu vl", "đồ óc chó", "stupid bot", "you are useless"])
def test_an_insult_gets_a_polite_reply_and_no_random_facts(make_client, insult):
    provider = Provider(similarity=0.6)
    result = ask(make_client, provider, insult, base=large_corpus(MARBLE))
    assert provider.user is None, "the model is not asked to answer an insult"
    assert not result["citations"]
    assert "Marble" not in result["reply"] and "Ngu Hanh" not in result["reply"]
    assert result["escalation_required"] is False
    assert "xin lỗi" in result["reply"].lower() or "sorry" in result["reply"].lower()


@pytest.mark.parametrize("question", ["Ngũ Hành Sơn có gì chơi", "ngu hanh son o dau"])
def test_the_place_named_ngu_hanh_son_is_still_a_question(make_client, question):
    reply = "Marble Mountains are five marble and limestone hills 9 km south of Da Nang."
    result = ask(make_client, Provider(similarity=0.6, reply=reply), question, base=large_corpus(MARBLE))
    assert result["citations"] and "Marble Mountains" in result["reply"]


AIRPORT = "Da Nang International Airport (DAD) is 3 km southwest of the centre; flights connect Hanoi and Ho Chi Minh City."


@pytest.mark.parametrize("question", ["giá vé máy bay Hà Nội Đà Nẵng hôm nay bao nhiêu", "tỷ giá đô hôm nay", "thời tiết Đà Nẵng bây giờ thế nào",
                                      "What is the flight price from Hanoi to Da Nang today?"])
def test_a_question_about_today_says_the_guides_have_no_live_figures(make_client, question):
    provider = Provider(similarity=0.6)
    result = ask(make_client, provider, question, base=large_corpus(AIRPORT))
    assert provider.user is None and not result["citations"]
    assert "DAD" not in result["reply"]
    assert "cập nhật theo ngày" in result["reply"] or "live" in result["reply"].lower()


def test_a_month_or_season_is_not_today(make_client):
    reply = "Da Nang International Airport (DAD) is 3 km southwest of the centre."
    result = ask(make_client, Provider(similarity=0.6, reply=reply), "sân bay Đà Nẵng cách trung tâm bao xa", base=large_corpus(AIRPORT))
    assert result["citations"]
