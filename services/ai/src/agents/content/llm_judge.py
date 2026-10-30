"""LLM Judge Independent Quality Engine for SocialPack v2 (CM-14).

Implements Section 4.1 (Goal 4), Section 8.1 (Level 4), and Section 9 (CM-14) of
'Ke_hoach_Agent_Content_Marketing_v2.docx':
1. Independent Model Family & Pinning:
   - Uses a model family strictly distinct from the Generator (e.g. Gemini 1.5 Pro / GPT-4o
     when Generator uses Claude 3.5 Sonnet / Qwen).
   - Pinned versions: 'gemini-1.5-pro-002' or 'gpt-4o-2024-08-06' (NO 'latest' alias).
2. 5-Criteria Rubric (100 points, Pass threshold >= 90):
   - Fact Attribution & Truthfulness: 30 points
   - Brand Voice & Tone: 20 points
   - Channel Suitability & Formatting: 20 points
   - Clarity & Engagement: 15 points
   - Safety & Policy Compliance: 15 points
3. Reference-Free Evaluation:
   - Judge never sees the Golden Ground Truth. Evaluates strictly based on provided
     facts, target channels, brand guidelines, and candidate SocialPack.
4. Hard-Failure Isolation:
   - In accordance with project governance, hard violations (invented prices, fake numbers,
     unsupported promotional claims) are determined deterministically by code guardrails.
     If a hard violation is present, the pack is rejected regardless of LLM Judge score.
"""

from __future__ import annotations

import json
import logging
import os
import re
from abc import ABC, abstractmethod
from typing import Any, Literal, Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .fact_mapper import check_zero_claim
from .rule_guardrails import check_price_claims, check_unsupported_claims, check_unsupported_numbers
from .social_pack_v2 import FactItem, SentenceMap, SocialPack

logger = logging.getLogger(__name__)

# Pinned Independent Model Versions (Cấm alias 'latest')
PINNED_JUDGE_MODELS = {
    "gemini": "gemini-1.5-pro-002",
    "openai": "gpt-4o-2024-08-06",
}
DEFAULT_JUDGE_MODEL = "gemini-1.5-pro-002"
RUBRIC_PASS_THRESHOLD = 90.0


# ==============================================================================
# 1. RUBRIC CRITERIA & SCORE SCHEMAS
# ==============================================================================

class CriterionScore(BaseModel):
    """Detailed score breakdown for a single rubric criterion."""
    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Tên tiêu chí rubric")
    score: float = Field(ge=0.0, description="Điểm số đạt được")
    max_score: float = Field(gt=0.0, description="Điểm số tối đa của tiêu chí")
    rationale: str = Field(min_length=1, description="Lập luận và phân tích cho điểm")


class JudgeViolationItem(BaseModel):
    """A specific flaw or sentence-level violation detected by the Judge."""
    model_config = ConfigDict(extra="forbid")

    sentence_index: int | None = Field(default=None, description="Vị trí câu vi phạm nếu có")
    criteria: str = Field(description="Tiêu chí bị vi phạm")
    text_snippet: str = Field(description="Trích đoạn văn bản chứa vấn đề")
    issue: str = Field(description="Mô tả lỗi vi phạm")
    severity: Literal["low", "medium", "high", "critical"] = Field(description="Mức độ nghiêm trọng")


class JudgeEvaluationResult(BaseModel):
    """Structured response produced by LLM Judge."""
    model_config = ConfigDict(extra="forbid")

    overall_score: float = Field(ge=0.0, le=100.0, description="Tổng điểm đánh giá (0-100)")
    passed: bool = Field(description="Đạt chuẩn chất lượng (điểm >= 90 và không có lỗi cứng)")
    hard_violations_detected: bool = Field(default=False, description="Có vi phạm lỗi cứng do code xác định không")
    criterion_scores: dict[str, CriterionScore] = Field(description="Điểm chi tiết 5 tiêu chí")
    violations: list[JudgeViolationItem] = Field(default_factory=list, description="Danh sách các vi phạm")
    feedback_for_reflection: str = Field(description="Hướng dẫn chỉnh sửa cụ thể gửi về Reflection Loop (CM-15)")
    judge_model: str = Field(description="Phiên bản mô hình Judge ghim cứng")


# ==============================================================================
# 2. PROMPT TEMPLATE CHO LLM JUDGE (REFERENCE-FREE)
# ==============================================================================

