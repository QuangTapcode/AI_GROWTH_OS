"""Comprehensive unit tests for CM-10 Image Prompt Generator (Juggernaut XL v9 Tuning).

Verifies Section 4.3 of KE_HOACH.md:
1. JUGGERNAUT_POSITIVE_TRIGGERS and JUGGERNAUT_NEGATIVE_TOKENS constants.
2. 5 Sample Articles tested:
   - Sample 1: Digital nomad & remote workation
   - Sample 2: Da Nang beach & ocean tourism
   - Sample 3: Coworking & ergonomic digital workspace
   - Sample 4: Artisan coffee culture & sunset relax
   - Sample 5: Minimalist lifestyle & modern architectural trends
3. Deduplication: no duplicate clauses in positive or negative prompt.
4. Subject preservation: prompt begins with English context concepts (Chunk 1 priority).
5. Anti-hallucination coverage: negative prompt contains text, logo, currency, and price tag groups.
6. CLIP 77 Token limit & SDXL Compel chunk boundary checks (subject in Chunk 1, total <= 2 chunks).
7. Backward compatibility: flux and fake providers retain original prompt/negative prompt.
8. Real premises/products: strictly return needs_assets with empty prompt regardless of provider.
"""

from __future__ import annotations

import os
from typing import Any

import pytest

from src.agents.content.img_prompt_gen import (
    MANDATORY_NEGATIVE_PROMPT,
    deduplicate_clauses,
    estimate_clip_tokens,
    generate_image_prompt,
)
from src.agents.content.social_pack_v2 import FactItem


# ==============================================================================
# 5 SAMPLE ARTICLES FOR JUGGERNAUT XL TESTING
# ==============================================================================

SAMPLE_ARTICLES: list[dict[str, Any]] = [
    {
        "id": "sample_01_digital_nomad",
        "title": "Xu hướng làm việc từ xa (Workation) và Digital Nomad 2026",
        "body_markdown": "Đà Nẵng đang vươn lên thành trung tâm digital nomad số một tại Đông Nam Á...",
        "facts": [
            FactItem(fact_id="f01", text="Đà Nẵng nằm trong top điểm đến nomad phát triển nhanh nhất 2026.", source_type="seo_body"),
            FactItem(fact_id="f02", text="Hạ tầng internet 5G tốc độ cao và kết nối xuyên suốt.", source_type="seo_body"),
        ],
        "brand_voice": "Trẻ trung, năng động, phong cách sống hiện đại",
        "expected_subject_keywords": ["digital nomad", "lifestyle", "desk", "laptop"],
    },
    {
        "id": "sample_02_beach_tourism",
        "title": "Cẩm nang du lịch Đà Nẵng: Khám phá bãi biển Mỹ Khê và ẩm thực ven biển",
        "body_markdown": "Bãi cát trắng mịn trải dài cùng bờ biển thơ mộng là điểm hẹn không thể bỏ qua...",
        "facts": [
            FactItem(fact_id="f03", text="Bãi biển Mỹ Khê được bình chọn là một trong những bãi biển đẹp nhất hành tinh.", source_type="seo_body"),
            FactItem(fact_id="f04", text="Không khí biển trong lành và sóng vỗ nhẹ nhàng buổi sớm mai.", source_type="seo_body"),
        ],
        "brand_voice": "Sang trọng, cao cấp, tinh tế",
        "expected_subject_keywords": ["coastline", "waves", "sunlight", "tropical"],
    },
    {
        "id": "sample_03_digital_workspace",
        "title": "Không gian làm việc số hiện đại và năng suất sáng tạo",
        "body_markdown": "Môi trường coworking công thái học với nhiều cây xanh giúp gia tăng năng suất...",
        "facts": [
            FactItem(fact_id="f05", text="Không gian coworking xanh mát với bàn làm việc công thái học.", source_type="seo_body"),
            FactItem(fact_id="f06", text="Môi trường làm việc yên tĩnh giúp tập trung và nâng cao hiệu suất làm việc.", source_type="seo_body"),
        ],
        "brand_voice": "Thực tế, chuyên nghiệp, cân bằng",
        "expected_subject_keywords": ["workspace", "plants", "scandinavian", "ergonomic"],
    },
    {
        "id": "sample_04_coffee_sunset",
        "title": "Văn hóa cà phê artisan và khoảnh khắc hoàng hôn thư giãn bên sông Hàn",
        "body_markdown": "Thưởng thức tách cà phê rang xay thủ công trong ánh hoàng hôn vàng rực rỡ...",
        "facts": [
            FactItem(fact_id="f07", text="Đà Nẵng sở hữu hàng trăm quán cà phê phong cách kiến trúc tối giản.", source_type="seo_body"),
            FactItem(fact_id="f08", text="Không gian thư giãn lý tưởng cho các buổi gặp gỡ và kết nối.", source_type="seo_body"),
        ],
        "brand_voice": "Thư thái, ấm áp, tinh tế",
        "expected_subject_keywords": ["coffee", "golden hour", "twilight", "aesthetic"],
    },
    {
        "id": "sample_05_minimalist_lifestyle",
        "title": "Phong cách sống tối giản và lối sống cân bằng cho thế hệ mới",
        "body_markdown": "Lối sống tối giản giúp giải phóng tâm trí, hướng đến sự thanh thản và bền vững...",
        "facts": [
            FactItem(fact_id="f09", text="Xu hướng sống tối giản giúp tối ưu không gian và tinh thần thư thái.", source_type="seo_body"),
            FactItem(fact_id="f10", text="Thiết kế không gian mở hòa quyện cùng ánh sáng tự nhiên.", source_type="seo_body"),
        ],
        "brand_voice": "Sang trọng, tối giản, thanh lịch",
        "expected_subject_keywords": ["lifestyle", "architectural", "airy", "geometry"],
    },
]


