"""Deterministic fact guardrails used by knowledge.answer."""

from __future__ import annotations

import pytest

from src.guardrails.facts import has_price_claim, missing_answer, sensitive_keys_in, unsupported_numbers


@pytest.mark.parametrize(
    ("question", "keys"),
    [
        ("What is the monthly rent?", ["monthly_rent"]),
        ("How much is the monthly rent at Example Residence?", ["monthly_rent"]),
        ("How much does Example Residence cost per month?", ["monthly_rent"]),
        ("How much is the deposit at Example Residence?", ["deposit"]),
        ("What are the coworking day pass fees?", ["price"]),
        ("What is the street address of Example Residence?", ["address"]),
        ("Which street is Example Residence on?", ["address"]),
        ("Is a unit available to move in next month?", ["availability"]),
        ("Are any apartments available?", ["availability"]),
        ("What is the rent and the address?", ["monthly_rent", "address"]),
        # Not sensitive: answered from retrieved, cited chunks.
        ("What food is available near Han Market?", []),
        ("Which monthly events happen in Da Nang?", []),
        ("Which area of Da Nang is Example Residence in?", []),
        ("Where is Example Residence located?", []),
        ("What are the coworking space opening hours?", ["opening_hours"]),
        ("When does Han Market open?", ["opening_hours"]),
        ("Is the rooftop terrace at Example Residence open?", []),
        ("What does the Example Food Street source say about Example Residence?", []),
    ],
)
def test_sensitive_intents(question: str, keys: list[str]) -> None:
    assert [fact.key for fact in sensitive_keys_in(question)] == keys


def test_missing_answer_wording() -> None:
    assert missing_answer(["monthly rent"]) == "The available sources do not include a verified monthly rent."
    assert missing_answer(["address"]) == "The available sources do not include a verified address."
    assert missing_answer(["monthly rent", "address"]) == (
        "The available sources do not include a verified monthly rent or address."
    )
    assert missing_answer(["opening hours"]) == "The available sources do not include verified opening hours."
    assert missing_answer(["monthly rent", "opening hours"]) == (
        "The available sources do not include a verified monthly rent or verified opening hours."
    )


def test_unsupported_numbers_require_cited_text() -> None:
    assert unsupported_numbers("Open 8:00 to 20:00.", ["Opening hours are 8:00 to 20:00 on weekdays."]) == []
    assert unsupported_numbers("Rent is 5,000,000 VND.", ["Rent has not been published."]) == ["5000000"]


@pytest.mark.parametrize(
    ("text", "is_price"),
    [
        ("Example Residence costs 5,000,000 VND per month.", True),
        ("The rent is 9,000,000.", True),
        ("A desk is $120.", True),
        ("Units go for 300 per month.", True),
        ("The coworking space opening hours are 8:00 to 20:00 on weekdays.", False),
        ("Day passes are offered; prices are not listed in this source.", False),
        ("It has 2 meeting rooms.", False),
    ],
)
def test_price_claims_in_free_text(text: str, is_price: bool) -> None:
    assert has_price_claim(text) is is_price
