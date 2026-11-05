"""Sentence-level lexical support: flags generated sentences that add detail the sources lack.

A sentence is unsupported when fewer than SUPPORT_MIN of its content words (longer than three
letters, lightly stemmed) occur in the grounding texts. Calibrated on real qwen3:8b drafts
(26/10): embellishments such as "Modular furniture, tech compatibility, and comfort are key."
scored <= 0.20 against the cited passage, while restated source sentences scored >= 0.33.
This is a heuristic filter for invented specifics, not a proof of factual accuracy.
"""
from __future__ import annotations

import re
import unicodedata

from ..rag.retrieval import terms

SUPPORT_MIN = 0.25
MIN_CONTENT_WORDS = 4
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_SUFFIX = re.compile(r"(ing|ed|es|s)$")
# A name on more entries than this describes the page, not one entry, so a claim cannot be tied to it.
MAX_ENTRIES_OF_A_NAME = 2
GENERAL_NAMES = {"vietnam", "vietnamese"}
# Listing pages keep one numbered entry per place, often inside one paragraph.
_SOURCE_ENTRY = re.compile(r"\n+|(?<=[.!?)])\s+(?=\d{1,3}\s+[^\W\d_])")
_TOKEN = re.compile(r"[^\W_]+")
_ONLY_A_LIST = re.compile(r"[\s,;/&]*(?:and|or)?[\s,;/&]*")
_PRAISE = re.compile(r"\b(?:hidden gems?|must[- ](?:try|see|visit|have)|world[- ]class|award[- ]winning|unmissable|unbeatable"
                     r"|legendary|top[- ]rated|second to none|one of the best)\b", re.IGNORECASE)


def _stems(text: str) -> set[str]:
    return {_SUFFIX.sub("", word) for word in terms(text) if len(word) > 3}


def unsupported_sentences(text: str, grounding: list[str], minimum: float = SUPPORT_MIN, min_words: int = MIN_CONTENT_WORDS) -> list[str]:
    known = _stems(" ".join(grounding))
    flagged = []
    for sentence in _SENTENCE.split(text):
        sentence = sentence.strip()
        if not sentence or sentence.startswith("#") or sentence.endswith("?"):
            # Headings are checked as structure; questions invite readers and assert nothing.
            continue
        words = _stems(sentence)
        if len(words) >= min_words and len(words & known) / len(words) < minimum:
            flagged.append(sentence)
    return flagged


def strip_unsupported(text: str, grounding: list[str], minimum: float = SUPPORT_MIN, min_words: int = MIN_CONTENT_WORDS) -> tuple[str, list[str]]:
    """Remove unsupported sentences, keeping line structure; returns (clean text, removed sentences)."""
    removed = unsupported_sentences(text, grounding, minimum, min_words)
    return _without(text, removed), removed


def _plain(text: str) -> str:
    """Compared without diacritics: the model writes "mi quang" for "mì quảng" and "Da Nang" for "Đà Nẵng"."""
    decomposed = unicodedata.normalize("NFKD", text.replace("Đ", "D").replace("đ", "d"))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


def _names_in(sentence: str) -> set[str]:
    """Runs of capitalised or Vietnamese words and their leading parts: "Quán Dung Mỳ Quảng" is also "Quán Dung"."""
    runs, run, end = [], [], 0
    for match in _TOKEN.finditer(sentence):
        word = match.group()
        name_like = not word.isascii() or word[0].isupper() or (bool(run) and word.isdigit())
        if run and (not name_like or sentence[end:match.start()] != " "):
            runs.append(run)
            run = []
        if name_like:
            run.append(word)
        end = match.end()
    if run:
        runs.append(run)
    opening = _TOKEN.match(sentence)
    names = set()
    for run in runs:
        variants = [run]
        # A plain word opening the sentence is capitalised by grammar: "Try Quán Thảo", "Known for".
        if opening and run[0] == opening.group() and run[0].isascii():
            variants = [run, run[1:]] if len(run) > 1 else []
        for words in variants:
            sizes = range(2, len(words) + 1) if len(words) > 1 else [len(words)]
            names.update(_plain(" ".join(words[:size])) for size in sizes)
    return names


def source_entries(passage: str) -> list[str]:
    """A passage split into what it says about one thing each: numbered listing entries, or lines."""
    return [entry for entry in _SOURCE_ENTRY.split(passage) if entry.strip()]


def strip_unfaithful(text: str, passages: list[str], common: list[str] = ()) -> tuple[str, list[str]]:
    """Remove sentences whose words are all in the sources while the claim is not; returns (clean text, removed sentences).

    Two names joined by a claim, not just by a list, must share one source entry. `common` holds what
    applies to every entry, such as the places the business serves. Names the sources never mention are
    left to the other checks. Lexical like them: it catches a venue tied to another entry's dish and
    praise no source gives, not every wrong reading.
    """
    raw_entries = [entry for passage in passages for entry in source_entries(passage)]
    entries = [_plain(entry) for entry in raw_entries]
    ignored = GENERAL_NAMES | {_plain(name) for name in common}
    entries_of = {}
    for name in {name for entry in raw_entries for sentence in _SENTENCE.split(entry) for name in _names_in(sentence)} - ignored:
        holding = {index for index, entry in enumerate(entries) if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", entry)}
        if 0 < len(holding) <= MAX_ENTRIES_OF_A_NAME:
            entries_of[name] = holding
    alternatives = "|".join(re.escape(name) for name in sorted(entries_of, key=len, reverse=True))
    names = re.compile(rf"(?<!\w)(?:{alternatives})(?!\w)") if alternatives else None
    source_text = " ".join(entries)
    removed = []
    for sentence in _SENTENCE.split(text):
        sentence = sentence.strip()
        if not sentence or sentence.startswith("#") or sentence.endswith("?"):
            continue
        plain = _plain(sentence)
        found = list(names.finditer(plain)) if names else []
        crossed = any(not _ONLY_A_LIST.fullmatch(plain[first.end():second.start()])
                      and not entries_of[first.group()] & entries_of[second.group()] for first, second in zip(found, found[1:]))
        praise = _PRAISE.search(sentence)
        if crossed or (praise and _plain(praise.group()) not in source_text):
            removed.append(sentence)
    return _without(text, removed), removed


def _without(text: str, removed: list[str]) -> str:
    for sentence in removed:
        text = text.replace(sentence, "")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()
