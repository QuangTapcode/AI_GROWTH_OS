"""Independent Quality Check Operation & Service (CM-15).

Implements the dedicated content.quality_check operation:
1. Receives a SocialPack (either pre-approval draft, approved pack, or published pack).
2. Performs comprehensive quality audit via ContentQualityAuditor:
   - Tier 1: Deterministic Code Guardrails (prices, numbers, promo claims, forbidden terms)
   - Tier 2: Sentence-Fact Mapping & Zero-Claim Compliance (TC-10, TC-11, NLI entailment)
   - Tier 3: Independent LLM Judge evaluation (Rubric 5 criteria >= 90)
3. Returns ContentQualityCheckResponse containing passed status, score, attribution rate,
   zero-claim compliance, detected issues, and actionable suggested fixes.
4. Fully reusable post-approval to detect tampering or verify publishing integrity.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ...app.config import Settings
from ...app.runtime import OperationError, OperationOutcome, RunContext
from ...app.schemas import JobRequest
from .reflection_loop import ContentQualityAuditor
from .social_pack_v2 import (
    ContentQualityCheckResponse,
    FactItem,
    SocialPack as SocialPackV2,
)
from .tenant_guard import TenantGuard

logger = logging.getLogger(__name__)

PROMPT_VERSION = "content-quality-check-v1"
CONTENT_QUALITY_CHECK_PROMPT_VERSION = PROMPT_VERSION


class ContentQualityCheckPayload(BaseModel):
    """Payload model for content.quality_check operation."""
    model_config = ConfigDict(extra="ignore")

    workspace_id: UUID | str | None = None
    social_pack: dict[str, Any] | SocialPackV2 | None = None
    facts: list[FactItem] | list[dict[str, Any]] = Field(default_factory=list)
    brand_voice: str | None = Field(default=None, max_length=500)
    rubric_criteria: list[str] = Field(default_factory=list)
    allowed_domains: list[str] | None = None
    forbidden_terms: list[str] | None = None


def check_social_pack_quality(
    social_pack: SocialPackV2 | dict[str, Any],
    facts: Sequence[FactItem] | None = None,
    brand_voice: str = "Thân thiện, tinh tế, hiện đại, phù hợp du mục số",
    allowed_domains: Sequence[str] | None = None,
    forbidden_terms: Sequence[str] | None = None,
    auditor: ContentQualityAuditor | None = None,
) -> ContentQualityCheckResponse:
    """Standalone pure evaluator for SocialPack quality.

    Can be invoked anytime: during generation reflection loop, in approval queue UI,
    or post-approval right before dispatching to publisher.
    """
    if auditor is None:
        auditor = ContentQualityAuditor()

    # Normalize pack object
    pack_obj: SocialPackV2 | dict[str, Any]
    if isinstance(social_pack, SocialPackV2):
        pack_obj = social_pack
    elif isinstance(social_pack, dict):
        try:
            pack_obj = SocialPackV2(**social_pack)
        except Exception:
            pack_obj = social_pack
    else:
        pack_obj = dict(social_pack)

    # Normalize facts: prefer explicitly provided facts, fallback to pack.extracted_facts
    eval_facts: list[FactItem] = []
    if facts:
        for f in facts:
            if isinstance(f, FactItem):
                eval_facts.append(f)
            elif isinstance(f, dict):
                eval_facts.append(FactItem(**f))
    else:
        pack_facts = getattr(pack_obj, "extracted_facts", pack_obj.get("extracted_facts", []) if isinstance(pack_obj, dict) else [])
        for f in pack_facts:
            if isinstance(f, FactItem):
                eval_facts.append(f)
            elif isinstance(f, dict):
                eval_facts.append(FactItem(**f))

    # Run full 3-tier audit
    audit_res = auditor.audit(
        social_pack=pack_obj,
        facts=eval_facts,
        brand_voice=brand_voice,
        allowed_domains=allowed_domains,
        forbidden_terms=forbidden_terms,
    )

    all_issues = list(audit_res.hard_errors) + list(audit_res.soft_issues)

    # Generate suggested fixes
    suggested_fixes: list[str] = []
    for he in audit_res.hard_errors:
        if "Price claim error" in he:
            suggested_fixes.append("Loại bỏ hoặc đối chiếu lại giá tiền với facts đã được kiểm chứng.")
        elif "Unsupported number" in he:
            suggested_fixes.append("Loại bỏ các số liệu/thống kê không có trong bài viết SEO nguồn.")
        elif "Unbacked promo" in he:
            suggested_fixes.append("Loại bỏ từ ngữ khuyến mãi, so sánh nhất hoặc khẳng định tuyệt đối.")
        elif "TC-10" in he:
            suggested_fixes.append("Gán đúng fact_id cho câu mang tính khẳng định sự thật.")
        elif "TC-11" in he:
            suggested_fixes.append("Viết lại Hook/CTA theo luật Zero-Claim (không chứa giá, số liệu, cam kết).")
        else:
            suggested_fixes.append(f"Khắc phục vi phạm: {he}")

    if audit_res.judge_res and audit_res.judge_res.feedback_for_reflection:
        suggested_fixes.append(audit_res.judge_res.feedback_for_reflection)

    return ContentQualityCheckResponse(
        passed=audit_res.passed,
        score=round(audit_res.score, 2),
        attribution_rate=round(audit_res.attribution_rate, 4),
        zero_claim_compliant=audit_res.zero_claim_compliant,
        issues=all_issues,
        suggested_fixes=suggested_fixes,
    )


def validate_content_quality_check(job: JobRequest, p: Any, settings: Settings) -> list[tuple[str, str]]:
    """Validates the content.quality_check job request before execution."""
    problems: list[tuple[str, str]] = []

    # Check for social_pack
    social_pack = getattr(p, "social_pack", None)
    if social_pack is None and hasattr(p, "caption"):
        social_pack = p

    if social_pack is None:
        problems.append(("MISSING_SOCIAL_PACK", "Payload must contain a 'social_pack' to inspect."))
        return problems

    # Check tenant boundary
    pack_ws = getattr(social_pack, "workspace_id", None)
    if pack_ws is None and isinstance(social_pack, dict):
        pack_ws = social_pack.get("workspace_id")

    if pack_ws is not None and str(pack_ws) != str(job.workspace_id):
        problems.append((
            "TENANT_SCOPE_VIOLATION",
            f"SocialPack workspace_id '{pack_ws}' does not match job workspace_id '{job.workspace_id}'.",
        ))

    return problems


async def run_content_quality_check(ctx: RunContext) -> OperationOutcome:
    """Handler for content.quality_check operation."""
    job = ctx.job
    p = ctx.payload
    workspace_id = str(job.workspace_id)

    # Extract social_pack
    raw_pack = getattr(p, "social_pack", None)
    if raw_pack is None and hasattr(p, "caption"):
        raw_pack = p

    if raw_pack is None:
        raise OperationError("MISSING_SOCIAL_PACK", "Payload does not contain valid social_pack.")

    # Enforce Tenant Isolation
    pack_ws = getattr(raw_pack, "workspace_id", None)
    if pack_ws is None and isinstance(raw_pack, dict):
        pack_ws = raw_pack.get("workspace_id")

    TenantGuard.verify_workspace_access(workspace_id, pack_ws)

    # Extract facts if supplied
    facts_raw = getattr(p, "facts", [])
    facts: list[FactItem] = []
    for f in facts_raw:
        if isinstance(f, FactItem):
            facts.append(f)
        elif isinstance(f, dict):
            facts.append(FactItem(**f))

    brand_voice = getattr(p, "brand_voice", "Thân thiện, tinh tế, hiện đại, phù hợp du mục số")
    allowed_domains = getattr(p, "allowed_domains", None)
    forbidden_terms = getattr(p, "forbidden_terms", None)

    # Perform Quality Evaluation
    response = check_social_pack_quality(
        social_pack=raw_pack,
        facts=facts if facts else None,
        brand_voice=brand_voice,
        allowed_domains=allowed_domains,
        forbidden_terms=forbidden_terms,
    )

    warnings: list[str] = []
    if not response.passed:
        warnings.append("SOCIAL_PACK_QUALITY_CHECK_FAILED")

    return OperationOutcome(
        result=response.model_dump(mode="json"),
        evidence=[],
        warnings=warnings,
    )
