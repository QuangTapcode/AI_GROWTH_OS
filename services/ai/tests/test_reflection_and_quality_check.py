"""Tests for CM-15: Reflection Self-Correction Loop & Operation content.quality_check.

Verifies Section 4.1 (Goal 6), Section 5.1 (Stage 4), Section 9 (CM-15), TC-10 and TC-11:
1. Multi-Stage Quality Gate:
   - Evaluates candidate SocialPack against Guardrails (CM-13), Fact Mapping / NLI (CM-08),
     and Independent LLM Judge (CM-14).
2. Reflection Self-Correction Loop:
   - Structured error feedback dispatched to generator for refinement.
   - Max 2 correction rounds.
   - TC-10: Factual sentence with unknown/missing fact_id triggers reflection and recovers.
   - TC-11: Hook/CTA containing unbacked claim triggers reflection and recovers.
   - Case recovering ONLY on round 2 (initial fail -> round 1 fail -> round 2 pass).
   - Case failing after 2 rounds (initial fail -> round 1 fail -> round 2 fail -> returns
     insufficient_data with explicit reasons; zero hard-error drafts escape).
3. Telemetry & Quality Report:
   - Records rounds count, error types, and per-round scores in quality_report.
   - Benchmark test set measures average reflection rounds <= 1.2.
4. Independent Operation content.quality_check:
   - Receives SocialPack independently.
   - Evaluates valid approved pack (passes).
   - Evaluates tampered pack post-approval (fails with explicit issues).
   - Enforces tenant isolation.
"""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any, Sequence
from uuid import UUID, uuid4

import pytest

from src.agents.content.quality_check_service import (
    CONTENT_QUALITY_CHECK_PROMPT_VERSION,
    ContentQualityCheckPayload,
    check_social_pack_quality,
    run_content_quality_check,
    validate_content_quality_check,
)
from src.agents.content.reflection_loop import (
    MAX_REFLECTION_ROUNDS,
    AuditResult,
    ContentQualityAuditor,
    QualityReport,
    ReflectionCorrectionLoop,
    RoundTelemetry,
    StructuredReflectionFeedback,
)
from src.agents.content.social_pack_v2 import (
    AssetV2,
    CTAObject,
    FactItem,
    SentenceMap,
    SocialPack as SocialPackV2,
    compute_content_hash,
)
from src.agents.content.tenant_guard import TenantAccessForbiddenError
from src.app.runtime import CallBudget, OperationError, RunContext
from src.app.schemas import JobRequest


# ==============================================================================
# TEST FIXTURES & HELPERS
# ==============================================================================

def make_sample_facts() -> list[FactItem]:
    """Sample verified facts from TripC Da Nang apartment article."""
    return [
        FactItem(
            fact_id="f01",
            text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.",
            source_type="seo_body",
        ),
        FactItem(
            fact_id="f02",
            text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.",
            source_type="seo_body",
        ),
        FactItem(
            fact_id="f03",
            text="Chi phí thuê trọn gói đã bao gồm internet tốc độ cao và dịch vụ dọn phòng hàng tuần.",
            source_type="seo_body",
        ),
        FactItem(
            fact_id="f04",
            text="Không gian trang bị bàn làm việc công thái học và ghế chuẩn Ergonomic.",
            source_type="seo_body",
        ),
    ]


