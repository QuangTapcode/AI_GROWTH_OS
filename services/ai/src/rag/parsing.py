"""Source extraction for knowledge.ingest: plain text, PDF with a text layer, allowlisted URL.

There is no OCR path on purpose: a PDF without extractable text is reported as
unsupported so nobody mistakes an empty index for an ingested document.
"""

from __future__ import annotations

import io
import re
import time
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from ..app.config import Settings
from ..app.runtime import OperationError


PARSER_VERSION = "w1-parser-2"

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


_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
# Structural containers are never chrome even when a theme puts menu-ish classes on them.
_NEVER_SKIP = {"html", "body", "main", "article"}
_SKIP_ROLES = {"navigation", "banner", "contentinfo", "search"}
# Page chrome that sites (Wikimedia, CMS themes) build from plain divs: menus, TOCs,
# edit links, reference lists, share/cookie bars. Exact class/id tokens only.
_BOILERPLATE = re.compile(
    r"^(toc|vector-toc|navbox|navbox-styles|mw-jump-link|mw-editsection|reflist|references|mw-references-wrap|"
    r"catlinks|printfooter|mw-indicators|noprint|sidebar|breadcrumbs?|cookie-banner|cookie-consent|share-buttons|"
    r"social-share|related-posts?|site-header|site-footer|mega-menu|skip-link|sr-only|visually-hidden)$"
)
# Use <main> only when it really holds the article; some apps stream content outside it.
_MAIN_SHARE = 0.4


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.main_parts: list[str] = []
        self.title_parts: list[str] = []
        # Skipped block: its tag name and nesting of that same tag (robust to unclosed <p>/<li>).
        self._skip_tag: str | None = None
        self._skip_depth = 0
        self._in_main = False
        self._in_title = False

    @staticmethod
    def _is_chrome(tag: str, attrs: list[tuple[str, str | None]]) -> bool:
        if tag in _NEVER_SKIP:
            return False
        if tag in _SKIP_TAGS:
            return True
        values = dict(attrs)
        if (values.get("role") or "").lower() in _SKIP_ROLES or values.get("aria-hidden") == "true":
            return True
        tokens = (values.get("class") or "").lower().split() + (values.get("id") or "").lower().split()
        return any(_BOILERPLATE.match(token) for token in tokens)

    def _emit(self, text: str) -> None:
        self.parts.append(text)
        if self._in_main:
            self.main_parts.append(text)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._skip_tag:
            if tag == self._skip_tag:
                self._skip_depth += 1
            return
        if tag == "title":
            self._in_title = True
        elif tag not in _VOID_TAGS and self._is_chrome(tag, attrs):
            self._skip_tag, self._skip_depth = tag, 1
            return
        if tag == "main":
            self._in_main = True
        if tag in _BLOCK_TAGS:
            self._emit("\n\n")

    def handle_endtag(self, tag: str) -> None:
        if self._skip_tag:
            if tag == self._skip_tag:
                self._skip_depth -= 1
                if not self._skip_depth:
                    self._skip_tag = None
            return
        if tag == "title":
            self._in_title = False
        if tag in _BLOCK_TAGS:
            self._emit("\n\n")
        if tag == "main":
            self._in_main = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
        elif not self._skip_tag:
            self._emit(data)


def parse_html(html: str, url: str) -> tuple[list[Segment], str | None]:
    extractor = _TextExtractor()
    extractor.feed(html)
    extractor.close()
    title = normalize_text(" ".join(extractor.title_parts)) or None
    whole, main = "".join(extractor.parts), "".join(extractor.main_parts)
    body = main if len(normalize_text(main)) >= _MAIN_SHARE * len(normalize_text(whole)) > 0 else whole
    segments = [
        Segment(text=paragraph, paragraph=index, url=url)
        for index, paragraph in enumerate(_paragraphs(body), start=1)
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


_ROBOTS_TTL_SECONDS = 3600
_robots_cache: dict[str, tuple[float, RobotFileParser | None]] = {}


async def check_robots_allowed(client: httpx.AsyncClient, url: str, user_agent: str) -> None:
    """RFC 9309: 4xx robots.txt means no rules; 5xx/unreachable means assume full disallow."""

    parts = urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    cached = _robots_cache.get(origin)
    if cached is None or time.monotonic() - cached[0] > _ROBOTS_TTL_SECONDS:
        try:
            response = await client.get(f"{origin}/robots.txt", headers={"User-Agent": user_agent}, follow_redirects=True)
        except httpx.HTTPError as exc:
            raise OperationError("ROBOTS_UNAVAILABLE", f"robots.txt for {parts.hostname} is unreachable", retryable=True) from exc
        if response.status_code >= 500:
            raise OperationError("ROBOTS_UNAVAILABLE", f"robots.txt for {parts.hostname} returned HTTP {response.status_code}", retryable=True)
        rules = None
        if response.status_code < 400:
            rules = RobotFileParser()
            rules.parse(response.text.splitlines())
        cached = (time.monotonic(), rules)
        _robots_cache[origin] = cached
    rules = cached[1]
    if rules is not None and not rules.can_fetch(user_agent, url):
        raise OperationError("ROBOTS_DISALLOWED", f"robots.txt of {parts.hostname} disallows this URL")


async def fetch_url(url: str, settings: Settings) -> tuple[str, str]:
    """Fetch an allowlisted page; every redirect hop is re-checked against the allowlist and robots.txt."""

    current = url
    headers = {"User-Agent": settings.ingest_user_agent}
    async with httpx.AsyncClient(timeout=settings.url_fetch_timeout_seconds, follow_redirects=False) as client:
        for _ in range(4):
            check_url_allowed(current, settings.ingest_url_allowlist)
            await check_robots_allowed(client, current, settings.ingest_user_agent)
            try:
                async with client.stream("GET", current, headers=headers) as response:
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