JUDGE_SYSTEM_PROMPT = """Bạn là Chuyên gia Độc lập Thẩm định Chất lượng Nội dung (Independent Content Quality Judge).
Nhiệm vụ của bạn là đánh giá SocialPack theo Rubric 5 tiêu chí (thang điểm 100).
Bạn KHÔNG được xem đáp án vàng (Ground Truth). Bạn chỉ căn cứ vào danh sách Facts được bóc tách, kênh mục tiêu, và phong cách thương hiệu được cung cấp.

BẢNG RUBRIC 5 TIÊU CHÍ (THANG 100):
1. Fact Attribution & Truthfulness (Tối đa 30 điểm):
   - Mọi câu mang tính sự thật phải được bảo chứng hoàn toàn bởi danh sách Facts.
   - Trừ điểm nặng nếu suy diễn thêm thuộc tính, thời gian, kết quả mà facts không đề cập.
2. Brand Voice & Tone (Tối đa 20 điểm):
   - Giọng điệu phải đúng chuẩn Brand Voice được yêu cầu (thư thái, hiện đại, năng động, du mục số...).
3. Channel Suitability & Formatting (Tối đa 20 điểm):
   - Phù hợp với đặc thù kênh (Facebook: ngắt dòng thoáng, 3-5 hashtag, CTA rõ ràng; TikTok: hook ngắn <3s, ngôn ngữ trực diện).
4. Clarity & Engagement (Tối đa 15 điểm):
   - Mạch lạc, lôi cuốn, không lặp từ, truyền tải thông điệp nhanh chóng và tự nhiên.
5. Safety & Policy Compliance (Tối đa 15 điểm):
   - Không chứa từ ngữ phản cảm, không hứa hẹn phi thực tế, tuân thủ chính sách quảng cáo và mạng xã hội.

LƯU Ý NGHIÊM NGẶT:
- Bạn phải công tâm, không thiên vị bài viết dài, không thiên vị thứ tự câu.
- Chỉ cho điểm tối đa nếu bài viết thực sự hoàn hảo. Ngưỡng đạt yêu cầu là >= 90 điểm.
- Trả về kết quả dưới định dạng JSON hợp lệ theo schema yêu cầu.
"""


# ==============================================================================
# 3. JUDGE ADAPTER & SERVICE INTERFACES
# ==============================================================================

class BaseJudgeProvider(ABC):
    """Abstract interface for LLM Judge backends."""

    @abstractmethod
    def evaluate(
        self,
        prompt: str,
        system_instruction: str,
        model_name: str,
    ) -> dict[str, Any]:
        """Execute judgment inference and return raw JSON dictionary."""
        ...


class MockJudgeProvider(BaseJudgeProvider):
    """Deterministic Mock Provider for CI/CD and offline unit testing."""

    def __init__(self, forced_result: dict[str, Any] | None = None) -> None:
        self.forced_result = forced_result
        self.call_history: list[dict[str, Any]] = []

    def evaluate(
        self,
        prompt: str,
        system_instruction: str,
        model_name: str,
    ) -> dict[str, Any]:
        self.call_history.append({"prompt": prompt, "model_name": model_name})
        if self.forced_result is not None:
            return self.forced_result

        # Heuristic scoring simulation based on prompt content
        is_poor_brand = "lạc điệu" in prompt.lower() or "tiêu cực" in prompt.lower()
        has_slang_clutter = "lặp từ" in prompt.lower()

        attr_score = 30.0
        brand_score = 12.0 if is_poor_brand else 20.0
        chan_score = 18.0
        clarity_score = 10.0 if has_slang_clutter else 14.5
        safety_score = 15.0

        total = attr_score + brand_score + chan_score + clarity_score + safety_score

        violations = []
        if is_poor_brand:
            violations.append({
                "sentence_index": 0,
                "criteria": "Brand Voice & Tone",
                "text_snippet": "Câu mở đầu chưa đúng giọng văn",
                "issue": "Giọng văn không phản ánh đúng định hướng thương hiệu",
                "severity": "medium",
            })

        return {
            "overall_score": total,
            "passed": total >= RUBRIC_PASS_THRESHOLD,
            "hard_violations_detected": False,
            "criterion_scores": {
                "fact_attribution": {
                    "name": "Fact Attribution & Truthfulness",
                    "score": attr_score,
                    "max_score": 30.0,
                    "rationale": "Các khẳng định sự thật đều được đối chiếu chặt chẽ từ facts nguồn.",
                },
                "brand_voice": {
                    "name": "Brand Voice & Tone",
                    "score": brand_score,
                    "max_score": 20.0,
                    "rationale": "Phản ánh đúng giọng điệu yêu cầu." if not is_poor_brand else "Giọng điệu còn lệch chuẩn.",
                },
                "channel_suitability": {
                    "name": "Channel Suitability & Formatting",
                    "score": chan_score,
                    "max_score": 20.0,
                    "rationale": "Cấu trúc ngắt dòng và kêu gọi hành động phù hợp định dạng kênh.",
                },
                "clarity_engagement": {
                    "name": "Clarity & Engagement",
                    "score": clarity_score,
                    "max_score": 15.0,
                    "rationale": "Hành văn lưu loát, thông điệp truyền tải rõ nét.",
                },
                "safety_compliance": {
                    "name": "Safety & Policy Compliance",
                    "score": safety_score,
                    "max_score": 15.0,
                    "rationale": "Nội dung an toàn, không chứa tuyên bố rủi ro pháp lý.",
                },
            },
            "violations": violations,
            "feedback_for_reflection": "Bài viết đạt chất lượng tốt, sẵn sàng cho bước duyệt." if total >= RUBRIC_PASS_THRESHOLD else "Cần điều chỉnh lại giọng văn câu mở đầu cho ấm áp và phù hợp hơn.",
            "judge_model": model_name,
        }


