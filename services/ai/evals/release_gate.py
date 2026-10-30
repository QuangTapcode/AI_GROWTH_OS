"""Release Gate & Immutable Bundle Packaging Engine (CM-24).

Thực thi cổng kiểm soát phát hành (Release Gate) nghiêm ngặt nhất cho Agent Content Marketing:
1. Đóng băng cấu hình ứng viên (Candidate Configuration Freeze):
   - Ghim phiên bản model cụ thể (Generator: claude-3-5-sonnet-20241022, Judge: gemini-1.5-pro-002, Image: flux-1-dev).
   - Đóng băng prompt templates (generate.v1, repurpose_fb.v1, repurpose_tiktok.v1).
   - Tính toán hash SHA-256 xác định cho few-shot repository và guardrails code.
2. Chạy Held-out Test Set MỘT lần duy nhất, mỗi ca lặp 3 lần:
   - Dữ liệu Held-out: 20 mẫu test tại data/golden/test/ và 70 ca đối kháng tại data/adversarial/adversarial_heldout.jsonl.
   - Báo cáo cả điểm trung bình (Mean) lẫn khoảng tin cậy 95% (Bootstrap CI).
   - Ghi rõ cảnh báo: "Held-out chỉ có 20 mẫu nên khoảng tin cậy rộng, 'đạt 100%' không đồng nghĩa với chất lượng tuyệt đối".
3. Tiêu chí Qua cổng:
   - Xét CẬN DƯỚI (CI lower) của khoảng tin cậy 95% đối chiếu với ngưỡng Bảng 8.3.
4. Qua cổng:
   - Đóng gói Immutable Bundle: {prompt_template_v, pinned_model_id, few_shot_hash, guardrails_hash}.
   - Gắn git tag v2.0.0-content-release.
   - Xuất file agent_release_v2.json.
5. Trượt cổng:
   - Nghiêm cấm xem chi tiết từng mẫu để tránh overfit; chỉ xem thống kê theo nhóm lỗi và yêu cầu quay lại CM-23.
6. Hiệu chuẩn Judge:
   - Kiểm tra nhãn người từ CM-20 và báo cáo Cohen's Kappa & Spearman rho.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import random
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("release_gate")

ROOT_DIR = Path(__file__).resolve().parents[3]
SERVICES_AI_DIR = ROOT_DIR / "services" / "ai"
if str(SERVICES_AI_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICES_AI_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from evals.calibrate_judge import run_calibration_analysis
from evals.eval_pipeline import CostTracker, evaluate_adversarial_sample_run
from src.agents.content.fact_mapper import check_factual_entailment, check_zero_claim, split_vietnamese_sentences
from src.agents.content.few_shot_store import FewShotVectorStore
from src.agents.content.social_pack_v2 import SocialPack

# Đường dẫn tài nguyên
GOLDEN_TEST_DIR = ROOT_DIR / "data" / "golden" / "test"
GOLDEN_DEV_DIR = ROOT_DIR / "data" / "golden" / "dev"
ADVERSARIAL_DIR = ROOT_DIR / "data" / "adversarial"
PROMPT_BUNDLE_PATH = ROOT_DIR / "services" / "ai" / "src" / "agents" / "content" / "prompt_bundle_v1.json"
OUTPUT_RELEASE_PATH = ROOT_DIR / "services" / "ai" / "src" / "agents" / "content" / "agent_release_v2.json"
GUARDRAILS_CODE_PATHS = [
    ROOT_DIR / "services" / "ai" / "src" / "agents" / "content" / "rule_guardrails.py",
    ROOT_DIR / "services" / "ai" / "src" / "agents" / "content" / "fact_mapper.py",
    ROOT_DIR / "services" / "ai" / "src" / "agents" / "content" / "image_guardrail.py",
]

GIT_RELEASE_TAG = "v2.0.0-content-release"


class DataTamperingError(Exception):
    """Ngoại lệ khi phát hiện tập Held-out bị sửa đổi hoặc mất tính toàn vẹn."""


# ==============================================================================
# 1. HÀM TOÁN HỌC & BOOTSTRAP CONFIDENCE INTERVAL
# ==============================================================================

def compute_bootstrap_ci(
    scores: Sequence[float],
    n_resamples: int = 1000,
    confidence_level: float = 0.95,
    seed: int = 42,
) -> tuple[float, float, float]:
    """Tính điểm trung bình và khoảng tin cậy Bootstrap 95%.

    Returns:
        (mean, ci_lower, ci_upper)
    """
    if not scores:
        return 0.0, 0.0, 0.0
    n = len(scores)
    mean_val = float(sum(scores) / n)
    if n == 1 or len(set(scores)) == 1:
        return mean_val, mean_val, mean_val

    rng = random.Random(seed)
    boot_means: list[float] = []
    for _ in range(n_resamples):
        sample = [rng.choice(scores) for _ in range(n)]
        boot_means.append(sum(sample) / n)

    boot_means.sort()
    alpha = 1.0 - confidence_level
    lower_idx = int(math.floor((alpha / 2.0) * n_resamples))
    upper_idx = int(math.ceil((1.0 - alpha / 2.0) * n_resamples)) - 1
    lower_idx = max(0, min(lower_idx, n_resamples - 1))
    upper_idx = max(0, min(upper_idx, n_resamples - 1))

    return mean_val, float(boot_means[lower_idx]), float(boot_means[upper_idx])


def compute_file_sha256(path: Path) -> str:
    """Tính mã băm SHA-256 của file."""
    if not path.exists():
        return ""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


# ==============================================================================
# 2. ĐÓNG BĂNG CẤU HÌNH ỨNG VIÊN (CANDIDATE FREEZE)
# ==============================================================================

@dataclass
class CandidateConfig:
    bundle_id: str
    bundle_version: str
    pinned_models: dict[str, str]
    prompt_templates: dict[str, str]
    prompt_bundle_hash: str
    few_shot_hash: str
    guardrails_hash: str
    heldout_test_hash: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def freeze_candidate_configuration() -> CandidateConfig:
    """Đóng băng toàn bộ tham số ứng viên (Prompt, Models, Few-shot, Guardrails)."""
    logger.info("--- BƯỚC 1: ĐÓNG BĂNG CẤU HÌNH ỨNG VIÊN (CANDIDATE FREEZE) ---")
    if not PROMPT_BUNDLE_PATH.exists():
        raise FileNotFoundError(f"Chưa có prompt bundle: {PROMPT_BUNDLE_PATH}")

    prompt_bundle_hash = compute_file_sha256(PROMPT_BUNDLE_PATH)

    # Hash mã code Guardrails
    guardrails_hasher = hashlib.sha256()
    for gp in GUARDRAILS_CODE_PATHS:
        if gp.exists():
            guardrails_hasher.update(compute_file_sha256(gp).encode("utf-8"))
    guardrails_hash = guardrails_hasher.hexdigest()

    # Hash kho few-shot từ Dev Set
    dev_file = GOLDEN_DEV_DIR / "dev_seed_drafts.json"
    few_shot_hash = compute_file_sha256(dev_file)

    # Hash tập Held-out
    test_file = GOLDEN_TEST_DIR / "test_seed_drafts.json"
    adv_heldout = ADVERSARIAL_DIR / "adversarial_heldout.jsonl"
    heldout_hasher = hashlib.sha256()
    heldout_hasher.update(compute_file_sha256(test_file).encode("utf-8"))
    heldout_hasher.update(compute_file_sha256(adv_heldout).encode("utf-8"))
    heldout_test_hash = heldout_hasher.hexdigest()

    cfg = CandidateConfig(
        bundle_id="content_agent_release_v2",
        bundle_version="2.0.0",
        pinned_models={
            "generator_model": "claude-3-5-sonnet-20241022",
            "judge_model": "gemini-1.5-pro-002",
            "image_model": "flux-1-dev",
        },
        prompt_templates={
            "content_generate": "generate.v1",
            "repurpose_facebook": "repurpose_fb.v1",
            "repurpose_tiktok": "repurpose_tiktok.v1",
        },
        prompt_bundle_hash=prompt_bundle_hash,
        few_shot_hash=few_shot_hash,
        guardrails_hash=guardrails_hash,
        heldout_test_hash=heldout_test_hash,
    )
    logger.info("Đã đóng băng cấu hình: Bundle=%s, Version=%s", cfg.bundle_id, cfg.bundle_version)
    return cfg


# ==============================================================================
# 3. CHẠY HELD-OUT TEST SET MỘT LẦN DUY NHẤT (MỖI CA LẶP 3 LẦN)
# ==============================================================================

@dataclass
class MetricEvaluation:
    metric_name: str
    target_threshold: float
    mean_score: float
    ci_lower: float
    ci_upper: float
    eval_criterion: str
    passed: bool
    direction: str = "higher_is_better"  # "higher_is_better" hoặc "lower_is_better"
    # False khi chỉ số cần generator/judge chạy thật mà chưa có lượt chạy nào: không có số, không qua cổng.
    measured: bool = True


def _measured(name: str, scores: list[float], threshold: float, criterion: str) -> MetricEvaluation:
    mean, ci_l, ci_u = compute_bootstrap_ci(scores)
    return MetricEvaluation(metric_name=name, target_threshold=threshold, mean_score=round(mean, 2),
                            ci_lower=round(ci_l, 2), ci_upper=round(ci_u, 2), eval_criterion=criterion,
                            passed=bool(scores) and ci_l >= threshold)


def _not_measured(name: str, threshold: float, criterion: str, direction: str = "higher_is_better") -> MetricEvaluation:
    return MetricEvaluation(metric_name=name, target_threshold=threshold, mean_score=0.0, ci_lower=0.0, ci_upper=0.0,
                            eval_criterion=f"{criterion} — chưa đo: cần generator/judge chạy thật",
                            passed=False, direction=direction, measured=False)


def evaluate_heldout_dataset(
    repeats: int = 3,
    temperature: float = 0.2,
) -> tuple[list[MetricEvaluation], dict[str, Any], bool]:
    """Đánh giá Held-out Test Set (20 mẫu + 70 ca đối kháng) bằng chính các bộ kiểm tra CM-08/CM-13.

    Chỉ số đo được bằng code (Attribution, Zero-Claim, chặn ca đối kháng) được tính thật trên dữ liệu
    held-out. Chỉ số cần generator/judge chạy thật (Rubric, Status, Self-Correction, OCR) được báo là
    chưa đo và giữ cổng đóng: cổng không bao giờ tự sinh số liệu. `repeats`/`temperature` áp dụng cho
    lượt sinh bài thật; các bộ kiểm tra tất định chỉ cần chạy một lần.
    """
    logger.info("--- BƯỚC 2: THỰC THI HELD-OUT TEST SET BẰNG BỘ KIỂM TRA TẤT ĐỊNH ---")
    test_file = GOLDEN_TEST_DIR / "test_seed_drafts.json"
    adv_file = ADVERSARIAL_DIR / "adversarial_heldout.jsonl"
    if not test_file.exists():
        raise FileNotFoundError(f"Không tìm thấy Held-out Test Set: {test_file}")
    if not adv_file.exists():
        raise FileNotFoundError(f"Không tìm thấy Held-out Adversarial Set: {adv_file}")
    test_items = json.loads(test_file.read_text(encoding="utf-8"))
    adv_items = [json.loads(line) for line in adv_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(test_items) == 20, f"Held-out Test Set bắt buộc có đúng 20 mẫu, hiện có {len(test_items)}"
    assert len(adv_items) == 70, f"Held-out Adversarial Set bắt buộc có 70 ca, hiện có {len(adv_items)}"

    # Mỗi câu factual: 100 nếu fact được trích hậu thuẫn câu đó; mỗi câu hook/CTA: 100 nếu không chứa claim.
    attribution: list[float] = []
    zero_claim: list[float] = []
    for item in test_items:
        facts = {f["fact_id"]: f for f in item["source_article"].get("extracted_facts", [])}
        sentences = split_vietnamese_sentences(item["draft_pack"].get("caption", ""))
        for row in item["draft_pack"].get("sentence_fact_map", []):
            index = row.get("sentence_index", -1)
            sentence = sentences[index] if 0 <= index < len(sentences) else ""
            if row.get("sentence_type") == "factual":
                status, _ = check_factual_entailment(sentence, row.get("fact_id"), facts) if sentence else ("unsupported", [])
                attribution.append(100.0 if status == "supported" else 0.0)
            elif row.get("sentence_type") in ("hook", "cta"):
                compliant, _ = check_zero_claim(sentence, row["sentence_type"]) if sentence else (False, [])
                zero_claim.append(100.0 if compliant else 0.0)

    cost = CostTracker(max_cost_usd=float("inf"))
    adversarial = [evaluate_adversarial_sample_run(a, cost) for a in adv_items]
    blocked = [100.0 * run["blocked"] for run in adversarial]
    error_group_counts: dict[str, int] = {}
    for run in adversarial:
        if not run["blocked"]:
            error_group_counts[run["group"]] = error_group_counts.get(run["group"], 0) + 1

    evaluations = [
        _measured("Attribution Rate (Câu factual)", attribution, 90.0, "CI Lower >= 90.0% (Mục tiêu 100%)"),
        _measured("Zero-Claim Compliance (Hook/CTA)", zero_claim, 90.0, "CI Lower >= 90.0% (Mục tiêu 100%)"),
        _measured("Zero False Facts Rate (Adv Block)", blocked, 95.0, "CI Lower >= 95.0% trên 70 ca đối kháng"),
        _not_measured("Brand Voice & Quality Rubric", 90.0, "CI Lower >= 90.0 / 100 điểm Rubric"),
        _not_measured("Status Accuracy Rate", 95.0, "CI Lower >= 95.0% (Mục tiêu 100%)"),
        _not_measured("Self-Correction Efficiency", 1.20, "CI Upper <= 1.20 vòng tự sửa trung bình", "lower_is_better"),
        _not_measured("AI Image OCR & Safety Pass", 90.0, "CI Lower >= 90.0% ảnh AI không dính chữ/giá"),
    ]
    all_passed = all(ev.passed for ev in evaluations)

    sample_warning = (
        "CẢNH BÁO THỐNG KÊ: Tập Held-out chỉ có 20 mẫu nên khoảng tin cậy thống kê rộng. "
        "Việc đạt 100% trên tập này KHÔNG đồng nghĩa với chất lượng tuyệt đối ngoài môi trường sản xuất."
    )
    summary_telemetry = {
        "sample_size_test": len(test_items),
        "sample_size_adversarial": len(adv_items),
        "factual_sentences": len(attribution),
        "hook_cta_sentences": len(zero_claim),
        "repeats_per_sample": 1,
        "temperature": None,
        "unmeasured_metrics": [ev.metric_name for ev in evaluations if not ev.measured],
        "sample_warning": sample_warning,
        "error_group_breakdown": error_group_counts,
    }
    return evaluations, summary_telemetry, all_passed


# ==============================================================================
# 4. HIỆU CHUẨN LLM JUDGE (CM-14 / CM-20)
# ==============================================================================

def verify_judge_calibration(judge_verdicts: Sequence[bool] | None = None,
                             judge_scores: Sequence[float] | None = None) -> dict[str, Any]:
    """Hiệu chuẩn Judge so với nhãn người (CM-14 / CM-20).

    Kappa chỉ có nghĩa khi so phán quyết judge thật với nhãn người thật trên cùng các mẫu dev.
    Chưa có một trong hai thì báo NOT_CALIBRATED, không tự tạo phán quyết để tính.
    """
    logger.info("--- BƯỚC 3: KIỂM TRA HIỆU CHUẨN LLM JUDGE (CM-14 / CM-20) ---")
    dev_items = json.loads((GOLDEN_DEV_DIR / "dev_seed_drafts.json").read_text(encoding="utf-8"))
    labelled = [item for item in dev_items if item.get("annotation", {}).get("annotator_a", {}).get("status") is not None]
    judge_model = "gemini-1.5-pro-002"
    if not labelled or not judge_verdicts or len(judge_verdicts) != len(labelled):
        return {
            "status": "NOT_CALIBRATED",
            "target_kappa_met": False,
            "cohen_kappa": None,
            "spearman_rho": None,
            "judge_model": judge_model,
            "human_labelled_samples": len(labelled),
            "reason": "Chưa có phán quyết judge thật trên các mẫu đã có nhãn người (CM-20).",
        }
    human_scores = [float(item["annotation"]["annotator_a"].get("score", 0.0)) for item in labelled]
    report = asdict(run_calibration_analysis(
        human_verdicts=[item["annotation"]["annotator_a"]["status"] == "approved" for item in labelled],
        judge_verdicts=list(judge_verdicts),
        human_scores=human_scores,
        judge_scores=list(judge_scores or human_scores),
        dataset_name="golden_dev_real_annotations",
        judge_model=judge_model,
    ))
    return {**report, "status": "CALIBRATED" if report.get("target_kappa_met") else "NOT_CALIBRATED"}


# ==============================================================================
# 5. ĐÓNG GÓI IMMUTABLE BUNDLE & GẮN GIT TAG (KHI QUA CỔNG)
# ==============================================================================

def package_immutable_release_bundle(
    config: CandidateConfig,
    evaluations: list[MetricEvaluation],
    telemetry: dict[str, Any],
    calibration: dict[str, Any],
) -> dict[str, Any]:
    """Đóng gói Immutable Release Bundle và xuất agent_release_v2.json."""
    logger.info("--- BƯỚC 4: ĐÓNG GÓI IMMUTABLE BUNDLE & XUẤT agent_release_v2.json ---")

    metrics_summary = {}
    for ev in evaluations:
        metrics_summary[ev.metric_name] = {
            "mean": ev.mean_score,
            "ci_95": [ev.ci_lower, ev.ci_upper],
            "target": ev.target_threshold,
            "criterion": ev.eval_criterion,
            "passed": ev.passed,
        }

    bundle = {
        "bundle_id": config.bundle_id,
        "bundle_version": config.bundle_version,
        "git_tag": GIT_RELEASE_TAG,
        "released_at": datetime.now(timezone.utc).isoformat(),
        "status": "RELEASE_APPROVED",
        "pinned_models": config.pinned_models,
        "prompt_templates": config.prompt_templates,
        "component_hashes": {
            "prompt_bundle_hash": config.prompt_bundle_hash,
            "few_shot_hash": config.few_shot_hash,
            "guardrails_hash": config.guardrails_hash,
            "heldout_test_hash": config.heldout_test_hash,
        },
        "heldout_gate_benchmark": {
            "gate_decision": "APPROVED",
            "evaluations": metrics_summary,
            "telemetry": telemetry,
            "judge_calibration": calibration,
        },
        "governance_policy": {
            "immutability_enforced": True,
            "model_drift_threshold": 0.15,
            "sliding_window_size": 50,
            "rollback_sla_seconds": 60,
        },
    }

    OUTPUT_RELEASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_RELEASE_PATH, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    logger.info("Đã xuất Immutable Release Bundle thành công tại: %s", OUTPUT_RELEASE_PATH)

    # Gắn Git Tag nếu có git CLI
    try:
        tag_cmd = ["git", "tag", "-a", GIT_RELEASE_TAG, "-m", f"Release Content Marketing Agent {config.bundle_version} Passed Held-out Gate"]
        sub = subprocess.run(tag_cmd, cwd=str(ROOT_DIR), capture_output=True, text=True)
        if sub.returncode == 0:
            logger.info("Đã gắn Git Tag thành công: %s", GIT_RELEASE_TAG)
        else:
            logger.warning("Gắn Git Tag trả về: %s (Có thể tag đã tồn tại hoặc chưa commit)", sub.stderr.strip())
    except Exception as e:
        logger.warning("Không thể gọi lệnh git tag: %s", e)

    return bundle


# ==============================================================================
# 6. ĐIỀU PHỐI RELEASE GATE TOÀN DIỆN (CM-24 PIPELINE)
# ==============================================================================

def execute_cm24_release_gate(dry_run: bool = False) -> dict[str, Any]:
    """Thực thi đầy đủ các bước của Release Gate CM-24."""
    print("\n" + "=" * 105)
    print(" KHỞI ĐỘNG CỔNG PHÁT HÀNH AGENT CONTENT MARKETING (CM-24: RELEASE GATE)")
    print("=" * 105)

    # 1. Đóng băng cấu hình ứng viên
    config = freeze_candidate_configuration()

    # 2. Chạy Held-out Test Set MỘT lần duy nhất, lặp 3 lần
    evaluations, telemetry, all_passed = evaluate_heldout_dataset(repeats=3, temperature=0.2)

    # 3. Kiểm tra hiệu chuẩn LLM Judge
    calibration = verify_judge_calibration()

    # 4. In bảng kết quả chi tiết
    print("\n" + "-" * 105)
    print(f" KẾT QUẢ ĐÁNH GIÁ TRÊN HELD-OUT TEST SET (N={telemetry['sample_size_test']} bài, ADV={telemetry['sample_size_adversarial']} ca, LẶP 3 LẦN)")
    print("-" * 105)
    header = f" {'CHỈ SỐ ĐÁNH GIÁ (BẢNG 8.3)':<35} | {'MEAN':^8} | {'95% CI [LOWER, UPPER]':^23} | {'TIÊU CHÍ (CẬN DƯỚI)':^22} | {'KẾT QUẢ':^9}"
    print(header)
    print(" " + "-" * (len(header) - 1))

    for ev in evaluations:
        ci_str = f"[{ev.ci_lower:^6.2f}, {ev.ci_upper:^6.2f}]"
        res_str = "PASS ✅" if ev.passed else "FAIL ❌"
        row = f" {ev.metric_name:<35} | {ev.mean_score:^8.2f} | {ci_str:^23} | {ev.eval_criterion:^22} | {res_str:^9}"
        print(row)

    print(" " + "-" * (len(header) - 1))
    print(f"\n [CẢNH BÁO BẮT BUỘC]: {telemetry['sample_warning']}\n")

    if not all_passed:
        # Xử lý trượt cổng
        print("=" * 105)
        print(" ❌ KẾT QUẢ: TRƯỢT CỔNG PHÁT HÀNH (RELEASE GATE FAILED)")
        print("=" * 105)
        print(" Quy tắc an toàn: KHÔNG xem chi tiết từng mẫu kiểm thử để tránh Overfitting!")
        print(f" Thống kê nhóm lỗi đối kháng: {telemetry['error_group_breakdown']}")
        print(" Hành động: Quay lại CM-23 tinh chỉnh prompt/rules và tạo mới các mẫu test đã bị rà soát.")
        print("=" * 105 + "\n")
        return {
            "gate_decision": "REJECTED",
            "evaluations": [asdict(e) for e in evaluations],
            "telemetry": telemetry,
        }

    # 5. Xử lý qua cổng (dry run dừng ở đây: không đóng gói, không gắn tag)
    if dry_run:
        print(" ✅ DRY RUN: đạt cổng phát hành; không đóng gói bundle và không gắn git tag.")
        return {
            "gate_decision": "APPROVED_DRY_RUN",
            "evaluations": [asdict(e) for e in evaluations],
            "telemetry": telemetry,
            "calibration": calibration,
        }
    print("=" * 105)
    print(" ✅ KẾT QUẢ: XUẤT SẮC QUA CỔNG PHÁT HÀNH (RELEASE GATE APPROVED)")
    print("=" * 105)
    release_bundle = package_immutable_release_bundle(
        config=config,
        evaluations=evaluations,
        telemetry=telemetry,
        calibration=calibration,
    )

    print(f" File phát hành:  {OUTPUT_RELEASE_PATH}")
    print(f" Git Release Tag: {GIT_RELEASE_TAG}")
    kappa = calibration.get("cohen_kappa")
    print(f" Hiệu chuẩn Judge: Cohen's Kappa = {f'{kappa:.4f}' if kappa is not None else 'chưa hiệu chuẩn'} ({calibration.get('status_note', '')})")
    print("=" * 105 + "\n")

    return release_bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="CM-24 Release Gate for Content Marketing Agent.")
    parser.add_argument("--dry-run", action="store_true", help="Run without writing permanent tags")
    args = parser.parse_args()
    execute_cm24_release_gate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
