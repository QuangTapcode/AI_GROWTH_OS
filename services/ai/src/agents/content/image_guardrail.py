"""Image Guardrail (OCR & Safety) for AI-Generated Graphics (CM-12).

Implements the automated inspection pipeline from Section 7.1 and Section 11 (TC-14)
of 'Ke_hoach_Agent_Content_Marketing_v2.docx':
1. OCR Text & Price Guardrail:
   - Scans image for hallucinated alphanumeric characters, letters, or price claims.
   - Any detected text or numbers results in immediate rejection (enforcing negative prompt).
2. Aspect Ratio & Dimensions Guardrail:
   - Minimum dimensions: 1080x1080 for 1:1, 1080x1920 for 9:16.
   - Strict ratio tolerance (<= 1.5% deviation).
3. Safety & Face Policy:
   - Evaluates content safety and flags potential faces/logos.
   - Records transparent limitations stating Level 2 Human Approval remains the final safeguard.
4. Auto-Retry Engine:
   - If guardrail fails, retries generation up to 2 times (max 3 total attempts).
   - If all attempts fail, gracefully returns status 'needs_assets'.
5. Metadata Recording:
   - On pass, sets `ai_image_meta.ocr_checked = True` and saves inspection telemetry.
"""

from __future__ import annotations

import io
import logging
import os
import re
import shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from PIL import Image

try:
    import pytesseract  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    pytesseract = None

from .image_client import (
    BaseImageProvider,
    BaseStorageClient,
    FakeImageProvider,
    FakeStorageClient,
    GpuWorkerImageProvider,
    ImageClient,
    ImageGenerationRequest,
    ImageGenerationResult,
    ImageProviderError,
)
from .social_pack_v2 import AIImageMetadata, AssetV2

logger = logging.getLogger(__name__)


# ==============================================================================
# PROHIBITED FABRICATED PRICE PATTERNS (CM-12 OCR GUARDRAIL)
# ==============================================================================

FABRICATED_PRICE_PATTERNS: tuple[str, ...] = (
    # 1. Currency symbol prefix + digits: $200, $ 200, ₫500000, €50, £100, ¥1000
    r"[\$€£¥₫]\s*\d+(?:[.,]\d+)?",
    # 2. Digits + currency symbol suffix: 200$, 500.000đ, 500,000₫, 50€, 100£
    r"\d+(?:[.,]\d+)?\s*[\$€£¥₫]",
    # 3. Kilo abbreviation: 500k, 50k, 100K, 8.5k
    r"\b\d+(?:[.,]\d+)?\s*k\b",
    # 4. Million abbreviations (Vietnamese & informal): 8.5tr, 8,5tr, 8 tr, 8,5 triệu, 8.5 triệu, 10 trieu, 8 trieu
    r"\b\d+(?:[.,]\d+)?\s*(?:tr|trieu|triệu)\b",
    # 5. Currency code suffix: 200 USD, 200usd, 500000 VND, 500k vnd, 100 EUR
    r"\b\d+(?:[.,]\d+)?\s*(?:usd|vnd|vnđ|eur)\b",
    # 6. Currency code prefix: USD 200, VND 500000, EUR 100
    r"\b(?:usd|vnd|vnđ|eur)\s*\d+(?:[.,]\d+)?\b",
    # 7. Standalone currency identifiers: vnd, vnđ, VND, VNĐ
    r"\b(?:vnd|vnđ)\b",
    # 8. Formatted numbers with thousand separators (e.g., 500.000, 500,000, 1.000.000)
    r"\b\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|d|vnd|vnđ))?\b",
)

FABRICATED_PRICE_REGEX: re.Pattern = re.compile(
    "|".join(f"(?:{p})" for p in FABRICATED_PRICE_PATTERNS),
    re.IGNORECASE | re.UNICODE,
)


# ==============================================================================
# 1. OCR ENGINE ABSTRACTION & IMPLEMENTATION
# ==============================================================================

class OcrUnavailableError(RuntimeError):
    """OCR could not run, so text in the image cannot be ruled out."""


