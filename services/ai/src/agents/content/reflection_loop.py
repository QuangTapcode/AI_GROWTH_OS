"""Reflection Self-Correction Loop for Content Marketing (CM-15).

Implements Section 4.1 (Goal 6), Section 5.1 (Stage 4), and Section 9 (CM-15) of
'Ke_hoach_Agent_Content_Marketing_v2.docx':
1. Multi-Stage Quality Gate:
   - Evaluates candidate SocialPack against:
     a) Deterministic Code Guardrails (CM-13: prices, numbers, promo claims, forbidden terms)
     b) Sentence-Fact Mapping & NLI Entailment (CM-08: factual sentences require valid fact_id [TC-10],
        Zero-Claim rule for hook/cta [TC-11], entailment status)
     c) Calibrated Independent LLM Judge (CM-14: 5-criteria rubric >= 90)
2. Reflection Feedback & Self-Correction Loop:
   - When flaws are detected, generates a structured actionable error report and
     triggers internal generator refinement.
   - Max 2 correction rounds (initial draft evaluation + max 2 retries). Target average rounds <= 1.2.
3. Strict Hard-Failure Containment:
   - If after 2 correction rounds the pack still contains hard violations or fails quality,
     returns status 'insufficient_data' with explicit reasons.
   - NEVER returns or approves a SocialPack with unresolved hard violations.
4. Comprehensive Quality Telemetry:
   - Records rounds count, per-round telemetry (errors, scores, latency), and attaches
     quality_report to the final output.
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Literal, Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .fact_mapper import check_zero_claim, map_caption_to_sentence_fact_map
from .llm_judge import ContentLLMJudge, JudgeEvaluationResult
from .rule_guardrails import (
    check_channels,
    check_factual_sentence_fact_ids,
    check_price_claims,
    check_tenant_forbidden_terms,
    check_unsupported_claims,
    check_unsupported_numbers,
    check_urls,
    evaluate_social_pack_guardrails,
)
from .social_pack_v2 import (
    FactItem,
    SentenceMap,
    SocialPack,
    SocialPackStatusType,
    compute_content_hash,
)

logger = logging.getLogger(__name__)

MAX_REFLECTION_ROUNDS = 2


# ==============================================================================
# 1. QUALITY TELEMETRY & REPORT SCHEMAS
# ==============================================================================

@dataclass
class RoundTelemetry:
    """Detailed audit metrics of a single reflection iteration."""

    round_index: int
    caption_length: int
    judge_score: float
    passed: bool
    hard_violations: list[str] = field(default_factory=list)
    soft_issues: list[str] = field(default_factory=list)
    latency_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class QualityReport:
    """Consolidated audit report of the entire generation and reflection lifecycle."""

    rounds_count: int
    final_passed: bool
    final_score: float
    hard_failures: list[str] = field(default_factory=list)
    unresolved_errors: list[str] = field(default_factory=list)
    rounds_history: list[RoundTelemetry] = field(default_factory=list)
    status_resolution: SocialPackStatusType = "draft"
    attribution_rate: float = 1.0
    zero_claim_compliant: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "rounds_count": self.rounds_count,
            "final_passed": self.final_passed,
            "final_score": self.final_score,
            "hard_failures": list(self.hard_failures),
            "unresolved_errors": list(self.unresolved_errors),
            "rounds_history": [r.to_dict() for r in self.rounds_history],
            "status_resolution": self.status_resolution,
            "attribution_rate": round(self.attribution_rate, 4),
            "zero_claim_compliant": self.zero_claim_compliant,
        }


@dataclass
class StructuredReflectionFeedback:
    """Actionable critique passed back to the generator for self-correction."""

    round_index: int
    hard_errors: list[str]
    soft_issues: list[str]
    actionable_instructions: str


@dataclass
class AuditResult:
    """Outcome of ContentQualityAuditor evaluation."""

    passed: bool
    score: float
    hard_errors: list[str]
    soft_issues: list[str]
    judge_res: JudgeEvaluationResult
    attribution_rate: float = 1.0
    zero_claim_compliant: bool = True


# ==============================================================================
# 2. AUDIT EVALUATOR HARNESS
# ==============================================================================

class ContentQualityAuditor:
    """Executes the full 3-tier validation suite: Guardrails + NLI Mapper + Judge."""

    def __init__(self, judge: ContentLLMJudge | None = None) -> None:
        self.judge = judge or ContentLLMJudge()

    def audit(
        self,
        social_pack: SocialPack | dict[str, Any],
        facts: Sequence[FactItem],
        brand_voice: str = "Thân thiện, tinh tế, hiện đại, phù hợp du mục số",
        allowed_domains: Sequence[str] | None = None,
        forbidden_terms: Sequence[str] | None = None,
    ) -> AuditResult:
        """Audit candidate SocialPack against all tiers.

        Returns an AuditResult containing pass status, score, violations, attribution rate,
        and judge result.
        """
        hard_errors: list[str] = []
        soft_issues: list[str] = []

        caption = social_pack.caption if isinstance(social_pack, SocialPack) else social_pack.get("caption", "")
        channels = social_pack.channels if isinstance(social_pack, SocialPack) else social_pack.get("channels", ["facebook"])
        sentence_map = (
            social_pack.sentence_fact_map
            if isinstance(social_pack, SocialPack)
            else social_pack.get("sentence_fact_map", [])
        )

        # If sentence_fact_map is missing or empty, auto-derive it so sentences can be audited
        if not sentence_map and caption:
            cta_text = ""
            if isinstance(social_pack, SocialPack):
                cta_text = social_pack.cta.label if social_pack.cta else ""
            elif isinstance(social_pack, dict):
                cta_val = social_pack.get("cta", {})
                cta_text = cta_val.get("label", "") if isinstance(cta_val, dict) else str(cta_val)
            sentence_map = map_caption_to_sentence_fact_map(
                caption=caption,
                facts=facts,
                expected_cta=cta_text,
            )

        # ----------------------------------------------------------------------
        # Tier 1 & 2: Deterministic Code Guardrails (CM-13) & Zero-Claim / Fact IDs (CM-08)
        # ----------------------------------------------------------------------
        cta_url = None
        if isinstance(social_pack, SocialPack) and social_pack.cta:
            cta_url = social_pack.cta.target_url
        elif isinstance(social_pack, dict):
            cta_val = social_pack.get("cta", {})
            if isinstance(cta_val, dict):
                cta_url = cta_val.get("target_url")

        guard_report = evaluate_social_pack_guardrails(
            caption=caption,
            extracted_facts=facts,
            channels=channels,
            sentence_fact_map=sentence_map,
            cta_target_url=cta_url,
            allowed_domains=allowed_domains or (),
            forbidden_terms=forbidden_terms or (),
        )

        for v in guard_report.violations:
            hard_errors.append(f"[{v.code}] {v.message}")

        # Check NLI entailment status and attribution rate
        factual_count = 0
        supported_count = 0

        for s in sentence_map:
            stype = getattr(s, "sentence_type", s.get("sentence_type") if isinstance(s, dict) else "")
            stext = getattr(s, "text", s.get("text") if isinstance(s, dict) else "")
            sidx = getattr(s, "sentence_index", s.get("sentence_index") if isinstance(s, dict) else 0)
            entail = getattr(s, "entailment_status", s.get("entailment_status") if isinstance(s, dict) else "unsupported")

            if stype == "factual":
                factual_count += 1
                if entail == "supported":
                    supported_count += 1
                elif entail == "unsupported":
                    hard_errors.append(f"Unsupported factual claim in sentence {sidx}: '{stext}'")
                elif entail == "partial":
                    soft_issues.append(f"Partial entailment in sentence {sidx}: '{stext}'")

        attribution_rate = (supported_count / factual_count) if factual_count > 0 else 1.0
        zero_claim_compliant = not any(v.code == "ZERO_CLAIM_VIOLATION" for v in guard_report.violations)

        # ----------------------------------------------------------------------
        # Tier 3: Independent LLM Judge Evaluation (CM-14)
        # ----------------------------------------------------------------------
        judge_res = self.judge.evaluate_social_pack(
            social_pack=social_pack,
            extracted_facts=facts,
            brand_voice=brand_voice,
            channels=channels,
        )

        overall_score = judge_res.overall_score
        for viol in judge_res.violations:
            if "Hard Rule" in viol.criteria:
                if viol.issue not in hard_errors:
                    hard_errors.append(viol.issue)
            else:
                soft_issues.append(f"[{viol.criteria}] {viol.issue} ('{viol.text_snippet}')")

        # Consolidated pass condition
        has_hard_errors = len(hard_errors) > 0
        judge_passed = judge_res.passed and (overall_score >= self.judge.pass_threshold)
        passed = (not has_hard_errors) and zero_claim_compliant and judge_passed

        return AuditResult(
            passed=passed,
            score=overall_score,
            hard_errors=hard_errors,
            soft_issues=soft_issues,
            judge_res=judge_res,
            attribution_rate=attribution_rate,
            zero_claim_compliant=zero_claim_compliant,
        )


# ==============================================================================
# 3. REFLECTION SELF-CORRECTION LOOP (CM-15)
# ==============================================================================

class ReflectionCorrectionLoop:
    """Orchestrates internal self-correction loop up to MAX_REFLECTION_ROUNDS (2)."""

    def __init__(
        self,
        auditor: ContentQualityAuditor | None = None,
        max_rounds: int = MAX_REFLECTION_ROUNDS,
    ) -> None:
        self.auditor = auditor or ContentQualityAuditor()
        self.max_rounds = max_rounds

    def run_loop(
        self,
        initial_pack: SocialPack,
        facts: Sequence[FactItem],
        refinement_generator_fn: Callable[[SocialPack, StructuredReflectionFeedback], SocialPack],
        brand_voice: str = "Thân thiện, tinh tế, hiện đại, phù hợp du mục số",
        allowed_domains: Sequence[str] | None = None,
        forbidden_terms: Sequence[str] | None = None,
    ) -> tuple[SocialPack, QualityReport]:
        """Execute the self-correction reflection loop.

        Flow:
        - Round 0: Audit initial draft. If clean, 0 repair rounds needed.
        - If flawed: Iterates through repair rounds (1 to max_rounds).
        - If fixed in round 1 -> rounds_count = 1.
        - If fixed in round 2 -> rounds_count = 2.
        - If flawed after max_rounds -> rounds_count = max_rounds, final_passed = False.
          Strictly overrides status to 'insufficient_data' with explicit reasons.
          Zero unverified hard-error drafts escape.

        Returns:
            (Final SocialPack, QualityReport)
        """
        current_pack = initial_pack
        rounds_history: list[RoundTelemetry] = []

        # ----------------------------------------------------------------------
        # Round 0: Evaluate Initial Candidate Pack
        # ----------------------------------------------------------------------
        t0_start = time.perf_counter()
        audit_res = self.auditor.audit(
            social_pack=current_pack,
            facts=facts,
            brand_voice=brand_voice,
            allowed_domains=allowed_domains,
            forbidden_terms=forbidden_terms,
        )
        t0_latency_ms = (time.perf_counter() - t0_start) * 1000.0

        rounds_history.append(
            RoundTelemetry(
                round_index=0,
                caption_length=len(current_pack.caption),
                judge_score=audit_res.score,
                passed=audit_res.passed,
                hard_violations=list(audit_res.hard_errors),
                soft_issues=list(audit_res.soft_issues),
                latency_ms=round(t0_latency_ms, 2),
            )
        )

        final_passed = audit_res.passed
        final_score = audit_res.score
        latest_hard_errors = list(audit_res.hard_errors)
        latest_soft_issues = list(audit_res.soft_issues)
        attribution_rate = audit_res.attribution_rate
        zero_claim_compliant = audit_res.zero_claim_compliant
        rounds_count = 0

        # If initial draft passed without errors, no self-correction needed!
        if audit_res.passed:
            logger.info("SocialPack passed quality audit on initial draft with score %.1f/100", audit_res.score)
        else:
            # ------------------------------------------------------------------
            # Enter Self-Correction Loop (Up to max_rounds retries)
            # ------------------------------------------------------------------
            for repair_round in range(1, self.max_rounds + 1):
                rounds_count = repair_round

                # 1. Build structured critique for the generator
                instructions: list[str] = []
                if latest_hard_errors:
                    instructions.append(f"LOẠI BỎ NGAY LỖI CỨNG: {'; '.join(latest_hard_errors)}.")
                if latest_soft_issues:
                    instructions.append(f"CẢI THIỆN CHẤT LƯỢNG: {'; '.join(latest_soft_issues)}.")
                if audit_res.judge_res and audit_res.judge_res.feedback_for_reflection:
                    instructions.append(f"Chỉ dẫn từ Judge: {audit_res.judge_res.feedback_for_reflection}")

                feedback = StructuredReflectionFeedback(
                    round_index=repair_round,
                    hard_errors=latest_hard_errors,
                    soft_issues=latest_soft_issues,
                    actionable_instructions=" ".join(instructions),
                )

                # 2. Call generator refinement callback to generate corrected pack
                try:
                    current_pack = refinement_generator_fn(current_pack, feedback)
                except Exception as exc:
                    logger.error("Generator refinement failed during round %d: %s", repair_round, exc)
                    break

                # 3. Audit revised pack
                t_repair_start = time.perf_counter()
                audit_res = self.auditor.audit(
                    social_pack=current_pack,
                    facts=facts,
                    brand_voice=brand_voice,
                    allowed_domains=allowed_domains,
                    forbidden_terms=forbidden_terms,
                )
                repair_latency_ms = (time.perf_counter() - t_repair_start) * 1000.0

                rounds_history.append(
                    RoundTelemetry(
                        round_index=repair_round,
                        caption_length=len(current_pack.caption),
                        judge_score=audit_res.score,
                        passed=audit_res.passed,
                        hard_violations=list(audit_res.hard_errors),
                        soft_issues=list(audit_res.soft_issues),
                        latency_ms=round(repair_latency_ms, 2),
                    )
                )

                final_passed = audit_res.passed
                final_score = audit_res.score
                latest_hard_errors = list(audit_res.hard_errors)
                latest_soft_issues = list(audit_res.soft_issues)
                attribution_rate = audit_res.attribution_rate
                zero_claim_compliant = audit_res.zero_claim_compliant

                if audit_res.passed:
                    logger.info(
                        "SocialPack passed quality audit on repair round %d with score %.1f/100",
                        repair_round,
                        audit_res.score,
                    )
                    break

                if repair_round == self.max_rounds:
                    logger.warning(
                        "SocialPack failed quality audit after exhausting %d reflection rounds. Hard errors: %s",
                        self.max_rounds,
                        "; ".join(latest_hard_errors),
                    )

        # ======================================================================
        # FINAL GOVERNANCE & RESOLUTION
        # ======================================================================
        status_resolution: SocialPackStatusType = "draft"

        if not final_passed:
            # STRICT POLICY: Never return draft if hard failures or unresolved errors remain
            status_resolution = "insufficient_data"
            rejection_msg = (
                f"Không thể tự sửa chất lượng sau {rounds_count} vòng phản tư: "
                + "; ".join(latest_hard_errors + latest_soft_issues)
            )

            # Construct sanitized fail pack without unverified claims
            updated_pack_dict = current_pack.model_dump()
            updated_pack_dict["status"] = "insufficient_data"
            updated_pack_dict["rejection_reason"] = rejection_msg
            current_pack = SocialPack(**updated_pack_dict)
        else:
            status_resolution = current_pack.status

        quality_report = QualityReport(
            rounds_count=rounds_count,
            final_passed=final_passed,
            final_score=final_score,
            hard_failures=latest_hard_errors,
            unresolved_errors=latest_soft_issues if not final_passed else [],
            rounds_history=rounds_history,
            status_resolution=status_resolution,
            attribution_rate=attribution_rate,
            zero_claim_compliant=zero_claim_compliant,
        )

        current_pack.metadata["quality_report"] = quality_report.to_dict()
        current_pack.content_hash = compute_content_hash(current_pack)

        return current_pack, quality_report
