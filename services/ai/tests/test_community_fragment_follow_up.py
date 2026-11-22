"""A few words that answer the bot's question back ("Khu vực Đà Nẵng") are read as the question they complete.

Seen live in the Telegram group on 2026-11-11: "Khi nào thì nên đi du lịch" → bot: "...Bạn muốn biết thêm về khu vực
nào không?" → "Khu vực Đà Nẵng" got a general description of Da Nang instead of when to visit it.
"""
from types import SimpleNamespace as NS

from src.agents.community.pipeline import is_fragment, standalone_question

WHEN = NS(question="Khi nào thì nên đi du lịch",
          reply="Thời điểm tốt nhất phụ thuộc vào từng khu vực. Bạn muốn biết thêm về khu vực nào không?")
WEATHER = NS(question="Đà Nẵng hôm nay bao nhiêu độ?", reply="Đà Nẵng lúc 18:15: 25°C. (Nguồn: Open-Meteo)")


def test_the_area_answering_the_bots_question_completes_it():
    assert standalone_question("Khu vực Đà Nẵng", [WEATHER, WHEN]) == "Khi nào thì nên đi du lịch - Khu vực Đà Nẵng"


def test_a_bare_place_after_the_bot_asked_back_completes_it():
    assert standalone_question("Đà Nẵng", [WHEN]) == "Khi nào thì nên đi du lịch - Đà Nẵng"


def test_a_second_narrowing_still_reads_the_first_real_question():
    da_nang = NS(question="Khu vực Đà Nẵng", reply="Đà Nẵng đẹp nhất từ tháng 2 đến tháng 5.")
    assert standalone_question("còn Hội An", [WHEN, da_nang]) == "Khi nào thì nên đi du lịch - còn Hội An"


def test_a_new_noun_phrase_after_a_finished_answer_stands_alone():
    # The weather reply asked nothing back and "Phở Đà Nẵng" does not narrow anything: a new topic.
    assert standalone_question("Phở Đà Nẵng", [WEATHER]) == "Phở Đà Nẵng"


def test_a_full_question_stands_alone():
    assert standalone_question("eSIM mua ở đâu?", [WHEN]) == "eSIM mua ở đâu?"
    assert standalone_question("Gợi ý các quán phở ngon tại Đà Nẵng", [WHEN]) == "Gợi ý các quán phở ngon tại Đà Nẵng"


def test_no_history_nothing_to_complete():
    assert standalone_question("Khu vực Đà Nẵng", []) == "Khu vực Đà Nẵng"


def test_greetings_and_insults_are_never_completed():
    assert standalone_question("xin chào", [WHEN]) == "xin chào"
    assert standalone_question("đồ ngu", [WHEN]) == "đồ ngu"


def test_what_counts_as_a_fragment():
    assert is_fragment("Khu vực Đà Nẵng")
    assert is_fragment("tháng 3")
    assert is_fragment("what about Hue")
    assert not is_fragment("Đà Nẵng có gì vui?")
    assert not is_fragment("where is Hue")
    assert not is_fragment("Gợi ý quán phở")


def test_a_place_asked_with_thi_sao_is_still_a_narrowing():
    da_nang = NS(question="Khu vực Đà Nẵng", reply="Đà Nẵng đẹp nhất từ tháng 2 đến tháng 5.")
    assert standalone_question("còn Huế thì sao?", [WHEN, da_nang]) == "Khi nào thì nên đi du lịch - còn Huế thì sao?"
    assert is_fragment("Phú Quốc thì sao?")
    assert not is_fragment("Đà Nẵng có gì vui thì sao")
