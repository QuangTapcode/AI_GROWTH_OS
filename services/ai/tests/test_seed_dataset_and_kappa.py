import json
import sys
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scripts.compute_kappa import (
    calculate_cohen_kappa,
    build_confusion_matrix,
    evaluate_dataset_annotations,
    generate_demo_simulation_data,
)


class TestAnnotationGuideAndProtectionRules:
    """Kiểm tra tài liệu hướng dẫn gán nhãn CM-19 và cơ chế bảo vệ Held-out Test Set."""

    def test_annotation_guide_document_exists_and_complete(self):
        guide_file = ROOT_DIR / "docs" / "content-marketing" / "annotation_guide.md"
        assert guide_file.exists(), f"Không tìm thấy file: {guide_file}"
        content = guide_file.read_text(encoding="utf-8")

        # Kiểm tra các phần cốt lõi bắt buộc
        assert "factual" in content
        assert "hook" in content
        assert "cta" in content
        assert "Zero-Claim" in content
        assert "Cohen's Kappa" in content or "Cohen" in content
        assert "0.85" in content

        # Kiểm tra bảng 8 loại lỗi
        for err_code in ["ERR_01", "ERR_02", "ERR_03", "ERR_04", "ERR_05", "ERR_06", "ERR_07", "ERR_08"]:
            assert err_code in content, f"Thiếu mã lỗi {err_code} trong bảng phân loại lỗi"

    def test_held_out_test_set_protection_rules(self):
        """Thư mục data/golden/test phải có CODEOWNERS và ghi chú cấm AI dùng khi tune."""
        test_dir = ROOT_DIR / "data" / "golden" / "test"
        assert test_dir.exists()

        codeowners_file = test_dir / "CODEOWNERS"
        assert codeowners_file.exists(), "Thiếu file CODEOWNERS trong data/golden/test"
        codeowners_content = codeowners_file.read_text(encoding="utf-8")
        assert "@content-lead" in codeowners_content or "CODEOWNERS" in codeowners_content

        readme_file = test_dir / "README.md"
        assert readme_file.exists(), "Thiếu file README.md trong data/golden/test"
        readme_content = readme_file.read_text(encoding="utf-8")
        assert "CHỈ-ĐỌC" in readme_content or "READ-ONLY" in readme_content
        assert "CẤM" in readme_content


class TestSeedDraftsGeneration:
    """Kiểm tra 50 bản nháp Seed Golden Set (30 dev, 20 test)."""

    def test_dev_seed_drafts_count_and_structure(self):
        dev_dir = ROOT_DIR / "data" / "golden" / "dev"
        assert dev_dir.exists()

        # Kiểm tra file gộp
        dev_all_file = dev_dir / "dev_seed_drafts.json"
        assert dev_all_file.exists()
        with open(dev_all_file, "r", encoding="utf-8") as f:
            dev_items = json.load(f)

        assert len(dev_items) == 30, f"Dev Set phải có chính xác 30 mẫu, hiện có: {len(dev_items)}"

        # Kiểm tra cấu trúc từng mẫu
        for idx, item in enumerate(dev_items, 1):
            assert item["sample_id"] == f"gs_dev_{idx:03d}"
            assert item["dataset_split"] == "dev"
            assert item["target_channel"] in ["facebook", "tiktok"]
            assert "source_article" in item
            assert len(item["source_article"]["extracted_facts"]) >= 3
            assert "draft_pack" in item
            assert "caption" in item["draft_pack"]
            assert "annotation" in item
            assert "annotator_a" in item["annotation"]
            assert "annotator_b" in item["annotation"]

    def test_test_seed_drafts_count_and_structure(self):
        test_dir = ROOT_DIR / "data" / "golden" / "test"
        assert test_dir.exists()

        # Kiểm tra file gộp
        test_all_file = test_dir / "test_seed_drafts.json"
        assert test_all_file.exists()
        with open(test_all_file, "r", encoding="utf-8") as f:
            test_items = json.load(f)

        assert len(test_items) == 20, f"Test Set phải có chính xác 20 mẫu, hiện có: {len(test_items)}"

        for idx, item in enumerate(test_items, 1):
            assert item["sample_id"] == f"gs_test_{idx:03d}"
            assert item["dataset_split"] == "test"
            assert item["target_channel"] in ["facebook", "tiktok"]


class TestCohenKappaEngine:
    """Kiểm tra thuật toán đo lường độ đồng thuận Cohen's Kappa giữa 2 người gán nhãn."""

    def test_perfect_agreement(self):
        rater_a = ["PASS", "PASS", "FAIL", "FAIL", "PASS"]
        rater_b = ["PASS", "PASS", "FAIL", "FAIL", "PASS"]
        kappa, p_o, p_e = calculate_cohen_kappa(rater_a, rater_b)
        assert kappa == 1.0
        assert p_o == 1.0

    def test_complete_disagreement(self):
        rater_a = ["PASS", "PASS", "PASS"]
        rater_b = ["FAIL", "FAIL", "FAIL"]
        kappa, p_o, p_e = calculate_cohen_kappa(rater_a, rater_b)
        assert kappa <= 0.0
        assert p_o == 0.0

    def test_length_mismatch_raises_value_error(self):
        with pytest.raises(ValueError):
            calculate_cohen_kappa(["PASS"], ["PASS", "FAIL"])

    def test_confusion_matrix_construction(self):
        rater_a = ["PASS", "FAIL", "PASS"]
        rater_b = ["PASS", "PASS", "FAIL"]
        matrix = build_confusion_matrix(rater_a, rater_b)
        assert matrix["pass"]["pass"] == 1
        assert matrix["fail"]["pass"] == 1
        assert matrix["pass"]["fail"] == 1
        assert matrix["fail"]["fail"] == 0

    def test_evaluate_simulation_pass_meets_threshold(self):
        """Mô phỏng kịch bản chuẩn đạt Kappa >= 0.85."""
        pass_items = generate_demo_simulation_data(is_pass_scenario=True)
        res = evaluate_dataset_annotations(pass_items, threshold=0.85)
        assert res["is_passed"] is True
        assert res["cohen_kappa"] >= 0.85
        assert "ACCEPT" in res["decision"]
        assert res["conflicts_count"] == 2

    def test_evaluate_simulation_fail_requires_adjudication(self):
        """Mô phỏng kịch bản nhiều ca lệch, Kappa < 0.85, yêu cầu hòa giải."""
        fail_items = generate_demo_simulation_data(is_pass_scenario=False)
        res = evaluate_dataset_annotations(fail_items, threshold=0.85)
        assert res["is_passed"] is False
        assert res["cohen_kappa"] < 0.85
        assert "REJECT" in res["decision"]
        assert res["conflicts_count"] == 6
