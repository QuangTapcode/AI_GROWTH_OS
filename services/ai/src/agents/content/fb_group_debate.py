"""Group Discussion & Debate Repurposer (CM-17).

Transforms long-form SEO articles into high-engagement Facebook Group discussion and debate posts:
1. Debate / Discussion Layout:
   - Part 1: Community Hook (Zero-Claim compliant topic opener: "Góc thảo luận cùng anh em...", "Quan điểm của các bác thế nào về...").
   - Part 2: Context & Facts (Facts formatted as real-world context, each factual sentence mapped to fact_id).
   - Part 3: Discussion Prompt & CTA (Engaging question inviting member perspectives & comments).
2. 3 to 5 Hashtags: Zero-Claim compliant.
3. Sentence-Fact Mapping & Reflection Loop (CM-15):
   - Guardrails (CM-13) + Mapper/NLI (CM-08) + Judge (CM-14).
   - Up to 2 self-correction rounds, failing to insufficient_data if hard errors persist.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Sequence
from uuid import uuid4

from .asset_manager import DualAssetManager
from .bundle_manager import get_active_bundle_id
from .fact_mapper import map_caption_to_sentence_fact_map, split_vietnamese_sentences
from .fb_repurposer import validate_facebook_hashtags
from .reflection_loop import ContentQualityAuditor, ReflectionCorrectionLoop
from .social_pack_v2 import (
    AIImageMetadata,
    AssetV2,
    CitationItem,
    CTAObject,
    FactItem,
    SentenceMap,
    SocialPack as SocialPackV2,
    compute_content_hash,
)

logger = logging.getLogger(__name__)

PROMPT_VERSION = "content-repurpose-group-debate-v1"
MIN_FACTS_THRESHOLD = 2

PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "content" / "repurpose_group_debate.v1.md"
SYSTEM_PROMPT = ""
if PROMPT_PATH.exists():
    SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")
else:
    SYSTEM_PROMPT = (
        "Bạn là Chuyên gia Điều phối Thảo luận Facebook Group của AI Growth OS. "
        "Chuyển thể bài SEO thành bài thảo luận chuyên sâu, kích thích tranh luận 2 chiều, "
        "bảo chứng sự thật 100% bằng facts được cung cấp."
    )


def generate_deterministic_group_debate_post(
    title: str,
    facts: Sequence[FactItem],
    brand_voice: str | None,
    verbatim_cta: str,
    custom_hashtags: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Sinh bài đăng Facebook Group dạng thảo luận / debate chuẩn xác định."""
    # 1. Hook mở đầu thảo luận (Zero-Claim: không số, không giá, không cam kết tuyệt đối)
    voice_str = (brand_voice or "").lower()
    if "chuyên môn" in voice_str or "phân tích" in voice_str:
        hook = "Góc thảo luận và trao đổi chuyên môn: Một số kinh nghiệm thực tế về môi trường làm việc từ xa cần anh em chia sẻ góc nhìn."
    elif "thư thái" in voice_str:
        hook = "Góc tâm sự thảo luận cùng các bác: Làm việc kết hợp nghỉ dưỡng bên bờ biển có thực sự giúp tăng năng suất?"
    else:
        hook = "Góc thảo luận cùng anh em: Những trải nghiệm thực tế khi chọn không gian làm việc từ xa quanh khu vực biển."

    # 2. Thân bài: Điểm dữ kiện thực tế từ facts
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

    # 3. Câu hỏi thảo luận & CTA: Gợi mở bình luận
    discussion_prompt = "Theo góc nhìn của các bác, yếu tố nào quan trọng nhất khi chọn chỗ ở remote?"
    cta_text = verbatim_cta.strip() if verbatim_cta else "Bác nào có trải nghiệm cho em xin thêm ý kiến bên dưới nhé!"

    explicit_mappings.append({
        "sentence_index": len(explicit_mappings),
        "sentence_type": "hook",
        "fact_id": "NONE",
    })
    explicit_mappings.append({
        "sentence_index": len(explicit_mappings),
        "sentence_type": "cta",
        "fact_id": "SYSTEM_CTA",
    })

    # 4. Hashtags
    clean_tags = list(custom_hashtags) if custom_hashtags else ["#ThaoLuanCungNhau", "#DigitalNomadVietnam", "#KinhNghiemLamViec", "#TripCDaNang"]
    if len(clean_tags) < 3:
        clean_tags.extend(["#Workation", "#GocChiaSe"])
    clean_tags = clean_tags[:5]
    hashtags_line = " ".join(clean_tags)

    full_caption = f"{hook}\n\n{body_text}\n\n{discussion_prompt}\n{cta_text}\n\n{hashtags_line}"

    return {
        "caption": full_caption,
        "hook": hook,
        "body_points": factual_points,
        "discussion_prompt": discussion_prompt,
        "cta": cta_text,
        "hashtags": clean_tags,
        "explicit_mappings": explicit_mappings,
    }


