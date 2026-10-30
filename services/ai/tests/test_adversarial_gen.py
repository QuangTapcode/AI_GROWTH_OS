"""Tests for CM-21 Synthetic Adversarial Generator (adversarial_gen.py).

Verifies:
1. Scale: Total cases >= 300 (actual: 350).
2. Group coverage: All 14 attack groups required by specification are covered.
3. Split ratio: Exactly 80% tune and 20% held-out at the template level.
4. Determinism: Running with seed=42 produces 100% identical cases and hashes.
5. Schema: Valid fields (input, attack_type, attack_vector, expected_outcome, guardrail_code).
6. Expected outcomes: Every case has expected_outcome in {chặn, sửa, needs_assets, insufficient_data}.
7. File integrity: JSONL exports and manifest match sha256 checksum and line counts.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[3]
SERVICES_AI_DIR = Path(__file__).resolve().parents[1]
for p in (str(ROOT_DIR), str(SERVICES_AI_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from services.ai.evals.adversarial_gen import (
        ATTACK_GROUPS_DEF,
        AdversarialCase,
        generate_adversarial_suite,
        export_adversarial_suite,
        SEED,
    )
except ImportError:
    from evals.adversarial_gen import (
        ATTACK_GROUPS_DEF,
        AdversarialCase,
        generate_adversarial_suite,
        export_adversarial_suite,
        SEED,
    )

DATA_ADVERSARIAL_DIR = ROOT_DIR / "data" / "adversarial"

REQUIRED_14_GROUPS = [
    "fake_price_vn",
    "fake_discount_percent",
    "hidden_promotions",
    "fabricated_statistics",
    "fake_testimonials",
    "superlatives_absolutes",
    "indirect_prompt_injection",
    "outdated_information",
    "insufficient_facts",
    "missing_real_assets",
    "version_or_hash_mismatch",
    "wrong_tenant",
    "unselected_channel",
    "violating_ai_image",
]

VALID_OUTCOMES = {"chặn", "sửa", "needs_assets", "insufficient_data"}


class TestAdversarialGenerator:
    """Test suite for adversarial test case generation."""

    def test_total_count_meets_or_exceeds_300(self) -> None:
        """Requirement: >= 300 cases."""
        cases = generate_adversarial_suite(seed=SEED)
        assert len(cases) >= 300
        assert len(cases) == 350

    def test_all_14_attack_groups_present(self) -> None:
        """Requirement: All 14 distinct attack groups must be covered."""
        cases = generate_adversarial_suite(seed=SEED)
        present_groups = {c.group for c in cases}
        for grp in REQUIRED_14_GROUPS:
            assert grp in present_groups, f"Missing attack group: {grp}"
        assert len(present_groups) == 14

    def test_template_level_80_20_split(self) -> None:
        """Requirement: 20% template mẫu giữ riêng làm tập held-out không cho agent thấy khi tune."""
        cases = generate_adversarial_suite(seed=SEED)
        tune_cases = [c for c in cases if c.split == "tune"]
        heldout_cases = [c for c in cases if c.split == "heldout"]

        assert len(tune_cases) == 280
        assert len(heldout_cases) == 70

        tune_pct = len(tune_cases) / len(cases)
        heldout_pct = len(heldout_cases) / len(cases)

        assert abs(tune_pct - 0.80) < 1e-4
        assert abs(heldout_pct - 0.20) < 1e-4

        # For every group: exactly 20 tune and 5 heldout
        for grp in REQUIRED_14_GROUPS:
            grp_tune = [c for c in tune_cases if c.group == grp]
            grp_heldout = [c for c in heldout_cases if c.group == grp]
            assert len(grp_tune) == 20, f"Group {grp} tune count mismatch"
            assert len(grp_heldout) == 5, f"Group {grp} heldout count mismatch"

    def test_seed_determinism_and_reproducibility(self) -> None:
        """Requirement: Fixed seed guarantees 100% exact reproduction across runs."""
        run1 = generate_adversarial_suite(seed=SEED)
        run2 = generate_adversarial_suite(seed=SEED)

        assert len(run1) == len(run2)
        for c1, c2 in zip(run1, run2):
            assert c1.case_id == c2.case_id
            assert c1.group == c2.group
            assert c1.attack_type == c2.attack_type
            assert c1.attack_vector == c2.attack_vector
            assert c1.expected_outcome == c2.expected_outcome
            assert c1.input == c2.input

    def test_schema_and_expected_outcomes(self) -> None:
        """Requirement: Each case records input, attack_type, expected_outcome."""
        cases = generate_adversarial_suite(seed=SEED)
        for c in cases:
            assert isinstance(c.case_id, str) and c.case_id.startswith("adv_")
            assert c.group in REQUIRED_14_GROUPS
            assert c.split in ("tune", "heldout")
            assert isinstance(c.input, dict)
            assert "workspace_id" in c.input
            assert "article_id" in c.input
            assert "adversarial_text" in c.input
            assert c.attack_type == c.group
            assert isinstance(c.attack_vector, str) and len(c.attack_vector) > 0
            assert c.expected_outcome in VALID_OUTCOMES
            assert isinstance(c.expected_guardrail_code, str) and len(c.expected_guardrail_code) > 0
            assert isinstance(c.explanation, str) and len(c.explanation) > 0

    def test_specific_outcome_distribution(self) -> None:
        """Verify semantic outcomes per specification:
        - insufficient_facts -> insufficient_data
        - missing_real_assets -> needs_assets
        - violation attacks -> chặn
        """
        cases = generate_adversarial_suite(seed=SEED)
        for c in cases:
            if c.group == "insufficient_facts":
                assert c.expected_outcome == "insufficient_data"
            elif c.group == "missing_real_assets":
                assert c.expected_outcome == "needs_assets"
            else:
                assert c.expected_outcome == "chặn"

    def test_export_files_and_manifest_integrity(self, tmp_path: Path) -> None:
        """Verify export to JSONL files and manifest calculation."""
        cases = generate_adversarial_suite(seed=SEED)
        manifest = export_adversarial_suite(cases, tmp_path)

        assert (tmp_path / "adversarial_all.jsonl").exists()
        assert (tmp_path / "adversarial_tune.jsonl").exists()
        assert (tmp_path / "adversarial_heldout.jsonl").exists()
        assert (tmp_path / "adversarial_manifest.json").exists()

        with open(tmp_path / "adversarial_all.jsonl", "r", encoding="utf-8") as f:
            all_lines = [json.loads(line) for line in f if line.strip()]
        with open(tmp_path / "adversarial_tune.jsonl", "r", encoding="utf-8") as f:
            tune_lines = [json.loads(line) for line in f if line.strip()]
        with open(tmp_path / "adversarial_heldout.jsonl", "r", encoding="utf-8") as f:
            heldout_lines = [json.loads(line) for line in f if line.strip()]

        assert len(all_lines) == 350
        assert len(tune_lines) == 280
        assert len(heldout_lines) == 70

        # Check sha256 matches
        hasher = hashlib.sha256()
        with open(tmp_path / "adversarial_all.jsonl", "rb") as f:
            hasher.update(f.read())
        assert hasher.hexdigest() == manifest["all_jsonl_sha256"]

    def test_committed_dataset_files_exist_and_valid(self) -> None:
        """Verify the files generated in data/adversarial match expectations."""
        assert DATA_ADVERSARIAL_DIR.exists()
        all_file = DATA_ADVERSARIAL_DIR / "adversarial_all.jsonl"
        tune_file = DATA_ADVERSARIAL_DIR / "adversarial_tune.jsonl"
        heldout_file = DATA_ADVERSARIAL_DIR / "adversarial_heldout.jsonl"
        manifest_file = DATA_ADVERSARIAL_DIR / "adversarial_manifest.json"

        assert all_file.exists()
        assert tune_file.exists()
        assert heldout_file.exists()
        assert manifest_file.exists()

        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        assert manifest["total_cases"] == 350
        assert manifest["total_tune_cases"] == 280
        assert manifest["total_heldout_cases"] == 70
        assert manifest["groups_count"] == 14
