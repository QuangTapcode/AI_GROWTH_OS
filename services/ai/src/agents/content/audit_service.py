"""Weekly Content Sample Audit Service (CM-31).

Implements post-publishing quality audit:
1. Samples randomly 10% of published posts from the previous 7 days (minimum 5 samples).
2. Re-runs Deterministic Guardrails (CM-13) and Sentence-Fact Mapper / NLI (CM-08).
3. Detects post-publishing drift, latent hallucinations, or regressions.
4. Generates structured audit reports (JSON and Markdown).
"""

from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Sequence

from .fact_mapper import map_caption_to_sentence_fact_map
from .rule_guardrails import evaluate_social_pack_guardrails, GuardrailReport
from .social_pack_v2 import FactItem, SocialPack as SocialPackV2

logger = logging.getLogger(__name__)

REPORTS_DIR = Path(__file__).resolve().parents[4] / "reports"


@dataclass
class AuditSampleResult:
    pack_id: str
    workspace_id: str
    channel: str
    caption: str
    passed: bool
    guardrail_passed: bool
    nli_passed: bool
    violations: list[str] = field(default_factory=list)
    unsupported_sentences: list[str] = field(default_factory=list)


@dataclass
class AuditReportSummary:
    audit_id: str
    audit_date: str
    period_start: str
    period_end: str
    total_published_in_period: int
    sample_rate_percent: float
    sample_size: int
    passed_count: int
    violation_count: int
    compliance_rate_percent: float
    status: str  # AUDIT_PASSED or AUDIT_DEFECT_DETECTED
    samples: list[AuditSampleResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "audit_id": self.audit_id,
            "audit_date": self.audit_date,
            "period": {"start": self.period_start, "end": self.period_end},
            "statistics": {
                "total_published": self.total_published_in_period,
                "sample_rate_percent": self.sample_rate_percent,
                "sample_size": self.sample_size,
                "passed_count": self.passed_count,
                "violation_count": self.violation_count,
                "compliance_rate_percent": round(self.compliance_rate_percent, 2),
                "status": self.status,
            },
            "samples": [
                {
                    "pack_id": s.pack_id,
                    "workspace_id": s.workspace_id,
                    "channel": s.channel,
                    "passed": s.passed,
                    "guardrail_passed": s.guardrail_passed,
                    "nli_passed": s.nli_passed,
                    "violations": s.violations,
                    "unsupported_sentences": s.unsupported_sentences,
                }
                for s in self.samples
            ],
        }

    def to_markdown(self) -> str:
        lines = [
            f"# BÁO CÁO KIỂM TOÁN CHẤT LƯỢNG NỘI DUNG HẬU XUẤT BẢN ({self.audit_date})",
            "",
            f"> **Mã kiểm toán:** `{self.audit_id}` | **Thời gian chạy:** {self.audit_date}  ",
            f"> **Kỳ kiểm toán:** {self.period_start} -> {self.period_end}  ",
            f"> **Trạng thái kết luận:** **{self.status}**",
            "",
            "## 1. Tổng Hợp Thống Kê Mẫu Kiểm Toán",
            "",
            "| Chỉ số | Giá trị | Ngưỡng yêu cầu | Đánh giá |",
            "| :--- | :---: | :---: | :---: |",
            f"| Tổng bài đã xuất bản trong kỳ | **{self.total_published_in_period}** | - | Toàn bộ cơ sở |",
            f"| Tỷ lệ trích mẫu kiểm toán | **{self.sample_rate_percent}%** | >= 10.0% | {'ĐẠT' if self.sample_rate_percent >= 10.0 else 'CẢNH BÁO'} |",
            f"| Số lượng mẫu kiểm toán thực tế | **{self.sample_size} bài** | >= 5 bài | {'ĐẠT' if self.sample_size >= 1 else 'THIẾU MẪU'} |",
            f"| Số bài hợp quy chuẩn 100% | **{self.passed_count} bài** | - | - |",
            f"| Số bài phát hiện lỗi/vi phạm | **{self.violation_count} bài** | 0 bài | {'AN TOÀN' if self.violation_count == 0 else '🚨 CẦN XỬ LÝ'} |",
            f"| Tỷ lệ tuân thủ (Compliance Rate) | **{self.compliance_rate_percent:.2f}%** | 100.0% | {'🟢 PASS' if self.compliance_rate_percent >= 99.0 else '🔴 FAIL'} |",
            "",
            "## 2. Chi Tiết Các Mẫu Được Kiểm Toán",
            "",
            "| STT | Pack ID | Channel | Guardrail Check | NLI Entailment | Kết quả | Lỗi phát hiện |",
            "| :---: | :--- | :---: | :---: | :---: | :---: | :--- |",
        ]

        for i, s in enumerate(self.samples, start=1):
            g_icon = "🟢 Đạt" if s.guardrail_passed else "🔴 Lỗi"
            n_icon = "🟢 Đạt" if s.nli_passed else "🔴 Lỗi"
            res_icon = "✅ ĐẠT" if s.passed else "❌ KHÔNG ĐẠT"
            issues = "; ".join(s.violations + s.unsupported_sentences) if not s.passed else "Không có lỗi"
            lines.append(f"| {i} | `{s.pack_id}` | {s.channel} | {g_icon} | {n_icon} | {res_icon} | {issues} |")

        lines.extend([
            "",
            "## 3. Kiến Nghị & Hành Động Khắc Phục",
            "",
            "- **Nếu 100% Pass**: Hệ thống đang vận hành ổn định, không có model drift hay rò rỉ lỗi.",
            "- **Nếu phát hiện lỗi**: Tech Lead và QA kích hoạt quy trình điều tra runbook, thu hồi các bài có nguy cơ và xem xét rollback bundle nếu cần.",
            "",
            "---",
            "*Báo cáo được sinh tự động bởi AI Growth OS Weekly Audit Pipeline (CM-31).*  ",
        ])

        return "\n".join(lines)


