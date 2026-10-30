"""Unit and Integration Tests for Image Guardrail (OCR & Safety) (CM-12 & TC-14).

Verifies all requirements:
1. OCR detection of letters, text, and numeric price claims (500k, 8.5tr, $200).
2. Image dimension validation (min 1080x1080 for 1:1, min 1080x1920 for 9:16).
3. Aspect ratio validation with strict tolerances.
4. Safety filter and limitations notice.
5. Auto-retry engine: retries up to 2 times (3 attempts total).
6. Exhausted retries return status 'needs_assets'.
7. Metadata stamps `ai_image_meta.ocr_checked = True`.
8. TC-14: Hallucinated/distorted text in AI image is caught by OCR, triggers retry/abort.
"""

from __future__ import annotations

import io
from typing import Literal
from uuid import uuid4

import pytest
from PIL import Image, ImageDraw

from src.agents.content.image_client import (
    BaseImageProvider,
    FakeImageProvider,
    FakeStorageClient,
    ImageClient,
    ImageGenerationRequest,
    ProviderImageOutput,
)
from src.agents.content.image_guardrail import (
    BaseOcrEngine,
    GuardedImageOutcome,
    GuardedImagePipeline,
    ImageGuardrail,
    ImageGuardrailReport,
    MockOcrEngine,
    TesseractOcrEngine,
)


# ==============================================================================
# TEST FIXTURES & HELPERS
# ==============================================================================

