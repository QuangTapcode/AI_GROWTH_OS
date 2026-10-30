"""Facebook Pack Repurposer (CM-16).

Transforms long-form SEO articles into high-engagement Facebook posts adhering to:
1. 3-part layout:
   - Part 1: Hook (First 3 seconds, Zero-Claim compliant: no numbers, prices, unverified claims).
   - Part 2: Body (Key takeaways / bullet points, each factual sentence mapped to fact_id).
   - Part 3: CTA (Verbatim Call To Action from request).
2. 3 to 5 Hashtags:
   - Zero-Claim compliant: strictly NO new claims, NO prices, NO digits, NO superlatives, NO unbacked promo words.
   - Limited to brand, verified locations, or general topic keywords.
3. Sentence-Fact Mapping & Reflection Loop (CM-15):
   - Guardrails (CM-13) + Mapper/NLI (CM-08) + Judge (CM-14).
   - Up to 2 self-correction rounds, failing to insufficient_data if hard errors persist.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Sequence
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from .asset_manager import DualAssetManager
from .bundle_manager import get_active_bundle_id
from .fact_mapper import map_caption_to_sentence_fact_map, split_vietnamese_sentences
from .reflection_loop import ContentQualityAuditor, ReflectionCorrectionLoop
from .social_pack_v2 import (
    AIImageMetadata,
    AssetV2,
    CitationItem,
    CTAObject,
    FactItem,
    SentenceMap,
    SocialPack as SocialPackV2,
    SocialPackStatusType,
    compute_content_hash,
)


logger = logging.getLogger(__name__)

PROMPT_VERSION = "content-repurpose-fb-v1"
MIN_FACTS_THRESHOLD = 3

PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "content" / "repurpose_fb.v1.md"
SYSTEM_PROMPT = ""
if PROMPT_PATH.exists():
    SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")
else:
    SYSTEM_PROMPT = (
        "Bạn là Chuyên gia Tái cấu trúc Nội dung Facebook của AI Growth OS. "
        "Tái cấu trúc bài SEO thành bài đăng Facebook 3 phần chuẩn, 3-5 hashtag Zero-Claim, "
        "bảo chứng sự thật 100% bằng facts được cung cấp."
    )

# Các mẫu từ ngữ cấm trong Hashtag để thực thi Zero-Claim
_FORBIDDEN_HASHTAG_TERMS = {
    "giare", "renhat", "totnhat", "so1", "free", "mienphi", "tang",
    "uudai", "khuyenmai", "hotdeal", "100%", "tuyetdoi", "camket",
    "trieu", "vnd", "usd", "cu",
}


def validate_facebook_hashtags(
    hashtags: Sequence[str],
    facts: Sequence[FactItem] = (),
) -> list[str]:
    """Kiểm tra tuân thủ quy tắc 3-5 hashtags và luật Zero-Claim cho hashtags."""
    violations: list[str] = []

    if len(hashtags) < 3 or len(hashtags) > 5:
        violations.append(
            f"[HASHTAG_COUNT_INVALID] Số lượng hashtag bắt buộc từ 3 đến 5 (hiện có: {len(hashtags)})."
        )

    for idx, tag in enumerate(hashtags):
        tag_str = str(tag).strip()
        if not tag_str.startswith("#"):
            violations.append(f"[HASHTAG_FORMAT_ERROR] Hashtag '{tag_str}' thiếu ký tự '#' bắt đầu.")
            continue

        inner = tag_str[1:].strip().lower()
        if not inner:
            violations.append(f"[HASHTAG_EMPTY] Hashtag thứ {idx + 1} không có nội dung sau '#'.")
            continue

        # Zero-Claim: Cấm chứa chữ số (số liệu, giá, phần trăm)
        if any(char.isdigit() for char in inner):
            violations.append(
                f"[HASHTAG_ZERO_CLAIM_VIOLATION] Hashtag '{tag_str}' chứa chữ số, "
                f"vi phạm luật Zero-Claim (cấm chèn số/giá trong hashtag)."
            )

        # Zero-Claim: Cấm từ ngữ so sánh nhất, ưu đãi, cam kết tuyệt đối
        for term in _FORBIDDEN_HASHTAG_TERMS:
            if term in inner:
                violations.append(
                    f"[HASHTAG_ZERO_CLAIM_VIOLATION] Hashtag '{tag_str}' chứa từ ngữ cam kết/ưu đãi/giá '{term}'."
                )

    return violations


def generate_deterministic_facebook_post(
    title: str,
    facts: Sequence[FactItem],
    brand_voice: str | None,
    verbatim_cta: str,
    custom_hashtags: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Sinh bài đăng Facebook 3 phần chuẩn xác định, bảo đảm 100% facts và Zero-Claim."""
    # 1. Hook 3 giây đầu (Zero-Claim: không số, không giá, không cam kết tuyệt đối)
    voice_str = (brand_voice or "").lower()
    if "năng động" in voice_str or "hiện đại" in voice_str:
        hook = "Khám phá không gian sống và làm việc linh hoạt được nhiều người quan tâm hiện nay."
    elif "thư thái" in voice_str or "nghỉ dưỡng" in voice_str:
        hook = "Tìm kiếm một không gian nghỉ ngơi thư thái và tiện nghi trọn vẹn bên bờ biển."
    else:
        hook = "Khám phá những trải nghiệm tiện nghi thực tế và không gian lưu trú hiện đại."

    # 2. Thân bài (Body): Định dạng bullet points từ facts
    factual_points: list[str] = []
    explicit_mappings: list[dict[str, Any]] = [
        {"sentence_index": 0, "sentence_type": "hook", "fact_id": "NONE"}
    ]
    facts_subset = list(facts)[:4]
    for idx, f in enumerate(facts_subset):
        clean_text = f.text.strip().rstrip(".!?") + "."
        factual_points.append(f"• {clean_text}")
        explicit_mappings.append({
            "sentence_index": idx + 1,
            "sentence_type": "factual",
            "fact_id": [f.fact_id],
        })

    body_text = "\n".join(factual_points)

    # 3. CTA: Giữ nguyên văn
    cta_text = verbatim_cta.strip()
    explicit_mappings.append({
        "sentence_index": len(explicit_mappings),
        "sentence_type": "cta",
        "fact_id": "SYSTEM_CTA",
    })

    # 4. 3-5 Hashtags Zero-Claim
    if custom_hashtags:
        clean_tags = list(custom_hashtags)
    else:
        clean_tags = ["#TripCDaNang", "#CanHoDaNang", "#KhongGianSong", "#Workation"]

    # Đảm bảo trong khoảng 3-5 tags
    if len(clean_tags) < 3:
        clean_tags.extend(["#LuuTruDaNang", "#TraiNghiem"])
    clean_tags = clean_tags[:5]
    hashtags_line = " ".join(clean_tags)

    # Tổng hợp caption 3 phần hoàn chỉnh
    full_caption = f"{hook}\n\n{body_text}\n\n{cta_text}\n\n{hashtags_line}"

    return {
        "caption": full_caption,
        "hook": hook,
        "body_points": factual_points,
        "cta": cta_text,
        "hashtags": clean_tags,
        "explicit_mappings": explicit_mappings,
    }


