"""Image Prompt Generator for Content Marketing (CM-10).

Generates artistic English prompts from abstract concepts in facts and brand aesthetic.
Enforces the Dual-Asset Governance Policy (Section 7):
- AI-Generated images are permitted ONLY for abstract concepts, market trends, or lifestyle backgrounds.
- If an article describes real products, physical rooms, specific amenities, or enterprise premises,
  generating AI images is STRICTLY PROHIBITED; it must return status='needs_assets'.
- Always attaches strict negative prompts to eliminate text, logos, real faces, and price tags.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Sequence

from .asset_manager import is_real_product_description
from .social_pack_v2 import FactItem

# Mandatory Negative Prompt to prevent hallucinated text, logos, distorted human faces, and price claims (TC-14)
MANDATORY_NEGATIVE_PROMPT: str = (
    "no text, no logo, no real face, no price, "
    "text, watermark, typography, letters, words, brand logo, insignia, label, "
    "real human face, photorealistic human face, portrait, recognizable people, "
    "price tag, discount number, currency sign, dollar sign, vnd, percentage, "
    "blurry, distorted, low quality, oversaturated, deformed anatomy, bad geometry, artifacts"
)

# Juggernaut XL v9 Specialized Tokens (Section 4.3 of KE_HOACH.md)
JUGGERNAUT_POSITIVE_TRIGGERS: str = (
    "cinematic photography, ultra realistic, highly detailed, "
    "realistic ambient lighting, professional travel magazine cover, "
    "sharp focus, 8k resolution, Hasselblad medium format photography, "
    "architectural aesthetic"
)

JUGGERNAUT_NEGATIVE_TOKENS: str = (
    "no text, no logo, no watermark, no words, typography, font, "
    "price tag, currency, vnd, dollar, deformed, distorted, low quality, "
    "cartoon, anime, 3d render, extra limbs, bad anatomy, oversaturated"
)


def deduplicate_clauses(base: str, addition: str) -> str:
    """Appends comma-separated clauses from addition to base without duplicate phrases."""
    clauses = [c.strip() for c in base.split(",") if c.strip()]
    seen_lower = {c.lower() for c in clauses}

    for item in addition.split(","):
        clean = item.strip()
        if not clean:
            continue
        if clean.lower() in seen_lower:
            continue
        clauses.append(clean)
        seen_lower.add(clean.lower())

    return ", ".join(clauses)


def estimate_clip_tokens(text: str) -> int:
    """Heuristic estimate of CLIP BPE token count (including BOS and EOS tokens).

    CLIP tokenizers typically produce ~1.2 tokens per word/punctuation mark.
    Standard CLIP context limit is 77 tokens (1 chunk).
    SDXL Compel dynamically chunks prompts into 77-token batches (1-2 chunks for up to ~150 tokens).
    """
    tokens = re.findall(r"\w+|[^\w\s]", text)
    return int(len(tokens) * 1.2) + 2

ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1080, 1080),   # Facebook post, Instagram carousel, square graphic
    "9:16": (1080, 1920),  # TikTok video background, Story, vertical graphic
}


@dataclass
class ImagePromptResult:
    """Result of the image prompt generation process."""

    prompt: str = ""
    negative_prompt: str = MANDATORY_NEGATIVE_PROMPT
    aspect_ratio: Literal["1:1", "9:16"] = "1:1"
    width: int = 1080
    height: int = 1080
    status: Literal["draft", "needs_assets"] = "draft"
    rejection_reason: str | None = None
    is_real_product: bool = False
    concepts: list[str] = field(default_factory=list)


def extract_abstract_concepts(
    facts: Sequence[str | FactItem | dict[str, Any]] = (),
    topic_or_title: str | None = None,
) -> list[str]:
    """Extract general thematic and conceptual terms from facts and topic for prompt construction."""
    concepts: list[str] = []
    text_corpus: list[str] = []

    if topic_or_title:
        text_corpus.append(topic_or_title)

    for f in facts:
        if isinstance(f, str):
            text_corpus.append(f)
        elif isinstance(f, FactItem):
            text_corpus.append(f.text)
        elif isinstance(f, dict) and "text" in f:
            text_corpus.append(str(f["text"]))
        elif hasattr(f, "text"):
            text_corpus.append(str(f.text))

    full_text = " ".join(text_corpus).lower()

    # Domain abstract concept mapping for hospitality, nomad, and lifestyle
    concept_dictionary = [
        (r"\b(?:digital nomad|làm việc từ xa|remote work|workation)\b", "minimalist digital nomad lifestyle, modern laptop on clean wooden desk overlooking coastal horizon"),
        (r"\b(?:bãi biển|biển|đại dương|mỹ khê|coastal|beach)\b", "serene tropical coastline, gentle morning waves, warm natural ambient sunlight"),
        (r"\b(?:công nghệ|5g|internet|tốc độ cao|kết nối)\b", "modern high-speed connectivity, sleek futuristic subtle fiber optic elements, clean aesthetic"),
        (r"\b(?:không gian làm việc|coworking|bàn làm việc|productivity)\b", "ergonomic peaceful modern workspace, green indoor plants, warm Scandinavian architectural design"),
        (r"\b(?:phong cách sống|lifestyle|hiện đại|xu hướng)\b", "contemporary urban lifestyle illustration, clean architectural geometry, airy atmosphere"),
        (r"\b(?:cà phê|thư giãn|relax|chill|hoàng hôn)\b", "artisan coffee cup, warm golden hour twilight, cozy aesthetic ambiance"),
        (r"\b(?:cộng đồng|kết nối|network|giao lưu)\b", "vibrant creative collaborative atmosphere, ambient architectural environment"),
        (r"\b(?:du lịch|khám phá|đà nẵng|miền trung)\b", "scenic coastal cityscape of Da Nang with iconic ocean landscape, artistic cinematic travel vibe"),
    ]

    for pattern, concept in concept_dictionary:
        if re.search(pattern, full_text):
            concepts.append(concept)

    if not concepts:
        concepts.append("modern aesthetic concept illustration, clean minimalist architectural design, natural warm ambient lighting")

    return concepts


def generate_image_prompt(
    article_or_request: Any,
    facts: Sequence[str | FactItem | dict[str, Any]] = (),
    brand_voice: str | None = None,
    target_channel: str = "facebook",
    aspect_ratio: Literal["1:1", "9:16"] | str | None = None,
    image_provider: str | None = None,
) -> ImagePromptResult:
    """Generate an AI image prompt strictly adhering to the Dual-Asset policy.

    1. Checks whether the content describes real products/premises via is_real_product_description().
       If TRUE: immediately returns status='needs_assets' with an explicit policy rejection reason.
    2. If FALSE (abstract concepts / market trends / lifestyle):
       Constructs an English artistic concept prompt with aspect ratio (1:1 for FB, 9:16 for TikTok)
       and attaches the mandatory negative prompt.
    3. If image_provider is 'gpu_worker':
       Optimizes prompt and negative prompt for SDXL / Juggernaut XL Checkpoint:
       - Appends JUGGERNAUT_POSITIVE_TRIGGERS with deduplication.
       - Enforces JUGGERNAUT_NEGATIVE_TOKENS at the head of negative prompt (suppressing text/logos/prices in Chunk 1).
       - Keeps subject first in Chunk 1, ensuring prompt fits within 1-2 Compel chunks (<= 150 tokens).
       For 'flux' / 'fake': preserves existing prompt and negative prompt behavior.
    """
    # 1. Dual-Asset Governance Check: Real product / room description is strictly forbidden from using AI images
    is_real, detection_method, matched_keywords = is_real_product_description(article_or_request)
    if is_real:
        return ImagePromptResult(
            prompt="",
            negative_prompt=MANDATORY_NEGATIVE_PROMPT,
            status="needs_assets",
            is_real_product=True,
            rejection_reason=(
                f"Bài viết mô tả sản phẩm, phòng ốc hoặc cơ sở vật chất thực tế của doanh nghiệp "
                f"(phát hiện qua {detection_method}: {matched_keywords[:3]}). "
                f"Chính sách Dual-Asset (Mục 7) nghiêm cấm dùng ảnh AI thay thế ảnh thật sản phẩm. "
                f"Bắt buộc người dùng tải lên ảnh thật đã được phê duyệt bản quyền."
            ),
        )

    # 2. Determine Aspect Ratio and Dimensions
    resolved_ratio: Literal["1:1", "9:16"] = "1:1"
    if aspect_ratio in ("1:1", "9:16"):
        resolved_ratio = aspect_ratio  # type: ignore[assignment]
    elif target_channel.lower() == "tiktok":
        resolved_ratio = "9:16"
    else:
        resolved_ratio = "1:1"

    width, height = ASPECT_RATIO_DIMENSIONS[resolved_ratio]

    # 3. Extract Abstract Concepts from Context
    title = ""
    if isinstance(article_or_request, Mapping):
        title = article_or_request.get("title", "")
    elif hasattr(article_or_request, "title"):
        title = getattr(article_or_request, "title", "")

    concepts = extract_abstract_concepts(facts=facts, topic_or_title=title)

    # 4. Synthesize Prompt with Brand Aesthetic
    aesthetic_style = "minimalist vector art, clean architectural lines, sophisticated corporate color palette"
    if brand_voice and ("trẻ trung" in brand_voice.lower() or "dynamic" in brand_voice.lower()):
        aesthetic_style = "vibrant modern graphic illustration, cinematic lighting, warm golden tones"
    elif brand_voice and ("sang trọng" in brand_voice.lower() or "luxury" in brand_voice.lower()):
        aesthetic_style = "high-end editorial design, muted earth tones, refined cinematic depth"

    prompt_core = ", ".join(concepts[:2])

    # Resolve provider mode (gpu_worker vs flux/fake)
    resolved_provider = (
        image_provider
        or (article_or_request.get("image_provider") if isinstance(article_or_request, Mapping) else None)
        or (article_or_request.get("ai_image_provider") if isinstance(article_or_request, Mapping) else None)
        or getattr(article_or_request, "image_provider", None)
        or getattr(article_or_request, "ai_image_provider", None)
        or os.getenv("AI_IMAGE_PROVIDER", "flux")
    )
    if isinstance(resolved_provider, str):
        resolved_provider = resolved_provider.strip().lower()
    else:
        resolved_provider = "flux"

    if resolved_provider in {"gpu_worker", "gpu-worker"}:
        # Photorealistic Juggernaut XL v9 styling (Section 4.3):
        # 1. Subject first: prompt_core stays in Chunk 1 of CLIP/Compel for maximum cross-attention.
        # 2. Append JUGGERNAUT_POSITIVE_TRIGGERS with deduplication.
        # 3. Negative prompt puts anti-text/logo/price group at head of Chunk 1 for strict suppression.
        base_style = aesthetic_style.replace("minimalist vector art", "architectural photography")
        base_prompt = f"{prompt_core}, {base_style}, elegant composition, peaceful atmosphere, empty of people, no text"
        full_prompt = deduplicate_clauses(base_prompt, JUGGERNAUT_POSITIVE_TRIGGERS)
        full_negative = deduplicate_clauses(JUGGERNAUT_NEGATIVE_TOKENS, MANDATORY_NEGATIVE_PROMPT)
    else:
        # Backward compatibility for flux / fake providers
        full_prompt = (
            f"{prompt_core}, {aesthetic_style}, "
            f"octane render, 8k resolution, elegant composition, peaceful atmosphere, "
            f"empty of people, no text"
        )
        full_negative = MANDATORY_NEGATIVE_PROMPT

    return ImagePromptResult(
        prompt=full_prompt,
        negative_prompt=full_negative,
        aspect_ratio=resolved_ratio,
        width=width,
        height=height,
        status="draft",
        is_real_product=False,
        concepts=concepts,
    )