class BaseOcrEngine(ABC):
    """Abstract interface for image OCR text and digit extraction."""

    def is_available(self) -> bool:
        return True

    @abstractmethod
    def extract_text(self, image: Image.Image) -> str:
        """Extract all visible text/digits from a PIL Image."""
        ...


class TesseractOcrEngine(BaseOcrEngine):
    """Tesseract OCR adapter using pytesseract."""

    def __init__(
        self,
        tesseract_cmd: str | None = None,
        lang: str | None = None,
        fail_policy: Literal["fail_closed", "fail_open"] | None = None,
        app_env: str | None = None,
    ) -> None:
        self.tesseract_cmd = tesseract_cmd
        if tesseract_cmd and pytesseract:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        self.lang = lang
        self.app_env = (
            app_env
            or os.getenv("APP_ENV")
            or os.getenv("NODE_ENV")
            or "local"
        ).strip().lower()

        env_policy = os.getenv("OCR_FAIL_POLICY", "").strip().lower()
        if fail_policy:
            self.fail_policy = fail_policy
        elif env_policy == "fail_open":
            self.fail_policy = "fail_open"
        elif env_policy == "fail_closed":
            self.fail_policy = "fail_closed"
        elif self.app_env in ("production", "prod"):
            self.fail_policy = "fail_closed"
        else:
            self.fail_policy = "fail_closed"

    def is_available(self) -> bool:
        """Check if tesseract binary is accessible in environment."""
        if pytesseract is None:
            return False
        if self.tesseract_cmd and shutil.which(self.tesseract_cmd):
            return True
        return shutil.which("tesseract") is not None

    def _get_lang_param(self) -> str:
        """Determine language parameter: 'eng+vie' if Vietnamese is available, else 'eng'."""
        if self.lang:
            return self.lang
        if pytesseract is None:
            return "eng"
        try:
            available_langs = pytesseract.get_languages(config="")
            if "vie" in available_langs and "eng" in available_langs:
                return "eng+vie"
            elif "vie" in available_langs:
                return "vie"
            elif "eng" in available_langs:
                return "eng"
        except Exception:
            pass
        return "eng+vie"

    def extract_text(self, image: Image.Image) -> str:
        """Perform OCR with Tesseract (eng+vie if available)."""
        if not self.is_available():
            raise OcrUnavailableError("Tesseract is not installed")

        try:
            gray_img = image.convert("L")
            lang = self._get_lang_param()
            try:
                raw_text = pytesseract.image_to_string(gray_img, lang=lang, config="--psm 6")
            except Exception as lang_exc:
                logger.debug("Tesseract OCR with lang='%s' failed (%s); retrying with 'eng'", lang, lang_exc)
                raw_text = pytesseract.image_to_string(gray_img, lang="eng", config="--psm 6")
            return raw_text.strip()
        except Exception as exc:  # pragma: no cover
            raise OcrUnavailableError(f"Tesseract failed: {exc.__class__.__name__} - {exc}") from exc


class MockOcrEngine(BaseOcrEngine):
    """Deterministic mock OCR engine for fast and isolated unit tests."""

    def __init__(self, forced_text: str = "", text_extractor: Any = None) -> None:
        self.forced_text = forced_text
        self.text_extractor = text_extractor

    def extract_text(self, image: Image.Image) -> str:
        if self.forced_text:
            return self.forced_text
        if self.text_extractor:
            return str(self.text_extractor(image))
        info = image.info or {}
        return str(info.get("mock_ocr_text", ""))


# ==============================================================================
# 2. IMAGE INSPECTION REPORT & GUARDRAIL
# ==============================================================================

@dataclass
class ImageGuardrailReport:
    """Detailed inspection report produced by ImageGuardrail."""

    passed: bool
    ocr_detected_text: str
    has_text_or_numbers: bool
    dimensions_valid: bool
    aspect_ratio_valid: bool
    safety_valid: bool
    width: int
    height: int
    actual_ratio: str
    has_fabricated_price: bool = False
    rejection_reasons: list[str] = field(default_factory=list)
    limitations_note: str = (
        "Heuristic safety check active. Full biometric face recognition and third-party commercial "
        "logo detection require external Vision API or Level 2 Human Approval queue."
    )


