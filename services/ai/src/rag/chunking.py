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


def chunk_segments(segments: list[Segment], *, max_tokens: int = 512, target_tokens: int = 350) -> list[Chunk]:
    target_tokens = min(target_tokens, max_tokens)
    chunks: list[Chunk] = []
    buffer: list[Segment] = []

    def flush() -> None:
        if not buffer:
            return
        text = "\n\n".join(segment.text for segment in buffer)
        first, last = buffer[0], buffer[-1]
        chunks.append(
            Chunk(
                index=len(chunks),
                text=text,
                locator=_locator(first.page, first.paragraph, last.paragraph),
                page=first.page,
                url=first.url,
                paragraph_start=first.paragraph,
                paragraph_end=last.paragraph,
                token_estimate=estimate_tokens(text),
                content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
            )
        )
        buffer.clear()

    for segment in segments:
        if estimate_tokens(segment.text) > max_tokens:
            flush()
            for piece in _split_long(segment.text, max_tokens):
                buffer.append(Segment(text=piece, paragraph=segment.paragraph, page=segment.page, url=segment.url))
                flush()
            continue
        if buffer and (buffer[-1].page != segment.page or buffer[-1].url != segment.url):
            flush()
        pending = "\n\n".join([*(item.text for item in buffer), segment.text])
        if buffer and estimate_tokens(pending) > target_tokens:
            flush()
        buffer.append(segment)
    flush()
    return chunks
