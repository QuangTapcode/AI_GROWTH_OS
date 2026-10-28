"""Deterministic Guardrails Engine for Content Marketing (CM-13).

Strict, code-based deterministic checks with ZERO reliance on LLMs:
1. has_price_claim: Vietnamese price regexes & slang (8tr, 8,5 triệu, 50k, 5.000.000đ, 1 củ, tám triệu, $200, VNĐ/USD, nửa giá).
2. unsupported_numbers: numbers, %, dates not backed by facts (with normalization before matching).
3. unsupported_claims: promotional words (tặng, free, miễn phí, combo, chỉ hôm nay), testimonials (khách nói, 5 sao, được chứng nhận),
   superlatives/comparatives (luôn luôn, 100%, tốt nhất, rẻ nhất).
4. Boundary checks: URLs outside whitelist, channels outside selected target set, missing fact_id on factual sentences (TC-10/11),
   tenant forbidden terms (TC-12).

Invariance rule: Numbers/prices/terms that match facts verbatim or canonically are strictly PERMITTED.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence
from urllib.parse import urlparse

from .social_pack_v2 import FactItem, SentenceMap


@dataclass(frozen=True)
class GuardrailViolation:
    """Structured policy violation with precise code and character span."""

    code: str
    message: str
    span_start: int = -1
    span_end: int = -1
    matched_text: str = ""
    sentence_index: int | None = None
    field: str = "caption"


@dataclass
class GuardrailReport:
    """Consolidated outcome of running deterministic guardrails."""

    is_valid: bool
    violations: list[GuardrailViolation] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.violations) == 0


# ==============================================================================
# 1. VIETNAMESE PRICE PATTERNS & DETECTION
# ==============================================================================

# Common currency tokens & units
# 8tr, 8.5tr, 8,5tr, 8 triệu, 8.5 triệu, 50k, 5.000.000đ, 5000000 dong, 1 củ, $200, 200$, 200 USD
_PRICE_DIGITS_UNIT = (
    r"(?<!\w)(?:\d+[\d.,]*)\s*"
    r"(?:tr(?:iệu|ieu)?|củ|cu|k|nghìn|ngàn|nghin|ngan|đồng|dong|đ|d|vnđ|vnd|usd)(?!\w)"
    r"|(?<!\w)(?:\d+[\d.,]*)\s*(?:[\$€])"
)

_PRICE_CURRENCY_FIRST = (
    r"(?<!\w)(?:\$|€|usd|vnd|vnđ)\s*(?:\d+[\d.,]*)(?!\w)"
)

# Textual numbers in Vietnamese + currency / price units
# e.g. "tám triệu", "hai triệu", "năm mươi nghìn", "một củ", "hai củ", "nửa củ"
_VIET_TEXT_NUMBERS = (
    r"(?:nửa|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|"
    r"mốt|hai mươi|ba mươi|bốn mươi|năm mươi|sáu mươi|bảy mươi|tám mươi|chín mươi|trăm)"
)
_PRICE_TEXTUAL = (
    rf"(?<!\w){_VIET_TEXT_NUMBERS}\s+"
    rf"(?:triệu|nghìn|ngàn|củ|đồng|lách)(?:\s+(?:đồng|vnđ|vnd))?(?!\w)"
)

# Vietnamese price slang and discount idiomatic claims
# "nửa giá", "đồng giá", "hạ giá", "giảm sốc"
_PRICE_SLANG_IDIOMS = (
    r"(?<!\w)(?:nửa giá|nua gia|đồng giá|dong gia|đại hạ giá|hạ giá)(?!\w)"
)

_PRICE_REGEXES: list[re.Pattern[str]] = [
    re.compile(_PRICE_DIGITS_UNIT, re.IGNORECASE),
    re.compile(_PRICE_CURRENCY_FIRST, re.IGNORECASE),
    re.compile(_PRICE_TEXTUAL, re.IGNORECASE),
    re.compile(_PRICE_SLANG_IDIOMS, re.IGNORECASE),
]


def _extract_fact_texts(facts: Iterable[str | FactItem | dict[str, Any]]) -> list[str]:
    """Helper to extract raw textual representations from various fact formats."""
    result: list[str] = []
    for item in facts:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, FactItem):
            result.append(item.text)
        elif isinstance(item, dict) and "text" in item:
            result.append(str(item["text"]))
        elif hasattr(item, "text"):
            result.append(str(item.text))
    return result


def _normalize_string(s: str) -> str:
    """Normalize string by collapsing whitespaces and lowercasing."""
    return re.sub(r"\s+", " ", s).strip().lower()


def _is_span_covered_in_facts(matched_text: str, fact_texts: Sequence[str]) -> bool:
    """Check if the matched text or its canonical form is explicitly backed by facts."""
    norm_matched = _normalize_string(matched_text)
    if not norm_matched:
        return True

    for fact in fact_texts:
        norm_fact = _normalize_string(fact)
        # Direct substring match
        if norm_matched in norm_fact:
            return True

        # Stripped punctuation check
        clean_matched = re.sub(r"[^\w\s]", "", norm_matched)
        clean_fact = re.sub(r"[^\w\s]", "", norm_fact)
        if clean_matched and clean_matched in clean_fact:
            return True

    return False


def has_price_claim(text: str) -> bool:
    """Quick boolean check if text contains any Vietnamese or international price claim pattern."""
    for pattern in _PRICE_REGEXES:
        if pattern.search(text):
            return True
    return False


def check_price_claims(
    text: str,
    allowed_facts: Sequence[str | FactItem | dict[str, Any]] = (),
    field_name: str = "caption",
    sentence_index: int | None = None,
) -> list[GuardrailViolation]:
    """Find all price claims; flag any claim not verified verbatim in allowed_facts."""
    fact_texts = _extract_fact_texts(allowed_facts)
    violations: list[GuardrailViolation] = []
    seen_spans: set[tuple[int, int]] = set()

    for pattern in _PRICE_REGEXES:
        for match in pattern.finditer(text):
            span = match.span()
            if span in seen_spans:
                continue
            seen_spans.add(span)

            matched_text = match.group().strip()
            # If the price claim matches verbatim or canonically in facts, it is permitted
            if _is_span_covered_in_facts(matched_text, fact_texts):
                continue

            violations.append(
                GuardrailViolation(
                    code="PRICE_CLAIM_UNSUPPORTED",
                    message=f"Tuyên bố giá '{matched_text}' không tồn tại trong sự thật được kiểm chứng.",
                    span_start=span[0],
                    span_end=span[1],
                    matched_text=matched_text,
                    sentence_index=sentence_index,
                    field=field_name,
                )
            )

    return sorted(violations, key=lambda v: v.span_start)


# ==============================================================================
# 2. UNSUPPORTED NUMBERS, PERCENTAGES, AND DATES
# ==============================================================================

# Regex for URL masking to prevent numeric segments in URLs from triggering false positives
_URL_REGEX = re.compile(r"https?://[^\s<>\"']+|www\.[^\s<>\"']+", re.IGNORECASE)

# Percentages: 50%, 100%, 8.5%
_PERCENTAGE_REGEX = re.compile(r"(?<!\w)(\d+(?:[.,]\d+)?)\s*%(?!\w)")

# Dates / times / durations: ngày 24/12/2026, 24/7, 15/10/2026, 15-10-2026, tháng 10, ngày 24, năm 2026, thứ 2, 20h, 14h, 8h30
_DATE_TIME_REGEX = re.compile(
    r"(?<!\w)(?:(?:ngày|tháng|năm|thứ)\s+)?(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}h(?:\d{2})?|\b(?:ngày|tháng|năm|thứ)\s+\d{1,4})(?!\w)",
    re.IGNORECASE,
)

# General numbers and numbers attached to units (e.g. 150m2, 15km, 50m, 5G, 200)
_NUMBER_REGEX = re.compile(r"(?<!\w)(\d+[\d.,]*)(?:[a-zA-ZÀ-ỹ]+\d*)?(?!\w)")

# Phone / Hotline regex (e.g. 0905.123.456, 0905123456, +84 905 123 456)
_PHONE_REGEX = re.compile(r"(?:\+84|0)\d{1,4}[.\s-]?\d{3,4}[.\s-]?\d{3,4}\b")


def _mask_urls_and_prices(text: str) -> str:
    """Mask URLs, phone numbers, and price claim patterns with whitespace to preserve string indices."""
    masked = list(text)

    # 1. Mask URLs
    for match in _URL_REGEX.finditer(text):
        start, end = match.span()
        for i in range(start, end):
            masked[i] = " "

    # 2. Mask price patterns so numbers inside prices are handled by check_price_claims
    for pattern in _PRICE_REGEXES:
        for match in pattern.finditer(text):
            start, end = match.span()
            for i in range(start, end):
                masked[i] = " "

    # 3. Mask telephone numbers / hotlines
    for match in _PHONE_REGEX.finditer(text):
        start, end = match.span()
        for i in range(start, end):
            masked[i] = " "

    return "".join(masked)


def _canonical_number(num_str: str) -> str:
    """Normalize a number by removing thousand separators and standardizing decimals.
    e.g. '8.500.000' -> '8500000', '8,5' -> '8.5'
    """
    s = num_str.strip()
    if "." in s and "," in s:
        # e.g. 1,000.50 or 1.000,50
        if s.rfind(".") > s.rfind(","):
            s = s.replace(",", "")
        else:
            s = s.replace(".", "").replace(",", ".")
    elif "." in s:
        # Check if dot is thousand separator (e.g. 8.500.000 or 5.000)
        parts = s.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            s = "".join(parts)
    elif "," in s:
        # Check if comma is thousand separator (e.g. 8,500,000) or decimal (e.g. 8,5)
        parts = s.split(",")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            s = "".join(parts)
        else:
            s = s.replace(",", ".")
    return s


def check_unsupported_numbers(
    text: str,
    allowed_facts: Sequence[str | FactItem | dict[str, Any]] = (),
    field_name: str = "caption",
    sentence_index: int | None = None,
) -> list[GuardrailViolation]:
    """Check for unsupported numbers, percentages, and dates in text."""
    fact_texts = _extract_fact_texts(allowed_facts)
    violations: list[GuardrailViolation] = []

    # 1. Pre-build fact number search representations
    fact_raw_numbers: set[str] = set()
    fact_canonical_numbers: set[str] = set()
    fact_digit_runs: set[str] = set()
    fact_percentages: set[str] = set()
    fact_dates: set[str] = set()

    for f_text in fact_texts:
        # Percentages in facts
        for m in _PERCENTAGE_REGEX.finditer(f_text):
            fact_percentages.add(_normalize_string(m.group()))
            fact_percentages.add(f"{_canonical_number(m.group(1))}%")

        # Dates in facts
        for m in _DATE_TIME_REGEX.finditer(f_text):
            fact_dates.add(_normalize_string(m.group()))
            fact_dates.add(re.sub(r"[^\w]", "", m.group().lower()))

        # Raw & canonical numbers in facts
        for m in _NUMBER_REGEX.finditer(f_text):
            raw = m.group(1)
            fact_raw_numbers.add(raw)
            canon = _canonical_number(raw)
            fact_canonical_numbers.add(canon)
            digits = re.sub(r"\D", "", raw)
            if digits:
                fact_digit_runs.add(digits)

    masked_text = _mask_urls_and_prices(text)
    checked_spans: set[tuple[int, int]] = set()

    # 2. Check Percentages first
    for match in _PERCENTAGE_REGEX.finditer(masked_text):
        span = match.span()
        checked_spans.add(span)
        raw_pct = match.group().strip()
        norm_pct = _normalize_string(raw_pct)
        canon_pct = f"{_canonical_number(match.group(1))}%"

        # Check if present in facts
        if (
            norm_pct in fact_percentages
            or canon_pct in fact_percentages
            or _is_span_covered_in_facts(raw_pct, fact_texts)
        ):
            continue

        violations.append(
            GuardrailViolation(
                code="PERCENTAGE_UNSUPPORTED",
                message=f"Tỷ lệ phần trăm '{raw_pct}' không xuất hiện trong sự thật được kiểm chứng.",
                span_start=span[0],
                span_end=span[1],
                matched_text=raw_pct,
                sentence_index=sentence_index,
                field=field_name,
            )
        )

    # 3. Check Dates / Times
    for match in _DATE_TIME_REGEX.finditer(masked_text):
        span = match.span()
        # Skip if already part of an identified percentage
        if any(s[0] <= span[0] and span[1] <= s[1] for s in checked_spans):
            continue
        checked_spans.add(span)
        raw_date = match.group().strip()
        norm_date = _normalize_string(raw_date)
        clean_date = re.sub(r"[^\w]", "", raw_date.lower())

        if (
            norm_date in fact_dates
            or clean_date in fact_dates
            or _is_span_covered_in_facts(raw_date, fact_texts)
        ):
            continue

        violations.append(
            GuardrailViolation(
                code="DATE_UNSUPPORTED",
                message=f"Ngày/thời gian '{raw_date}' không xuất hiện trong sự thật được kiểm chứng.",
                span_start=span[0],
                span_end=span[1],
                matched_text=raw_date,
                sentence_index=sentence_index,
                field=field_name,
            )
        )

    # 4. Check standalone Numbers & Units
    for match in _NUMBER_REGEX.finditer(masked_text):
        span = match.span()
        # Skip if within percentage or date spans
        if any(s[0] <= span[0] and span[1] <= s[1] for s in checked_spans):
            continue

        full_matched = match.group().strip()
        raw_num = match.group(1)
        canon_num = _canonical_number(raw_num)
        digit_run = re.sub(r"\D", "", raw_num)

        # Allow if verbatim, canonical, or digit run exists in fact representations
        if (
            full_matched in fact_raw_numbers
            or raw_num in fact_raw_numbers
            or canon_num in fact_canonical_numbers
            or (digit_run and digit_run in fact_digit_runs)
            or _is_span_covered_in_facts(full_matched, fact_texts)
            or _is_span_covered_in_facts(raw_num, fact_texts)
        ):
            continue

        violations.append(
            GuardrailViolation(
                code="NUMBER_UNSUPPORTED",
                message=f"Số liệu '{full_matched}' không xuất hiện trong sự thật được kiểm chứng.",
                span_start=span[0],
                span_end=span[1],
                matched_text=full_matched,
                sentence_index=sentence_index,
                field=field_name,
            )
        )

    return sorted(violations, key=lambda v: v.span_start)


# ==============================================================================
# 3. PROMOTIONAL TERMS, TESTIMONIALS, SUPERLATIVES
# ==============================================================================

# A. Promotional / Discount terms:
# tặng, free, miễn phí, combo, chỉ hôm nay, ưu đãi, khuyến mãi, voucher, coupon, quà tặng, giảm giá
_PROMOTIONAL_TERMS: list[str] = [
    "tặng",
    "free",
    "miễn phí",
    "mien phi",
    "combo",
    "chỉ hôm nay",
    "chi hom nay",
    "ưu đãi",
    "uu dai",
    "khuyến mãi",
    "khuyen mai",
    "voucher",
    "coupon",
    "quà tặng",
    "qua tang",
    "giảm sốc",
    "giam soc",
    "tri ân",
    "tri an",
]

# B. Testimonial / Social proof terms:
# khách nói, 5 sao, được chứng nhận, khách hàng đánh giá, review, ai cũng khen
_TESTIMONIAL_TERMS: list[str] = [
    "khách nói",
    "khach noi",
    "5 sao",
    "5-sao",
    "5star",
    "năm sao",
    "nam sao",
    "được chứng nhận",
    "duoc chung nhan",
    "chứng nhận",
    "chung nhan",
    "khách hàng đánh giá",
    "khach hang danh gia",
    "review tốt",
    "ai cũng khen",
    "ai cung khen",
    "người dùng khen",
]

# C. Superlatives / Absolute claims:
# luôn luôn, 100%, tốt nhất, rẻ nhất, số 1, hàng đầu, hoàn hảo nhất, độc quyền, vô địch, tuyệt đối, vĩnh viễn, không đâu bằng
_SUPERLATIVE_TERMS: list[str] = [
    "luôn luôn",
    "luon luon",
    "tốt nhất",
    "tot nhat",
    "rẻ nhất",
    "re nhat",
    "số 1",
    "so 1",
    "hàng đầu",
    "hang dau",
    "hoàn hảo nhất",
    "hoan hao nhat",
    "độc quyền",
    "doc quyen",
    "vô địch",
    "vo dich",
    "tuyệt đối",
    "tuyet doi",
    "vĩnh viễn",
    "vinh vien",
    "không đâu bằng",
    "khong dau bang",
    "không đâu sánh bằng",
    "khong dau sanh bang",
    "đỉnh nhất",
    "dinh nhat",
    "xịn nhất",
    "xin nhat",
    "sang nhất",
    "sang nhat",
]


def _compile_phrase_patterns(phrases: Sequence[str]) -> list[tuple[str, re.Pattern[str]]]:
    """Compile phrases with boundary matching safe for accented Vietnamese."""
    compiled: list[tuple[str, re.Pattern[str]]] = []
    # Sort by length descending to match longest phrases first
    sorted_phrases = sorted(phrases, key=len, reverse=True)
    for p in sorted_phrases:
        escaped = re.escape(p)
        pattern = re.compile(rf"(?<![\wÀ-ỹ]){escaped}(?![\wÀ-ỹ])", re.IGNORECASE)
        compiled.append((p, pattern))
    return compiled


_COMPILED_PROMOS = _compile_phrase_patterns(_PROMOTIONAL_TERMS)
_COMPILED_TESTIMONIALS = _compile_phrase_patterns(_TESTIMONIAL_TERMS)
_COMPILED_SUPERLATIVES = _compile_phrase_patterns(_SUPERLATIVE_TERMS)


def check_unsupported_claims(
    text: str,
    allowed_facts: Sequence[str | FactItem | dict[str, Any]] = (),
    field_name: str = "caption",
    sentence_index: int | None = None,
) -> list[GuardrailViolation]:
    """Find unsupported promotional terms, testimonials, and absolute claims."""
    fact_texts = _extract_fact_texts(allowed_facts)
    violations: list[GuardrailViolation] = []
    seen_spans: set[tuple[int, int]] = set()

    def _scan(
        compiled_list: list[tuple[str, re.Pattern[str]]],
        violation_code: str,
        violation_type: str,
    ) -> None:
        for phrase, pattern in compiled_list:
            for match in pattern.finditer(text):
                span = match.span()
                if any(s[0] <= span[0] and span[1] <= s[1] for s in seen_spans):
                    continue
                seen_spans.add(span)

                matched_text = match.group().strip()
                # Allowed IF AND ONLY IF backed by facts
                if _is_span_covered_in_facts(matched_text, fact_texts):
                    continue

                violations.append(
                    GuardrailViolation(
                        code=violation_code,
                        message=f"Từ {violation_type} '{matched_text}' không có trong sự thật nguồn.",
                        span_start=span[0],
                        span_end=span[1],
                        matched_text=matched_text,
                        sentence_index=sentence_index,
                        field=field_name,
                    )
                )

    _scan(_COMPILED_PROMOS, "PROMOTIONAL_TERM_UNSUPPORTED", "ưu đãi/khuyến mãi")
    _scan(_COMPILED_TESTIMONIALS, "TESTIMONIAL_UNSUPPORTED", "testimonial/chứng nhận")
    _scan(_COMPILED_SUPERLATIVES, "SUPERLATIVE_UNSUPPORTED", "tuyệt đối/so sánh hơn")

    return sorted(violations, key=lambda v: v.span_start)


# ==============================================================================
# 4. CHANNELS, URL WHITELIST, SENTENCE MAP & TENANT FORBIDDEN TERMS
# ==============================================================================

SYSTEM_SUPPORTED_CHANNELS = frozenset({"facebook", "tiktok"})
DEFAULT_ALLOWED_DOMAINS = frozenset({"tripc.vn", "m.me", "cdn.tripc.vn"})


def check_channels(
    channels: Sequence[str],
    target_channels: Sequence[str] | None = None,
) -> list[GuardrailViolation]:
    """Ensure channels are supported and within the selected target set."""
    violations: list[GuardrailViolation] = []
    target_set = set(target_channels) if target_channels is not None else set(SYSTEM_SUPPORTED_CHANNELS)

    for ch in channels:
        ch_lower = ch.strip().lower()
        if ch_lower not in SYSTEM_SUPPORTED_CHANNELS:
            violations.append(
                GuardrailViolation(
                    code="INVALID_CHANNEL",
                    message=f"Kênh '{ch}' không được hệ thống hỗ trợ (chỉ chấp nhận: facebook, tiktok).",
                    matched_text=ch,
                    field="channels",
                )
            )
        elif ch_lower not in target_set:
            violations.append(
                GuardrailViolation(
                    code="UNSELECTED_CHANNEL",
                    message=f"Kênh '{ch}' không nằm trong tập kênh mục tiêu được yêu cầu: {sorted(target_set)}.",
                    matched_text=ch,
                    field="channels",
                )
            )

    return violations


def extract_urls(text: str) -> list[tuple[int, int, str]]:
    """Extract all URLs from free text with character spans."""
    return [(m.start(), m.end(), m.group()) for m in _URL_REGEX.finditer(text)]


def check_urls(
    urls: Sequence[str],
    allowed_domains: Sequence[str] = (),
    allowed_urls: Sequence[str] = (),
    field_name: str = "urls",
) -> list[GuardrailViolation]:
    """Check that URLs match approved domain whitelist or explicit allowed URL set."""
    violations: list[GuardrailViolation] = []
    allowed_domain_set = {d.lower().strip() for d in allowed_domains} | set(DEFAULT_ALLOWED_DOMAINS)
    allowed_url_set = {u.lower().strip().rstrip("/") for u in allowed_urls}

    for url in urls:
        raw_url = url.strip()
        if not raw_url:
            continue

        clean_url = raw_url.lower().rstrip("/")
        if clean_url in allowed_url_set:
            continue

        parsed = urlparse(raw_url)
        netloc = parsed.netloc.lower()
        if not netloc and "/" in raw_url:
            # Handle URLs without scheme
            netloc = raw_url.split("/")[0].lower()

        # Remove port if present
        if ":" in netloc:
            netloc = netloc.split(":")[0]

        # Domain whitelist check
        domain_match = any(
            netloc == domain or netloc.endswith("." + domain)
            for domain in allowed_domain_set
        )
        if not domain_match:
            violations.append(
                GuardrailViolation(
                    code="DISALLOWED_URL",
                    message=f"URL '{raw_url}' có tên miền '{netloc}' nằm ngoài danh sách cho phép.",
                    matched_text=raw_url,
                    field=field_name,
                )
            )

    return violations


def check_tenant_forbidden_terms(
    text: str,
    forbidden_terms: Sequence[str] = (),
    field_name: str = "caption",
    sentence_index: int | None = None,
) -> list[GuardrailViolation]:
    """Detect presence of tenant-specific forbidden terms."""
    violations: list[GuardrailViolation] = []
    if not forbidden_terms:
        return violations

    compiled = _compile_phrase_patterns(forbidden_terms)
    for term, pattern in compiled:
        for match in pattern.finditer(text):
            span = match.span()
            matched = match.group()
            violations.append(
                GuardrailViolation(
                    code="TENANT_FORBIDDEN_TERM",
                    message=f"Nội dung chứa từ cấm của tenant: '{matched}'.",
                    span_start=span[0],
                    span_end=span[1],
                    matched_text=matched,
                    sentence_index=sentence_index,
                    field=field_name,
                )
            )

    return sorted(violations, key=lambda v: v.span_start)


def check_factual_sentence_fact_ids(
    sentence_fact_map: Sequence[SentenceMap | dict[str, Any]],
    available_facts: Sequence[FactItem | str | dict[str, Any]] = (),
) -> list[GuardrailViolation]:
    """Validate fact_id assignments on sentence_fact_map:
    - Factual sentences must have valid, non-empty fact_ids matching existing facts (TC-10).
    - Hook / CTA sentences must have NONE / SYSTEM_CTA and adhere to Zero-Claim (TC-11).
    """
    violations: list[GuardrailViolation] = []

    # Collect valid fact_ids
    valid_fact_ids: set[str] = set()
    for f in available_facts:
        if isinstance(f, FactItem):
            valid_fact_ids.add(f.fact_id)
        elif isinstance(f, dict) and "fact_id" in f:
            valid_fact_ids.add(str(f["fact_id"]))
        elif hasattr(f, "fact_id"):
            valid_fact_ids.add(str(f.fact_id))

    for item in sentence_fact_map:
        if isinstance(item, dict):
            s_idx = item.get("sentence_index", 0)
            s_type = item.get("sentence_type", "factual")
            f_id = item.get("fact_id")
            text = str(item.get("text", ""))
        else:
            s_idx = item.sentence_index
            s_type = item.sentence_type
            f_id = item.fact_id
            text = item.text

        if s_type == "factual":
            # 1. Missing fact_id check
            if not f_id or f_id in ("NONE", "SYSTEM_CTA"):
                violations.append(
                    GuardrailViolation(
                        code="MISSING_FACT_ID",
                        message=f"Câu factual [{s_idx}] thiếu fact_id hợp lệ: '{text}'.",
                        sentence_index=s_idx,
                        field="sentence_fact_map",
                        matched_text=text,
                    )
                )
            else:
                # 2. Unknown fact_id check
                assigned_ids = [f_id] if isinstance(f_id, str) else list(f_id)
                for aid in assigned_ids:
                    if valid_fact_ids and aid not in valid_fact_ids:
                        violations.append(
                            GuardrailViolation(
                                code="UNKNOWN_FACT_ID",
                                message=f"Câu factual [{s_idx}] trỏ đến fact_id không tồn tại '{aid}'.",
                                sentence_index=s_idx,
                                field="sentence_fact_map",
                                matched_text=aid,
                            )
                        )

        elif s_type in ("hook", "cta"):
            # 3. Invalid fact_id on non-factual
            if isinstance(f_id, list) or (isinstance(f_id, str) and f_id not in ("NONE", "SYSTEM_CTA", "")):
                violations.append(
                    GuardrailViolation(
                        code="INVALID_NON_FACTUAL_FACT_ID",
                        message=f"Câu {s_type} [{s_idx}] không được gán fact_id thật: {f_id}.",
                        sentence_index=s_idx,
                        field="sentence_fact_map",
                        matched_text=str(f_id),
                    )
                )

            # 4. Zero-Claim Rule verification (TC-11)
            # Mask telephone and target URLs in CTA to prevent false positives
            clean_text = text
            if s_type == "cta":
                clean_text = _PHONE_REGEX.sub(" ", clean_text)
                clean_text = re.sub(r"https?://[^\s]+", " ", clean_text)

            price_viols = check_price_claims(clean_text, allowed_facts=(), sentence_index=s_idx, field_name="sentence_fact_map")
            num_viols = check_unsupported_numbers(clean_text, allowed_facts=(), sentence_index=s_idx, field_name="sentence_fact_map")
            claim_viols = check_unsupported_claims(clean_text, allowed_facts=(), sentence_index=s_idx, field_name="sentence_fact_map")

            if price_viols or num_viols or claim_viols:
                all_matched = [v.matched_text for v in (price_viols + num_viols + claim_viols)]
                violations.append(
                    GuardrailViolation(
                        code="ZERO_CLAIM_VIOLATION",
                        message=f"Câu {s_type} [{s_idx}] vi phạm Zero-Claim Rule (chứa giá/số/khẳng định chưa kiểm chứng): {all_matched}.",
                        sentence_index=s_idx,
                        field="sentence_fact_map",
                        matched_text=", ".join(all_matched),
                    )
                )

    return violations


# ==============================================================================
# 5. UNIFIED SOCIALPACK GUARDRAILS EVALUATOR
# ==============================================================================

def evaluate_social_pack_guardrails(
    caption: str,
    extracted_facts: Sequence[FactItem | str | dict[str, Any]] = (),
    channels: Sequence[str] = (),
    target_channels: Sequence[str] | None = None,
    sentence_fact_map: Sequence[SentenceMap | dict[str, Any]] = (),
    cta_target_url: str | None = None,
    allowed_domains: Sequence[str] = (),
    forbidden_terms: Sequence[str] = (),
) -> GuardrailReport:
    """Consolidated deterministic guardrails entrypoint.

    Executes all rule checks:
    - Vietnamese prices
    - Numbers, percentages, dates
    - Promotions, testimonials, superlatives
    - Channel boundaries
    - URL whitelist
    - SentenceMap fact_id & Zero-Claim
    - Tenant forbidden terms
    """
    violations: list[GuardrailViolation] = []

    # 1. Price claims check on caption
    violations.extend(check_price_claims(caption, allowed_facts=extracted_facts, field_name="caption"))

    # 2. Unsupported numbers / percentages / dates on caption
    violations.extend(check_unsupported_numbers(caption, allowed_facts=extracted_facts, field_name="caption"))

    # 3. Promotional, testimonial, and superlative terms on caption
    violations.extend(check_unsupported_claims(caption, allowed_facts=extracted_facts, field_name="caption"))

    # 4. Tenant forbidden terms on caption
    if forbidden_terms:
        violations.extend(check_tenant_forbidden_terms(caption, forbidden_terms=forbidden_terms, field_name="caption"))

    # 5. Channel validation
    if channels:
        violations.extend(check_channels(channels, target_channels=target_channels))

    # 6. URL validation (from caption & CTA)
    urls_to_check: list[str] = []
    for _, _, u in extract_urls(caption):
        urls_to_check.append(u)
    if cta_target_url:
        urls_to_check.append(cta_target_url)

    if urls_to_check:
        violations.extend(check_urls(urls_to_check, allowed_domains=allowed_domains, field_name="urls"))

    # 7. SentenceMap fact_id & Zero-Claim checks
    if sentence_fact_map:
        violations.extend(check_factual_sentence_fact_ids(sentence_fact_map, available_facts=extracted_facts))

    return GuardrailReport(is_valid=(len(violations) == 0), violations=violations)