class ImageGuardrail:
    """Validates AI-generated images against text, dimensions, and safety criteria."""

    # Supported aspect ratio specs: (expected_w_to_h_ratio, min_w, min_h)
    RATIO_SPECS = {
        "1:1": (1.0, 1080, 1080),
        "9:16": (9.0 / 16.0, 1080, 1920),
        "16:9": (16.0 / 9.0, 1920, 1080),
    }

    # Prohibited fabricated price regex and alphanumeric detector
    FABRICATED_PRICE_PATTERNS = FABRICATED_PRICE_PATTERNS
    FABRICATED_PRICE_REGEX = FABRICATED_PRICE_REGEX
    ALPHANUMERIC_REGEX = re.compile(r"[\w\$\€\₫\¥\£]", re.UNICODE)

    # Known commercial / brand logos or sensitive terms for heuristic safety
    SENSITIVE_KEYWORDS = {
        "nsfw", "nude", "violence", "blood", "weapon", "drugs",
        "hilton", "marriott", "airbnb", "vinpearl", "booking.com", "agoda",
    }

    # Prohibited face tokens per Dual-Asset Policy Section 7 (cấm sinh giả người thật/khuôn mặt thật)
    REAL_FACE_KEYWORDS = {
        "real face", "human face", "real person", "human portrait", "selfie", "close-up face",
        "người thật", "khuôn mặt thật", "chân dung người thật",
    }

    def __init__(
        self,
        ocr_engine: BaseOcrEngine | None = None,
        fail_policy: Literal["fail_closed", "fail_open"] | None = None,
        app_env: str | None = None,
    ) -> None:
        self.app_env = (
            app_env
            or os.getenv("APP_ENV")
            or os.getenv("NODE_ENV")
            or "local"
        ).strip().lower()

        env_policy = os.getenv("OCR_FAIL_POLICY", "").strip().lower()
        if fail_policy:
            self.fail_policy = fail_policy
        elif env_policy == "fail_open":
            self.fail_policy = "fail_open"
        elif env_policy == "fail_closed":
            self.fail_policy = "fail_closed"
        elif self.app_env in ("production", "prod"):
            self.fail_policy = "fail_closed"
        else:
            self.fail_policy = "fail_closed"

        self.ocr_engine = ocr_engine or TesseractOcrEngine(
            fail_policy=self.fail_policy,
            app_env=self.app_env,
        )

    def inspect(
        self,
        image_bytes: bytes,
        expected_ratio: Literal["1:1", "9:16"] = "1:1",
        metadata: dict[str, Any] | None = None,
    ) -> ImageGuardrailReport:
        """Inspect raw image bytes against all quality, price, and safety criteria."""
        rejection_reasons: list[str] = []

        try:
            image = Image.open(io.BytesIO(image_bytes))
        except Exception as exc:
            return ImageGuardrailReport(
                passed=False,
                ocr_detected_text="",
                has_text_or_numbers=False,
                dimensions_valid=False,
                aspect_ratio_valid=False,
                safety_valid=False,
                width=0,
                height=0,
                actual_ratio="unknown",
                has_fabricated_price=False,
                rejection_reasons=[f"Invalid or corrupted image format: {exc}"],
            )

        width, height = image.size

        # ----------------------------------------------------------------------
        # 1. OCR Text & Fabricated Price Detection
        # ----------------------------------------------------------------------
        ocr_ran = True
        has_text = False
        has_fabricated_price = False
        detected_text = ""
        clean_text = ""

        if not self.ocr_engine.is_available():
            ocr_ran = False
            if self.fail_policy == "fail_open":
                logger.warning(
                    "Tesseract OCR is not installed/available. Fail-open policy is active: "
                    "skipping OCR text and price inspection. (Warning: image may contain text/prices)"
                )
            else:
                logger.warning(
                    "Tesseract OCR is not installed/available. Fail-closed policy is active: "
                    "rejecting image inspection."
                )
                rejection_reasons.append(
                    "OCR engine is not installed or unavailable (fail-closed policy active)"
                )
        else:
            try:
                detected_text = self.ocr_engine.extract_text(image)
                clean_text = " ".join(detected_text.split())

                # Check for fabricated price claims
                price_match = self.FABRICATED_PRICE_REGEX.search(clean_text)
                if price_match:
                    has_fabricated_price = True
                    rejection_reasons.append(
                        f"OCR detected prohibited fabricated price claim: '{price_match.group(0)}' in '{clean_text}'"
                    )

                has_text = bool(self.ALPHANUMERIC_REGEX.search(clean_text))
                if has_text:
                    rejection_reasons.append(
                        f"OCR detected prohibited text or numeric digits in AI image: '{clean_text}'"
                    )
            except OcrUnavailableError as exc:
                ocr_ran = False
                if self.fail_policy == "fail_open":
                    logger.warning(
                        "OCR extraction failed (%s); fail-open policy active: skipping text check.", exc
                    )
                else:
                    logger.warning(
                        "OCR extraction failed (%s); fail-closed policy active: rejecting image.", exc
                    )
                    rejection_reasons.append(
                        f"OCR could not run, so text in the image cannot be ruled out: {exc}"
                    )

        # ----------------------------------------------------------------------
        # 2. Dimensions & Aspect Ratio Check
        # ----------------------------------------------------------------------
        if expected_ratio not in self.RATIO_SPECS:
            rejection_reasons.append(f"Unsupported aspect ratio '{expected_ratio}'. Must be '1:1', '9:16', or '16:9'.")
            expected_target_ratio, min_w, min_h = (1.0, 1080, 1080)
        else:
            expected_target_ratio, min_w, min_h = self.RATIO_SPECS[expected_ratio]

        dimensions_valid = (width >= min_w) and (height >= min_h)
        if not dimensions_valid:
            rejection_reasons.append(
                f"Image dimensions {width}x{height} below minimum required {min_w}x{min_h} for ratio {expected_ratio}"
            )

        actual_w_h_ratio = width / height if height > 0 else 0.0
        # Allow 1.5% ratio tolerance for minor rounding differences
        ratio_diff = abs(actual_w_h_ratio - expected_target_ratio)
        aspect_ratio_valid = ratio_diff <= 0.015

        actual_ratio_str = f"{width}:{height}"
        if not aspect_ratio_valid:
            rejection_reasons.append(
                f"Image aspect ratio deviation too large: actual {actual_w_h_ratio:.3f} "
                f"vs expected {expected_target_ratio:.3f} ({expected_ratio})"
            )

        # ----------------------------------------------------------------------
        # 3. Safety & Brand Logo Filter (Heuristic)
        # ----------------------------------------------------------------------
        safety_valid = True
        meta = metadata or {}
        combined_text = f"{meta.get('prompt', '')} {meta.get('alt_text', '')} {clean_text}".lower()

        for sensitive in self.SENSITIVE_KEYWORDS:
            if re.search(r"\b" + re.escape(sensitive) + r"\b", combined_text):
                safety_valid = False
                rejection_reasons.append(f"Safety filter triggered on prohibited term: '{sensitive}'")
                break

        for face_term in self.REAL_FACE_KEYWORDS:
            if face_term in combined_text:
                safety_valid = False
                rejection_reasons.append(
                    f"AI image policy strictly forbids generating real human faces or deceptive portraits: '{face_term}'"
                )
                break

        ocr_passed = (ocr_ran and not has_text and not has_fabricated_price) or (
            not ocr_ran and self.fail_policy == "fail_open"
        )

        passed = (
            ocr_passed
            and dimensions_valid
            and aspect_ratio_valid
            and safety_valid
        )

        limitations_note = (
            "Heuristic safety check active. Full biometric face recognition and third-party commercial "
            "logo detection require external Vision API or Level 2 Human Approval queue."
        )
        if not ocr_ran and self.fail_policy == "fail_open":
            limitations_note += " [WARNING: OCR inspection was bypassed due to fail-open policy; Tesseract not installed.]"

        return ImageGuardrailReport(
            passed=passed,
            ocr_detected_text=clean_text,
            has_text_or_numbers=has_text,
            dimensions_valid=dimensions_valid,
            aspect_ratio_valid=aspect_ratio_valid,
            safety_valid=safety_valid,
            width=width,
            height=height,
            actual_ratio=actual_ratio_str,
            has_fabricated_price=has_fabricated_price,
            rejection_reasons=rejection_reasons,
            limitations_note=limitations_note,
        )