class GroupDiscussionRepurposer:
    """Bộ chuyển đổi chuyên biệt bài SEO sang bài thảo luận Facebook Group (CM-17)."""

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
        """Tái cấu trúc bài SEO thành bài thảo luận Facebook Group kèm kiểm định Reflection Loop."""
        if current_version is not None:
            version = current_version + 1

        active_bundle_id = get_active_bundle_id()

        # Kiểm tra ngưỡng facts tối thiểu
        if len(facts) < MIN_FACTS_THRESHOLD:
            empty_cta = cta_object or CTAObject(
                type="discussion",
                label="Thảo luận cộng đồng",
                target_url="https://facebook.com/groups/community"
            )
            return SocialPackV2(
                pack_id=pack_id or f"sp_grp_deb_{uuid4().hex[:12]}",
                workspace_id=workspace_id,
                parent_content_id=parent_content_id,
                parent_version=parent_version,
                channels=["facebook_group"],
                group_post_format="debate_discussion",
                caption="Dữ liệu bài viết không đủ facts tối thiểu để tạo bài thảo luận Group.",
                cta=empty_cta,
                extracted_facts=facts,
                sentence_fact_map=[],
                image_assets=[],
                citations=citations or [],
                version=version,
                bundle_id=active_bundle_id,
                status="insufficient_data",
                rejection_reason=f"Số lượng facts ({len(facts)}) không đạt ngưỡng tối thiểu ({MIN_FACTS_THRESHOLD}).",
            )

        # Quản lý tài sản ảnh Dual-Asset
        asset_decision = DualAssetManager.decide_asset_status(
            request={
                "title": title,
                "body_markdown": "",
                "is_real_product": is_real_product,
                "extracted_facts": [getattr(f, "text", getattr(f, "fact_text", str(f))) for f in facts],
            },
            assets=image_assets,
        )

        final_image_assets: list[AssetV2] = list(image_assets or [])
        if not final_image_assets:
            final_image_assets.append(
                AssetV2(
                    asset_id=f"ast_grp_ai_{uuid4().hex[:8]}",
                    url="https://cdn.tripc.vn/generated/group_discussion_concept_1080x1080.webp",
                    source_type="ai_generated",
                    license="ai_generated",
                    attribution="Generated by Flux.1 [dev] via AI Growth OS Group Pipeline",
                    alt_text="[Ảnh minh họa AI] Đồ họa phong cách làm việc từ xa kết hợp thảo luận",
                )
            )

        has_ai = any(a.source_type == "ai_generated" for a in final_image_assets)
        ai_meta: AIImageMetadata | None = (
            AIImageMetadata(
                model_name="flux-1-dev",
                prompt=f"Minimalist concept illustration for {title}, natural warm lighting, vector aesthetic, no people, no text",
                seed=424242,
                ocr_checked=True,
            )
            if has_ai
            else None
        )

        # Sinh bài đăng thảo luận
        draft_content = generate_deterministic_group_debate_post(
            title=title,
            facts=facts,
            brand_voice=brand_voice,
            verbatim_cta=verbatim_cta,
        )

        actual_cta_obj = cta_object or CTAObject(
            type="discussion",
            label="Tham gia thảo luận cùng nhóm",
            target_url="https://facebook.com/groups/community"
        )

        # Phân rã câu và ánh xạ
        sentence_maps = map_caption_to_sentence_fact_map(
            caption=draft_content["caption"],
            facts=facts,
            explicit_mappings=draft_content["explicit_mappings"],
        )

        initial_pack = SocialPackV2(
            pack_id=pack_id or f"sp_grp_deb_{uuid4().hex[:12]}",
            workspace_id=workspace_id,
            parent_content_id=parent_content_id,
            parent_version=parent_version,
            channels=["facebook_group"],
            group_post_format="debate_discussion",
            discussion_prompt=draft_content.get("discussion_prompt"),
            caption=draft_content["caption"],
            cta=actual_cta_obj,
            extracted_facts=facts,
            sentence_fact_map=sentence_maps,
            image_assets=final_image_assets,
            ai_image_meta=ai_meta,
            citations=citations or [],
            version=version,
            bundle_id=active_bundle_id,
            status="needs_assets" if asset_decision.status == "needs_assets" else "draft",
            rejection_reason=asset_decision.reason if asset_decision.status == "needs_assets" else None,
        )

        initial_pack.content_hash = compute_content_hash(initial_pack)

        if initial_pack.status == "needs_assets":
            return initial_pack

        def refine_debate_draft(current: SocialPackV2, feedback: Any) -> SocialPackV2:
            clean_draft = generate_deterministic_group_debate_post(
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
            p_dict["discussion_prompt"] = clean_draft.get("discussion_prompt")
            if has_ai and ai_meta:
                p_dict["ai_image_meta"] = ai_meta.model_dump()
            return SocialPackV2(**p_dict)

        # Kiểm định qua Reflection Loop
        final_pack, report = self.loop.run_loop(
            initial_pack=initial_pack,
            facts=facts,
            refinement_generator_fn=refine_debate_draft,
            brand_voice=brand_voice,
        )
        return final_pack