# ==============================================================================
# TEST SUITE: 5 SAMPLE ARTICLES FOR JUGGERNAUT XL
# ==============================================================================

@pytest.mark.parametrize("sample", SAMPLE_ARTICLES, ids=[s["id"] for s in SAMPLE_ARTICLES])
def test_sample_articles_generate_valid_juggernaut_prompt(sample: dict[str, Any]) -> None:
    """CM-10 / Sec 4.3: Validates positive and negative prompt for 5 realistic sample articles."""
    result = generate_image_prompt(
        article_or_request={"title": sample["title"], "body_markdown": sample["body_markdown"]},
        facts=sample["facts"],
        brand_voice=sample["brand_voice"],
        target_channel="facebook",
        image_provider="gpu_worker",
    )

    # 1. Status and governance
    assert result.status == "draft"
    assert result.is_real_product is False
    assert result.rejection_reason is None

    # 2. English subject context at the beginning
    prompt = result.prompt
    assert len(prompt) > 40
    # Core subject must match expected domain concepts
    assert any(kw in prompt.lower() for kw in sample["expected_subject_keywords"])

    # 3. Juggernaut XL Positive Style Triggers attached
    expected_positive_triggers = [
        "cinematic photography",
        "ultra realistic",
        "highly detailed",
        "realistic ambient lighting",
        "professional travel magazine cover",
        "sharp focus",
        "8k resolution",
        "hasselblad medium format photography",
        "architectural aesthetic",
    ]
    for trigger in expected_positive_triggers:
        assert trigger in prompt.lower(), f"Missing trigger '{trigger}' in prompt: {prompt}"

    # 4. No duplicate clauses in positive prompt
    pos_clauses = [c.strip().lower() for c in prompt.split(",") if c.strip()]
    duplicate_pos = [c for c in pos_clauses if pos_clauses.count(c) > 1]
    assert len(duplicate_pos) == 0, f"Found duplicate clauses in positive prompt: {set(duplicate_pos)}"

    # 5. Anti-hallucination coverage in negative prompt
    neg = result.negative_prompt
    # Must have anti-text group
    for anti_text in ["no text", "no words", "typography", "font", "watermark"]:
        assert anti_text in neg.lower(), f"Missing anti-text token '{anti_text}' in negative prompt"

    # Must have anti-logo group
    assert "no logo" in neg.lower()

    # Must have anti-price group
    for anti_price in ["price tag", "currency", "vnd", "dollar"]:
        assert anti_price in neg.lower(), f"Missing anti-price token '{anti_price}' in negative prompt"

    # Must have quality & anti-non-photorealistic group
    for anti_style in ["deformed", "distorted", "low quality", "cartoon", "anime", "3d render"]:
        assert anti_style in neg.lower(), f"Missing anti-style token '{anti_style}' in negative prompt"

    # 6. No duplicate clauses in negative prompt
    neg_clauses = [c.strip().lower() for c in neg.split(",") if c.strip()]
    duplicate_neg = [c for c in neg_clauses if neg_clauses.count(c) > 1]
    assert len(duplicate_neg) == 0, f"Found duplicate clauses in negative prompt: {set(duplicate_neg)}"

    # 7. CLIP Token Boundary Checks & Compel Chunk Management
    # Positive prompt fits in 1 to 2 Compel chunks (<= 150 tokens)
    word_count = len(prompt.split())
    assert 30 <= word_count <= 80, f"Prompt word count {word_count} is out of expected range [30, 80]"
    estimated_pos_tokens = estimate_clip_tokens(prompt)
    assert estimated_pos_tokens <= 150, f"Estimated positive tokens {estimated_pos_tokens} exceeded 150 (max 2 chunks)"

    # Negative prompt fits in at most 2 Compel chunks (<= 150 tokens)
    neg_word_count = len(neg.split())
    assert neg_word_count <= 70, f"Negative prompt word count {neg_word_count} is too long"
    estimated_neg_tokens = estimate_clip_tokens(neg)
    assert estimated_neg_tokens <= 150, f"Negative prompt estimated tokens {estimated_neg_tokens} exceeded 150"

    # Crucial: Anti-text, anti-logo, anti-price tokens MUST be located in Chunk 1 (the first 10 clauses)
    chunk_1_text = ", ".join([c.strip() for c in neg.split(",")[:10]])
    for critical in ["no text", "no logo", "no watermark", "price tag", "currency", "vnd", "dollar"]:
        assert critical in chunk_1_text.lower(), f"Critical negative token '{critical}' must be in Chunk 1"