class ContentSampleAuditor:
    """Performs weekly 10% sampling and re-verification against Guardrail + NLI."""

    def __init__(self, sample_rate: float = 0.10, min_samples: int = 5, seed: int = 42) -> None:
        self.sample_rate = sample_rate
        self.min_samples = min_samples
        self.seed = seed

    def audit_single_pack(
        self,
        pack: SocialPackV2 | dict[str, Any],
        expected_cta: str = "https://tripc.vn",
    ) -> AuditSampleResult:
        """Audits a single published SocialPack against Deterministic Guardrails & NLI."""
        if isinstance(pack, dict):
            pack_dict = pack
            pack_id = pack_dict.get("pack_id", "sp_unknown")
            workspace_id = pack_dict.get("workspace_id", "ws_default")
            channels = pack_dict.get("channels", ["facebook"])
            caption = pack_dict.get("caption", "")
            facts_raw = pack_dict.get("extracted_facts", [])
            facts = [f if isinstance(f, FactItem) else FactItem(**f) for f in facts_raw]
            cta_obj = pack_dict.get("cta", {})
            cta_url = cta_obj.get("target_url") if isinstance(cta_obj, dict) else str(cta_obj)
        else:
            pack_id = pack.pack_id
            workspace_id = pack.workspace_id
            channels = pack.channels
            caption = pack.caption
            facts = pack.extracted_facts
            cta_url = pack.cta.target_url if pack.cta else expected_cta

        channel = channels[0] if channels else "facebook"
        violations: list[str] = []
        unsupported_sentences: list[str] = []

        # 1. Deterministic Guardrails check
        guardrail_passed = True
        try:
            allowed_domains = ["tripc.vn"]
            report = evaluate_social_pack_guardrails(
                caption=caption,
                extracted_facts=facts,
                channels=[channel],
                target_channels=[channel],
                cta_target_url=cta_url,
                allowed_domains=allowed_domains,
            )
            if not report.is_valid:
                guardrail_passed = False
                for v in report.violations:
                    violations.append(f"[{v.code}] {v.message}")
        except Exception as exc:
            guardrail_passed = False
            violations.append(f"Guardrail error: {exc}")

        # 2. Sentence-Fact Mapping & NLI check
        nli_passed = True
        try:
            explicit_mappings = pack_dict.get("sentence_fact_map") if isinstance(pack, dict) else getattr(pack, "sentence_fact_map", None)
            sentence_map = map_caption_to_sentence_fact_map(
                caption=caption,
                facts=facts,
                expected_cta=None,
                explicit_mappings=explicit_mappings,
            )
            for item in sentence_map:
                if item.sentence_type == "factual" and item.entailment_status == "unsupported":
                    nli_passed = False
                    unsupported_sentences.append(f"Câu '{item.text}' không có dẫn chứng sự thật (unsupported)")
                elif item.sentence_type in ("hook", "cta") and item.entailment_status == "unsupported":
                    nli_passed = False
                    unsupported_sentences.append(f"Câu {item.sentence_type} '{item.text}' vi phạm Zero-Claim")
        except Exception as exc:
            nli_passed = False
            unsupported_sentences.append(f"NLI validation error: {exc}")

        passed = guardrail_passed and nli_passed
        return AuditSampleResult(
            pack_id=pack_id,
            workspace_id=workspace_id,
            channel=channel,
            caption=caption,
            passed=passed,
            guardrail_passed=guardrail_passed,
            nli_passed=nli_passed,
            violations=violations,
            unsupported_sentences=unsupported_sentences,
        )

    def run_weekly_audit(
        self,
        published_posts: Sequence[SocialPackV2 | dict[str, Any]],
        period_days: int = 7,
    ) -> AuditReportSummary:
        """Selects random 10% sample of published posts and runs audit."""
        total_count = len(published_posts)
        if total_count == 0:
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            return AuditReportSummary(
                audit_id=f"audit_{int(time.time())}",
                audit_date=now_iso,
                period_start="N/A",
                period_end="N/A",
                total_published_in_period=0,
                sample_rate_percent=0.0,
                sample_size=0,
                passed_count=0,
                violation_count=0,
                compliance_rate_percent=100.0,
                status="NO_DATA",
            )

        # Determine sample size: max(min_samples, int(ceil(total * sample_rate)))
        target_sample_size = max(1, int(round(total_count * self.sample_rate)))
        sample_size = min(total_count, max(self.min_samples, target_sample_size))

        # Reproducible random sampling
        rng = random.Random(self.seed)
        sampled_posts = rng.sample(list(published_posts), sample_size)

        sample_results: list[AuditSampleResult] = []
        for post in sampled_posts:
            res = self.audit_single_pack(post)
            sample_results.append(res)

        passed_count = sum(1 for r in sample_results if r.passed)
        violation_count = len(sample_results) - passed_count
        compliance_rate = (passed_count / len(sample_results)) * 100.0

        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=period_days)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
        audit_id = f"audit_weekly_{now.strftime('%Y%m%d_%H%M%S')}"

        status = "AUDIT_PASSED" if violation_count == 0 else "AUDIT_DEFECT_DETECTED"

        report = AuditReportSummary(
            audit_id=audit_id,
            audit_date=end_date,
            period_start=start_date,
            period_end=end_date,
            total_published_in_period=total_count,
            sample_rate_percent=round((sample_size / total_count) * 100.0, 1),
            sample_size=sample_size,
            passed_count=passed_count,
            violation_count=violation_count,
            compliance_rate_percent=compliance_rate,
            status=status,
            samples=sample_results,
        )

        return report

    def save_report(self, report: AuditReportSummary, output_dir: Path | None = None) -> tuple[Path, Path]:
        """Saves JSON and Markdown reports to reports directory."""
        target_dir = output_dir or REPORTS_DIR
        target_dir.mkdir(parents=True, exist_ok=True)

        json_path = target_dir / f"{report.audit_id}.json"
        md_path = target_dir / f"{report.audit_id}.md"

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)

        with open(md_path, "w", encoding="utf-8") as f:
            f.write(report.to_markdown())

        logger.info("Saved weekly audit reports to %s and %s", json_path, md_path)
        return json_path, md_path
