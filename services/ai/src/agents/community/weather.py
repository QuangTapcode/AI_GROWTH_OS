"""Today's or tomorrow's weather for a city the customer names, read live from Open-Meteo (free, no key).

Only the city's coordinates leave this service; nothing about the customer does.
"""
from dataclasses import dataclass
import re
import unicodedata

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_S = 6.0


@dataclass(frozen=True)
class City:
    vi: str
    en: str
    coords: tuple[float, float]


# Keys are unaccented and lower case, as `_plain` makes the question.
CITIES = {
    "da nang": City("Đà Nẵng", "Da Nang", (16.0544, 108.2022)),
    "hoi an": City("Hội An", "Hoi An", (15.8801, 108.338)),
    "hue": City("Huế", "Hue", (16.4637, 107.5909)),
    "ha noi": City("Hà Nội", "Hanoi", (21.0285, 105.8542)),
    "ho chi minh": City("TP. Hồ Chí Minh", "Ho Chi Minh City", (10.8231, 106.6297)),
    "nha trang": City("Nha Trang", "Nha Trang", (12.2388, 109.1967)),
    "da lat": City("Đà Lạt", "Da Lat", (11.9404, 108.4583)),
    "phu quoc": City("Phú Quốc", "Phu Quoc", (10.2899, 103.984)),
    "ha long": City("Hạ Long", "Ha Long", (20.9599, 107.0425)),
    "sa pa": City("Sa Pa", "Sa Pa", (22.3364, 103.8438)),
    "quy nhon": City("Quy Nhơn", "Quy Nhon", (13.782, 109.219)),
    "vung tau": City("Vũng Tàu", "Vung Tau", (10.346, 107.0843)),
    "can tho": City("Cần Thơ", "Can Tho", (10.0452, 105.7469)),
    "hai phong": City("Hải Phòng", "Hai Phong", (20.8449, 106.6881)),
    "ninh binh": City("Ninh Bình", "Ninh Binh", (20.2506, 105.9745)),
    "phan thiet": City("Phan Thiết", "Phan Thiet", (10.9289, 108.1021)),
    "ha giang": City("Hà Giang", "Ha Giang", (22.8233, 104.9836)),
}
ALIASES = {"danang": "da nang", "hanoi": "ha noi", "sai gon": "ho chi minh", "saigon": "ho chi minh",
           "hcm": "ho chi minh", "tphcm": "ho chi minh", "dalat": "da lat", "halong": "ha long",
           "sapa": "sa pa", "mui ne": "phan thiet"}

WEATHER = re.compile(r"\b(?:thời tiết|nhiệt độ|bao nhiêu độ|mấy độ|mưa|nắng|nóng|lạnh|dự báo|weather|temperature"
                     r"|forecast|rain\w*|sunny|hot|cold)\b", re.IGNORECASE)
NOW = re.compile(r"\b(?:hôm nay|nay|bây giờ|hiện tại|hiện giờ|lúc này|today|now|right now|currently|tonight)\b", re.IGNORECASE)
TOMORROW = re.compile(r"\b(?:ngày mai|mai|tomorrow)\b", re.IGNORECASE)

# WMO weather codes, grouped.
_CODES = [((0,), "trời quang", "clear sky"), ((1, 2), "ít mây", "partly cloudy"), ((3,), "nhiều mây", "overcast"),
          ((45, 48), "có sương mù", "foggy"), ((51, 53, 55, 56, 57), "mưa phùn", "drizzle"),
          ((61, 63, 65, 66, 67), "có mưa", "rain"), ((71, 73, 75, 77, 85, 86), "có tuyết", "snow"),
          ((80, 81, 82), "mưa rào", "showers"), ((95, 96, 99), "có dông", "thunderstorms")]


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    return " ".join(re.findall(r"[a-z0-9]+", "".join(ch for ch in text if not unicodedata.combining(ch)).lower()))


def weather_day(text: str) -> str | None:
    """'today' or 'tomorrow' when the message asks about the weather of that day; None otherwise."""
    if not WEATHER.search(text):
        return None
    if TOMORROW.search(text):
        return "tomorrow"
    return "today" if NOW.search(text) else None


def city_in(text: str) -> City | None:
    plain = f" {_plain(text)} "
    for key, city in [*CITIES.items(), *((alias, CITIES[key]) for alias, key in ALIASES.items())]:
        if f" {key} " in plain:
            return city
    return None


async def fetch_forecast(lat: float, lon: float) -> dict:
    params = {"latitude": lat, "longitude": lon, "timezone": "Asia/Ho_Chi_Minh", "forecast_days": 2,
              "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code",
              "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"}
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        response = await client.get(FORECAST_URL, params=params)
        response.raise_for_status()
        return response.json()


def _sky(code, vi: bool) -> str:
    for codes, in_vi, in_en in _CODES:
        if code in codes:
            return in_vi if vi else in_en
    return ""


def _deg(value) -> str:
    return f"{round(float(value))}°C"


def weather_reply(city: City, forecast: dict, day: str, vi: bool) -> str:
    daily = forecast["daily"]
    i = 1 if day == "tomorrow" else 0
    low, high = _deg(daily["temperature_2m_min"][i]), _deg(daily["temperature_2m_max"][i])
    rain = daily.get("precipitation_probability_max", [None, None])[i]
    sky = _sky(daily.get("weather_code", [None, None])[i], vi)
    if day == "tomorrow":
        if vi:
            return (f"Dự báo {city.vi} ngày mai: {low}–{high}" + (f", {sky}" if sky else "")
                    + (f", khả năng mưa {rain}%" if rain is not None else "") + ". (Nguồn: Open-Meteo)")
        return (f"Tomorrow in {city.en}: {low}–{high}" + (f", {sky}" if sky else "")
                + (f", {rain}% chance of rain" if rain is not None else "") + ". (Source: Open-Meteo)")
    now = forecast["current"]
    at = str(now.get("time", ""))[-5:]
    temp, feels = _deg(now["temperature_2m"]), _deg(now["apparent_temperature"])
    now_sky = _sky(now.get("weather_code"), vi)
    if vi:
        return (f"{city.vi} lúc {at}: {temp}, cảm giác như {feels}, độ ẩm {now['relative_humidity_2m']}%"
                + (f", {now_sky}" if now_sky else "") + f". Cả ngày hôm nay {low}–{high}"
                + (f", khả năng mưa {rain}%" if rain is not None else "") + ". (Nguồn: Open-Meteo)")
    return (f"{city.en} at {at}: {temp}, feels like {feels}, humidity {now['relative_humidity_2m']}%"
            + (f", {now_sky}" if now_sky else "") + f". Today {low}–{high}"
            + (f", {rain}% chance of rain" if rain is not None else "") + ". (Source: Open-Meteo)")


ASK_CITY_VI = "Bạn muốn xem thời tiết ở thành phố nào? Ví dụ: Đà Nẵng, Hội An, Huế, Hà Nội hay TP. Hồ Chí Minh."
ASK_CITY_EN = "Which city would you like the weather for? For example Da Nang, Hoi An, Hue, Hanoi or Ho Chi Minh City."


async def live_weather_reply(question: str, vi: bool) -> str | None:
    """The reply to a question about today's or tomorrow's weather; None when it asks something else
    or the forecast service cannot be reached (the caller then says it has no live figures)."""
    day = weather_day(question)
    if not day:
        return None
    city = city_in(question)
    if not city:
        return ASK_CITY_VI if vi else ASK_CITY_EN
    try:
        forecast = await fetch_forecast(*city.coords)
        return weather_reply(city, forecast, day, vi)
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        return None
