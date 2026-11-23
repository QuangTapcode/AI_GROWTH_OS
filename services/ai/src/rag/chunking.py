"""Paragraph-preserving chunking with citation locators.

Chunks never span two pages or two URLs, so a citation always resolves to the
page/URL it came from. Token counts are a conservative estimate (3 chars/token)
until the worker pins the embedding tokenizer.
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass

from .parsing import Segment


_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 3))


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    locator: str
    page: int | None
    url: str | None
    paragraph_start: int
    paragraph_end: int
    token_estimate: int
    content_hash: str


def _locator(page: int | None, start: int, end: int) -> str:
    paragraphs = f"paragraph:{start}" if start == end else f"paragraph:{start}-{end}"
    return f"page:{page};{paragraphs}" if page is not None else paragraphs


def _split_long(text: str, max_tokens: int) -> list[str]:
    """Split one oversized paragraph on sentences, then on words as a last resort."""

    pieces: list[str] = []
    current = ""
    for sentence in _SENTENCE_END.split(text):
        candidate = f"{current} {sentence}".strip()
        if estimate_tokens(candidate) <= max_tokens:
            current = candidate
            continue
        if current:
            pieces.append(current)
        if estimate_tokens(sentence) <= max_tokens:
            current = sentence
            continue
        current = ""
        for word in sentence.split(" "):
            candidate = f"{current} {word}".strip()
            if estimate_tokens(candidate) > max_tokens and current:
                pieces.append(current)
                current = word
            else:
                current = candidate
    if current:
        pieces.append(current)
    return pieces


_HEADING_NOT_END = ('.', '!', '?', ';', ':', ',', '…', '"', '”', "'", ')')


def looks_like_heading(text: str) -> bool:
    """A section title the HTML parser flattened into a paragraph: short, one line, no sentence ending."""
    line = text.strip()
    return (0 < len(line) <= 80 and "\n" not in line and not line.endswith(_HEADING_NOT_END)
            and len(line.split()) <= 10 and any(ch.isalpha() for ch in line))


# A chunk shorter than this says too little to be found or quoted on its own.
MIN_CHUNK_CHARS = 150
_REAL_WORD = re.compile(r"[^\W\d_]{2,}")


def _has_words(text: str) -> bool:
    """Navigation leftovers ("v", "t", "e" under a Wikipedia navbox) carry no word to search for."""
    return bool(_REAL_WORD.search(text))


def chunk_segments(segments: list[Segment], *, max_tokens: int = 512, target_tokens: int = 350) -> list[Chunk]:
    target_tokens = min(target_tokens, max_tokens)
    groups: list[list[Segment]] = []
    buffer: list[Segment] = []

    def flush() -> None:
        if buffer:
            groups.append(list(buffer))
            buffer.clear()

    def trailing_heading() -> list[Segment]:
        # A heading never ends a chunk: it moves on to the text it introduces.
        return [buffer.pop()] if buffer and looks_like_heading(buffer[-1].text) else []

    for segment in segments:
        if not _has_words(segment.text):
            continue
        if buffer and (buffer[-1].page != segment.page or buffer[-1].url != segment.url):
            flush()
        if estimate_tokens(segment.text) > max_tokens:
            carried = trailing_heading()
            flush()
            room = max_tokens - sum(estimate_tokens(item.text) + 1 for item in carried)
            for number, piece in enumerate(_split_long(segment.text, room)):
                if number == 0:
                    buffer.extend(carried)
                buffer.append(Segment(text=piece, paragraph=segment.paragraph, page=segment.page, url=segment.url))
                flush()
            continue
        pending = "\n\n".join([*(item.text for item in buffer), segment.text])
        # A heading opens the chunk about its section rather than closing the one before it.
        opens_section = looks_like_heading(segment.text) and estimate_tokens("\n\n".join(i.text for i in buffer)) >= target_tokens // 3
        if buffer and (estimate_tokens(pending) > target_tokens or opens_section):
            carried = trailing_heading() if len(buffer) > 1 else []
            flush()
            buffer.extend(carried)
        buffer.append(segment)
    flush()
    return [_chunk(index, group) for index, group in enumerate(_merge_scraps(groups, max_tokens))]


def _merge_scraps(groups: list[list[Segment]], max_tokens: int) -> list[list[Segment]]:
    """Join a group too short to stand alone to its neighbour on the same page/URL, when the result fits."""
    text = lambda group: "\n\n".join(item.text for item in group)
    same_place = lambda a, b: a[-1].page == b[0].page and a[-1].url == b[0].url
    merged: list[list[Segment]] = []
    for group in groups:
        if merged and same_place(merged[-1], group) and (len(text(group)) < MIN_CHUNK_CHARS or len(text(merged[-1])) < MIN_CHUNK_CHARS)                 and estimate_tokens(text(merged[-1] + group)) <= max_tokens:
            merged[-1] = merged[-1] + group
        else:
            merged.append(group)
    return merged


def _chunk(index: int, group: list[Segment]) -> Chunk:
    text = "\n\n".join(segment.text for segment in group)
    first, last = group[0], group[-1]
    return Chunk(
        index=index,
        text=text,
        locator=_locator(first.page, first.paragraph, last.paragraph),
        page=first.page,
        url=first.url,
        paragraph_start=first.paragraph,
        paragraph_end=last.paragraph,
        token_estimate=estimate_tokens(text),
        content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )
