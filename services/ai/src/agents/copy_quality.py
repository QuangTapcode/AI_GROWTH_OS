"""Deterministic copy repairs applied before a draft can be approved or posted.

Small local models cut sentences off mid-word ("...scene doesn") or end them on a connector
("...close to the"). Such a line says nothing complete, so it is removed and reported.
"""
from __future__ import annotations

import re

# Contraction stems missing their "'t" and words a complete sentence does not end on.
_DANGLING = {"doesn", "isn", "wasn", "aren", "weren", "don", "didn", "can", "couldn", "shouldn", "wouldn",
             "won", "haven", "hasn", "hadn", "the", "a", "an", "to", "of", "and", "or", "but", "for", "with",
             "in", "on", "at", "by", "from", "that", "which", "your", "their", "our", "is", "are", "be"}
_LAST_WORD = re.compile(r"([A-Za-z]+)\W*$")


def canonical_locations(text: str, locations: list[str]) -> str:
    """Respell a profile location the model split inside a word ("Da N-ang") as the profile writes it.

    Words must be separated by spaces and the match must contain an in-word hyphen, so URL slugs
    such as "/da-nang-guide" and correct spellings are left untouched.
    """
    for location in locations:
        words = location.split()
        if not words:
            continue
        pattern = r"\s+".join("-?".join(re.escape(ch) for ch in word) for word in words)
        text = re.sub(rf"(?<![\w/-]){pattern}(?![\w/-])",
                      lambda m: location if "-" in m.group(0) else m.group(0), text, flags=re.IGNORECASE)
    return text


def drop_truncated_lines(text: str) -> tuple[str, list[str]]:
    """Remove lines that end mid-sentence; returns (clean text, removed lines)."""
    kept, removed = [], []
    for line in text.split("\n"):
        stripped = line.strip()
        last = _LAST_WORD.search(stripped)
        if stripped and not stripped.endswith((".", "!", "?", ":")) and last and last.group(1).lower() in _DANGLING:
            removed.append(stripped)
            continue
        kept.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip(), removed