def make_base_social_pack(
    workspace_id: UUID | None = None,
    caption: str | None = None,
    sentence_map: list[SentenceMap] | None = None,
    cta_label: str = "Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!",
    facts: list[FactItem] | None = None,
) -> SocialPackV2:
    """Creates a well-formed base SocialPack v2.0."""
    ws_id = str(workspace_id or uuid4())
    pack_facts = facts if facts is not None else make_sample_facts()

    default_caption = (
        "Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.\n\n"
        "TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.\n"
        "Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.\n"
        "Chi phí thuê trọn gói đã bao gồm internet tốc độ cao và dịch vụ dọn phòng hàng tuần.\n\n"
        f"{cta_label}"
    )

    cap = caption if caption is not None else default_caption

    if sentence_map is not None:
        s_map = sentence_map
    else:
        s_map = [
            SentenceMap(
                sentence_index=0,
                text="Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.",
                sentence_type="hook",
                fact_id="NONE",
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=1,
                text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.",
                sentence_type="factual",
                fact_id=["f01"],
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=2,
                text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.",
                sentence_type="factual",
                fact_id=["f02"],
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=3,
                text="Chi phí thuê trọn gói đã bao gồm internet tốc độ cao và dịch vụ dọn phòng hàng tuần.",
                sentence_type="factual",
                fact_id=["f03"],
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=4,
                text=cta_label,
                sentence_type="cta",
                fact_id="SYSTEM_CTA",
                entailment_status="supported",
            ),
        ]

    pack = SocialPackV2(
        pack_id=f"spk_{uuid4().hex[:12]}",
        workspace_id=ws_id,
        parent_content_id=str(uuid4()),
        parent_version=1,
        channels=["facebook"],
        caption=cap,
        cta=CTAObject(type="contact_us", label=cta_label, target_url="https://tripc.vn"),
        extracted_facts=pack_facts,
        sentence_fact_map=s_map,
        image_assets=[
            AssetV2(
                asset_id=f"ast_{uuid4().hex[:8]}",
                url="https://tripc.vn/media/room.jpg",
                source_type="real_asset",
                license="enterprise_owned",
                attribution="TripC Da Nang",
                alt_text="Ảnh phòng studio view biển",
            )
        ],
        citations=[],
        version=1,
        status="draft",
    )
    pack.content_hash = compute_content_hash(pack)
    return pack


# ==============================================================================
# 1. TC-10: FACT MAPPING ERROR SELF-CORRECTION
# ==============================================================================

def test_tc10_fact_mapping_error_self_correction():
    """TC-10: Factual sentence with unknown/invalid fact_id triggers reflection loop and self-corrects."""
    facts = make_sample_facts()
    ws_id = uuid4()

    # Flawed initial pack: factual sentence points to unknown fact_id ["f99"]
    flawed_map = [
        SentenceMap(
            sentence_index=0,
            text="Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.",
            sentence_type="hook",
            fact_id="NONE",
            entailment_status="supported",
        ),
        SentenceMap(
            sentence_index=1,
            text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.",
            sentence_type="factual",
            fact_id=["f99"],  # TC-10 VIOLATION: Unknown fact_id!
            entailment_status="supported",
        ),
        SentenceMap(
            sentence_index=2,
            text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.",
            sentence_type="factual",
            fact_id=["f02"],
            entailment_status="supported",
        ),
        SentenceMap(
            sentence_index=3,
            text="Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!",
            sentence_type="cta",
            fact_id="SYSTEM_CTA",
            entailment_status="supported",
        ),
    ]

    initial_pack = make_base_social_pack(workspace_id=ws_id, sentence_map=flawed_map, facts=[])

    # Refinement generator fixes fact_id assignment
    def refinement_generator(current: SocialPackV2, feedback: StructuredReflectionFeedback) -> SocialPackV2:
        assert feedback.round_index == 1
        assert any("UNKNOWN_FACT_ID" in err or "TC-10" in err for err in feedback.hard_errors)

        # Fix the mapping
        fixed_map = deepcopy(current.sentence_fact_map)
        fixed_map[1].fact_id = ["f01"]

        p_dict = current.model_dump()
        p_dict["sentence_fact_map"] = [s.model_dump() for s in fixed_map]
        p_dict["extracted_facts"] = [f.model_dump() for f in facts]
        return SocialPackV2(**p_dict)

    loop = ReflectionCorrectionLoop()
    final_pack, report = loop.run_loop(
        initial_pack=initial_pack,
        facts=facts,
        refinement_generator_fn=refinement_generator,
    )

    # Verifications
    assert report.rounds_count == 1
    assert report.final_passed is True
    assert final_pack.status == "draft"
    assert len(report.rounds_history) == 2  # Round 0 (initial) + Round 1 (repaired)
    assert report.rounds_history[0].passed is False
    assert any("UNKNOWN_FACT_ID" in err for err in report.rounds_history[0].hard_violations)
    assert report.rounds_history[1].passed is True
    assert final_pack.sentence_fact_map[1].fact_id == ["f01"]


