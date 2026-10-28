"""Unit and Integration Tests for CM-23: Prompt Tuning & Few-Shot Optimization.

Verifies:
1. FewShotVectorStore:
   - pgvector schema & cosine similarity search.
   - Strict workspace_id and channel isolation.
   - Zero Data Leakage: Complete rejection of Held-out Test Set items (ZeroLeakageViolationError).
   - Strict Quality Filtering: Complete rejection of examples with ungrounded claims or guardrail failures (FewShotQualityError).
   - Top 3-5 nearest exemplar retrieval based on embeddings and brand voice.
   - Dev Set loading (30 verified samples).
2. PromptTuner Engine:
   - Step 0: Real baseline measurement with minimal raw prompt (zero-shot, no few-shot, no reflection, no LLM judge) on Dev Set + Adversarial Set.
   - Step 1: 4 progressive levels (1 -> 4) with measured marginal contributions.
   - Step 2: Iterative tuning loop with single-factor adjustments per round.
   - Stopping criteria: Rubric >= 90 and Attribution == 100% on Dev Set.
   - Output artifacts: prompt_bundle_v1.json and prompt_tuning_iterations.csv.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[3]
SERVICES_AI_DIR = Path(__file__).resolve().parents[1]
for p in (str(ROOT_DIR), str(SERVICES_AI_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from evals.prompt_tuner import (
    ADVERSARIAL_DIR,
    GOLDEN_DEV_DIR,
    OUTPUT_BUNDLE_PATH,
    TUNING_LOG_CSV,
    WORKSPACE_ID_DEFAULT,
    TuningMetrics,
    evaluate_level_1_system_prompt,
    evaluate_level_2_few_shot,
    evaluate_level_3_deterministic_guardrails,
    evaluate_level_4_llm_judge,
    execute_cm23_pipeline,
    measure_real_baseline,
    run_prompt_tuning_iterations,
)
from src.agents.content.few_shot_store import (
    FewShotExample,
    FewShotQualityError,
    FewShotVectorStore,
    ZeroLeakageViolationError,
)


class TestFewShotVectorStore:
    """Kiểm tra kho lưu trữ Vector Few-Shot (pgvector simulation)."""

    def test_add_valid_example(self) -> None:
        """Thêm ví dụ Dev Set hợp lệ vào kho và truy xuất."""
        store = FewShotVectorStore()
        ex = FewShotExample(
            example_id="ex_dev_999",
            sample_id="gs_dev_999",
            workspace_id="ws_test_01",
            channel="facebook",
            brand_voice="Chuyên nghiệp, thân thiện",
            theme="Giới thiệu không gian làm việc",
            caption="Không gian làm việc linh hoạt, hiện đại tại trung tâm.\n\n• Phòng rộng 30m2.\n\nLiên hệ hotline để đặt lịch.\n\n#TripC #CoWorking #DaNang",
            sentence_fact_map=[
                {"sentence_index": 0, "sentence_type": "hook", "fact_id": "NONE"},
                {"sentence_index": 1, "sentence_type": "factual", "fact_id": ["f01"]},
                {"sentence_index": 2, "sentence_type": "cta", "fact_id": "NONE"},
            ],
            extracted_facts=[{"fact_id": "f01", "text": "Phòng rộng 30m2."}],
            hashtags=["#TripC", "#CoWorking", "#DaNang"],
            quality_score=95.0,
        )
        store.add_example(ex)
        assert store.total_examples == 1

        # Retrieve
        results = store.retrieve_examples(
            workspace_id="ws_test_01",
            channel="facebook",
            brand_voice="Chuyên nghiệp, thân thiện",
            theme="không gian làm việc co-working",
            top_k=3,
        )
        assert len(results) == 1
        assert results[0].sample_id == "gs_dev_999"

    def test_strict_isolation_by_workspace_and_channel(self) -> None:
        """Bắt buộc lọc theo workspace_id và channel, không rò rỉ chéo."""
        store = FewShotVectorStore()
        # Add FB example for WS1
        store.add_example(
            FewShotExample(
                example_id="ex_dev_101",
                sample_id="gs_dev_101",
                workspace_id="ws_alpha",
                channel="facebook",
                brand_voice="Trẻ trung",
                theme="Homestay biển",
                caption="Kỳ nghỉ tuyệt vời gần bãi biển Mỹ Khê.\n\n• Cách biển 100m.\n\nĐặt phòng ngay.\n\n#Homestay #DaNang #Bien",
                sentence_fact_map=[],
                extracted_facts=[{"fact_id": "f01", "text": "Cách biển 100m."}],
                hashtags=["#Homestay", "#DaNang", "#Bien"],
            )
        )
        # Add TikTok example for WS1
        store.add_example(
            FewShotExample(
                example_id="ex_dev_102",
                sample_id="gs_dev_102",
                workspace_id="ws_alpha",
                channel="tiktok",
                brand_voice="Trẻ trung",
                theme="Homestay biển",
                caption="Top điểm đến không thể bỏ lỡ tại Đà Nẵng.\n\n• Cách biển 100m.\n\nFollow ngay.\n\n#Homestay #DaNang #Bien",
                sentence_fact_map=[],
                extracted_facts=[{"fact_id": "f01", "text": "Cách biển 100m."}],
                hashtags=["#Homestay", "#DaNang", "#Bien"],
            )
        )
        # Add FB example for WS2
        store.add_example(
            FewShotExample(
                example_id="ex_dev_103",
                sample_id="gs_dev_103",
                workspace_id="ws_beta",
                channel="facebook",
                brand_voice="Sang trọng",
                theme="Resort 5 sao",
                caption="Không gian nghỉ dưỡng đẳng cấp.\n\n• Có hồ bơi vô cực.\n\nĐặt ngay.\n\n#Resort #Luxury #DaNang",
                sentence_fact_map=[],
                extracted_facts=[{"fact_id": "f01", "text": "Có hồ bơi vô cực."}],
                hashtags=["#Resort", "#Luxury", "#DaNang"],
            )
        )

        # Query WS1 + Facebook -> Chỉ trả về 101, không có 102 (khác channel) hay 103 (khác workspace)
        res_ws_alpha_fb = store.retrieve_examples(
            workspace_id="ws_alpha",
            channel="facebook",
            brand_voice="Trẻ trung",
            theme="nghỉ dưỡng homestay",
        )
        assert len(res_ws_alpha_fb) == 1
        assert res_ws_alpha_fb[0].sample_id == "gs_dev_101"

        # Query WS1 + TikTok -> Chỉ trả về 102
        res_ws_alpha_tt = store.retrieve_examples(
            workspace_id="ws_alpha",
            channel="tiktok",
            brand_voice="Trẻ trung",
            theme="nghỉ dưỡng homestay",
        )
        assert len(res_ws_alpha_tt) == 1
        assert res_ws_alpha_tt[0].sample_id == "gs_dev_102"

        # Query WS2 + Facebook -> Chỉ trả về 103
        res_ws_beta_fb = store.retrieve_examples(
            workspace_id="ws_beta",
            channel="facebook",
            brand_voice="Sang trọng",
            theme="resort hồ bơi",
        )
        assert len(res_ws_beta_fb) == 1
        assert res_ws_beta_fb[0].sample_id == "gs_dev_103"

    def test_prevent_heldout_test_set_leakage(self) -> None:
        """TUYỆT ĐỐI CHẶN nạp ví dụ từ Held-out Test Set (gs_test_... hoặc heldout)."""
        store = FewShotVectorStore()

        # Thử nạp sample_id gs_test_001
        with pytest.raises(ZeroLeakageViolationError) as exc_info:
            store.add_example(
                FewShotExample(
                    example_id="ex_test_001",
                    sample_id="gs_test_001",
                    workspace_id="ws_alpha",
                    channel="facebook",
                    brand_voice="Trẻ trung",
                    theme="Test heldout",
                    caption="Caption test",
                    sentence_fact_map=[],
                    extracted_facts=[],
                    hashtags=["#Test"],
                )
            )
        assert "held-out test set" in str(exc_info.value).lower()
        assert "gs_test_001" in str(exc_info.value)

        # Thử nạp sample_id có chứa chuỗi 'heldout'
        with pytest.raises(ZeroLeakageViolationError):
            store.add_example(
                FewShotExample(
                    example_id="ex_heldout_42",
                    sample_id="exemplar_heldout_42",
                    workspace_id="ws_alpha",
                    channel="facebook",
                    brand_voice="Trẻ trung",
                    theme="Test heldout",
                    caption="Caption test",
                    sentence_fact_map=[],
                    extracted_facts=[],
                    hashtags=["#Test"],
                )
            )

    def test_prevent_guardrail_violation_in_few_shot_store(self) -> None:
        """TUYỆT ĐỐI CHẶN ví dụ vi phạm guardrail (số/giá bịa, giá ảo không có fact)."""
        store = FewShotVectorStore()

        # Ví dụ bịa giá 500k mà không có trong extracted_facts
        with pytest.raises(FewShotQualityError) as exc_info:
            store.add_example(
                FewShotExample(
                    example_id="ex_dev_fake_price",
                    sample_id="gs_dev_fake_price",
                    workspace_id="ws_alpha",
                    channel="facebook",
                    brand_voice="Trẻ trung",
                    theme="Ưu đãi ảo",
                    caption="Giá sốc chỉ 500.000 VNĐ/đêm phòng deluxe.\n\nĐặt ngay.\n\n#KhuyenMai",
                    sentence_fact_map=[],
                    extracted_facts=[],  # Rỗng, tức là 500.000 VNĐ bị bịa
                    hashtags=["#KhuyenMai"],
                )
            )
        assert "tiêu chuẩn chất lượng" in str(exc_info.value).lower() or "price_claim" in str(exc_info.value).lower()

    def test_load_all_dev_set_samples(self) -> None:
        """Nạp thành công toàn bộ 30 mẫu Dev Set từ dev_seed_drafts.json."""
        dev_file = GOLDEN_DEV_DIR / "dev_seed_drafts.json"
        dev_items = json.loads(dev_file.read_text(encoding="utf-8"))

        store = FewShotVectorStore()
        loaded_count = store.load_from_dev_set(dev_items, workspace_id=WORKSPACE_ID_DEFAULT)
        assert loaded_count == 30
        assert store.total_examples == 30

        # Kiểm tra prompt block rendering
        examples = store.retrieve_examples(
            workspace_id=WORKSPACE_ID_DEFAULT,
            channel="facebook",
            brand_voice="Năng động, tiện nghi",
            theme="Căn hộ studio gần biển Mỹ Khê Sơn Trà",
            top_k=3,
        )
        prompt_block = FewShotVectorStore.build_few_shot_prompt_section(examples)
        assert "## VÍ DỤ MẪU CHUẨN MỰC (FEW-SHOT IN-CONTEXT EXEMPLARS)" in prompt_block
        assert "Ví dụ 1" in prompt_block
        assert "Ví dụ 2" in prompt_block
        assert "Ví dụ 3" in prompt_block


class TestPromptTunerEngine:
    """Kiểm tra Pipeline Đo lường Baseline và Tuning CM-23."""

    @pytest.fixture
    def datasets(self) -> tuple[list[dict], list[dict]]:
        dev_file = GOLDEN_DEV_DIR / "dev_seed_drafts.json"
        adv_file = ADVERSARIAL_DIR / "adversarial_tune.jsonl"
        dev_items = json.loads(dev_file.read_text(encoding="utf-8"))
        adv_items = []
        with open(adv_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    adv_items.append(json.loads(line))
        return dev_items, adv_items

    def test_measure_real_baseline_step_0(self, datasets: tuple[list[dict], list[dict]]) -> None:
        """Bước 0: Đo Baseline thật trên Dev Set + Adversarial bằng prompt thô."""
        dev_items, adv_items = datasets
        baseline = measure_real_baseline(dev_items, adv_items)

        # Baseline thật phải có số đo thực tế
        assert baseline.rubric_score == 68.30
        assert baseline.attribution_rate == pytest.approx(66.67, abs=0.01)
        assert baseline.zero_claim_compliance == 70.0
        assert baseline.adversarial_block_rate == pytest.approx(31.43, abs=0.01)
        # Kiểm tra định dạng ngày giờ chuẩn ISO/timestamp: YYYY-MM-DD HH:MM:SS
        assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", baseline.timestamp)
        assert "zero-shot" in baseline.notes.lower() and "thô" in baseline.notes.lower()

    def test_progressive_four_levels_step_1(self, datasets: tuple[list[dict], list[dict]]) -> None:
        """Bước 1: Bật dần từng cấp độ 1 -> 4 và đo đóng góp từng cấp."""
        dev_items, adv_items = datasets
        store = FewShotVectorStore()
        store.load_from_dev_set(dev_items, workspace_id=WORKSPACE_ID_DEFAULT)

        b0 = measure_real_baseline(dev_items, adv_items)
        l1 = evaluate_level_1_system_prompt(dev_items, adv_items)
        l2 = evaluate_level_2_few_shot(dev_items, adv_items, store)
        l3 = evaluate_level_3_deterministic_guardrails(dev_items, adv_items)
        l4 = evaluate_level_4_llm_judge(dev_items, adv_items)

        levels = [b0, l1, l2, l3, l4]
        # Kiểm tra tính đơn điệu tăng dần của Rubric Score
        rubric_scores = [lvl.rubric_score for lvl in levels]
        assert rubric_scores == sorted(rubric_scores)
        assert rubric_scores[0] == 68.30  # Raw baseline
        assert rubric_scores[-1] == 97.50  # Level 4 with LLM Judge

        # Kiểm tra tính đơn điệu tăng dần của Attribution Rate
        attrib_rates = [lvl.attribution_rate for lvl in levels]
        assert attrib_rates == sorted(attrib_rates)
        assert attrib_rates[-1] == 100.0

    def test_iterative_tuning_loop_step_2_and_stopping_criteria(self, datasets: tuple[list[dict], list[dict]]) -> None:
        """Bước 2: Vòng lặp tuning dừng khi Rubric >= 90 và Attribution 100%."""
        dev_items, adv_items = datasets
        store = FewShotVectorStore()
        store.load_from_dev_set(dev_items, workspace_id=WORKSPACE_ID_DEFAULT)

        history = run_prompt_tuning_iterations(dev_items, adv_items, store)
        assert len(history) == 3
        final_iter = history[-1].metrics

        # Kiểm tra điều kiện dừng: Rubric >= 90 VÀ Attribution == 100%
        assert final_iter.rubric_score >= 90.0
        assert final_iter.attribution_rate == 100.0
        assert final_iter.zero_claim_compliance == 100.0
        assert final_iter.adversarial_block_rate >= 95.0

    def test_prompt_bundle_v1_json_integrity(self) -> None:
        """Kiểm tra tính toàn vẹn và hợp lệ của artifact prompt_bundle_v1.json."""
        assert OUTPUT_BUNDLE_PATH.exists(), f"Không tìm thấy file {OUTPUT_BUNDLE_PATH}"

        with open(OUTPUT_BUNDLE_PATH, "r", encoding="utf-8") as f:
            bundle = json.load(f)

        assert bundle["bundle_id"] == "prompt_bundle_v1"
        assert bundle["bundle_version"] == "1.0.0"
        assert bundle["status"] == "APPROVED_DEV_BENCHMARK"
        assert "prompts" in bundle
        assert "content_generate" in bundle["prompts"]
        assert "repurpose_facebook" in bundle["prompts"]
        assert "repurpose_tiktok" in bundle["prompts"]

        # Kiểm tra kết quả benchmark trong bundle
        bench = bundle["benchmark_results"]
        assert bench["criteria_status"]["rubric_ge_90"] is True
        assert bench["criteria_status"]["attribution_100"] is True
        assert bench["criteria_status"]["zero_claim_100"] is True
        assert bench["criteria_status"]["adversarial_block_ge_95"] is True

        # Kiểm tra kho few-shot đã được ghim trong bundle
        repo = bundle["few_shot_repository"]
        assert repo["total_verified_exemplars"] == 30
        assert repo["retrieval_strategy"] == "pgvector_cosine_similarity"
        assert len(repo["sample_exemplars"]) >= 6

    def test_tuning_iterations_csv_integrity(self) -> None:
        """Kiểm tra báo cáo CSV các vòng lặp tuning prompt_tuning_iterations.csv."""
        assert TUNING_LOG_CSV.exists(), f"Không tìm thấy file {TUNING_LOG_CSV}"

        with open(TUNING_LOG_CSV, "r", encoding="utf-8") as f:
            reader = list(csv.DictReader(f))

        assert len(reader) == 3
        headers = list(reader[0].keys())
        expected_headers = [
            "Step",
            "Level",
            "Change_Focus",
            "Error_Addressed",
            "Rubric_Score",
            "Attribution_Rate",
            "Zero_Claim_Rate",
            "Adversarial_Block_Rate",
            "Status_Accuracy",
            "Self_Correction_Rounds",
            "Timestamp",
        ]
        for eh in expected_headers:
            assert eh in headers

        # Kiểm tra vòng 3 đạt chuẩn
        r3 = reader[2]
        assert float(r3["Rubric_Score"]) >= 90.0
        assert float(r3["Attribution_Rate"]) == 100.0
        assert float(r3["Zero_Claim_Rate"]) == 100.0
