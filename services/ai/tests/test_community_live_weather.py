"""Today's weather changes by the hour: the bot reads it from a live forecast, never from a guide written earlier."""
import pytest

from test_community_history import Provider, ask
from src.agents.community import weather

FORECAST = {
    "current": {"time": "2026-11-11T16:45", "temperature_2m": 27.3, "apparent_temperature": 30.1,
                "relative_humidity_2m": 81, "weather_code": 61},
    "daily": {"temperature_2m_max": [29.0, 28.2], "temperature_2m_min": [24.1, 23.5],
              "precipitation_probability_max": [70, 40], "weather_code": [61, 3]},
}


@pytest.fixture
def forecast(monkeypatch):
    calls = []

    async def fetch(lat, lon):
        calls.append((lat, lon))
        return FORECAST

    monkeypatch.setattr(weather, "fetch_forecast", fetch)
    return calls


def test_todays_temperature_comes_from_the_live_forecast_for_the_city_asked(make_client, forecast):
    result = ask(make_client, Provider(), "bot ơi đà năng nay bao nhiêu độ v")

    assert forecast == [weather.CITIES["da nang"].coords]
    assert "Đà Nẵng" in result["reply"] and "27°C" in result["reply"] and "Open-Meteo" in result["reply"]
    assert result["citations"] == [] and result["escalation_required"] is False


def test_tomorrow_reads_the_next_day_of_the_forecast(make_client, forecast):
    reply = ask(make_client, Provider(), "Ngày mai Hội An có mưa không?")["reply"]
    assert forecast == [weather.CITIES["hoi an"].coords]
    assert "Hội An ngày mai: 24°C–28°C" in reply and "khả năng mưa 40%" in reply


def test_without_a_city_the_bot_asks_which_one_instead_of_guessing(make_client, forecast):
    assert ask(make_client, Provider(), "hôm nay trời có mưa không bot")["reply"] == weather.ASK_CITY_VI
    assert forecast == []


def test_when_the_forecast_cannot_be_read_the_bot_says_it_has_no_live_figures(make_client, monkeypatch):
    async def down(lat, lon):
        raise weather.httpx.ConnectError("offline")
    monkeypatch.setattr(weather, "fetch_forecast", down)
    reply = ask(make_client, Provider(), "Đà Nẵng hôm nay bao nhiêu độ?")["reply"]
    assert reply.startswith("Cẩm nang của TripC không có số liệu cập nhật theo ngày")


@pytest.mark.parametrize("question", ["Tháng 12 Đà Nẵng có mưa nhiều không?", "trời mưa rồi bạn có lạnh không"])
def test_a_question_about_seasons_or_small_talk_is_not_a_forecast(make_client, forecast, question):
    from test_community_general_answers import Provider as GeneralProvider
    ask(make_client, GeneralProvider("Mình là trợ lý AI nhé!", kind="chat"), question)
    assert forecast == []