# ==============================================================================
# 2. TC-11: ZERO-CLAIM HOOK & CTA VIOLATION SELF-CORRECTION
# ==============================================================================

def test_tc11_zero_claim_violation_self_correction():
    """TC-11: Hook or CTA containing unbacked claim triggers reflection loop and self-corrects."""
    facts = make_sample_facts()
    ws_id = uuid4()

    # Flawed initial pack: Hook contains fake price 'chỉ 500k', CTA contains superlative 'rẻ nhất'
    flawed_caption = (
        "Ưu đãi sốc chỉ 500k cho kỳ nghỉ tuyệt vời tại Đà Nẵng!\n\n"
        "TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.\n"
        "Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.\n\n"
        "Đặt phòng ngay hôm nay với giá rẻ nhất Đà Nẵng!"
    )

    flawed_map = [
        SentenceMap(
            sentence_index=0,
            text="Ưu đãi sốc chỉ 500k cho kỳ nghỉ tuyệt vời tại Đà Nẵng!",
            sentence_type="hook",
            fact_id="NONE",
            entailment_status="supported",
        ),
        SentenceMap(
            sentence_index=1,
            text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.",
            sentence_type="factual",
            fact_id=["f01"],
            entailment_status="supported",
        ),
        SentenceMap(
            sentence_index=2,
            text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.",
            sentence_type="factual",
            fact_id=["f02"],
            entailment_status="supported",
        ),
        SentenceMap(
            sentence_index=3,
            text="Đặt phòng ngay hôm nay với giá rẻ nhất Đà Nẵng!",
            sentence_type="cta",
            fact_id="SYSTEM_CTA",
            entailment_status="supported",
        ),
    ]

    initial_pack = make_base_social_pack(
        workspace_id=ws_id,
        caption=flawed_caption,
        sentence_map=flawed_map,
        cta_label="Đặt phòng ngay hôm nay với giá rẻ nhất Đà Nẵng!",
    )

    # Refinement generator cleans Hook & CTA
    def refinement_generator(current: SocialPackV2, feedback: StructuredReflectionFeedback) -> SocialPackV2:
        assert feedback.round_index == 1
        assert any("ZERO_CLAIM_VIOLATION" in err or "PRICE_CLAIM" in err for err in feedback.hard_errors)

        clean_caption = (
            "Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.\n\n"
            "TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.\n"
            "Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.\n\n"
            "Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!"
        )

        clean_map = [
            SentenceMap(
                sentence_index=0,
                text="Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.",
                sentence_type="hook",
                fact_id="NONE",
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=1,
                text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.",
                sentence_type="factual",
                fact_id=["f01"],
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=2,
                text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.",
                sentence_type="factual",
                fact_id=["f02"],
                entailment_status="supported",
            ),
            SentenceMap(
                sentence_index=3,
                text="Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!",
                sentence_type="cta",
                fact_id="SYSTEM_CTA",
                entailment_status="supported",
            ),
        ]

        p_dict = current.model_dump()
        p_dict["caption"] = clean_caption
        p_dict["sentence_fact_map"] = [s.model_dump() for s in clean_map]
        p_dict["cta"] = {"type": "contact_us", "label": "Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!", "target_url": "https://tripc.vn"}
        return SocialPackV2(**p_dict)

    loop = ReflectionCorrectionLoop()
    final_pack, report = loop.run_loop(
        initial_pack=initial_pack,
        facts=facts,
        refinement_generator_fn=refinement_generator,
    )

    assert report.rounds_count == 1
    assert report.final_passed is True
    assert final_pack.status == "draft"
    assert report.zero_claim_compliant is True
    assert len(report.rounds_history) == 2
    assert report.rounds_history[0].passed is False
    assert report.rounds_history[1].passed is True


# ==============================================================================
# 3. CA CHỈ SỬA ĐƯỢC Ở VÒNG 2 (RECOVERY ON ROUND 2)
# ==============================================================================