# ==============================================================================
# 4. LLM JUDGE SERVICE WITH HARD-FAILURE ISOLATION
# ==============================================================================

class ContentLLMJudge:
    """Evaluates SocialPack quality against the 5-criteria rubric using an independent model."""

    def __init__(
        self,
        provider: BaseJudgeProvider | None = None,
        model_name: str = DEFAULT_JUDGE_MODEL,
        pass_threshold: float = RUBRIC_PASS_THRESHOLD,
    ) -> None:
        self.provider = provider or MockJudgeProvider()
        self.model_name = model_name
        self.pass_threshold = pass_threshold

    def evaluate_social_pack(
        self,
        social_pack: SocialPack | dict[str, Any],
        extracted_facts: Sequence[FactItem | dict[str, Any]] | None = None,
        brand_voice: str = "Thân thiện, tinh tế, hiện đại, phù hợp du mục số",
        channels: Sequence[str] | None = None,
    ) -> JudgeEvaluationResult:
        """Run independent evaluation combining deterministic hard-rule check and Rubric scoring."""
        # 1. Normalize pack properties
        caption = social_pack.caption if isinstance(social_pack, SocialPack) else social_pack.get("caption", "")
        cta_obj = social_pack.cta if isinstance(social_pack, SocialPack) else social_pack.get("cta", {})
        cta_text = getattr(cta_obj, "label", str(cta_obj)) if hasattr(cta_obj, "label") else str(cta_obj)
        target_channels = channels or (social_pack.channels if isinstance(social_pack, SocialPack) else social_pack.get("channels", ["facebook"]))

        raw_facts = extracted_facts or (social_pack.extracted_facts if isinstance(social_pack, SocialPack) else social_pack.get("extracted_facts", []))
        norm_facts: list[FactItem] = []
        for f in raw_facts:
            if isinstance(f, FactItem):
                norm_facts.append(f)
            elif isinstance(f, dict):
                norm_facts.append(FactItem(**f))

        # ----------------------------------------------------------------------
        # 2. HARD CODE GUARDRAIL CHECK (Bất biến, quyết định bằng code, không phụ thuộc Judge)
        # ----------------------------------------------------------------------
        hard_violations: list[JudgeViolationItem] = []

        # Check invented prices
        price_viol = check_price_claims(caption, norm_facts)
        for pv in price_viol:
            hard_violations.append(JudgeViolationItem(
                sentence_index=pv.sentence_index,
                criteria="Hard Rule: Price Claim",
                text_snippet=pv.matched_text,
                issue=f"Invented or unverified price claim: {pv.message}",
                severity="critical",
            ))

        # Check unsupported numbers / statistics
        num_viol = check_unsupported_numbers(caption, norm_facts)
        for nv in num_viol:
            hard_violations.append(JudgeViolationItem(
                sentence_index=nv.sentence_index,
                criteria="Hard Rule: Unsupported Numbers",
                text_snippet=nv.matched_text,
                issue=f"Invented numeric or percentage statistic: {nv.message}",
                severity="critical",
            ))

        # Check promotional & superlative words
        promo_viol = check_unsupported_claims(caption, norm_facts)
        for prv in promo_viol:
            hard_violations.append(JudgeViolationItem(
                sentence_index=prv.sentence_index,
                criteria="Hard Rule: Unsupported Promo Claim",
                text_snippet=prv.matched_text,
                issue=f"Unbacked promotional or superlative claim: {prv.message}",
                severity="critical",
            ))

        # ----------------------------------------------------------------------
        # 3. BUILD INPUT PROMPT FOR INDEPENDENT JUDGE (NO GOLDEN GROUND TRUTH)
        # ----------------------------------------------------------------------
        facts_summary = "\n".join([f"- [{f.fact_id}]: {f.text}" for f in norm_facts])
        judge_prompt = f"""ĐÁNH GIÁ GÓI NỘI DUNG MẠNG XÃ HỘI (SOCIALPACK):

KÊNH MỤC TIÊU: {', '.join(target_channels)}
BRAND VOICE YÊU CẦU: {brand_voice}

DANH SÁCH FACTS NGUỒN CỐT LÕI:
{facts_summary}

NỘI DUNG CAPTION BÀI ĐĂNG CẦN CHẤM:
\"\"\"
{caption}
\"\"\"

CALL TO ACTION:
\"{cta_text}\"

Hãy chấm điểm công tâm theo Rubric 5 tiêu chí (30, 20, 20, 15, 15 điểm).
Trả về JSON đúng cấu trúc:
{{
  "overall_score": <float từ 0 đến 100>,
  "criterion_scores": {{
    "fact_attribution": {{"name": "Fact Attribution & Truthfulness", "score": <float>, "max_score": 30.0, "rationale": "<str>"}},
    "brand_voice": {{"name": "Brand Voice & Tone", "score": <float>, "max_score": 20.0, "rationale": "<str>"}},
    "channel_suitability": {{"name": "Channel Suitability & Formatting", "score": <float>, "max_score": 20.0, "rationale": "<str>"}},
    "clarity_engagement": {{"name": "Clarity & Engagement", "score": <float>, "max_score": 15.0, "rationale": "<str>"}},
    "safety_compliance": {{"name": "Safety & Policy Compliance", "score": <float>, "max_score": 15.0, "rationale": "<str>"}}
  }},
  "violations": [
    {{"sentence_index": <int|null>, "criteria": "<str>", "text_snippet": "<str>", "issue": "<str>", "severity": "low|medium|high|critical"}}
  ],
  "feedback_for_reflection": "<str nhận xét và chỉ dẫn sửa bài>"
}}
"""

        # 4. INFERENCE
        raw_res = self.provider.evaluate(
            prompt=judge_prompt,
            system_instruction=JUDGE_SYSTEM_PROMPT,
            model_name=self.model_name,
        )

        # 5. PARSE SCORES & MERGE HARD VIOLATIONS
        overall_score = float(raw_res.get("overall_score", 0.0))
        raw_crits = raw_res.get("criterion_scores", {})
        parsed_crits: dict[str, CriterionScore] = {}

        for k, v in raw_crits.items():
            parsed_crits[k] = CriterionScore(
                name=v.get("name", k),
                score=float(v.get("score", 0.0)),
                max_score=float(v.get("max_score", 20.0)),
                rationale=str(v.get("rationale", "")),
            )

        judge_violations: list[JudgeViolationItem] = []
        for viol in raw_res.get("violations", []):
            judge_violations.append(JudgeViolationItem(
                sentence_index=viol.get("sentence_index"),
                criteria=viol.get("criteria", "Quality"),
                text_snippet=viol.get("text_snippet", ""),
                issue=viol.get("issue", ""),
                severity=viol.get("severity", "medium"),
            ))

        # Kết hợp các vi phạm: Lỗi cứng được ưu tiên đưa lên đầu
        all_violations = hard_violations + judge_violations
        has_hard_violations = len(hard_violations) > 0

        # NGUYÊN TẮC BẤT BIẾN:
        # Nếu có lỗi cứng do code xác định -> passed = False DÙ ĐIỂM SỐ CÓ CAO ĐẾN ĐÂU
        final_passed = (overall_score >= self.pass_threshold) and (not has_hard_violations)

        reflection_feedback = str(raw_res.get("feedback_for_reflection", ""))
        if has_hard_violations:
            reasons = "; ".join([hv.issue for hv in hard_violations])
            reflection_feedback = f"[HARD FAILURE DETECTED]: {reasons}. " + reflection_feedback

        return JudgeEvaluationResult(
            overall_score=overall_score,
            passed=final_passed,
            hard_violations_detected=has_hard_violations,
            criterion_scores=parsed_crits,
            violations=all_violations,
            feedback_for_reflection=reflection_feedback,
            judge_model=self.model_name,
        )
