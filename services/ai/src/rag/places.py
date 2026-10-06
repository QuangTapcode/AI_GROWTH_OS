"""Old and new Da Nang place names after the 1 July 2025 reorganisation.

Users, guides and POI datasets still say "Son Tra district" or "My An"; new sources say
"An Hai ward". Retrieval expands a question with the matching names so both kinds of
text are found. The notes are search hints, not citable facts.
"""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "danang_wards_2025.json"
MAX_NOTES = 6


def fold(text: str) -> str:
    """Lowercase ASCII form: 'Ngũ Hành Sơn' -> 'ngu hanh son'."""

    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text.lower())).strip()


def _plain(name: str) -> str:
    return re.sub(r"\s*\((part|remainder)\)$", "", name)


@lru_cache(maxsize=1)
def _aliases() -> tuple[tuple[str, str], ...]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    pairs: list[tuple[str, str]] = []
    for item in data["wards"]:
        ward = item["ward"]
        former = ", ".join(_plain(name) for name in item["former_units"])
        pairs.append((fold(ward), f"{ward} ward (since 1 July 2025) covers the former wards/communes {former}"))
        for name in item["former_units"]:
            plain = _plain(name)
            if fold(plain) != fold(ward):
                pairs.append((fold(plain), f"former {plain} is now part of {ward} ward"))
    for district, wards in data["former_districts"].items():
        note = f"former {district} district (abolished 1 July 2025) is now mostly {', '.join(wards)} wards"
        pairs.append((fold(f"{district} district"), note))
        pairs.append((fold(f"quan {district}"), note))
    for landmark, wards in data["landmarks"].items():
        pairs.append((fold(landmark), f"{landmark} is in {', '.join(wards)} ward(s) after the 2025 reorganisation"))
    # Longest alias first so "son tra district" wins over "son tra" for the same span.
    return tuple(sorted(pairs, key=lambda pair: len(pair[0]), reverse=True))


def place_notes(question: str) -> list[str]:
    folded = f" {fold(question)} "
    notes: list[str] = []
    for alias, note in _aliases():
        if f" {alias} " in folded and note not in notes:
            notes.append(note)
        if len(notes) >= MAX_NOTES:
            break
    return notes