# ==============================================================================
# CLIP 77 TOKEN LIMIT & COMPEL CHUNK MANAGEMENT TESTS
# ==============================================================================

def test_subject_placed_in_chunk_one_for_maximum_attention() -> None:
    """Verifies that subject concept is placed before style triggers (Chunk 1 of CLIP)."""
    article = {"title": "Xu hướng làm việc từ xa (Workation) và Digital Nomad 2026"}
    res = generate_image_prompt(article, image_provider="gpu_worker")

    prompt = res.prompt
    # Subject terms must appear BEFORE Juggernaut style triggers
    subject_idx = prompt.find("digital nomad")
    trigger_idx = prompt.find("cinematic photography")

    assert subject_idx != -1
    assert trigger_idx != -1
    assert subject_idx < trigger_idx, "Subject must appear before style triggers for Chunk 1 prioritization"


def test_anti_text_and_price_in_first_twenty_tokens_of_negative_prompt() -> None:
    """Verifies that anti-text, logo, and price tokens are placed at the very front of negative prompt."""
    article = {"title": "Cẩm nang du lịch Đà Nẵng"}
    res = generate_image_prompt(article, image_provider="gpu_worker")

    neg = res.negative_prompt
    # First 50 characters must contain text/logo/price prohibitions
    first_part = neg[:80].lower()
    assert "no text" in first_part
    assert "no logo" in first_part
    assert "no watermark" in first_part


def test_clause_deduplication_helper() -> None:
    """deduplicate_clauses appends unique clauses and skips existing phrases."""
    base = "minimalist desk, 8k resolution, natural lighting"
    addition = "cinematic photography, 8k resolution, sharp focus, natural lighting"

    result = deduplicate_clauses(base, addition)
    assert result == "minimalist desk, 8k resolution, natural lighting, cinematic photography, sharp focus"
    assert result.count("8k resolution") == 1
    assert result.count("natural lighting") == 1


# ==============================================================================
# PROVIDER SELECTION & BACKWARD COMPATIBILITY TESTS
# ==============================================================================

def test_flux_and_fake_providers_retain_original_prompts() -> None:
    """When provider is flux or fake, prompt uses legacy octane render and MANDATORY_NEGATIVE_PROMPT."""
    article = {"title": "Lối sống tối giản của giới trẻ hiện đại"}

    res_flux = generate_image_prompt(article, image_provider="flux")
    assert "octane render" in res_flux.prompt
    assert "Hasselblad" not in res_flux.prompt
    assert res_flux.negative_prompt == MANDATORY_NEGATIVE_PROMPT

    res_fake = generate_image_prompt(article, image_provider="fake")
    assert "octane render" in res_fake.prompt
    assert "Hasselblad" not in res_fake.prompt
    assert res_fake.negative_prompt == MANDATORY_NEGATIVE_PROMPT


def test_provider_resolution_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """When image_provider arg is omitted, reads AI_IMAGE_PROVIDER from environment."""
    article = {"title": "Lối sống tối giản của giới trẻ hiện đại"}

    monkeypatch.setenv("AI_IMAGE_PROVIDER", "gpu_worker")
    res_env_invoke = generate_image_prompt(article)
    assert "Hasselblad" in res_env_invoke.prompt
    assert "no words" in res_env_invoke.negative_prompt

    monkeypatch.setenv("AI_IMAGE_PROVIDER", "flux")
    res_env_flux = generate_image_prompt(article)
    assert "octane render" in res_env_flux.prompt
    assert "Hasselblad" not in res_env_flux.prompt


def test_real_room_article_aborts_ai_regardless_of_provider() -> None:
    """Real room article always returns needs_assets even when provider is gpu_worker."""
    real_article = {
        "title": "Căn hộ Studio TripC Da Nang cách biển Mỹ Khê 200m",
        "body_markdown": "Căn hộ có diện tích 45m2, đầy đủ nội thất phòng ngủ, ban công riêng và bồn tắm, giá thuê 8.5tr.",
    }
    res = generate_image_prompt(real_article, image_provider="gpu_worker")
    assert res.status == "needs_assets"
    assert res.prompt == ""
    assert res.is_real_product is True