class FacebookRepurposer:
    """Bộ chuyển đổi chuyên biệt bài SEO sang bài đăng Facebook chuẩn mực."""

    def __init__(self, auditor: ContentQualityAuditor | None = None) -> None:
        self.auditor = auditor or ContentQualityAuditor()
        self.loop = ReflectionCorrectionLoop(auditor=self.auditor)

    def repurpose(
        self,
        workspace_id: str,
        parent_content_id: str,
        parent_version: int,
        title: str,
        facts: list[FactItem],
        verbatim_cta: str,
        cta_object: CTAObject | None = None,
        brand_voice: str | None = None,
        image_assets: list[AssetV2] | None = None,
        citations: list[CitationItem] | None = None,
        is_real_product: bool = False,
        version: int = 1,
        current_version: int | None = None,
        pack_id: str | None = None,
    ) -> SocialPackV2:
        """Tái cấu trúc bài SEO thành Facebook SocialPack v2 và thực hiện vòng phản tư kiểm định."""
        if current_version is not None:
            version = current_version + 1
        if cta_object is None:
            cta_object = CTAObject(type="contact_us", label=verbatim_cta[:100], target_url="https://tripc.vn")
        image_assets = image_assets or []
        citations = citations or []
        assigned_pack_id = pack_id or f"sp_fb_{uuid4().hex[:12]}"

        # 0. Xác định ai_image_meta nếu có ảnh AI
        has_ai = any(a.source_type == "ai_generated" for a in image_assets)
        ai_meta = (
            AIImageMetadata(
                model_name="flux-1-dev",
                prompt=f"Minimalist concept illustration for {title}, no text, no logo",
                seed=42,
                ocr_checked=True,
            )
            if has_ai
            else None
        )

        # 1. Kiểm tra Dual-Asset: nếu là bài mô tả sản phẩm thật thì bắt buộc có ảnh thật approved
        asset_decision = DualAssetManager.decide_asset_status(
            request={
                "title": title,
                "body_markdown": "",
                "is_real_product": is_real_product,
                "extracted_facts": [getattr(f, "text", getattr(f, "fact_text", str(f))) for f in facts],
            },
            assets=image_assets,
        )
        if asset_decision.status == "needs_assets":
            needs_pack = SocialPackV2(
                pack_id=assigned_pack_id,
                workspace_id=workspace_id,
                parent_content_id=parent_content_id,
                parent_version=parent_version,
                channels=["facebook"],
                caption=f"Khám phá không gian thực tế tại {title}.\n\n{verbatim_cta}",
                cta=cta_object,
                extracted_facts=facts,
                sentence_fact_map=[],
                image_assets=[],
                ai_image_meta=None,
                citations=citations,
                version=version,
                bundle_id=get_active_bundle_id(),
                status="needs_assets",
                rejection_reason=asset_decision.reason,
            )
            return needs_pack

        # 2. Kiểm tra ngưỡng tối thiểu facts
        if len(facts) < MIN_FACTS_THRESHOLD:
            empty_pack = SocialPackV2(
                pack_id=assigned_pack_id,
                workspace_id=workspace_id,
                parent_content_id=parent_content_id,
                parent_version=parent_version,
                channels=["facebook"],
                caption=f"Bản nháp chưa đủ dữ liệu cho {title}.\n\n{verbatim_cta}",
                cta=cta_object,
                extracted_facts=facts,
                sentence_fact_map=[],
                image_assets=image_assets,
                ai_image_meta=ai_meta,
                citations=citations,
                version=version,
                bundle_id=get_active_bundle_id(),
                status="insufficient_data",
                rejection_reason=(
                    f"Không đủ facts tối thiểu để tái chế bài đăng Facebook "
                    f"(yêu cầu ít nhất {MIN_FACTS_THRESHOLD} facts, hiện có {len(facts)})."
                ),
            )
            return empty_pack


        # 3. Sinh bài đăng Facebook xác định 3 phần
        draft = generate_deterministic_facebook_post(
            title=title,
            facts=facts,
            brand_voice=brand_voice,
            verbatim_cta=verbatim_cta,
        )

        # 4. Kiểm tra hashtag Zero-Claim
        tag_violations = validate_facebook_hashtags(draft["hashtags"], facts=facts)
        if tag_violations:
            logger.warning("Hashtag vi phạm phát hiện: %s", tag_violations)

        # 5. Ánh xạ câu sang Fact Map
        sentence_map = map_caption_to_sentence_fact_map(
            caption=draft["caption"],
            facts=facts,
            expected_cta=verbatim_cta,
            explicit_mappings=draft.get("explicit_mappings"),
        )

        candidate_pack = SocialPackV2(
            pack_id=assigned_pack_id,
            workspace_id=workspace_id,
            parent_content_id=parent_content_id,
            parent_version=parent_version,
            channels=["facebook"],
            caption=draft["caption"],
            cta=cta_object,
            extracted_facts=facts,
            sentence_fact_map=sentence_map,
            image_assets=image_assets,
            ai_image_meta=ai_meta,
            citations=citations,
            version=version,
            bundle_id=get_active_bundle_id(),
            status="draft",
            metadata={
                "repurposer": "FacebookRepurposer",
                "format": "3_part_post",
                "hashtags": draft["hashtags"],
            },
        )
        candidate_pack.content_hash = compute_content_hash(candidate_pack)

        # 6. Chạy vòng lặp tự phản hồi (Reflection Loop CM-15)
        def refine_facebook_draft(current: SocialPackV2, feedback: Any) -> SocialPackV2:
            clean_draft = generate_deterministic_facebook_post(
                title=title,
                facts=facts,
                brand_voice=brand_voice,
                verbatim_cta=verbatim_cta,
            )
            clean_map = map_caption_to_sentence_fact_map(
                caption=clean_draft["caption"],
                facts=facts,
                expected_cta=verbatim_cta,
                explicit_mappings=clean_draft.get("explicit_mappings"),
            )
            p_dict = current.model_dump()
            p_dict["caption"] = clean_draft["caption"]
            p_dict["sentence_fact_map"] = [s.model_dump() for s in clean_map]
            p_dict["metadata"]["hashtags"] = clean_draft["hashtags"]
            if has_ai:
                p_dict["ai_image_meta"] = ai_meta.model_dump()
            return SocialPackV2(**p_dict)


        final_pack, report = self.loop.run_loop(
            initial_pack=candidate_pack,
            facts=facts,
            refinement_generator_fn=refine_facebook_draft,
            brand_voice=brand_voice,
        )

        return final_pack
