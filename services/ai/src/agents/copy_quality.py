"""Deterministic copy repairs applied before a draft can be approved or posted.

Small local models cut sentences off mid-word ("...scene doesn") or end them on a connector
("...close to the"). Such a line says nothing complete, so it is removed and reported.
"""
from __future__ import annotations

import re

# Contraction stems missing their "'t" and words a complete sentence does not end on.
_DANGLING = {"doesn", "isn", "wasn", "aren", "weren", "don", "didn", "can", "couldn", "shouldn", "wouldn",
             "won", "haven", "hasn", "hadn", "the", "a", "an", "to", "of", "and", "or", "but", "for", "with",
             "in", "on", "at", "by", "from", "that", "which", "your", "their", "our", "is", "are", "be",
             "before", "after", "about", "into", "than", "as", "if", "when", "while", "because", "so", "this", "these"}
_LAST_WORD = re.compile(r"([A-Za-z]+)\W*$")
_WORD = re.compile(r"[^\W\d_]+")
# A bare number starting a line or sentence, right before a capitalized name.
_LIST_NUMBER = re.compile(r"(?:(?<=^)|(?<=\n)|(?<=[.!?]\s))\d{1,3}\s+(?=[A-ZÀ-Ỹ])")
_UPDATE_STAMP = re.compile(r"\s*\(\s*updated\s+(?:[A-Za-z]{3,9}\s+)?\d{4}\s*\)|(?<=[.!?\n])\s*\bupdated\s+(?:[A-Za-z]{3,9}\s+)?\d{4}\.?",
                           re.IGNORECASE)
REPEAT_OVERLAP = 0.6
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


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


def shorten(text: str, limit: int) -> str:
    """Fit a display limit on a sentence or word boundary.

    Ollama enforces schema limits while generating, so a limit in the draft schema stops the model
    mid-phrase; draft schemas allow more and the display limit is applied here.
    """
    text = text.strip()
    if len(text) <= limit:
        return text
    head = text[:limit]
    # A finished sentence, when it keeps most of the text.
    end = max(head.rfind(mark) for mark in (". ", "! ", "? "))
    if end >= limit // 2:
        return head[:end + 1]
    words = head[:head.rfind(" ")].split() if " " in head else [head]
    while len(words) > 1 and ends_mid_sentence(words[-1]):
        words.pop()
    return " ".join(words).rstrip(" ,;:–-—")


def strip_listing_artifacts(text: str) -> str:
    """Remove what listing pages add around an entry: its list number ("11 Cơm Nhà Linh") and date stamp."""
    return _LIST_NUMBER.sub("", _UPDATE_STAMP.sub("", text)).strip()


def repeats_line(line: str, reference: str) -> bool:
    """The line restates most of the reference line; sharing the topic's words is not enough."""
    words, known = _content_words(line), _content_words(reference)
    return bool(words and known) and len(words & known) / len(known) >= REPEAT_OVERLAP


def _content_words(text: str) -> set[str]:
    return {word.casefold() for word in _WORD.findall(text) if len(word) > 3}


def ends_in_cut_word(sentence: str, known_words: set[str]) -> bool:
    """The sentence stops on the start of a longer source word ("newcom" for "newcomers") with no end mark."""
    stripped = sentence.strip()
    words = _WORD.findall(stripped)
    if not words or stripped.endswith((".", "!", "?", ":")):
        return False
    last = words[-1].casefold()
    return last not in known_words and any(word.startswith(last) for word in known_words)


def drop_broken_sentences(text: str, keep_cjk: bool = False, grounding: list[str] = ()) -> tuple[str, list[str]]:
    """Remove sentences that stop mid-way or slip into another script, keeping line structure.

    The local model is a Qwen build: it sometimes drifts into Chinese in the middle of English copy.
    """
    known_words = {word.casefold() for word in _WORD.findall(" ".join(grounding))}
    removed, lines = [], []
    for line in text.split("\n"):
        kept = []
        for sentence in _SENTENCE.split(line):
            if ends_mid_sentence(sentence) or (not keep_cjk and has_cjk(sentence)) or ends_in_cut_word(sentence, known_words):
                removed.append(sentence.strip())
            else:
                kept.append(sentence)
        lines.append(" ".join(kept))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip(), removed


def has_cjk(text: str) -> bool:
    return bool(_CJK.search(text))


def ends_mid_sentence(text: str) -> bool:
    """The text stops on a word a complete sentence does not end on; a mere missing full stop is fine."""
    stripped = text.strip()
    last = _LAST_WORD.search(stripped)
    return bool(stripped and not stripped.endswith((".", "!", "?", ":")) and last and last.group(1).lower() in _DANGLING)


def drop_truncated_lines(text: str) -> tuple[str, list[str]]:
    """Remove lines that end mid-sentence; returns (clean text, removed lines)."""
    kept, removed = [], []
    for line in text.split("\n"):
        stripped = line.strip()
        if ends_mid_sentence(stripped):
            removed.append(stripped)
            continue
        kept.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip(), removed
