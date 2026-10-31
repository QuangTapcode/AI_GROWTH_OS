"""Sentence-level lexical support: flags generated sentences that add detail the sources lack.

A sentence is unsupported when fewer than SUPPORT_MIN of its content words (longer than three
letters, lightly stemmed) occur in the grounding texts. Calibrated on real qwen3:8b drafts
(26/10): embellishments such as "Modular furniture, tech compatibility, and comfort are key."
scored <= 0.20 against the cited passage, while restated source sentences scored >= 0.33.
This is a heuristic filter for invented specifics, not a proof of factual accuracy.
"""
from __future__ import annotations

import re

from ..rag.retrieval import terms

SUPPORT_MIN = 0.25
MIN_CONTENT_WORDS = 4
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_SUFFIX = re.compile(r"(ing|ed|es|s)$")


def _stems(text: str) -> set[str]:
    return {_SUFFIX.sub("", word) for word in terms(text) if len(word) > 3}


def unsupported_sentences(text: str, grounding: list[str]) -> list[str]:
    known = _stems(" ".join(grounding))
    flagged = []
    for sentence in _SENTENCE.split(text):
        sentence = sentence.strip()
        if not sentence or sentence.startswith("#") or sentence.endswith("?"):
            # Headings are checked as structure; questions invite readers and assert nothing.
            continue
        words = _stems(sentence)
        if len(words) >= MIN_CONTENT_WORDS and len(words & known) / len(words) < SUPPORT_MIN:
            flagged.append(sentence)
    return flagged


def strip_unsupported(text: str, grounding: list[str]) -> tuple[str, list[str]]:
    """Remove unsupported sentences, keeping line structure; returns (clean text, removed sentences)."""
    removed = unsupported_sentences(text, grounding)
    for sentence in removed:
        text = text.replace(sentence, "")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text, removed
