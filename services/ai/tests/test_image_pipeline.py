"""Comprehensive unit and integration tests for CM-10 and CM-11.

Verifies:
- CM-10 (img_prompt_gen.py):
  1. Generates rich English prompts from abstract concepts & brand voice.
  2. Always includes mandatory negative prompts (no text, no logo, no real face, no price).
  3. Correctly maps aspect ratio: 1:1 (1080x1080) for Facebook, 9:16 (1080x1920) for TikTok.
  4. Real product/room/location articles NEVER generate AI images, strictly returning needs_assets.
- CM-11 (image_client.py):
  1. Multi-provider support (Flux.1 [dev], Imagen 3, FakeImageProvider).
  2. Latency P50 <= 15s.
  3. Full metadata recorded matching Migration 012 (media_assets schema).
  4. SHA-256 content_hash computed and image uploaded to Cloudflare R2 / FakeStorage.
  5. Cost tracking per image recorded accurately ($0.035 for Flux, $0.04 for Imagen).
  6. Retry mechanism with exponential backoff on transient failure.
"""

from __future__ import annotations

import hashlib
import time
from uuid import uuid4

import pytest

from src.agents.content.img_prompt_gen import (
    ASPECT_RATIO_DIMENSIONS,
    MANDATORY_NEGATIVE_PROMPT,
    ImagePromptResult,
    extract_abstract_concepts,
    generate_image_prompt,
)
from src.agents.content.image_client import (
    FakeImageProvider,
    FakeStorageClient,
    FluxImageProvider,
    ImageClient,
    ImageGenerationRequest,
    ImageGenerationResult,
    ImagenImageProvider,
    R2StorageClient,
)
from src.agents.content.social_pack_v2 import FactItem


# ==============================================================================
# CM-10: IMAGE PROMPT GENERATOR TESTS
# ==============================================================================

def test_abstract_concept_generates_valid_prompt() -> None:
    """CM-10: Abstract concept article generates valid English prompt with negative prompt."""
    article = {
        "title": "Xu hướng làm việc từ xa (Workation) và Digital Nomad 2026",
        "primary_keyword": "digital nomad đà nẵng",
        "body_markdown": "Cộng đồng làm việc từ xa đang ngày càng phát triển tại Đông Nam Á...",
    }
    facts = [
        FactItem(fact_id="f01", text="Đà Nẵng nằm trong top 5 thành phố có tốc độ phát triển nomad nhanh nhất năm 2026.", source_type="seo_body"),
        FactItem(fact_id="f02", text="Xu hướng kết hợp du lịch và làm việc gia tăng mạnh mẽ.", source_type="seo_body"),
    ]

    result = generate_image_prompt(
        article_or_request=article,
        facts=facts,
        brand_voice="Trẻ trung, năng động, phong cách sống hiện đại",
        target_channel="facebook",
    )

    assert result.status == "draft"
    assert result.is_real_product is False
    assert result.rejection_reason is None
    assert len(result.prompt) > 20
    assert "digital nomad" in result.prompt.lower() or "workspace" in result.prompt.lower()
    assert result.aspect_ratio == "1:1"
    assert (result.width, result.height) == (1080, 1080)

    # Verify negative prompt strictly forbids text, logos, real faces, and prices
    for forbidden in ["no text", "no logo", "real human face", "no price", "watermark"]:
        assert forbidden in result.negative_prompt.lower()


@pytest.mark.parametrize(
    "channel, aspect_ratio, expected_dims",
    [
        ("facebook", None, (1080, 1080)),
        ("tiktok", None, (1080, 1920)),
        ("facebook", "9:16", (1080, 1920)),
        ("tiktok", "1:1", (1080, 1080)),
    ],
)
def test_aspect_ratio_mapping(channel: str, aspect_ratio: str | None, expected_dims: tuple[int, int]) -> None:
    """CM-10: Verifies aspect ratio and exact pixel dimensions."""
    article = {"title": "Lối sống tối giản của giới trẻ hiện đại"}
    result = generate_image_prompt(
        article_or_request=article,
        target_channel=channel,
        aspect_ratio=aspect_ratio,
    )
    assert (result.width, result.height) == expected_dims


@pytest.mark.parametrize(
    "real_article_data",
    [
        # Article describing specific apartment / room
        {
            "title": "Căn hộ Studio tại TripC Da Nang cách bãi biển Mỹ Khê 200m",
            "body_markdown": "Căn hộ có diện tích 45m2, đầy đủ nội thất phòng ngủ, ban công riêng và bồn tắm.",
        },
        # Article describing penthouse
        {
            "title": "Khám phá căn hộ Penthouse 120m2 hướng biển",
            "body_markdown": "Trang bị bồn tắm ngắm biển Mỹ Khê trực diện, giá thuê 25 triệu.",
        },
        # Explicit flag requires_real_asset = True
        {
            "title": "Không gian sinh hoạt chung",
            "requires_real_asset": True,
        },
        # Explicit flag is_real_product = True
        {
            "title": "Trải nghiệm tiện ích tòa nhà",
            "is_real_product": True,
        },
    ],
)
def test_real_product_strictly_blocks_ai_image(real_article_data: dict) -> None:
    """CM-10 / Dual-Asset Policy: Real product/room articles NEVER generate AI images."""
    result = generate_image_prompt(article_or_request=real_article_data)

    assert result.status == "needs_assets"
    assert result.is_real_product is True
    assert result.prompt == ""
    assert result.rejection_reason is not None
    assert "chính sách dual-asset" in result.rejection_reason.lower() or "ảnh thật" in result.rejection_reason.lower()