def reinforce_negative_prompt_compel(base_negative_prompt: str, attempt: int) -> str:
    """Reinforce negative prompt using valid Compel syntax with increasing weights per retry attempt.

    Attempt 1 (1st retry): weight=1.3 -> (text:1.3), (price tag:1.3), ...
    Attempt 2 (2nd retry): weight=1.5 -> (text:1.5), (price tag:1.5), ...
    """
    weight = round(1.1 + attempt * 0.2, 1)
    compel_tokens = (
        f"(text:{weight}), (price tag:{weight}), (words:{weight}), "
        f"(letters:{weight}), (numbers:{weight}), (watermark:{weight})"
    )
    base = base_negative_prompt.strip()
    if base:
        return f"{base}, {compel_tokens}"
    return compel_tokens


# ==============================================================================
# 3. GUARDED IMAGE GENERATION PIPELINE (WITH RETRY & NEEDS_ASSETS RESOLUTION)
# ==============================================================================

@dataclass
class GuardedImageOutcome:
    """Final result of guarded image generation with retry policy."""

    status: Literal["approved", "needs_assets", "image_pending"]
    result: ImageGenerationResult | None
    attempts_made: int
    all_reports: list[ImageGuardrailReport]
    failure_reasons: list[str] = field(default_factory=list)
    job_id: str | None = None


