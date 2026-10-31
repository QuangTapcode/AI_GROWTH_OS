"""Unit & Integration Tests for CM-24: Release Gate & Immutable Bundle Packaging.

Verifies:
1. Candidate Configuration Freeze:
   - Pinned models (Generator, Judge, Image) with specific version IDs.
   - Immutable hashes calculated for Prompt Bundle, Few-Shot store, and Guardrails code.
2. Held-out Evaluation:
   - Evaluated on Held-out Test Set (20 samples) + Held-out Adversarial Set (70 cases).
   - Exactly 3 repeats per sample, temperature = 0.2.
   - Bootstrap 95% Confidence Interval calculation (mean, ci_lower, ci_upper).
   - Mandatory sample size disclaimer ("20 samples, wide CI, 100% != absolute quality").
3. Gate Decision (Table 8.3 Criteria):
   - Strict pass threshold considering the lower bound (CI lower) of 95% CI.
   - All 7 metrics passed.
4. Packaging & Artifacts:
   - Immutable bundle agent_release_v2.json created.
   - Git tag v2.0.0-content-release exists and matches release version.
   - SocialPack contains bundle_id="content_agent_release_v2".
5. LLM Judge Calibration (CM-14 / CM-20):
   - Cohen's Kappa & Spearman rank correlation checked.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[3]
SERVICES_AI_DIR = Path(__file__).resolve().parents[1]
for p in (str(ROOT_DIR), str(SERVICES_AI_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from evals.release_gate import (
    GIT_RELEASE_TAG,
    OUTPUT_RELEASE_PATH,
    PROMPT_BUNDLE_PATH,
    compute_bootstrap_ci,
    evaluate_heldout_dataset,
    execute_cm24_release_gate,
    freeze_candidate_configuration,
    verify_judge_calibration,
)
from src.agents.content.bundle_manager import get_active_bundle_id
from src.agents.content.fb_repurposer import FacebookRepurposer
from src.agents.content.social_pack_v2 import CTAObject, FactItem, SocialPack
from src.agents.content.tiktok_repurposer import TikTokRepurposer


class TestReleaseGateCandidateFreeze:
    """Kiểm tra Đóng băng cấu hình ứng viên (Candidate Configuration Freeze)."""

    def test_freeze_candidate_configuration(self) -> None:
        """Đóng băng cấu hình ứng viên, ghim cứng model ID và tính SHA-256."""
        cfg = freeze_candidate_configuration()
        assert cfg.bundle_id == "content_agent_release_v2"
        assert cfg.bundle_version == "2.0.0"

        # Pinned models
        assert cfg.pinned_models["generator_model"] == "claude-3-5-sonnet-20241022"
        assert cfg.pinned_models["judge_model"] == "gemini-1.5-pro-002"
        assert cfg.pinned_models["image_model"] == "flux-1-dev"

        # Prompt templates
        assert cfg.prompt_templates["content_generate"] == "generate.v1"
        assert cfg.prompt_templates["repurpose_facebook"] == "repurpose_fb.v1"
        assert cfg.prompt_templates["repurpose_tiktok"] == "repurpose_tiktok.v1"

        # Hashes
        assert len(cfg.prompt_bundle_hash) == 64
        assert len(cfg.few_shot_hash) == 64
        assert len(cfg.guardrails_hash) == 64
        assert len(cfg.heldout_test_hash) == 64


class TestHeldoutEvaluationAndCriteria:
    """Kiểm tra chạy Held-out Test Set và đối chiếu ngưỡng Bảng 8.3."""

    def test_bootstrap_ci_calculation(self) -> None:
        """Kiểm tra tính toán Bootstrap 95% Confidence Interval."""
        # Test case xác định
        scores = [100.0] * 20
        mean, ci_l, ci_u = compute_bootstrap_ci(scores)
        assert mean == 100.0
        assert ci_l == 100.0
        assert ci_u == 100.0

        # Test case phân tán
        scores_var = [90.0, 92.0, 94.0, 95.0, 96.0, 98.0]
        mean_v, ci_l_v, ci_u_v = compute_bootstrap_ci(scores_var, seed=42)
        assert 90.0 <= ci_l_v <= mean_v <= ci_u_v <= 98.0

    def test_heldout_gate_measures_the_checks_and_never_invents_model_metrics(self) -> None:
        """Attribution, Zero-Claim and adversarial blocking are measured by the real checks on the
        held-out set; metrics that need a live generator/judge are reported as not measured and
        keep the gate closed."""
        evaluations, telemetry, all_passed = evaluate_heldout_dataset(repeats=3, temperature=0.2)

        assert telemetry["sample_size_test"] == 20
        assert telemetry["sample_size_adversarial"] == 70
        eval_map = {ev.metric_name: ev for ev in evaluations}
        assert len(eval_map) == 7
        for name in ("Attribution Rate (Câu factual)", "Zero-Claim Compliance (Hook/CTA)", "Zero False Facts Rate (Adv Block)"):
            assert eval_map[name].measured is True, name
            assert 0.0 <= eval_map[name].mean_score <= 100.0
        for name in ("Brand Voice & Quality Rubric", "Status Accuracy Rate", "Self-Correction Efficiency", "AI Image OCR & Safety Pass"):
            assert eval_map[name].measured is False, name
            assert eval_map[name].passed is False, name
        assert all_passed is False


class TestReleaseGateDecision:
    """The gate packages a release only from real measurements, and a dry run never writes one."""

    def test_gate_without_live_evaluation_is_rejected_and_writes_no_release(self, tmp_path, monkeypatch) -> None:
        import evals.release_gate as gate
        target = tmp_path / "agent_release_v2.json"
        monkeypatch.setattr(gate, "OUTPUT_RELEASE_PATH", target)
        result = gate.execute_cm24_release_gate()
        assert result["gate_decision"] == "REJECTED"
        assert not target.exists()

    def test_dry_run_of_a_passing_gate_writes_no_release(self, tmp_path, monkeypatch) -> None:
        import evals.release_gate as gate
        target = tmp_path / "agent_release_v2.json"
        monkeypatch.setattr(gate, "OUTPUT_RELEASE_PATH", target)
        evaluations, telemetry, _ = gate.evaluate_heldout_dataset()
        passing = [gate.MetricEvaluation(**{**gate.asdict(ev), "passed": True, "measured": True}) for ev in evaluations]
        monkeypatch.setattr(gate, "evaluate_heldout_dataset", lambda **_: (passing, telemetry, True))
        result = gate.execute_cm24_release_gate(dry_run=True)
        assert result["gate_decision"] == "APPROVED_DRY_RUN"
        assert not target.exists()


class TestImmutableBundleAndGovernance:
    """Kiểm tra đóng gói Immutable Bundle và quản trị phát hành."""

    def test_release_v2_built_on_simulated_evaluation_stays_blocked(self) -> None:
        """agent_release_v2.json came from a gate that simulated its held-out scores, so the record is
        kept as blocked evidence and is never the active bundle."""
        bundle = json.loads(OUTPUT_RELEASE_PATH.read_text(encoding="utf-8"))
        assert bundle["bundle_id"] == "content_agent_release_v2"
        assert bundle["status"] == "INVALID_BLOCKED_MOCK"
        assert bundle["heldout_gate_benchmark"]["gate_decision"] == "INVALID_BLOCKED"
        assert bundle["git_tag"] == "DELETED"
        assert get_active_bundle_id() != "content_agent_release_v2"

    def test_blocked_release_has_no_git_tag(self) -> None:
        """A blocked release must not be tagged in the repository."""
        res = subprocess.run(["git", "-c", "safe.directory=*", "tag", "-l", GIT_RELEASE_TAG],
                             cwd=str(ROOT_DIR), capture_output=True, text=True, stdin=subprocess.DEVNULL)
        assert res.returncode == 0, res.stderr
        assert GIT_RELEASE_TAG not in res.stdout

    def test_social_pack_schema_and_bundle_id(self) -> None:
        """Mỗi SocialPack phải có trường bundle_id trỏ về Immutable Bundle."""
        pack = SocialPack(
            pack_id="spk_release_check",
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_sample_01",
            parent_version=1,
            channels=["facebook"],
            caption="Khám phá căn hộ Studio TripC Da Nang cách biển Mỹ Khê 200m.\n\nĐặt phòng ngay.",
            cta=CTAObject(type="open_link", label="Đặt phòng ngay", target_url="https://tripc.vn"),
            bundle_id="content_agent_release_v2",
        )
        assert pack.bundle_id == "content_agent_release_v2"
        pack_dict = pack.model_dump()
        assert pack_dict["bundle_id"] == "content_agent_release_v2"

    def test_repurposers_assign_bundle_id(self) -> None:
        """Facebook và TikTok Repurposers gán bundle_id của bundle đang active vào SocialPack đầu ra."""
        fb_rep = FacebookRepurposer()
        facts = [
            FactItem(fact_id="f01", text="Căn hộ Studio TripC Da Nang cách biển Mỹ Khê 200m."),
            FactItem(fact_id="f02", text="Diện tích căn hộ 35m2 hướng biển."),
            FactItem(fact_id="f03", text="Nội thất trang bị điều hòa inverter và bếp từ."),
        ]
        pack_fb = fb_rep.repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_01",
            parent_version=1,
            title="Căn hộ Studio TripC Da Nang",
            facts=facts,
            verbatim_cta="Liên hệ TripC để đặt phòng.",
        )
        assert pack_fb.bundle_id == get_active_bundle_id() == "content_agent_release_v1"

        tt_rep = TikTokRepurposer()
        pack_tt = tt_rep.repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_01",
            parent_version=1,
            title="Căn hộ Studio TripC Da Nang",
            facts=facts,
            verbatim_cta="Theo dõi kênh TripC ngay hôm nay.",
        )
        assert pack_tt.bundle_id == get_active_bundle_id()


class TestJudgeCalibrationVerification:
    """Kiểm tra hiệu chuẩn LLM Judge (CM-14 / CM-20)."""

    def test_judge_is_not_reported_calibrated_without_real_judge_verdicts(self) -> None:
        """Kappa needs real judge verdicts next to human labels; none are recorded yet, so the
        judge is reported as not calibrated instead of scoring a copy of the human labels."""
        calib = verify_judge_calibration()
        assert calib["status"] == "NOT_CALIBRATED"
        assert calib["target_kappa_met"] is False
        assert calib["cohen_kappa"] is None
