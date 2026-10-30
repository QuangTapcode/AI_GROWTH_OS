"""Comprehensive Unit and Integration Tests for LLM Judge Engine & Calibration (CM-14).

Verifies:
1. Pinned Independent Model Family (gemini-1.5-pro-002 / gpt-4o-2024-08-06).
2. 5-Criteria Rubric Breakdown (30, 20, 20, 15, 15 points = 100 max) and >= 90 threshold.
3. Reference-free evaluation: Judge evaluates without access to Golden Ground Truth.
4. Hard-failure isolation: Deterministic code guardrails override Judge score on fake prices,
   numbers, and unbacked promo claims (setting passed=False regardless of LLM score).
5. Statistical Calibration Math: Cohen's Kappa (κ), Spearman rank correlation (ρ), confusion matrix.
6. Diagnostic Bias Tests:
   - Length Bias: Ensuring artificially elongated wordy copy is not unfairly favored.
   - Position / Order Bias: Permuting factual sentences yields stable, consistent score.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from evals.calibrate_judge import (
    compute_cohen_kappa,
    compute_confusion_matrix,
    compute_spearman_correlation,
    run_calibration_analysis,
)
from src.agents.content.llm_judge import (
    DEFAULT_JUDGE_MODEL,
    PINNED_JUDGE_MODELS,
    RUBRIC_PASS_THRESHOLD,
    BaseJudgeProvider,
    ContentLLMJudge,
    JudgeEvaluationResult,
    MockJudgeProvider,
)
from src.agents.content.social_pack_v2 import FactItem, SocialPack


# ==============================================================================
# 1. RUBRIC 5-CRITERIA & MODEL PINNING TESTS
# ==============================================================================

class TestJudgeModelPinningAndRubric:
    """Verifies model family independence and rubric breakdown."""

    def test_default_model_is_pinned_independent_family(self):
        assert DEFAULT_JUDGE_MODEL == "gemini-1.5-pro-002"
        assert "gemini" in PINNED_JUDGE_MODELS
        assert "openai" in PINNED_JUDGE_MODELS
        for model in PINNED_JUDGE_MODELS.values():
            assert "latest" not in model

    def test_perfect_social_pack_scores_above_threshold(self):
        judge = ContentLLMJudge()

        facts = [
            FactItem(fact_id="f01", text="Căn hộ studio TripC Da Nang cách biển Mỹ Khê 200m."),
            FactItem(fact_id="f02", text="Giá thuê trọn gói 8.500.000 VNĐ/tháng."),
            FactItem(fact_id="f03", text="Toàn bộ tòa nhà phủ sóng 5G."),
        ]

        pack = {
            "caption": (
                "Đà Nẵng là điểm hẹn tuyệt vời cho cộng đồng làm việc từ xa.\n\n"
                "Căn hộ studio TripC Da Nang cách biển Mỹ Khê 200m, với giá thuê 8.500.000 VNĐ/tháng.\n\n"
                "Tòa nhà phủ sóng 5G tốc độ cao.\n\n"
                "Nhắn tin Fanpage để nhận tư vấn chi tiết."
            ),
            "cta": {"type": "send_message", "label": "Nhắn tin nhận tư vấn", "target_url": "https://m.me/tripc"},
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        res = judge.evaluate_social_pack(
            social_pack=pack,
            brand_voice="Thư thái, tinh tế, hiện đại",
        )

        assert isinstance(res, JudgeEvaluationResult)
        assert res.overall_score >= RUBRIC_PASS_THRESHOLD
        assert res.passed is True
        assert res.hard_violations_detected is False

        # Validate 5 criteria weights
        assert "fact_attribution" in res.criterion_scores
        assert res.criterion_scores["fact_attribution"].max_score == 30.0

        assert "brand_voice" in res.criterion_scores
        assert res.criterion_scores["brand_voice"].max_score == 20.0

        assert "channel_suitability" in res.criterion_scores
        assert res.criterion_scores["channel_suitability"].max_score == 20.0

        assert "clarity_engagement" in res.criterion_scores
        assert res.criterion_scores["clarity_engagement"].max_score == 15.0

        assert "safety_compliance" in res.criterion_scores
        assert res.criterion_scores["safety_compliance"].max_score == 15.0

        total_max = sum(c.max_score for c in res.criterion_scores.values())
        assert total_max == 100.0

    def test_reference_free_evaluation_no_ground_truth_leakage(self):
        """Judge prompt must strictly contain facts and candidate text, never Golden answers."""
        mock_provider = MockJudgeProvider()
        judge = ContentLLMJudge(provider=mock_provider)

        facts = [FactItem(fact_id="f01", text="Tòa nhà phủ sóng 5G.")]
        pack = {
            "caption": "Tòa nhà phủ sóng 5G hiện đại.",
            "cta": "Liên hệ ngay",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        judge.evaluate_social_pack(social_pack=pack)

        assert len(mock_provider.call_history) == 1
        prompt_sent = mock_provider.call_history[0]["prompt"]

        # Ensure ground truth keywords are absent from prompt
        assert "ground_truth" not in prompt_sent.lower()
        assert "golden_set" not in prompt_sent.lower()
        assert "đáp án vàng" not in prompt_sent.lower()
        assert "DANH SÁCH FACTS NGUỒN CỐT LÕI:" in prompt_sent


# ==============================================================================
# 2. HARD-FAILURE ISOLATION TESTS
# ==============================================================================

class TestHardFailureIsolation:
    """Verifies that invented numbers/prices immediately fail regardless of LLM Judge score."""

    def test_invented_price_fails_despite_high_llm_score(self):
        # Mock provider returns high subjective score 96.0
        generous_result = {
            "overall_score": 96.0,
            "passed": True,
            "criterion_scores": {
                "fact_attribution": {"name": "Fact Attribution", "score": 28.0, "max_score": 30.0, "rationale": "OK"},
                "brand_voice": {"name": "Brand Voice", "score": 20.0, "max_score": 20.0, "rationale": "OK"},
                "channel_suitability": {"name": "Channel", "score": 19.0, "max_score": 20.0, "rationale": "OK"},
                "clarity_engagement": {"name": "Clarity", "score": 15.0, "max_score": 15.0, "rationale": "OK"},
                "safety_compliance": {"name": "Safety", "score": 14.0, "max_score": 15.0, "rationale": "OK"},
            },
            "violations": [],
            "feedback_for_reflection": "Tuyệt vời",
            "judge_model": "gemini-1.5-pro-002",
        }

        provider = MockJudgeProvider(forced_result=generous_result)
        judge = ContentLLMJudge(provider=provider)

        # Facts contain NO price
        facts = [FactItem(fact_id="f01", text="Căn hộ studio cách biển Mỹ Khê 200m.")]

        # Caption contains hallucinated price '500k'
        pack = {
            "caption": "Căn hộ studio cách biển Mỹ Khê 200m với giá cực sốc chỉ 500k một đêm.",
            "cta": "Đặt ngay",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        outcome = judge.evaluate_social_pack(social_pack=pack)

        # Hard failure MUST override generous LLM score
        assert outcome.overall_score == 96.0
        assert outcome.hard_violations_detected is True
        assert outcome.passed is False
        assert any("Hard Rule: Price Claim" in v.criteria for v in outcome.violations)
        assert "[HARD FAILURE DETECTED]" in outcome.feedback_for_reflection

    def test_unsupported_promo_superlative_fails_hard_rule(self):
        generous_result = {
            "overall_score": 95.0,
            "passed": True,
            "criterion_scores": {
                "fact_attribution": {"name": "Fact Attribution", "score": 30.0, "max_score": 30.0, "rationale": "OK"},
                "brand_voice": {"name": "Brand Voice", "score": 20.0, "max_score": 20.0, "rationale": "OK"},
                "channel_suitability": {"name": "Channel", "score": 18.0, "max_score": 20.0, "rationale": "OK"},
                "clarity_engagement": {"name": "Clarity", "score": 14.0, "max_score": 15.0, "rationale": "OK"},
                "safety_compliance": {"name": "Safety", "score": 13.0, "max_score": 15.0, "rationale": "OK"},
            },
            "violations": [],
            "feedback_for_reflection": "Tốt",
            "judge_model": "gemini-1.5-pro-002",
        }

        judge = ContentLLMJudge(provider=MockJudgeProvider(forced_result=generous_result))
        facts = [FactItem(fact_id="f01", text="Căn hộ studio hướng biển.")]

        # Contains unverified superlative 'tốt nhất Đà Nẵng' and unbacked promo 'tặng free'
        pack = {
            "caption": "Căn hộ studio hướng biển tốt nhất Đà Nẵng, tặng free 1 đêm nghỉ dưỡng.",
            "cta": "Liên hệ ngay",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        outcome = judge.evaluate_social_pack(social_pack=pack)
        assert outcome.hard_violations_detected is True
        assert outcome.passed is False
        assert any("Hard Rule: Unsupported Promo Claim" in v.criteria for v in outcome.violations)


# ==============================================================================
# 3. STATISTICAL CALIBRATION MATH (COHEN'S KAPPA & SPEARMAN RANK)
# ==============================================================================

class TestStatisticalCalibrationMath:
    """Verifies mathematical correctness of Cohen's Kappa and Spearman Correlation."""

    def test_cohen_kappa_perfect_agreement(self):
        rater_a = [True, True, False, False, True, True, False, True]
        rater_b = [True, True, False, False, True, True, False, True]
        kappa = compute_cohen_kappa(rater_a, rater_b)
        assert kappa == 1.0

    def test_cohen_kappa_high_agreement(self):
        # 9 agreements out of 10
        rater_a = [1, 1, 1, 0, 1, 0, 1, 1, 0, 1]
        rater_b = [1, 1, 1, 0, 1, 0, 1, 1, 1, 1]
        kappa = compute_cohen_kappa(rater_a, rater_b)
        assert kappa >= 0.70  # Substantial agreement

    def test_cohen_kappa_random_chance_near_zero(self):
        rater_a = [1, 0, 1, 0, 1, 0, 1, 0]
        rater_b = [0, 1, 0, 1, 0, 1, 0, 1]
        kappa = compute_cohen_kappa(rater_a, rater_b)
        assert kappa <= 0.0

    def test_spearman_perfect_monotonic_correlation(self):
        scores_a = [60.0, 70.0, 80.0, 90.0, 95.0]
        scores_b = [10.0, 20.0, 30.0, 40.0, 50.0]
        rho = compute_spearman_correlation(scores_a, scores_b)
        assert rho == 1.0

    def test_spearman_perfect_inverse_correlation(self):
        scores_a = [10.0, 20.0, 30.0, 40.0]
        scores_b = [40.0, 30.0, 20.0, 10.0]
        rho = compute_spearman_correlation(scores_a, scores_b)
        assert rho == -1.0

    def test_confusion_matrix_accuracy(self):
        human = [True, True, False, False]
        judge = [True, False, False, True]
        cm = compute_confusion_matrix(human, judge)
        assert cm["true_positives"] == 1
        assert cm["false_negatives"] == 1
        assert cm["true_negatives"] == 1
        assert cm["false_positives"] == 1
        assert cm["accuracy"] == 0.5

    def test_full_calibration_analysis_report(self):
        human_v = [True] * 9 + [False]
        judge_v = [True] * 9 + [False]
        human_s = [90.0, 92.0, 91.0, 95.0, 88.0, 93.0, 94.0, 89.0, 96.0, 60.0]
        judge_s = [89.0, 91.0, 90.0, 94.0, 89.0, 92.0, 93.0, 90.0, 95.0, 62.0]

        report = run_calibration_analysis(
            human_verdicts=human_v,
            judge_verdicts=judge_v,
            human_scores=human_s,
            judge_scores=judge_s,
        )

        assert report.total_samples == 10
        assert report.cohen_kappa == 1.0
        assert report.spearman_rho >= 0.90
        assert report.target_kappa_met is True