class GuardedImagePipeline:
    """Coordinates generation, OCR guardrail inspection, retry loop, and storage."""

    def __init__(
        self,
        image_client: ImageClient | None = None,
        guardrail: ImageGuardrail | None = None,
        max_retries: int | None = None,
        app_env: str | None = None,
    ) -> None:
        self.image_client = image_client or ImageClient(app_env=app_env)
        self.guardrail = guardrail or ImageGuardrail(app_env=app_env)
        if max_retries is not None:
            self.max_retries = max_retries
        else:
            env_retries = os.getenv("IMAGE_GUARDRAIL_MAX_RETRIES")
            self.max_retries = int(env_retries) if env_retries and env_retries.isdigit() else 2

    def not_ready(self) -> str | None:
        """What a deployment still has to set up before an image can be generated, inspected and stored."""
        if not self.image_client.provider.is_configured:
            return "IMAGE_PROVIDER_NOT_CONFIGURED"
        if not isinstance(self.image_client.provider, GpuWorkerImageProvider):
            if not self.image_client.storage.is_configured:
                return "IMAGE_STORAGE_NOT_CONFIGURED"
            if not self.guardrail.ocr_engine.is_available() and self.guardrail.fail_policy != "fail_open":
                return "OCR_NOT_AVAILABLE"
        return None

    def generate_guarded_image(
        self,
        request: ImageGenerationRequest,
        workspace_id: UUID | str = "00000000-0000-0000-0000-000000000001",
        article_id: UUID | str | None = None,
        post_id: UUID | str | None = None,
    ) -> GuardedImageOutcome:
        """Execute image generation with automatic OCR/dimension guardrails.

        If inspection fails, retries up to `max_retries` (2) times with updated seeds
        and reinforced negative prompt tokens. If still failing, returns `needs_assets`.

        When provider is GpuWorkerImageProvider:
        - Submits job asynchronously to Cloud queue (POST /api/v1/image-jobs) and returns immediately.
        - Bypasses local retry loop (handled by Cloud worker lifecycle up to 3 attempts).
        - Bypasses local OCR inspection (handled by GPU worker pre-guardrail).
        - Returns status='image_pending' with job_id.
        """
        # 0. Asynchronous GPU Worker bypass: no blocking, no local retry loop, no local OCR check
        if isinstance(self.image_client.provider, GpuWorkerImageProvider):
            if not self.image_client.provider.is_configured:
                logger.warning(
                    "Image provider %s is not configured; returning status='needs_assets'",
                    type(self.image_client.provider).__name__,
                )
                return GuardedImageOutcome(
                    status="needs_assets",
                    result=None,
                    attempts_made=0,
                    all_reports=[],
                    failure_reasons=["IMAGE_PROVIDER_NOT_CONFIGURED"],
                )
            try:
                job_id = self.image_client.provider.submit(
                    request=request,
                    workspace_id=workspace_id,
                    article_id=article_id,
                    post_id=post_id,
                )
                return GuardedImageOutcome(
                    status="image_pending",
                    result=None,
                    attempts_made=1,
                    all_reports=[],
                    failure_reasons=[],
                    job_id=job_id,
                )
            except ImageProviderError as err:
                logger.warning("GpuWorkerImageProvider submit failed: %s (%s)", err, err.code)
                return GuardedImageOutcome(
                    status="needs_assets",
                    result=None,
                    attempts_made=1,
                    all_reports=[],
                    failure_reasons=[f"{err.code}: {err}"],
                )
        attempts_made = 0
        all_reports: list[ImageGuardrailReport] = []
        all_rejection_reasons: list[str] = []

        # If provider is not configured (e.g. unconfigured in production), return needs_assets without crashing
        if not self.image_client.provider.is_configured:
            logger.warning(
                "Image provider %s is not configured; returning status='needs_assets'",
                type(self.image_client.provider).__name__,
            )
            return GuardedImageOutcome(
                status="needs_assets",
                result=None,
                attempts_made=0,
                all_reports=[],
                failure_reasons=["IMAGE_PROVIDER_NOT_CONFIGURED"],
            )

        # An image that can never pass inspection is not worth paying for.
        if not self.guardrail.ocr_engine.is_available() and self.guardrail.fail_policy != "fail_open":
            return GuardedImageOutcome(status="needs_assets", result=None, attempts_made=0, all_reports=[],
                                       failure_reasons=["OCR engine is not available (fail-closed)"])

        total_allowed_attempts = 1 + self.max_retries
        current_request = request

        for attempt in range(1, total_allowed_attempts + 1):
            attempts_made += 1

            # 1. Generate candidate from provider
            raw_output = self.image_client.provider.generate(current_request)

            # 2. Inspect candidate bytes with guardrail
            report = self.guardrail.inspect(
                image_bytes=raw_output.image_bytes,
                expected_ratio=current_request.aspect_ratio,
                metadata={
                    "prompt": current_request.prompt,
                    "alt_text": current_request.alt_text_description,
                },
            )
            all_reports.append(report)

            if report.passed:
                # Store the very image inspected and produce media_assets payload with ocr_checked=True
                generation_result = self.image_client.store(raw_output, current_request, workspace_id, ocr_checked=True)

                return GuardedImageOutcome(
                    status="approved",
                    result=generation_result,
                    attempts_made=attempts_made,
                    all_reports=all_reports,
                    failure_reasons=[],
                )

            # Guardrail failed: record reasons
            all_rejection_reasons.extend(report.rejection_reasons)
            logger.warning(
                "Image guardrail failed attempt %d/%d: %s",
                attempt,
                total_allowed_attempts,
                "; ".join(report.rejection_reasons),
            )

            # If there are attempts remaining, prepare next retry with new seed and Compel weighted negative prompt
            if attempt < total_allowed_attempts:
                new_seed = ((current_request.seed or 123456) + attempt * 7919) % 1_000_000_000
                reinforced_negative = reinforce_negative_prompt_compel(request.negative_prompt, attempt=attempt)
                current_request = ImageGenerationRequest(
                    prompt=request.prompt,
                    negative_prompt=reinforced_negative,
                    aspect_ratio=request.aspect_ratio,
                    width=request.width,
                    height=request.height,
                    seed=new_seed,
                    workspace_id=workspace_id,
                    model_name=request.model_name,
                    alt_text_description=request.alt_text_description,
                )

        # All attempts exhausted without passing guardrail -> Return needs_assets (DO NOT store rejected images)
        logger.warning(
            "All %d image generation attempts exhausted without passing guardrail. "
            "Returning status='needs_assets'. No corrupted or rejected images were stored. "
            "Rejection reasons: %s",
            total_allowed_attempts,
            "; ".join(all_rejection_reasons),
        )
        return GuardedImageOutcome(
            status="needs_assets",
            result=None,
            attempts_made=attempts_made,
            all_reports=all_reports,
            failure_reasons=all_rejection_reasons,
        )
