#!/usr/bin/env python3
"""Weekly Content Sample Audit CLI Script (CM-31).

Samples 10% of published posts from the previous 7 days (minimum 5 samples)
and re-verifies them through Deterministic Guardrails (CM-13) and
Sentence-Fact Mapper / NLI Entailment (CM-08).

Outputs audit summary to console and persists JSON + Markdown reports in reports/.
"""

import argparse
import glob
import json
import logging
import sys
import time
from pathlib import Path

# Add services/ai to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
AI_DIR = ROOT_DIR / "services" / "ai"
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

# Safe UTF-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from src.agents.content.audit_service import ContentSampleAuditor, AuditReportSummary
from src.agents.content.social_pack_v2 import SocialPack as SocialPackV2

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("weekly_audit")


def load_published_posts(input_path: str | None = None) -> list[dict]:
    """Loads published posts from file or gathers default seed samples."""
    posts: list[dict] = []

    if input_path:
        path = Path(input_path)
        if not path.exists():
            logger.error("Input file not found: %s", input_path)
            sys.exit(1)

        if path.suffix == ".jsonl":
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        posts.append(json.loads(line))
        else:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    posts = data
                elif isinstance(data, dict):
                    posts = data.get("published_posts", [data])
        return posts

    # Default fallback: gather from golden samples or synthetic published posts
    golden_files = list(glob.glob(str(ROOT_DIR / "data" / "golden" / "dev" / "*.json"))) + list(
        glob.glob(str(ROOT_DIR / "data" / "golden" / "test" / "*.json"))
    )

    for g_path in golden_files:
        if "seed_drafts.json" in g_path:
            continue
        try:
            with open(g_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    continue
                sample_id = data.get("sample_id") or data.get("golden_sample_id") or Path(g_path).stem
                src_art = data.get("source_article", {})
                facts = src_art.get("extracted_facts") or src_art.get("facts") or data.get("extracted_facts", [])
                draft = data.get("draft_pack") or data.get("ground_truth_social_pack") or data
                caption = draft.get("caption", "") if isinstance(draft, dict) else ""
                channel = data.get("target_channel") or (draft.get("channel") if isinstance(draft, dict) else "facebook") or "facebook"
                cta_target = "https://tripc.vn"
                sent_map = draft.get("sentence_fact_map") or data.get("sentence_fact_map") or [] if isinstance(draft, dict) else []
                if caption and facts:
                    post = {
                        "pack_id": f"sp_audit_{sample_id}",
                        "workspace_id": str(data.get("workspace_id", "ws_tripc_danang")),
                        "channels": [channel],
                        "caption": caption,
                        "extracted_facts": facts,
                        "sentence_fact_map": sent_map,
                        "cta": {"type": "contact_us", "target_url": cta_target},
                        "status": "approved",
                        "published_at": time.strftime("%Y-%m-%d"),
                    }
                    posts.append(post)
        except Exception as exc:
            logger.warning("Could not load sample %s: %s", g_path, exc)

    logger.info("Loaded %d published posts for audit (from seed/golden repository).", len(posts))
    return posts


def main():
    parser = argparse.ArgumentParser(description="Run weekly 10% content sample audit (CM-31)")
    parser.add_argument("--input", type=str, default=None, help="Path to JSON or JSONL file with published posts")
    parser.add_argument("--sample-rate", type=float, default=0.10, help="Audit sample rate (default: 0.10 = 10%%)")
    parser.add_argument("--min-samples", type=int, default=5, help="Minimum sample count (default: 5)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic sampling (default: 42)")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory for reports (default: reports/)")
    parser.add_argument("--fail-on-violation", action="store_true", help="Exit code 1 if any violation is found")

    args = parser.parse_args()

    posts = load_published_posts(args.input)
    if not posts:
        logger.error("No published posts found to audit.")
        sys.exit(1)

    auditor = ContentSampleAuditor(
        sample_rate=args.sample_rate,
        min_samples=args.min_samples,
        seed=args.seed,
    )

    logger.info(
        "Starting weekly audit with %d total posts (sample rate: %.1f%%, min: %d)...",
        len(posts),
        args.sample_rate * 100.0,
        args.min_samples,
    )

    report = auditor.run_weekly_audit(published_posts=posts, period_days=7)

    out_dir = Path(args.output_dir) if args.output_dir else (ROOT_DIR / "reports")
    json_path, md_path = auditor.save_report(report, output_dir=out_dir)

    print("\n" + "=" * 70)
    print("  AI GROWTH OS — BÁO CÁO KIỂM TOÁN CHẤT LƯỢNG HẬU XUẤT BẢN (CM-31)")
    print("=" * 70)
    print(f"Mã kiểm toán:           {report.audit_id}")
    print(f"Thời gian:              {report.audit_date} (Kỳ: {report.period_start} -> {report.period_end})")
    print(f"Tổng bài xuất bản:      {report.total_published_in_period}")
    print(f"Tỷ lệ trích mẫu:        {report.sample_rate_percent}% ({report.sample_size} bài)")
    print(f"Số bài đạt chuẩn:       {report.passed_count}/{report.sample_size}")
    print(f"Số bài vi phạm:         {report.violation_count}")
    print(f"Tỷ lệ tuân thủ:         {report.compliance_rate_percent:.2f}%")
    print(f"Kết luận kiểm toán:     {'🟢 ' + report.status if report.status == 'AUDIT_PASSED' else '🚨 ' + report.status}")
    print("-" * 70)
    print(f"Báo cáo JSON:           {json_path}")
    print(f"Báo cáo Markdown:       {md_path}")
    print("=" * 70 + "\n")

    if args.fail_on_violation and report.violation_count > 0:
        logger.error("Audit failed: %d violations detected.", report.violation_count)
        sys.exit(1)


if __name__ == "__main__":
    main()
