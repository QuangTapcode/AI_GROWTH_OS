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
    FABRICATED_PRICE_PATTERNS,
    FABRICATED_PRICE_REGEX,
    BaseOcrEngine,
    GuardedImageOutcome,
    GuardedImagePipeline,
    ImageGuardrail,
    ImageGuardrailReport,
    MockOcrEngine,
    OcrUnavailableError,
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
        self.requests_received: list[ImageGenerationRequest] = []

    def generate(self, request: ImageGenerationRequest) -> ProviderImageOutput:
        self.call_count += 1
        self.requests_received.append(request)
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
        return ImageGuardrail(ocr_engine=MockOcrEngine())

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
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
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
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
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

    def test_retry_loop_fails_twice_then_succeeds_on_third_attempt_with_compel_negative_weights(self):
        """Mock provider returns text twice, then clean on attempt 3 -> succeeds with Compel syntax."""
        provider = FlakyImageProvider(failure_count=2, failure_text="Giảm giá 500k")
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=2)

        req = ImageGenerationRequest(
            prompt="Modern minimalist apartment in Da Nang",
            negative_prompt="blurry, deformed",
            aspect_ratio="1:1",
            width=1080,
            height=1080,
            seed=1000,
        )

        outcome = pipeline.generate_guarded_image(req, workspace_id=uuid4())

        # Verify outcome
        assert outcome.status == "approved"
        assert outcome.attempts_made == 3
        assert outcome.result is not None
        assert outcome.result.ai_metadata.ocr_checked is True

        # Verify exactly 3 calls were received
        assert len(provider.requests_received) == 3

        # Verify seeds changed on every attempt
        seeds = [r.seed for r in provider.requests_received]
        assert len(set(seeds)) == 3, f"Seeds must be distinct: {seeds}"

        # Verify Compel syntax weights on negative prompt
        # Attempt 1: original negative prompt
        assert provider.requests_received[0].negative_prompt == "blurry, deformed"
        # Attempt 2 (1st retry): weight 1.3
        assert "(text:1.3)" in provider.requests_received[1].negative_prompt
        assert "(price tag:1.3)" in provider.requests_received[1].negative_prompt
        # Attempt 3 (2nd retry): weight 1.5
        assert "(text:1.5)" in provider.requests_received[2].negative_prompt
        assert "(price tag:1.5)" in provider.requests_received[2].negative_prompt

        # Verify KHÔNG lưu ảnh lỗi: ONLY the 3rd (clean) image was stored
        assert len(storage.stored_files) == 1

    def test_retry_loop_fails_all_three_attempts_returns_needs_assets_and_never_stores_failed_images(self, caplog: pytest.LogCaptureFixture):
        """Mock provider returns text on all 3 attempts -> returns needs_assets, logs reason, NEVER stores failed images."""
        provider = FlakyImageProvider(failure_count=3, failure_text="Đơn giá 8.5tr")
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=2)

        req = ImageGenerationRequest(
            prompt="Luxury hotel room in Da Nang",
            negative_prompt="watermark",
            aspect_ratio="1:1",
            width=1080,
            height=1080,
            seed=2000,
        )

        caplog.clear()
        with caplog.at_level("WARNING"):
            outcome = pipeline.generate_guarded_image(req, workspace_id=uuid4())

        assert outcome.status == "needs_assets"
        assert outcome.attempts_made == 3
        assert outcome.result is None
        assert len(outcome.failure_reasons) > 0
        assert any("prohibited fabricated price claim" in r for r in outcome.failure_reasons)

        # Verify warning log was recorded
        assert any("All 3 image generation attempts exhausted without passing guardrail" in record.message for record in caplog.records)

        # Verify KHÔNG lưu ảnh lỗi: storage must be completely empty!
        assert storage.stored_files == {}, "Failed or rejected images must NEVER be saved to storage!"

    def test_configurable_max_retries_one_retry(self):
        """GuardedImagePipeline respects max_retries=1 (stops after 2 attempts total)."""
        provider = FlakyImageProvider(failure_count=3, failure_text="Price $200")
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=1)

        req = ImageGenerationRequest(prompt="Test", negative_prompt="")
        outcome = pipeline.generate_guarded_image(req)

        assert outcome.status == "needs_assets"
        assert outcome.attempts_made == 2  # 1 initial + 1 retry
        assert storage.stored_files == {}

    def test_configurable_max_retries_zero(self):
        """GuardedImagePipeline respects max_retries=0 (stops after 1 initial attempt)."""
        provider = FlakyImageProvider(failure_count=3, failure_text="Price $200")
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail, max_retries=0)

        req = ImageGenerationRequest(prompt="Test", negative_prompt="")
        outcome = pipeline.generate_guarded_image(req)

        assert outcome.status == "needs_assets"
        assert outcome.attempts_made == 1  # 0 retries
        assert storage.stored_files == {}

    def test_configurable_max_retries_from_environment(self, monkeypatch: pytest.MonkeyPatch):
        """GuardedImagePipeline reads IMAGE_GUARDRAIL_MAX_RETRIES from environment."""
        monkeypatch.setenv("IMAGE_GUARDRAIL_MAX_RETRIES", "1")
        pipeline = GuardedImagePipeline()
        assert pipeline.max_retries == 1

        monkeypatch.setenv("IMAGE_GUARDRAIL_MAX_RETRIES", "0")
        pipeline = GuardedImagePipeline()
        assert pipeline.max_retries == 0


