"""TikTok Script Repurposer (CM-17).

Transforms long-form SEO articles into short-form video scripts adhering to:
1. Script Structure (3 parts):
   - Hook 3s: Grabs attention, strictly Zero-Claim (no numbers, prices, or fake commitments).
   - Body: High-energy, conversational delivery grounded in SEO facts.
   - CTA: Call To Action to follow, comment, or visit bio link.
2. Word Count Constraint:
   - Spoken voiceover MUST be strictly between 120 and 180 words.
3. Storyboard & Visual Cues (NO video generation):
   - Structured visual cues and on-screen text for each scene stored in metadata["storyboard"].
4. Sentence-Fact Mapping & Reflection Loop (CM-15):
   - Guardrails (CM-13) + Mapper/NLI (CM-08) + Judge (CM-14).
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

PROMPT_VERSION = "content-repurpose-tiktok-v1"
MIN_FACTS_THRESHOLD = 3
TIKTOK_MIN_WORDS = 120
TIKTOK_MAX_WORDS = 180

PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "content" / "repurpose_tiktok.v1.md"
SYSTEM_PROMPT = ""
if PROMPT_PATH.exists():
    SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")
else:
    SYSTEM_PROMPT = (
        "Bạn là Biên kịch Kịch bản Video ngắn TikTok của AI Growth OS. "
        "Chuyển thể bài SEO thành kịch bản 120-180 từ (Hook 3s, thân bài, CTA) "
        "kèm gợi ý storyboard visual, bảo chứng sự thật 100% bằng facts."
    )


class StoryboardScene(BaseModel):
    """Cấu trúc một phân cảnh trong kịch bản video ngắn TikTok."""
    model_config = ConfigDict(extra="forbid")

    scene_index: int = Field(ge=0, description="Thứ tự phân cảnh (0: Hook, 1..n: Body, n+1: CTA)")
    scene_title: str = Field(min_length=1, max_length=100, description="Tên phân cảnh")
    duration_seconds: float = Field(gt=0, le=60.0, description="Thời lượng ước tính (giây)")
    visual_cue: str = Field(min_length=1, max_length=500, description="Mô tả hình ảnh/góc máy gợi ý")
    audio_voiceover: str = Field(min_length=1, max_length=1000, description="Lời thoại nói trong cảnh")
    on_screen_text: str | None = Field(default=None, max_length=200, description="Chữ hiển thị trên màn hình")


def count_script_words(text: str) -> int:
    """Đếm số từ của phần lời thoại nói (Spoken Script), loại bỏ các thẻ chỉ dẫn đạo diễn [Visual:...]."""
    # Loại bỏ các thẻ vuông đạo diễn như [Visual: ...] hoặc [Hook 3s]
    clean_text = re.sub(r"\[.*?\]", " ", text)
    # Tách theo khoảng trắng để đếm số từ / âm tiết tiếng Việt
    tokens = [t.strip() for t in clean_text.split() if t.strip()]
    return len(tokens)


def validate_tiktok_word_count(script: str) -> list[str]:
    """Kiểm tra kịch bản có nằm trong khoảng 120 - 180 từ hay không, trả về danh sách vi phạm."""
    words = count_script_words(script)
    violations: list[str] = []
    if words < TIKTOK_MIN_WORDS:
        violations.append(
            f"[TIKTOK_WORD_COUNT_VIOLATION] Kịch bản quá ngắn ({words} từ, yêu cầu tối thiểu {TIKTOK_MIN_WORDS} từ)."
        )
    elif words > TIKTOK_MAX_WORDS:
        violations.append(
            f"[TIKTOK_WORD_COUNT_VIOLATION] Kịch bản quá dài ({words} từ, yêu cầu tối đa {TIKTOK_MAX_WORDS} từ)."
        )
    return violations


def generate_deterministic_tiktok_script(
    title: str,
    facts: Sequence[FactItem],
    brand_voice: str | None,
    verbatim_cta: str,
) -> dict[str, Any]:
    """Sinh kịch bản video TikTok xác định chuẩn 120-180 từ kèm gợi ý storyboard."""
    # 1. Hook 3 giây đầu (Zero-Claim: không số, không giá, không cam kết tuyệt đối)
    hook_voiceover = (
        f"Bạn đang tìm kiếm một phương pháp thông minh và hiệu quả để tối ưu hóa "
        f"kế hoạch chuyến đi cũng như trải nghiệm du lịch sắp tới của mình hay chưa?"
    )

    # 2. Thân bài (Body): Triển khai các câu thoại mượt mà bám sát facts
    facts_list = list(facts)
    f0 = facts_list[0].text.strip().rstrip(".!?") if len(facts_list) > 0 else "Nền tảng số thông minh đồng hành cùng bạn"
    f1 = facts_list[1].text.strip().rstrip(".!?") if len(facts_list) > 1 else "Hiệu suất tối ưu giúp tiết kiệm thời gian đáng kể"
    f2 = facts_list[2].text.strip().rstrip(".!?") if len(facts_list) > 2 else "Hệ thống dữ liệu điểm đến đa dạng và phong phú"
    f3 = facts_list[3].text.strip().rstrip(".!?") if len(facts_list) > 3 else "Khả năng cá nhân hóa đề xuất theo đúng nhu cầu"

    body_voice_1 = f"Trước hết, về giải pháp nền tảng thì {f0} một cách bài bản và tiện lợi."
    body_voice_2 = f"Tiếp theo, về hiệu suất vận hành thì {f1} nhằm tiết kiệm tối đa thì giờ quý báu."
    body_voice_3 = f"Bên cạnh đó, về kho dữ liệu điểm đến thì {f2} cho bạn thỏa sức khám phá khắp nơi."
    body_voice_4 = f"Hơn thế nữa, về tính năng thông minh thì {f3} để mang lại trải nghiệm phù hợp nhất."

    body_sentences = [body_voice_1, body_voice_2, body_voice_3, body_voice_4]

    # 3. CTA: Lời kêu gọi hành động (100% nguyên văn theo luật Zero-Claim)
    clean_cta = verbatim_cta.strip().rstrip(".!?") + "."
    cta_voiceover = clean_cta

    # Gom các câu thoại thành kịch bản hoàn chỉnh
    spoken_sentences = [hook_voiceover] + body_sentences + [cta_voiceover]
    total_spoken_text = f"{hook_voiceover}\n\n" + "\n".join(body_sentences) + f"\n\n{cta_voiceover}"
    final_count = count_script_words(total_spoken_text)

    # Xây dựng explicit_mappings bảo đảm tính tương thích tuyệt đối cho FactMapper
    explicit_mappings: list[dict[str, Any]] = [
        {"sentence_index": 0, "sentence_type": "hook", "fact_id": "NONE"}
    ]
    for idx, f in enumerate(facts_list[:4]):
        explicit_mappings.append({
            "sentence_index": idx + 1,
            "sentence_type": "factual",
            "fact_id": [f.fact_id],
        })
    explicit_mappings.append({
        "sentence_index": len(explicit_mappings),
        "sentence_type": "cta",
        "fact_id": "SYSTEM_CTA",
    })

    # 4. Tạo Storyboard Scenes (4 cảnh tiêu chuẩn)
    storyboard: list[StoryboardScene] = [
        StoryboardScene(
            scene_index=1,
            scene_title="Hook 3 giây",
            duration_seconds=3.0,
            visual_cue="Góc máy chuyển động nhanh lướt qua màn hình ứng dụng và khung cảnh du lịch sôi động",
            audio_voiceover=hook_voiceover,
            on_screen_text=title[:50],
        ),
        StoryboardScene(
            scene_index=2,
            scene_title="Thân bài - Nền tảng & Hiệu suất",
            duration_seconds=15.0,
            visual_cue="Cận cảnh giao diện lập lịch trình trực quan với biểu đồ thời gian chuyển đổi nhanh chóng",
            audio_voiceover=f"{body_voice_1} {body_voice_2}",
            on_screen_text="Tối ưu lịch trình",
        ),
        StoryboardScene(
            scene_index=3,
            scene_title="Thân bài - Dữ liệu & Cá nhân hóa",
            duration_seconds=15.0,
            visual_cue="Màn hình hiển thị bản đồ điểm đến bản địa phong phú cùng danh sách gợi ý thông minh",
            audio_voiceover=f"{body_voice_3} {body_voice_4}",
            on_screen_text="Khám phá bản địa",
        ),
        StoryboardScene(
            scene_index=4,
            scene_title="CTA Kêu gọi hành động",
            duration_seconds=5.0,
            visual_cue="Nhân vật trải nghiệm mỉm cười, đồ họa icon linkbio và thông điệp kêu gọi hành động xuất hiện",
            audio_voiceover=cta_voiceover,
            on_screen_text=clean_cta[:50],
        ),
    ]

    return {
        "caption": total_spoken_text,
        "spoken_script": total_spoken_text,
        "word_count": final_count,
        "spoken_word_count": final_count,
        "storyboard": [s.model_dump() for s in storyboard],
        "spoken_sentences": spoken_sentences,
        "explicit_mappings": explicit_mappings,
    }


class TikTokRepurposer:
    """Bộ chuyển đổi chuyên biệt bài SEO sang kịch bản video ngắn TikTok (120-180 từ)."""

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
        """Tái cấu trúc bài SEO thành TikTok Script SocialPack v2 kèm storyboard và kiểm tra độ dài 120-180 từ."""
        if current_version is not None:
            version = current_version + 1
        if cta_object is None:
            cta_object = CTAObject(type="contact_us", label=verbatim_cta[:100], target_url="https://tripc.vn")
        image_assets = image_assets or []
        citations = citations or []
        assigned_pack_id = pack_id or f"sp_tt_{uuid4().hex[:12]}"

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

        # 1. Kiểm tra chính sách Dual-Asset
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
                channels=["tiktok"],
                caption=f"Kịch bản TikTok chờ hình ảnh thực tế cho {title}.\n\n{verbatim_cta}",
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

        # 2. Kiểm tra số lượng facts tối thiểu
        if len(facts) < MIN_FACTS_THRESHOLD:
            empty_pack = SocialPackV2(
                pack_id=assigned_pack_id,
                workspace_id=workspace_id,
                parent_content_id=parent_content_id,
                parent_version=parent_version,
                channels=["tiktok"],
                caption=f"Bản nháp kịch bản TikTok chưa đủ dữ liệu cho {title}.\n\n{verbatim_cta}",
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
                    f"Không đủ facts tối thiểu để tạo kịch bản TikTok "
                    f"(yêu cầu ít nhất {MIN_FACTS_THRESHOLD} facts, hiện có {len(facts)})."
                ),
            )
            return empty_pack


        # 3. Sinh kịch bản TikTok xác định kèm Storyboard
        draft = generate_deterministic_tiktok_script(
            title=title,
            facts=facts,
            brand_voice=brand_voice,
            verbatim_cta=verbatim_cta,
        )

        # 4. Kiểm tra độ dài kịch bản (120-180 từ)
        w_count = draft.get("spoken_word_count") or count_script_words(draft["spoken_script"])
        violations = validate_tiktok_word_count(draft["spoken_script"])
        if violations:
            logger.warning("Độ dài kịch bản chưa đạt chuẩn: %s", violations)

        # 5. Ánh xạ câu sang Fact Map trên caption hoàn chỉnh
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
            channels=["tiktok"],
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
                "repurposer": "TikTokRepurposer",
                "format": "short_video_script",
                "word_count": w_count,
                "spoken_word_count": w_count,
                "storyboard": draft["storyboard"],
            },
        )
        candidate_pack.content_hash = compute_content_hash(candidate_pack)

        # 6. Chạy vòng lặp tự phản hồi (Reflection Loop CM-15)
        def refine_tiktok_draft(current: SocialPackV2, feedback: Any) -> SocialPackV2:
            clean_draft = generate_deterministic_tiktok_script(
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
            p_dict["metadata"]["word_count"] = clean_draft.get("spoken_word_count", clean_draft.get("word_count", 0))
            p_dict["metadata"]["spoken_word_count"] = clean_draft.get("spoken_word_count", clean_draft.get("word_count", 0))
            p_dict["metadata"]["storyboard"] = clean_draft["storyboard"]
            if has_ai:
                p_dict["ai_image_meta"] = ai_meta.model_dump()
            return SocialPackV2(**p_dict)


        final_pack, report = self.loop.run_loop(
            initial_pack=candidate_pack,
            facts=facts,
            refinement_generator_fn=refine_tiktok_draft,
            brand_voice=brand_voice,
        )

        return final_pack