def test_recovery_only_on_round_2():
    """Tests case where candidate fails Round 0 and Round 1, but successfully self-corrects on Round 2."""
    facts = make_sample_facts()
    ws_id = uuid4()

    # Flawed initial pack (Round 0): Unbacked price claim '8.5 triệu'
    cap_r0 = (
        "Chào mừng bạn đến với căn hộ ven biển.\n\n"
        "Giá thuê cực sốc 8.5 triệu/tháng tại TripC Da Nang.\n"
        "Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.\n\n"
        "Liên hệ ngay hôm nay để nhận thông tin!"
    )
    map_r0 = [
        SentenceMap(sentence_index=0, text="Chào mừng bạn đến với căn hộ ven biển.", sentence_type="hook", fact_id="NONE"),
        SentenceMap(sentence_index=1, text="Giá thuê cực sốc 8.5 triệu/tháng tại TripC Da Nang.", sentence_type="factual", fact_id=["f01"]),
        SentenceMap(sentence_index=2, text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.", sentence_type="factual", fact_id=["f02"]),
        SentenceMap(sentence_index=3, text="Liên hệ ngay hôm nay để nhận thông tin!", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]
    initial_pack = make_base_social_pack(workspace_id=ws_id, caption=cap_r0, sentence_map=map_r0)

    # Attempt tracker
    calls = []

    def refinement_generator(current: SocialPackV2, feedback: StructuredReflectionFeedback) -> SocialPackV2:
        calls.append(feedback.round_index)

        if feedback.round_index == 1:
            # Round 1 attempt: introduces unbacked percentage 'ưu đãi 40%' (still fails)
            cap_r1 = (
                "Chào mừng bạn đến với căn hộ ven biển.\n\n"
                "TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.\n"
                "Nhận ngay ưu đãi 40% chi phí thuê trong tháng đầu.\n\n"
                "Liên hệ ngay hôm nay để nhận thông tin!"
            )
            map_r1 = [
                SentenceMap(sentence_index=0, text="Chào mừng bạn đến với căn hộ ven biển.", sentence_type="hook", fact_id="NONE"),
                SentenceMap(sentence_index=1, text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.", sentence_type="factual", fact_id=["f01"]),
                SentenceMap(sentence_index=2, text="Nhận ngay ưu đãi 40% chi phí thuê trong tháng đầu.", sentence_type="factual", fact_id=["f02"]),
                SentenceMap(sentence_index=3, text="Liên hệ ngay hôm nay để nhận thông tin!", sentence_type="cta", fact_id="SYSTEM_CTA"),
            ]
            p_dict = current.model_dump()
            p_dict["caption"] = cap_r1
            p_dict["sentence_fact_map"] = [s.model_dump() for s in map_r1]
            return SocialPackV2(**p_dict)

        elif feedback.round_index == 2:
            # Round 2 attempt: fully fixed and strictly aligned with facts
            cap_r2 = (
                "Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.\n\n"
                "TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.\n"
                "Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.\n\n"
                "Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!"
            )
            map_r2 = [
                SentenceMap(sentence_index=0, text="Khám phá không gian sống tiện nghi ngay cạnh biển Mỹ Khê.", sentence_type="hook", fact_id="NONE"),
                SentenceMap(sentence_index=1, text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp, phường Phước Mỹ, quận Sơn Trà.", sentence_type="factual", fact_id=["f01"]),
                SentenceMap(sentence_index=2, text="Căn hộ chỉ cách bãi tắm Mỹ Khê 150 mét đi bộ.", sentence_type="factual", fact_id=["f02"]),
                SentenceMap(sentence_index=3, text="Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!", sentence_type="cta", fact_id="SYSTEM_CTA"),
            ]
            p_dict = current.model_dump()
            p_dict["caption"] = cap_r2
            p_dict["sentence_fact_map"] = [s.model_dump() for s in map_r2]
            p_dict["cta"] = {"type": "contact_us", "label": "Liên hệ Fanpage TripC Da Nang để được tư vấn chi tiết!", "target_url": "https://tripc.vn"}
            return SocialPackV2(**p_dict)

        raise AssertionError(f"Unexpected round index {feedback.round_index}")

    loop = ReflectionCorrectionLoop(max_rounds=2)
    final_pack, report = loop.run_loop(
        initial_pack=initial_pack,
        facts=facts,
        refinement_generator_fn=refinement_generator,
    )

    # Verifications
    assert calls == [1, 2]
    assert report.rounds_count == 2
    assert report.final_passed is True
    assert final_pack.status == "draft"
    assert len(report.rounds_history) == 3  # Round 0, Round 1, Round 2
    assert report.rounds_history[0].passed is False
    assert report.rounds_history[1].passed is False
    assert report.rounds_history[2].passed is True
    assert report.final_score >= 90.0


# ==============================================================================
# 4. CA KHÔNG SỬA ĐƯỢC SAU 2 VÒNG (STRICT INSUFFICIENT_DATA REJECTION)
# ==============================================================================

def test_unrepairable_after_2_rounds_returns_insufficient_data():
    """Tests case where candidate fails after exhausting 2 rounds: strictly returns status 'insufficient_data'."""
    facts = make_sample_facts()
    ws_id = uuid4()

    # Flawed initial pack with persistent hallucination
    cap_bad = (
        "Ưu đãi độc quyền giảm 90% chỉ hôm nay tại TripC!\n\n"
        "Giá phòng chỉ 100k cho khách hàng đặt sớm.\n\n"
        "Gọi ngay để nhận giá rẻ nhất!"
    )
    map_bad = [
        SentenceMap(sentence_index=0, text="Ưu đãi độc quyền giảm 90% chỉ hôm nay tại TripC!", sentence_type="hook", fact_id="NONE"),
        SentenceMap(sentence_index=1, text="Giá phòng chỉ 100k cho khách hàng đặt sớm.", sentence_type="factual", fact_id=["f01"]),
        SentenceMap(sentence_index=2, text="Gọi ngay để nhận giá rẻ nhất!", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]
    initial_pack = make_base_social_pack(workspace_id=ws_id, caption=cap_bad, sentence_map=map_bad)

    # Defiant generator that refuses or fails to remove hard violations
    def defiant_generator(current: SocialPackV2, feedback: StructuredReflectionFeedback) -> SocialPackV2:
        # Repeats an unbacked price claim in every round
        cap_still_bad = f"Vòng {feedback.round_index}: Căn hộ giảm 70% còn 200k/đêm!"
        map_still_bad = [
            SentenceMap(sentence_index=0, text=cap_still_bad, sentence_type="factual", fact_id=["f01"])
        ]
        p_dict = current.model_dump()
        p_dict["caption"] = cap_still_bad
        p_dict["sentence_fact_map"] = [s.model_dump() for s in map_still_bad]
        return SocialPackV2(**p_dict)

    loop = ReflectionCorrectionLoop(max_rounds=2)
    final_pack, report = loop.run_loop(
        initial_pack=initial_pack,
        facts=facts,
        refinement_generator_fn=defiant_generator,
    )

    # Verifications
    assert report.rounds_count == 2
    assert report.final_passed is False
    assert final_pack.status == "insufficient_data"  # MUST NEVER BE "draft"!
    assert report.status_resolution == "insufficient_data"
    assert final_pack.rejection_reason is not None
    assert "Không thể tự sửa chất lượng sau 2 vòng phản tư" in final_pack.rejection_reason
    assert len(report.hard_failures) > 0
    assert len(report.rounds_history) == 3  # Round 0, Round 1, Round 2
    assert all(r.passed is False for r in report.rounds_history)


# ==============================================================================
# 5. AVERAGE ROUNDS BENCHMARK (BENCHMARK SUITE <= 1.2 ROUNDS)
# ==============================================================================

def test_average_reflection_rounds_benchmark():
    """Benchmark test suite verifying average reflection rounds <= 1.2 across 10 cases."""
    facts = make_sample_facts()
    ws_id = uuid4()

    # Define 10 test case behaviors:
    # - Cases 0, 1, 2, 3: Clean on draft (0 reflection rounds)
    # - Cases 4, 5, 6: Recover on round 1 (1 reflection round)
    # - Cases 7, 8: Recover on round 2 (2 reflection rounds)
    # - Case 9: Unrepairable after 2 rounds (2 reflection rounds exhausted)
    # Expected average: (4*0 + 3*1 + 2*2 + 1*2) / 10 = (0 + 3 + 4 + 2) / 10 = 0.9 rounds <= 1.2 rounds!

    benchmark_cases = [
        {"case_id": "c0_clean", "clean_at_round": 0},
        {"case_id": "c1_clean", "clean_at_round": 0},
        {"case_id": "c2_clean", "clean_at_round": 0},
        {"case_id": "c3_clean", "clean_at_round": 0},
        {"case_id": "c4_fix_r1", "clean_at_round": 1},
        {"case_id": "c5_fix_r1", "clean_at_round": 1},
        {"case_id": "c6_fix_r1", "clean_at_round": 1},
        {"case_id": "c7_fix_r2", "clean_at_round": 2},
        {"case_id": "c8_fix_r2", "clean_at_round": 2},
        {"case_id": "c9_unrepairable", "clean_at_round": 99},
    ]

    total_repair_rounds = 0
    loop = ReflectionCorrectionLoop(max_rounds=2)

    for spec in benchmark_cases:
        target_clean = spec["clean_at_round"]

        if target_clean == 0:
            # Perfectly clean pack
            initial_pack = make_base_social_pack(workspace_id=ws_id)
        else:
            # Flawed pack with unbacked price
            flawed_cap = "Khám phá phòng đẹp chỉ 500k tại Đà Nẵng.\nTripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp.\nLiên hệ ngay!"
            flawed_map = [
                SentenceMap(sentence_index=0, text="Khám phá phòng đẹp chỉ 500k tại Đà Nẵng.", sentence_type="hook", fact_id="NONE"),
                SentenceMap(sentence_index=1, text="TripC Da Nang toạ lạc tại 120 đường Võ Nguyên Giáp.", sentence_type="factual", fact_id=["f01"]),
                SentenceMap(sentence_index=2, text="Liên hệ ngay!", sentence_type="cta", fact_id="SYSTEM_CTA"),
            ]
            initial_pack = make_base_social_pack(workspace_id=ws_id, caption=flawed_cap, sentence_map=flawed_map)

        def make_refiner(clean_threshold: int):
            def refiner(current: SocialPackV2, feedback: StructuredReflectionFeedback) -> SocialPackV2:
                if feedback.round_index >= clean_threshold:
                    # Clean pack
                    clean_p = make_base_social_pack(workspace_id=ws_id)
                    p_dict = current.model_dump()
                    p_dict["caption"] = clean_p.caption
                    p_dict["sentence_fact_map"] = [s.model_dump() for s in clean_p.sentence_fact_map]
                    p_dict["cta"] = clean_p.cta.model_dump()
                    return SocialPackV2(**p_dict)
                else:
                    # Still flawed
                    flawed_cap = f"Vòng {feedback.round_index} vẫn còn giá 500k chưa sửa."
                    p_dict = current.model_dump()
                    p_dict["caption"] = flawed_cap
                    p_dict["sentence_fact_map"] = [
                        {"sentence_index": 0, "text": flawed_cap, "sentence_type": "factual", "fact_id": ["f01"]}
                    ]
                    return SocialPackV2(**p_dict)
            return refiner

        final_pack, report = loop.run_loop(
            initial_pack=initial_pack,
            facts=facts,
            refinement_generator_fn=make_refiner(target_clean),
        )

        total_repair_rounds += report.rounds_count
        if target_clean <= 2:
            assert report.final_passed is True
            assert final_pack.status == "draft"
        else:
            assert report.final_passed is False
            assert final_pack.status == "insufficient_data"

    average_rounds = total_repair_rounds / len(benchmark_cases)
    assert average_rounds <= 1.2, f"Average rounds {average_rounds} exceeded target 1.2"
    assert average_rounds == 0.9


# ==============================================================================
# 6. STANDALONE OPERATION content.quality_check
# ==============================================================================

def test_standalone_quality_check_valid_social_pack():
    """Tests content.quality_check on a valid approved SocialPack."""
    ws_id = uuid4()
    facts = make_sample_facts()
    pack = make_base_social_pack(workspace_id=ws_id)

    # Call standalone pure function
    res = check_social_pack_quality(social_pack=pack, facts=facts)

    assert res.passed is True
    assert res.score >= 90.0
    assert res.attribution_rate == 1.0
    assert res.zero_claim_compliant is True
    assert len(res.issues) == 0


def test_standalone_quality_check_tampered_social_pack():
    """Tests content.quality_check on a tampered SocialPack post-approval (injected unbacked price)."""
    ws_id = uuid4()
    facts = make_sample_facts()
    pack = make_base_social_pack(workspace_id=ws_id)

    # Tamper with caption to inject unbacked claim
    tampered_dict = pack.model_dump()
    tampered_dict["caption"] = "Căn hộ số 1 tốt nhất Đà Nẵng, giá chỉ 200k/đêm! Đặt ngay!"
    tampered_dict["sentence_fact_map"] = [
        {"sentence_index": 0, "text": "Căn hộ số 1 tốt nhất Đà Nẵng, giá chỉ 200k/đêm!", "sentence_type": "factual", "fact_id": ["f01"]},
        {"sentence_index": 1, "text": "Đặt ngay!", "sentence_type": "cta", "fact_id": "SYSTEM_CTA"},
    ]

    res = check_social_pack_quality(social_pack=tampered_dict, facts=facts)

    assert res.passed is False
    assert any("Price claim" in issue or "PRICE_CLAIM" in issue for issue in res.issues)
    assert len(res.suggested_fixes) > 0


def test_content_quality_check_tenant_isolation():
    """Tests tenant isolation in content.quality_check: foreign workspace pack is rejected."""
    ws_tenant_a = uuid4()
    ws_tenant_b = uuid4()

    pack_b = make_base_social_pack(workspace_id=ws_tenant_b)

    payload = ContentQualityCheckPayload(
        workspace_id=ws_tenant_a,
        social_pack=pack_b,
    )

    job = JobRequest(
        schema_version="1.0.0",
        job_id=uuid4(),
        workspace_id=ws_tenant_a,
        operation="content.quality_check",
        input_version=1,
        trace_id="trace_tenant_test",
        synthetic=True,
    )

    # Validate fails before run
    problems = validate_content_quality_check(job, payload, settings=None)  # type: ignore[arg-type]
    assert any(code == "TENANT_SCOPE_VIOLATION" for code, _ in problems)

    class MockCallBudget:
        def __init__(self, cap: int = 10) -> None:
            self.cap = cap
            self.calls = 0

        def consume(self) -> None:
            self.calls += 1

        def remaining(self) -> int:
            return max(0, self.cap - self.calls)

    import logging
    ctx = RunContext(
        job=job,
        payload=payload,
        settings=None,  # type: ignore[arg-type]
        provider=None,  # type: ignore[arg-type]
        budget=MockCallBudget(10),  # type: ignore[arg-type]
        logger=logging.getLogger("test_quality_check"),
    )

    with pytest.raises(TenantAccessForbiddenError):
        asyncio.run(run_content_quality_check(ctx))


def test_content_quality_check_operation_handler_e2e():
    """Tests run_content_quality_check operation outcome."""
    ws_id = uuid4()
    facts = make_sample_facts()
    pack = make_base_social_pack(workspace_id=ws_id)

    payload = ContentQualityCheckPayload(
        workspace_id=ws_id,
        social_pack=pack,
        facts=facts,
    )

    job = JobRequest(
        schema_version="1.0.0",
        job_id=uuid4(),
        workspace_id=ws_id,
        operation="content.quality_check",
        input_version=1,
        trace_id="trace_e2e_quality_check",
        synthetic=True,
    )

    class MockCallBudget:
        def __init__(self, cap: int = 10) -> None:
            self.cap = cap
            self.calls = 0

        def consume(self) -> None:
            self.calls += 1

        def remaining(self) -> int:
            return max(0, self.cap - self.calls)

    import logging
    ctx = RunContext(
        job=job,
        payload=payload,
        settings=None,  # type: ignore[arg-type]
        provider=None,  # type: ignore[arg-type]
        budget=MockCallBudget(10),  # type: ignore[arg-type]
        logger=logging.getLogger("test_quality_check"),
    )

    outcome = asyncio.run(run_content_quality_check(ctx))
    assert outcome.result["passed"] is True
    assert outcome.result["score"] >= 90.0
    assert outcome.result["attribution_rate"] == 1.0
    assert outcome.warnings == []