# ==============================================================================
# 5. FABRICATED PRICE OCR GUARDRAIL & FAIL-OPEN/CLOSED TESTS (CM-12)
# ==============================================================================

class TestFabricatedPriceOcrGuardrail:
    """Tests for fabricated price regex constant and fail-open/closed Tesseract behavior."""

    @pytest.mark.parametrize(
        "price_token",
        [
            "500k",
            "500K",
            "500.000đ",
            "500,000đ",
            "500.000 đ",
            "8.5tr",
            "8,5tr",
            "8,5 triệu",
            "8.5 triệu",
            "8 tr",
            "10 trieu",
            "$200",
            "200$",
            "200 USD",
            "200usd",
            "vnd",
            "VNĐ",
            "500k vnd",
            "15.000.000 VND",
            "€50",
            "100£",
        ],
    )
    def test_fabricated_price_regex_matches_target_patterns(self, price_token: str):
        """FABRICATED_PRICE_REGEX matches all prohibited price formats accurately."""
        match = FABRICATED_PRICE_REGEX.search(price_token)
        assert match is not None, f"Expected match for price pattern: '{price_token}'"
        assert len(match.group(0)) > 0

    @pytest.mark.parametrize(
        "safe_phrase",
        [
            "khách sạn đà nẵng",
            "phòng nghỉ dưỡng cao cấp",
            "view biển mỹ khê",
            "kien truc toi gian",
            "nam 2026 tuyet dep",
            "phong ngu so 3",
            "tang 15 toa nha",
        ],
    )
    def test_fabricated_price_regex_does_not_match_safe_text(self, safe_phrase: str):
        """FABRICATED_PRICE_REGEX does not produce false positives on non-price words."""
        match = FABRICATED_PRICE_REGEX.search(safe_phrase)
        assert match is None, f"Unexpected price match on safe phrase: '{safe_phrase}' -> '{match.group(0)}'"

    @pytest.mark.parametrize(
        "price_str",
        [
            "500k",
            "500.000đ",
            "8.5tr",
            "8,5 triệu",
            "$200",
            "200 USD",
            "vnd",
        ],
    )
    def test_guardrail_rejects_synthetic_pillow_image_with_drawn_price(self, price_str: str):
        """Image with price drawn via Pillow is rejected with has_fabricated_price=True."""
        image_bytes = create_test_image_bytes(
            width=1080,
            height=1080,
            drawn_text=price_str,
            mock_ocr_text=f"Special offer {price_str} booking now",
            format="PNG",
        )

        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
        report = guardrail.inspect(image_bytes, expected_ratio="1:1")

        assert report.passed is False
        assert report.has_fabricated_price is True
        assert report.has_text_or_numbers is True
        assert any("prohibited fabricated price claim" in r for r in report.rejection_reasons)
        assert any("prohibited text or numeric digits" in r for r in report.rejection_reasons)

    def test_guardrail_accepts_clean_synthetic_pillow_image(self):
        """Clean synthetic Pillow image without text or prices passes guardrail."""
        clean_bytes = create_test_image_bytes(
            width=1080,
            height=1080,
            drawn_text=None,
            mock_ocr_text="",
            color=(100, 150, 200),
            format="PNG",
        )

        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine())
        report = guardrail.inspect(clean_bytes, expected_ratio="1:1")

        assert report.passed is True
        assert report.has_fabricated_price is False
        assert report.has_text_or_numbers is False
        assert report.dimensions_valid is True
        assert report.aspect_ratio_valid is True
        assert len(report.rejection_reasons) == 0

    def test_guardrail_inspects_webp_bytes(self):
        """Guardrail accepts WebP image bytes matching standard provider output format."""
        # Generate genuine WebP bytes via Pillow (same mime type and dimensions as provider output)
        img = Image.new("RGB", (1080, 1080), color=(80, 120, 160))
        buf = io.BytesIO()
        img.save(buf, format="WEBP")
        webp_bytes = buf.getvalue()

        guardrail = ImageGuardrail(ocr_engine=MockOcrEngine(forced_text=""))
        report = guardrail.inspect(webp_bytes, expected_ratio="1:1")

        assert report.passed is True
        assert report.width == 1080
        assert report.height == 1080
        assert report.actual_ratio == "1080:1080"
        assert report.has_fabricated_price is False
        assert report.has_text_or_numbers is False

    def test_tesseract_unavailable_fail_closed_behavior(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
        """When Tesseract is unavailable with fail-closed, image is rejected and pipeline yields needs_assets."""
        engine = TesseractOcrEngine()
        monkeypatch.setattr(engine, "is_available", lambda: False)

        clean_bytes = create_test_image_bytes(1080, 1080)

        caplog.clear()
        with caplog.at_level("WARNING"):
            guardrail = ImageGuardrail(ocr_engine=engine, fail_policy="fail_closed")
            report = guardrail.inspect(clean_bytes)

        assert report.passed is False
        assert any("OCR engine is not installed or unavailable" in r for r in report.rejection_reasons)
        assert any("Fail-closed policy is active" in record.message for record in caplog.records)

        # Pipeline test
        provider = FakeImageProvider()
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail)

        assert pipeline.not_ready() == "OCR_NOT_AVAILABLE"

        req = ImageGenerationRequest(prompt="Test prompt", negative_prompt="")
        outcome = pipeline.generate_guarded_image(req)
        assert outcome.status == "needs_assets"
        assert outcome.attempts_made == 0
        assert "OCR engine is not available (fail-closed)" in outcome.failure_reasons

    def test_tesseract_unavailable_fail_open_behavior(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
        """When Tesseract is unavailable with fail-open, image passes and pipeline yields approved."""
        engine = TesseractOcrEngine()
        monkeypatch.setattr(engine, "is_available", lambda: False)

        clean_bytes = create_test_image_bytes(1080, 1080)

        caplog.clear()
        with caplog.at_level("WARNING"):
            guardrail = ImageGuardrail(ocr_engine=engine, fail_policy="fail_open")
            report = guardrail.inspect(clean_bytes)

        assert report.passed is True
        assert "fail-open policy" in report.limitations_note
        assert any("Fail-open policy is active" in record.message for record in caplog.records)

        # Pipeline test
        provider = FakeImageProvider()
        storage = FakeStorageClient()
        client = ImageClient(provider=provider, storage=storage)
        pipeline = GuardedImagePipeline(image_client=client, guardrail=guardrail)

        assert pipeline.not_ready() is None

        req = ImageGenerationRequest(prompt="Test prompt", negative_prompt="")
        outcome = pipeline.generate_guarded_image(req)
        assert outcome.status == "approved"
        assert outcome.result is not None

    def test_production_defaults_to_fail_closed(self, monkeypatch: pytest.MonkeyPatch):
        """In production environment, OCR guardrail defaults to fail-closed policy."""
        monkeypatch.delenv("OCR_FAIL_POLICY", raising=False)
        monkeypatch.setenv("APP_ENV", "production")

        guardrail = ImageGuardrail()
        assert guardrail.fail_policy == "fail_closed"
        assert guardrail.app_env == "production"

    def test_tesseract_ocr_engine_language_detection(self, monkeypatch: pytest.MonkeyPatch):
        """TesseractOcrEngine detects eng+vie when available, falls back to eng."""
        engine = TesseractOcrEngine()

        # Case 1: Both eng and vie installed
        import pytesseract
        monkeypatch.setattr(pytesseract, "get_languages", lambda config="": ["eng", "vie", "osd"])
        assert engine._get_lang_param() == "eng+vie"

        # Case 2: Only eng installed
        monkeypatch.setattr(pytesseract, "get_languages", lambda config="": ["eng", "osd"])
        assert engine._get_lang_param() == "eng"

        # Case 3: Only vie installed
        monkeypatch.setattr(pytesseract, "get_languages", lambda config="": ["vie", "osd"])
        assert engine._get_lang_param() == "vie"

        # Case 4: Explicit lang override
        custom_engine = TesseractOcrEngine(lang="fra")
        assert custom_engine._get_lang_param() == "fra"
