"""Source extraction for knowledge.ingest: plain text, PDF with a text layer, allowlisted URL.

There is no OCR path on purpose: a PDF without extractable text is reported as
unsupported so nobody mistakes an empty index for an ingested document.
"""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from ..app.config import Settings
from ..app.runtime import OperationError


PARSER_VERSION = "w1-parser-1"

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACES = re.compile(r"[ \t ]+")
_BLANK_LINES = re.compile(r"\n\s*\n+")


@dataclass(frozen=True)
class Segment:
    """One paragraph with its citation position."""

    text: str
    paragraph: int
    page: int | None = None
    url: str | None = None


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_CHARS.sub("", text)
    lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _paragraphs(text: str) -> list[str]:
    blocks = _BLANK_LINES.split(normalize_text(text))
    return [" ".join(line for line in block.split("\n") if line) for block in blocks if block.strip()]


def parse_text(text: str) -> list[Segment]:
    return [Segment(text=paragraph, paragraph=index) for index, paragraph in enumerate(_paragraphs(text), start=1)]


def parse_pdf(data: bytes) -> tuple[list[Segment], int, list[int]]:
    """Return segments, page count and pages without a text layer."""

    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise OperationError("UNSUPPORTED_PDF_ENCRYPTED", "Encrypted PDF is not supported")
        pages = [page.extract_text() or "" for page in reader.pages]
    except OperationError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        raise OperationError("INVALID_PDF", "PDF could not be parsed") from exc

    segments: list[Segment] = []
    empty_pages: list[int] = []
    for page_number, page_text in enumerate(pages, start=1):
        paragraphs = _paragraphs(page_text)
        if not paragraphs:
            empty_pages.append(page_number)
            continue
        # Paragraph numbering restarts per page so a locator reads "page:2;paragraph:1".
        segments.extend(
            Segment(text=paragraph, paragraph=index, page=page_number)
            for index, paragraph in enumerate(paragraphs, start=1)
        )
    if not segments:
        raise OperationError(
            "UNSUPPORTED_PDF_NO_TEXT",
            "PDF has no extractable text layer; OCR is not supported in the pilot",
        )
    return segments, len(pages), empty_pages


_SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "nav", "footer", "header", "form", "iframe"}
_BLOCK_TAGS = {
    "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "td", "th",
    "section", "article", "main", "aside", "blockquote", "pre", "table", "dd", "dt",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
        elif not self._skip_depth:
            self.parts.append(data)


def parse_html(html: str, url: str) -> tuple[list[Segment], str | None]:
    extractor = _TextExtractor()
    extractor.feed(html)
    extractor.close()
    title = normalize_text(" ".join(extractor.title_parts)) or None
    segments = [
        Segment(text=paragraph, paragraph=index, url=url)
        for index, paragraph in enumerate(_paragraphs("".join(extractor.parts)), start=1)
    ]
    return segments, title


def check_url_allowed(url: str, allowlist: tuple[str, ...]) -> None:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme not in {"http", "https"} or not host:
        raise OperationError("URL_NOT_ALLOWED", "Only absolute http(s) URLs can be ingested")
    if parts.username or parts.password:
        raise OperationError("URL_NOT_ALLOWED", "URLs with credentials are not allowed")
    if not any(host == domain or host.endswith(f".{domain}") for domain in allowlist):
        raise OperationError("URL_NOT_ALLOWED", f"Host {host} is not in the ingest allowlist")


async def fetch_url(url: str, settings: Settings) -> tuple[str, str]:
    """Fetch an allowlisted page; every redirect hop is re-checked against the allowlist."""

    current = url
    async with httpx.AsyncClient(timeout=settings.url_fetch_timeout_seconds, follow_redirects=False) as client:
        for _ in range(4):
            check_url_allowed(current, settings.ingest_url_allowlist)
            try:
                async with client.stream("GET", current, headers={"User-Agent": "AI-Growth-OS-ingest/0.1"}) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise OperationError("URL_FETCH_FAILED", "Redirect without location")
                        current = urljoin(current, location)
                        continue
                    if response.status_code >= 400:
                        raise OperationError(
                            "URL_FETCH_FAILED",
                            f"Source URL returned HTTP {response.status_code}",
                            retryable=response.status_code >= 500,
                        )
                    content_type = response.headers.get("content-type", "").lower()
                    if not content_type.startswith(("text/html", "text/plain", "application/xhtml")):
                        raise OperationError("UNSUPPORTED_CONTENT_TYPE", f"Unsupported content type {content_type}")
                    body = bytearray()
                    async for piece in response.aiter_bytes():
                        body.extend(piece)
                        if len(body) > settings.max_source_bytes:
                            raise OperationError("SOURCE_TOO_LARGE", "Fetched page exceeds the source size limit")
                    return current, body.decode(response.encoding or "utf-8", errors="replace")
            except httpx.HTTPError as exc:
                raise OperationError("URL_FETCH_FAILED", "Source URL could not be fetched", retryable=True) from exc
    raise OperationError("URL_FETCH_FAILED", "Too many redirects")