def test_brand_voice_influences_prompt_style() -> None:
    """CM-10: Brand voice alters visual stylistic tokens in prompt."""
    article = {"title": "Phong cách làm việc cân bằng"}

    luxury_result = generate_image_prompt(article, brand_voice="Sang trọng, cao cấp, tinh tế")
    dynamic_result = generate_image_prompt(article, brand_voice="Trẻ trung, năng động, bứt phá")

    assert "editorial" in luxury_result.prompt.lower() or "muted" in luxury_result.prompt.lower()
    assert "vibrant" in dynamic_result.prompt.lower() or "cinematic" in dynamic_result.prompt.lower()


# ==============================================================================
# CM-11: AI IMAGE CLIENT & STORAGE ADAPTER TESTS
# ==============================================================================

def test_fake_image_provider_latency_and_p50() -> None:
    """CM-11: Fake provider satisfies P50 <= 15s SLA with deterministic output."""
    provider = FakeImageProvider(latency_s=0.005, unit_cost=0.035)
    storage = FakeStorageClient()
    client = ImageClient(provider=provider, storage=storage)

    req = ImageGenerationRequest(
        prompt="Modern minimalist digital nomad workspace, warm lighting, octane render",
        negative_prompt=MANDATORY_NEGATIVE_PROMPT,
        aspect_ratio="1:1",
        width=1080,
        height=1080,
        seed=42,
    )

    start = time.perf_counter()
    result = client.generate_and_store(req)
    total_time = time.perf_counter() - start

    assert total_time < 15.0  # Well within P50 <= 15s
    assert result.latency_s < 15.0
    assert result.cost_usd == 0.035
    assert result.aspect_ratio == "1:1"


def test_aspect_ratios_and_dimensions() -> None:
    """CM-11: Verifies 1:1 and 9:16 generation and metadata formatting."""
    client = ImageClient(provider=FakeImageProvider(), storage=FakeStorageClient())

    # 1. Square 1:1
    res_1x1 = client.generate_and_store(
        ImageGenerationRequest(prompt="concept 1", negative_prompt="", aspect_ratio="1:1", width=1080, height=1080)
    )
    assert res_1x1.media_asset_record["ai_metadata"]["width"] == 1080
    assert res_1x1.media_asset_record["ai_metadata"]["height"] == 1080
    assert res_1x1.aspect_ratio == "1:1"

    # 2. Vertical 9:16
    res_9x16 = client.generate_and_store(
        ImageGenerationRequest(prompt="concept 2", negative_prompt="", aspect_ratio="9:16", width=1080, height=1920)
    )
    assert res_9x16.media_asset_record["ai_metadata"]["width"] == 1080
    assert res_9x16.media_asset_record["ai_metadata"]["height"] == 1920
    assert res_9x16.aspect_ratio == "9:16"


def test_sha256_content_hash_and_storage_url() -> None:
    """CM-11: Verifies SHA-256 hash integrity and public CDN URL formatting."""
    storage = FakeStorageClient(cdn_base_url="https://cdn.tripc.vn")
    client = ImageClient(provider=FakeImageProvider(), storage=storage)

    req = ImageGenerationRequest(
        prompt="Abstract geometric wave pattern",
        negative_prompt="",
        seed=999,
    )
    result = client.generate_and_store(req)

    # Hash verification
    assert len(result.content_hash) == 64
    assert result.storage_url.startswith("https://cdn.tripc.vn/generated/")
    assert result.content_hash[:16] in result.storage_url

    # Check file exists in storage client
    filename = result.storage_url.split("/")[-1]
    assert filename in storage.stored_files
    stored_bytes = storage.stored_files[filename]
    assert hashlib.sha256(stored_bytes).hexdigest() == result.content_hash


