"""Deterministic fact guardrails: sensitive facts come from verified structured facts only.

Prices, addresses and availability are never taken from free text or model output.
If the approved snapshot has no verified value, the answer says the fact is missing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SensitiveFact:
    key: str
    label: str
    warning: str
    pattern: re.Pattern[str]
    # A more specific intent that, when also present, makes this generic one redundant.
    superseded_by: tuple[str, ...] = ()
    verb: str = "is"


_PRICE = r"(price|prices|pricing|cost|costs|how much|fee|fees)"
_MONTH = r"(month|monthly|per month)"
_UNIT = r"(unit|units|apartment|apartments|room|rooms|residence|studio|flat)"

SENSITIVE_FACTS = (
    SensitiveFact(
        "monthly_rent",
        "monthly rent",
        "MISSING_VERIFIED_PRICE",
        re.compile(rf"\b(rent|rents|rental)\b|\b{_PRICE}\b.*\b{_MONTH}\b|\b{_MONTH}\b.*\b{_PRICE}\b", re.I),
    ),
    SensitiveFact("deposit", "deposit", "MISSING_VERIFIED_PRICE", re.compile(r"\bdeposits?\b", re.I)),
    SensitiveFact(
        "price",
        "price",
        "MISSING_VERIFIED_PRICE",
        re.compile(rf"\b{_PRICE}\b", re.I),
        superseded_by=("monthly_rent", "deposit"),
    ),
    # "street" alone matches place names ("Example Food Street"), so only explicit address wording counts.
    SensitiveFact(
        "address",
        "address",
        "MISSING_VERIFIED_ADDRESS",
        re.compile(r"\baddress(es)?\b|\b(which|what) street\b", re.I),
    ),
    # PRD M02: opening hours are never fabricated; POI/guide hours are third-party and often stale.
    SensitiveFact(
        "opening_hours",
        "opening hours",
        "MISSING_VERIFIED_HOURS",
        re.compile(
            r"\bopening (hours|times?)\b|\b(business|office) hours\b|\bhours of operation\b|\bopen now\b"
            r"|\b(what time|when)\b.{0,40}\b(open|opens|close|closes)\b",
            re.I,
        ),
        verb="are",
    ),
    SensitiveFact(
        "availability",
        "availability",
        "MISSING_VERIFIED_AVAILABILITY",
        # "available" alone is too broad ("what food is available"); require a housing unit or move-in wording.
        re.compile(
            rf"\b(vacancy|vacancies|vacant|move in|move-in)\b"
            rf"|\b(available|availability)\b.*\b{_UNIT}\b|\b{_UNIT}\b.*\b(available|availability)\b",
            re.I,
        ),
    ),
)

_NUMBER = re.compile(r"\d[\d.,]*")
_PRICE_CLAIM = re.compile(
    r"\d[\d.,]*\s*(vnd|usd|dong|đ|million|k)\b"
    r"|(\$|€|usd|vnd)\s*\d"
    r"|\d[\d.,]*\s*(per|a|/)\s*month"
    r"|\b(rent|rents|rental|price|prices|cost|costs|fee|fees|deposit)\b[^.!?]*\d",
    re.I,
)


def has_price_claim(text: str) -> bool:
    """True when free text states a price; prices may only come from verified structured facts."""

    return bool(_PRICE_CLAIM.search(text))


def sensitive_keys_in(question: str) -> list[SensitiveFact]:
    hits = [fact for fact in SENSITIVE_FACTS if fact.pattern.search(question)]
    keys = {fact.key for fact in hits}
    return [fact for fact in hits if not keys.intersection(fact.superseded_by)]


def is_verified_value(value: object, verification: str | None) -> bool:
    return value is not None and value != "" and verification == "verified"


PLURAL_LABELS = frozenset(fact.label for fact in SENSITIVE_FACTS if fact.verb == "are")


def missing_answer(labels: list[str]) -> str:
    if any(label in PLURAL_LABELS for label in labels):
        # "a verified opening hours" is wrong; give each item its own article.
        items = [f"verified {label}" if label in PLURAL_LABELS else f"a verified {label}" for label in labels]
    else:
        items = [f"a verified {labels[0]}", *labels[1:]]
    joined = items[0] if len(items) == 1 else ", ".join(items[:-1]) + f" or {items[-1]}"
    return f"The available sources do not include {joined}."


def _digit_runs(text: str) -> set[str]:
    return {re.sub(r"\D", "", match) for match in _NUMBER.findall(text)} - {""}


def unsupported_numbers(answer: str, evidence_texts: list[str]) -> list[str]:
    """Numbers in the answer that do not appear in any cited evidence text."""

    allowed: set[str] = set()
    for text in evidence_texts:
        allowed |= _digit_runs(text)
    return sorted(number for number in _digit_runs(answer) if number not in allowed)