# ==============================================================================
# 4. DIAGNOSTIC BIAS TESTS (LENGTH & POSITION / ORDER BIAS)
# ==============================================================================

class TestJudgeBiases:
    """Evaluates that the Judge does not exhibit systematic Length Bias or Position Bias."""

    def test_length_bias_artificial_fluff_does_not_inflate_score(self):
        """Artificially elongating a caption with wordy fluff should not boost score."""
        judge = ContentLLMJudge()
        facts = [FactItem(fact_id="f01", text="Căn hộ studio cách biển Mỹ Khê 200m.")]

        # Concise version (80 words)
        concise_pack = {
            "caption": (
                "Khám phá không gian sống tiện nghi tại Đà Nẵng.\n"
                "Căn hộ studio cách biển Mỹ Khê 200m là lựa chọn hoàn hảo cho bạn.\n"
                "Liên hệ ngay hôm nay."
            ),
            "cta": "Liên hệ ngay",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        # Fluffy redundant version (250 words repeating phrases with fluff)
        fluffy_pack = {
            "caption": (
                "Khám phá không gian sống tiện nghi tại Đà Nẵng.\n"
                "Căn hộ studio cách biển Mỹ Khê 200m là lựa chọn hoàn hảo cho bạn.\n"
                "Chúng tôi xin trân trọng giới thiệu rằng căn hộ này thực sự vô cùng tuyệt vời và lý tưởng.\n"
                "Như đã đề cập ở trên, căn hộ này cách biển Mỹ Khê 200m một cách rất thuận tiện.\n"
                "Rất mong nhận được sự ủng hộ của quý khách hàng thân thiết.\n"
                "Liên hệ ngay hôm nay."
            ),
            "cta": "Liên hệ ngay",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        res_concise = judge.evaluate_social_pack(concise_pack)
        res_fluffy = judge.evaluate_social_pack(fluffy_pack)

        # Fluffy verbose version should not have higher clarity/engagement score
        assert (
            res_fluffy.criterion_scores["clarity_engagement"].score
            <= res_concise.criterion_scores["clarity_engagement"].score
        )

    def test_position_order_bias_sentence_permutation_invariance(self):
        """Permuting factual sentences should yield stable, invariant overall scores."""
        judge = ContentLLMJudge()
        facts = [
            FactItem(fact_id="f01", text="Căn hộ studio có ban công rộng."),
            FactItem(fact_id="f02", text="Toà nhà trang bị hệ thống lọc nước sạch."),
        ]

        # Order 1: Fact 1 then Fact 2
        order_1 = {
            "caption": (
                "Chào đón bạn đến với kỳ nghỉ dưỡng tuyệt vời.\n"
                "Căn hộ studio có ban công rộng thoáng mát.\n"
                "Toà nhà trang bị hệ thống lọc nước sạch.\n"
                "Đặt lịch ghé thăm ngay."
            ),
            "cta": "Đặt lịch",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        # Order 2: Fact 2 then Fact 1
        order_2 = {
            "caption": (
                "Chào đón bạn đến với kỳ nghỉ dưỡng tuyệt vời.\n"
                "Toà nhà trang bị hệ thống lọc nước sạch.\n"
                "Căn hộ studio có ban công rộng thoáng mát.\n"
                "Đặt lịch ghé thăm ngay."
            ),
            "cta": "Đặt lịch",
            "channels": ["facebook"],
            "extracted_facts": facts,
        }

        res_1 = judge.evaluate_social_pack(order_1)
        res_2 = judge.evaluate_social_pack(order_2)

        # Score discrepancy between sentence orders must be within <= 1.0 point
        score_diff = abs(res_1.overall_score - res_2.overall_score)
        assert score_diff <= 1.0
        assert res_1.passed == res_2.passed
