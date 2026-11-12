"""Chunks follow the page's sections: a heading opens the chunk about it, and no scrap is left on its own."""
from src.rag.chunking import chunk_segments
from src.rag.parsing import Segment

LONG = "Da Nang has a dry season from February to August, with the sunniest weather from April to June. " * 9


def seg(text, n):
    return Segment(text=text, paragraph=n, url="https://en.wikivoyage.org/wiki/Da_Nang")


def test_a_heading_starts_the_chunk_about_it_instead_of_ending_the_one_before():
    rain = "The rainy season runs from September to December, with typhoons possible in October and November. " * 3
    chunks = chunk_segments([seg(LONG, 1), seg("Climate", 2), seg(rain, 3)], max_tokens=512, target_tokens=350)
    assert not any(c.text.rstrip().endswith("Climate") for c in chunks)
    assert any(c.text.startswith("Climate\n\nThe rainy season") for c in chunks)


def test_a_short_last_piece_joins_the_chunk_before_it():
    chunks = chunk_segments([seg(LONG, 1), seg(LONG, 2), seg("Arrive early to beat the heat.", 3)], max_tokens=512, target_tokens=350)
    assert all(len(c.text) >= 200 for c in chunks)
    assert chunks[-1].text.endswith("Arrive early to beat the heat.")


def test_a_sentence_is_not_mistaken_for_a_heading():
    chunks = chunk_segments([seg(LONG, 1), seg("Bring a raincoat.", 2), seg(LONG, 3)], max_tokens=512, target_tokens=350)
    assert not any(c.text.startswith("Bring a raincoat.") for c in chunks)


def test_a_heading_stays_with_a_long_section_that_must_be_split():
    huge = "The citadel walls run ten kilometres around the old imperial city and its moat. " * 40
    chunks = chunk_segments([seg(LONG, 1), seg("Citadel of Hue", 2), seg(huge, 3)], max_tokens=512, target_tokens=350)
    assert not any(c.text.strip() == "Citadel of Hue" for c in chunks)
    assert any(c.text.startswith("Citadel of Hue\n\nThe citadel walls") for c in chunks)


def test_scraps_and_navigation_leftovers_never_become_chunks_of_their_own():
    chunks = chunk_segments([seg(LONG, 1), seg("Sleep", 2), seg("Stay safe", 3), seg("v", 4), seg("t", 5), seg("e", 6)],
                            max_tokens=512, target_tokens=350)
    assert all(len(c.text) >= 150 for c in chunks)
    assert not any(c.text.strip().endswith("v\n\nt\n\ne") for c in chunks)
