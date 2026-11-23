"""A new question that stands on its own is answered about itself, not about the topic of the message it replied to."""
from types import SimpleNamespace as NS

from src.agents.community.pipeline import choose_passages

ESIM = NS(chunk_id="esim", text="Quick answer: a travel eSIM bought online before you fly works on arrival; local SIMs are sold at the airport.")
RAIN = NS(chunk_id="rain", text="Cool season (mid-December to February): the Central coast is wet from September to December.")
AIRPORT = NS(chunk_id="airport", text="From Da Nang airport, take a Grab or taxi to the centre, about 3 km and 10 minutes.")
CHUNKS = [(None, ESIM), (None, RAIN), (None, AIRPORT)]
WEATHER_TURN = [NS(question="thời tiết Đà Nẵng tháng 12 thế nào")]


def test_a_new_topic_after_a_weather_reply_gets_its_own_passage():
    own = {"esim": 0.68, "rain": 0.31, "airport": 0.30}
    with_history = {"esim": 0.52, "rain": 0.74, "airport": 0.33}
    picked = choose_passages("eSIM mua ở đâu?", WEATHER_TURN, CHUNKS, own, with_history, "live")
    assert picked[0][1].chunk_id == "esim"
    assert "rain" not in [c.chunk_id for _, c in picked]


def test_the_airport_question_after_esim_is_about_the_airport():
    own = {"esim": 0.35, "rain": 0.25, "airport": 0.66}
    with_history = {"esim": 0.71, "rain": 0.3, "airport": 0.5}
    turns = [*WEATHER_TURN, NS(question="eSIM mua ở đâu?")]
    picked = choose_passages("từ sân bay Đà Nẵng về trung tâm đi bằng gì", turns, CHUNKS, own, with_history, "live")
    assert picked[0][1].chunk_id == "airport"


def test_a_real_follow_up_still_reads_the_earlier_topic():
    own = {"esim": 0.42, "rain": 0.3, "airport": 0.3}
    with_history = {"esim": 0.72, "rain": 0.28, "airport": 0.29}
    picked = choose_passages("còn sim vật lý thì sao?", [NS(question="eSIM mua ở đâu?")], CHUNKS, own, with_history, "live")
    assert picked and picked[0][1].chunk_id == "esim"