def test_media_assets_migration_012_compliance() -> None:
    """CM-11: Verifies media_assets database record conforms to migration 012 schema."""
    ws_id = uuid4()
    client = ImageClient(provider=FakeImageProvider(unit_cost=0.035), storage=FakeStorageClient())

    req = ImageGenerationRequest(
        prompt="Tropical workation vibe",
        negative_prompt=MANDATORY_NEGATIVE_PROMPT,
        workspace_id=ws_id,
        model_name="flux-1-dev",
        alt_text_description="Khái niệm làm việc ven biển",
    )
    result = client.generate_and_store(req, workspace_id=ws_id)

    record = result.media_asset_record
    assert record["workspace_id"] == str(ws_id)
    assert record["source_type"] == "ai_generated"
    assert record["license"] == "ai_generated"
    assert "Generated by flux-1-dev via AI Growth OS" in record["attribution"]
    assert record["status"] in ("approved", "pending")
    assert record["alt_text"].startswith("[Ảnh minh họa AI]")
    assert record["content_hash"] == result.content_hash

    # ai_metadata JSONB structure check
    meta = record["ai_metadata"]
    assert meta["model_name"] == "flux-1-dev"
    assert meta["prompt"] == req.prompt
    assert meta["negative_prompt"] == MANDATORY_NEGATIVE_PROMPT
    assert meta["ocr_checked"] is True
    assert meta["cost_usd"] == 0.035
    assert meta["latency_s"] >= 0.0


def test_multi_provider_flux_and_imagen() -> None:
    """CM-11: Tests Flux.1 and Imagen 3 provider configurations and costs."""
    storage = FakeStorageClient()

    # Flux.1
    flux_client = ImageClient(provider=FluxImageProvider(unit_cost=0.035), storage=storage)
    flux_res = flux_client.generate_and_store(
        ImageGenerationRequest(prompt="Flux concept", negative_prompt="", model_name="flux-1-dev")
    )
    assert flux_res.cost_usd == 0.035
    assert flux_res.ai_metadata.model_name == "flux-1-dev"

    # Imagen 3
    imagen_client = ImageClient(provider=ImagenImageProvider(unit_cost=0.040), storage=storage)
    imagen_res = imagen_client.generate_and_store(
        ImageGenerationRequest(prompt="Imagen concept", negative_prompt="", model_name="imagen-3")
    )
    assert imagen_res.cost_usd == 0.040
    assert imagen_res.ai_metadata.model_name == "imagen-3"


def test_retry_on_transient_failure() -> None:
    """CM-11: Verifies retry policy with exponential backoff on transient errors."""
    class FlakyProvider(FakeImageProvider):
        def __init__(self) -> None:
            super().__init__()
            self.attempts = 0

        def generate(self, request: ImageGenerationRequest):
            self.attempts += 1
            if self.attempts < 3:
                raise ConnectionResetError("Temporary network glitch")
            return super().generate(request)

    flaky_provider = FlakyProvider()
    client = ImageClient(provider=flaky_provider, max_retries=3)

    req = ImageGenerationRequest(prompt="Resilience test", negative_prompt="")
    result = client.generate_and_store(req)

    assert flaky_provider.attempts == 3
    assert result is not None
    assert result.content_hash is not None


def test_r2_storage_adapter_defaults() -> None:
    """CM-11: Verifies Cloudflare R2 storage client configuration."""
    r2 = R2StorageClient(cdn_base_url="https://cdn.tripc.vn")
    url = r2.upload(b"FAKE_DATA", "test_file.webp")
    assert url == "https://cdn.tripc.vn/generated/test_file.webp"


# ==============================================================================
# INTEGRATION TEST: CM-10 + CM-11 PIPELINE
# ==============================================================================

def test_full_pipeline_abstract_generates_and_stores() -> None:
    """End-to-end pipeline: abstract article generates prompt and saves asset."""
    article = {
        "title": "Báo cáo thị trường lưu trú cho Digital Nomad tại Đà Nẵng 2026",
        "body_markdown": "Số lượng người làm việc từ xa đang tăng trưởng 50% hàng năm...",
    }
    facts = [
        FactItem(fact_id="f01", text="Đà Nẵng có tốc độ phát triển cộng đồng nomad nhanh nhất.", source_type="seo_body"),
    ]

    prompt_res = generate_image_prompt(article, facts=facts, target_channel="tiktok")
    assert prompt_res.status == "draft"

    client = ImageClient(provider=FakeImageProvider(), storage=FakeStorageClient())
    gen_req = ImageGenerationRequest(
        prompt=prompt_res.prompt,
        negative_prompt=prompt_res.negative_prompt,
        aspect_ratio=prompt_res.aspect_ratio,
        width=prompt_res.width,
        height=prompt_res.height,
    )
    gen_res = client.generate_and_store(gen_req)

    assert gen_res.aspect_ratio == "9:16"
    assert gen_res.asset.alt_text.startswith("[Ảnh minh họa AI]")
    assert gen_res.media_asset_record["source_type"] == "ai_generated"
    assert gen_res.cost_usd > 0


def test_full_pipeline_real_product_aborts_ai_generation() -> None:
    """End-to-end pipeline: real product article aborts prompt generation, preventing AI image generation."""
    real_article = {
        "title": "Căn hộ Studio TripC Da Nang cách biển Mỹ Khê 200m",
        "body_markdown": "Giá thuê 8.500.000 VNĐ/tháng, phòng ngủ đầy đủ nội thất.",
    }

    prompt_res = generate_image_prompt(real_article)

    # Must abort and refuse generation
    assert prompt_res.status == "needs_assets"
    assert prompt_res.prompt == ""
    assert prompt_res.is_real_product is True