def create_test_image_bytes(
    width: int,
    height: int,
    drawn_text: str | None = None,
    mock_ocr_text: str | None = None,
    color: tuple[int, int, int] = (245, 245, 245),
    format: str = "PNG",
) -> bytes:
    """Helper creating real PIL in-memory image bytes with optional drawn text and metadata."""
    img = Image.new("RGB", (width, height), color=color)

    if drawn_text:
        draw = ImageDraw.Draw(img)
        # Draw text at center
        draw.text((width // 4, height // 4), drawn_text, fill=(20, 20, 20))

    buf = io.BytesIO()
    # Save with custom metadata info for fallback test execution
    info_dict = {}
    if mock_ocr_text is not None:
        info_dict["mock_ocr_text"] = mock_ocr_text
    elif drawn_text is not None:
        info_dict["mock_ocr_text"] = drawn_text

    # PNG format allows saving text metadata
    if format.upper() == "PNG":
        from PIL import PngImagePlugin
        png_info = PngImagePlugin.PngInfo()
        for k, v in info_dict.items():
            png_info.add_text(k, str(v))
        img.save(buf, format="PNG", pnginfo=png_info)
    else:
        img.save(buf, format=format)

    return buf.getvalue()


class FlakyImageProvider(BaseImageProvider):
    """Mock provider failing on early attempts then succeeding, or failing consistently."""

    def __init__(self, failure_count: int, failure_text: str = "Hallucinated Text 500k") -> None:
        self.failure_count = failure_count
        self.failure_text = failure_text
        self.call_count = 0

    def generate(self, request: ImageGenerationRequest) -> ProviderImageOutput:
        self.call_count += 1
        if self.call_count <= self.failure_count:
            # Generate image with OCR violation text
            bad_bytes = create_test_image_bytes(
                width=request.width,
                height=request.height,
                drawn_text=self.failure_text,
                mock_ocr_text=self.failure_text,
            )
            return ProviderImageOutput(
                image_bytes=bad_bytes,
                mime_type="image/png",
                model_name=request.model_name,
                seed=request.seed or 1111,
                cost_usd=0.035,
                latency_s=0.01,
                width=request.width,
                height=request.height,
            )
        else:
            # Clean image passes guardrail
            clean_bytes = create_test_image_bytes(
                width=request.width,
                height=request.height,
                drawn_text=None,
                mock_ocr_text="",
            )
            return ProviderImageOutput(
                image_bytes=clean_bytes,
                mime_type="image/png",
                model_name=request.model_name,
                seed=request.seed or 2222,
                cost_usd=0.035,
                latency_s=0.01,
                width=request.width,
                height=request.height,
            )


# ==============================================================================
# 1. OCR GUARDRAIL TESTS (TEXT, NUMBERS, PRICES)
# ==============================================================================

class TestOcrGuardrail:
    """Verifies that any text, digits, or price claims cause immediate rejection."""

    @pytest.fixture
    def guardrail(self) -> ImageGuardrail:
        return ImageGuardrail(ocr_engine=TesseractOcrEngine())

    def test_clean_square_image_passes(self, guardrail: ImageGuardrail):
        clean_bytes = create_test_image_bytes(1080, 1080, drawn_text=None, mock_ocr_text="")
        report = guardrail.inspect(clean_bytes, expected_ratio="1:1")
        assert report.passed is True
        assert report.has_text_or_numbers is False
        assert report.dimensions_valid is True
        assert report.aspect_ratio_valid is True
        assert len(report.rejection_reasons) == 0

    def test_clean_vertical_image_passes(self, guardrail: ImageGuardrail):
        clean_bytes = create_test_image_bytes(1080, 1920, drawn_text=None, mock_ocr_text="")
        report = guardrail.inspect(clean_bytes, expected_ratio="9:16")
        assert report.passed is True
        assert report.has_text_or_numbers is False
        assert report.dimensions_valid is True
        assert report.aspect_ratio_valid is True

    @pytest.mark.parametrize(
        "prohibited_text",
        [
            "Sale Off 50%",
            "Giá phòng 500k",
            "8.5tr VNĐ",
            "Only $200",
            "TripC Da Nang Apartment",
            "Giảm giá hôm nay",
            "1 củ",
            "abc123xyz",
            "Đà Nẵng",
            "Ưu đãi sốc",
            "Phòng đẹp",
        ],
    )
    def test_detected_text_or_prices_are_strictly_rejected(
        self, guardrail: ImageGuardrail, prohibited_text: str
    ):
        bad_bytes = create_test_image_bytes(
            1080, 1080, drawn_text=prohibited_text, mock_ocr_text=prohibited_text
        )
        report = guardrail.inspect(bad_bytes, expected_ratio="1:1")
        assert report.passed is False
        assert report.has_text_or_numbers is True
        assert any("prohibited text or numeric digits" in r for r in report.rejection_reasons)

    def test_mock_ocr_engine_forced_text(self):
        mock_engine = MockOcrEngine(forced_text="Distorted AI letters detected")
        guardrail = ImageGuardrail(ocr_engine=mock_engine)

        clean_bytes = create_test_image_bytes(1080, 1080)
        report = guardrail.inspect(clean_bytes, expected_ratio="1:1")
        assert report.passed is False
        assert "Distorted AI letters detected" in report.ocr_detected_text


# ==============================================================================
# 2. DIMENSIONS & RATIO TESTS
# ==============================================================================

class TestDimensionsAndRatio:
    """Verifies resolution thresholds and aspect ratio conformance."""

    @pytest.fixture
    def guardrail(self) -> ImageGuardrail:
        return ImageGuardrail(ocr_engine=MockOcrEngine(""))

    def test_image_smaller_than_1080x1080_rejected(self, guardrail: ImageGuardrail):
        small_bytes = create_test_image_bytes(800, 800)
        report = guardrail.inspect(small_bytes, expected_ratio="1:1")
        assert report.passed is False
        assert report.dimensions_valid is False
        assert any("below minimum required 1080x1080" in r for r in report.rejection_reasons)

    def test_vertical_smaller_than_1080x1920_rejected(self, guardrail: ImageGuardrail):
        small_bytes = create_test_image_bytes(720, 1280)
        report = guardrail.inspect(small_bytes, expected_ratio="9:16")
        assert report.passed is False
        assert report.dimensions_valid is False
        assert any("below minimum required 1080x1920" in r for r in report.rejection_reasons)

    def test_incorrect_aspect_ratio_rejected(self, guardrail: ImageGuardrail):
        # 1080x1400 is neither 1:1 nor 9:16
        bad_ratio_bytes = create_test_image_bytes(1080, 1400)
        report = guardrail.inspect(bad_ratio_bytes, expected_ratio="1:1")
        assert report.passed is False
        assert report.aspect_ratio_valid is False
        assert any("aspect ratio deviation too large" in r for r in report.rejection_reasons)

    def test_corrupted_image_bytes_handled_gracefully(self, guardrail: ImageGuardrail):
        corrupted_bytes = b"NOT_A_VALID_IMAGE_DATA_BYTES"
        report = guardrail.inspect(corrupted_bytes, expected_ratio="1:1")
        assert report.passed is False
        assert any("Invalid or corrupted image format" in r for r in report.rejection_reasons)


# ==============================================================================
# 3. SAFETY & LIMITATIONS NOTICES
# ==============================================================================

class TestSafetyAndLimitations:
    """Verifies sensitive term filters and transparent limitations notice."""

    @pytest.fixture
    def guardrail(self) -> ImageGuardrail:
        return ImageGuardrail(ocr_engine=MockOcrEngine(""))

    def test_sensitive_term_in_metadata_triggers_rejection(self, guardrail: ImageGuardrail):
        clean_bytes = create_test_image_bytes(1080, 1080)
        report = guardrail.inspect(
            clean_bytes,
            expected_ratio="1:1",
            metadata={"prompt": "A modern room with nsfw painting", "alt_text": "Room photo"},
        )
        assert report.passed is False
        assert report.safety_valid is False
        assert any("Safety filter triggered on prohibited term: 'nsfw'" in r for r in report.rejection_reasons)

    def test_commercial_brand_competitor_triggers_rejection(self, guardrail: ImageGuardrail):
        clean_bytes = create_test_image_bytes(1080, 1080)
        report = guardrail.inspect(
            clean_bytes,
            expected_ratio="1:1",
            metadata={"prompt": "Illustration with marriott logo at night", "alt_text": "Minimalist graphic"},
        )
        assert report.passed is False
        assert report.safety_valid is False
        assert any("marriott" in r for r in report.rejection_reasons)

    def test_real_face_request_triggers_rejection(self, guardrail: ImageGuardrail):
        clean_bytes = create_test_image_bytes(1080, 1080)
        report = guardrail.inspect(
            clean_bytes,
            expected_ratio="1:1",
            metadata={"prompt": "Realistic close-up portrait of human face smiling", "alt_text": "Portrait"},
        )
        assert report.passed is False
        assert report.safety_valid is False
        assert any("real human faces" in r for r in report.rejection_reasons)

    def test_limitations_notice_is_present(self, guardrail: ImageGuardrail):
        clean_bytes = create_test_image_bytes(1080, 1080)
        report = guardrail.inspect(clean_bytes, expected_ratio="1:1")
        assert "Level 2 Human Approval" in report.limitations_note


# ==============================================================================
# 4. AUTO-RETRY ENGINE & TC-14 COMPLIANCE
# ==============================================================================

class TestGuardedPipelineAndRetries:
    """Tests the retry loop: 1 initial + max 2 retries (total 3 attempts)."""

    def test_first_attempt_clean_passes_immediately(self):
        provider = FakeImageProvider()
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine(""))
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=2)

        req = ImageGenerationRequest(
            prompt="Abstract modern digital nomad illustration",
            negative_prompt="no text, no logo, no real face, no price",
            aspect_ratio="1:1",
            width=1080,
            height=1080,
        )

        outcome = pipeline.generate_guarded_image(req, workspace_id=uuid4())

        assert outcome.status == "approved"
        assert outcome.attempts_made == 1
        assert outcome.result is not None
        assert outcome.result.ai_metadata.ocr_checked is True
        assert outcome.result.media_asset_record["ai_metadata"]["ocr_checked"] is True
        assert len(outcome.failure_reasons) == 0

    def test_tc14_ocr_text_error_triggers_retry_and_succeeds_on_second_attempt(self):
        """TC-14: AI image has hallucinated/distorted text on attempt 1, retries and succeeds on attempt 2."""
        provider = FlakyImageProvider(failure_count=1, failure_text="Méo mó text $200")
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=TesseractOcrEngine())
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=2)

        req = ImageGenerationRequest(
            prompt="Minimalist geometric landscape of Da Nang",
            negative_prompt="no text, no logo, no real face, no price",
            aspect_ratio="1:1",
            width=1080,
            height=1080,
            seed=4444,
        )

        outcome = pipeline.generate_guarded_image(req, workspace_id=uuid4())

        assert outcome.status == "approved"
        assert outcome.attempts_made == 2
        assert len(outcome.all_reports) == 2
        # First report had OCR failure
        assert outcome.all_reports[0].passed is False
        assert outcome.all_reports[0].has_text_or_numbers is True
        # Second report passed
        assert outcome.all_reports[1].passed is True
        assert outcome.result is not None
        assert outcome.result.ai_metadata.ocr_checked is True

    def test_tc14_exhausted_retries_returns_needs_assets(self):
        """When 3 consecutive attempts all contain text/price errors, pipeline returns needs_assets."""
        provider = FlakyImageProvider(failure_count=3, failure_text="Fake price 8.5tr")
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=TesseractOcrEngine())
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=2)

        req = ImageGenerationRequest(
            prompt="Minimalist sunrise over ocean",
            negative_prompt="no text, no logo, no real face, no price",
            aspect_ratio="1:1",
            width=1080,
            height=1080,
        )

        outcome = pipeline.generate_guarded_image(req, workspace_id=uuid4())

        assert outcome.status == "needs_assets"
        assert outcome.attempts_made == 3  # 1 initial + 2 retries
        assert outcome.result is None
        assert len(outcome.failure_reasons) > 0
        assert any("prohibited text or numeric digits" in r for r in outcome.failure_reasons)
