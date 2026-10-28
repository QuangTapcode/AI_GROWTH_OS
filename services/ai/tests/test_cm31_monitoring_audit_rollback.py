"""Tests for Content Marketing Monitoring, Sample Audit, and Instant Rollback (CM-31).

Verifies:
1. Rolling 50-article sliding window metrics and P1 alert triggering:
   - Alert when rejection rate > 15% on 50 consecutive posts.
   - Alert when 3 consecutive posts violate factual integrity.
   - Time-based fallback alert for low-throughput periods (24h window).
2. Reflection loop metrics (average <= 1.2 rounds), Judge metrics (>= 90/100),
   P50/P95 latencies, and API error tracking.
3. Prometheus metrics exposition (/metrics).
4. Weekly 10% sample audit service with Guardrails + NLI verification.
5. Configuration-based instant rollback in < 60 seconds (measured real time).
"""

from __future__ import annotations

import time
from pathlib import Path
import pytest

from src.agents.content.monitoring import ContentMetricsTracker, get_metrics_tracker
from src.agents.content.audit_service import ContentSampleAuditor, AuditReportSummary
from src.agents.content.bundle_manager import (
    get_active_bundle_id,
    get_active_bundle,
    rollback_to_previous_bundle,
    switch_bundle,
)
from src.agents.content.social_pack_v2 import FactItem


class TestContentMetricsTracker:
    """Test suite for CM-31 sliding window telemetry and P1 alert engine."""

    def test_rolling_50_empty_metrics(self):
        tracker = ContentMetricsTracker(window_size=50)
        metrics = tracker.get_rolling_metrics()
        assert metrics["window_size"] == 50
        assert metrics["sample_count"] == 0
        assert metrics["rejection_rate"] == 0.0
        assert metrics["p1_alert_triggered"] is False

    def test_p1_alert_high_rejection_rate(self):
        """P1 alert must trigger if rejection rate > 15% on 50 articles."""
        tracker = ContentMetricsTracker(window_size=50)

        # Record 40 successful runs and 10 rejections = 10/50 = 20% > 15%
        for i in range(40):
            tracker.record_run(
                run_id=f"run_ok_{i}",
                workspace_id="ws_tripc",
                operation="content.generate",
                channel="facebook",
                status="draft",
                latency_seconds=1.2,
                reflection_rounds=1,
                judge_score=92.0,
            )

        for i in range(10):
            tracker.record_run(
                run_id=f"run_rej_{i}",
                workspace_id="ws_tripc",
                operation="content.generate",
                channel="facebook",
                status="needs_assets",
                rejection_reason="Thiếu ảnh thật sản phẩm",
                latency_seconds=0.8,
                reflection_rounds=2,
            )

        metrics = tracker.get_rolling_metrics()
        assert metrics["sample_count"] == 50
        assert metrics["rejected_count"] == 10
        assert metrics["rejection_rate"] == 0.20
        assert metrics["p1_alert_high_rejection"] is True
        assert metrics["p1_alert_triggered"] is True

    def test_p1_alert_3_consecutive_factual_violations(self):
        """P1 alert must trigger if 3 consecutive posts violate factual integrity."""
        tracker = ContentMetricsTracker(window_size=50)

        # 2 factual violations
        tracker.record_run(
            run_id="run_f1",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="facebook",
            status="insufficient_data",
            rejection_reason="Giá ảo không có trong fact",
            is_factual_violation=True,
        )
        assert tracker.get_rolling_metrics()["p1_alert_factual_violation"] is False

        tracker.record_run(
            run_id="run_f2",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="facebook",
            status="insufficient_data",
            rejection_reason="Tỷ lệ % bịa đặt",
            is_factual_violation=True,
        )
        assert tracker.get_rolling_metrics()["p1_alert_factual_violation"] is False

        # 3rd consecutive factual violation triggers P1 immediately
        tracker.record_run(
            run_id="run_f3",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="tiktok",
            status="insufficient_data",
            rejection_reason="Unsupported claim: số tiền sai lệch",
            is_factual_violation=True,
        )
        metrics = tracker.get_rolling_metrics()
        assert metrics["consecutive_factual_violations"] == 3
        assert metrics["p1_alert_factual_violation"] is True
        assert metrics["p1_alert_triggered"] is True

        # Successful run resets consecutive counter
        tracker.record_run(
            run_id="run_ok",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="facebook",
            status="draft",
        )
        assert tracker.get_rolling_metrics()["consecutive_factual_violations"] == 0
        assert tracker.get_rolling_metrics()["p1_alert_factual_violation"] is False

    def test_low_volume_time_based_fallback_alerts(self):
        """Low-volume tenant: 2 factual violations in 24h triggers P1 time alert."""
        tracker = ContentMetricsTracker(window_size=50, low_volume_hours=24)
        now = time.time()

        # 2 factual violations spread across the day
        tracker.record_run(
            run_id="run_t1",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="facebook",
            status="failed",
            is_factual_violation=True,
            timestamp=now - 7200,  # 2 hours ago
        )
        tracker.record_run(
            run_id="run_t2",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="tiktok",
            status="failed",
            is_factual_violation=True,
            timestamp=now - 3600,  # 1 hour ago
        )

        time_metrics = tracker.get_time_window_metrics(hours=24)
        assert time_metrics["sample_count"] == 2
        assert time_metrics["factual_violation_count"] == 2
        assert time_metrics["p1_time_alert"] is True

    def test_reflection_and_judge_and_latency_metrics(self):
        """Verifies calculation of reflection rounds, judge scores, and P50/P95 latencies."""
        tracker = ContentMetricsTracker()

        latencies = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 12.0]
        for idx, lat in enumerate(latencies):
            tracker.record_run(
                run_id=f"run_l_{idx}",
                workspace_id="ws_tripc",
                operation="content.generate",
                channel="facebook",
                status="draft",
                reflection_rounds=1 if idx < 8 else 2,
                judge_score=95.0 - idx,
                judge_breakdown={"attribution": 30.0, "brand_voice": 20.0, "channel": 18.0},
                latency_seconds=lat,
                error_code="RATE_LIMIT" if idx == 9 else None,
            )

        # Reflection
        refl = tracker.get_reflection_metrics()
        assert refl["total_evaluated_runs"] == 10
        assert refl["average_rounds"] <= 1.20
        assert refl["compliant_with_target_1_2"] is True

        # Judge
        judge = tracker.get_judge_metrics()
        assert judge["sample_count"] == 10
        assert judge["average_overall_score"] >= 90.0
        assert judge["sub_criteria_averages"]["attribution"] == 30.0

        # Latencies
        lat = tracker.get_latency_metrics()
        assert lat["sample_count"] == 10
        assert lat["p50_seconds"] <= 12.0
        assert lat["p95_seconds"] <= 30.0
        assert lat["sla_p50_compliant"] is True
        assert lat["sla_p95_compliant"] is True

        # API errors
        err = tracker.get_api_error_metrics()
        assert err["total_errors"] == 1
        assert "content.generate:facebook:RATE_LIMIT" in err["errors_by_category"]

    def test_prometheus_exposition_format(self):
        """Verifies export_prometheus_text produces valid Prometheus format."""
        tracker = ContentMetricsTracker()
        tracker.record_run(
            run_id="run_prom_01",
            workspace_id="ws_tripc",
            operation="content.generate",
            channel="facebook",
            status="draft",
            reflection_rounds=1,
            judge_score=94.5,
            latency_seconds=2.45,
        )

        prom_text = tracker.export_prometheus_text()
        assert "content_rolling_50_rejection_ratio" in prom_text
        assert "content_consecutive_factual_violations" in prom_text
        assert "content_p1_alert_active 0" in prom_text
        assert "content_reflection_rounds_avg" in prom_text
        assert "content_judge_score_overall 94.50" in prom_text
        assert "content_latency_p50_seconds 2.4500" in prom_text
        assert "content_active_bundle_info" in prom_text


class TestContentSampleAuditor:
    """Test suite for weekly 10% sample audit."""

    def test_audit_valid_published_pack(self):
        auditor = ContentSampleAuditor(sample_rate=0.10, min_samples=1)
        valid_pack = {
            "pack_id": "sp_audit_test_01",
            "workspace_id": "ws_tripc",
            "channels": ["facebook"],
            "caption": "Studio TripC cách biển Mỹ Khê 200m.\n\nGiá thuê 8.500.000 VNĐ/tháng.\n\nLiên hệ đặt phòng.",
            "extracted_facts": [
                FactItem(fact_id="f01", text="Studio TripC cách biển Mỹ Khê 200m.", source_type="seo_body"),
                FactItem(fact_id="f02", text="Giá thuê 8.500.000 VNĐ/tháng.", source_type="seo_body"),
            ],
            "cta": {"type": "contact_us", "target_url": "https://tripc.vn"},
        }

        res = auditor.audit_single_pack(valid_pack)
        assert res.guardrail_passed is True
        assert res.nli_passed is True
        assert res.passed is True
        assert len(res.violations) == 0

    def test_audit_detects_unsupported_price(self):
        auditor = ContentSampleAuditor(sample_rate=0.10, min_samples=1)
        # Pack contains price not in facts
        bad_pack = {
            "pack_id": "sp_audit_bad_01",
            "workspace_id": "ws_tripc",
            "channels": ["facebook"],
            "caption": "Phòng đẹp giá chỉ 500k/đêm.\n\nĐặt ngay.",
            "extracted_facts": [
                FactItem(fact_id="f01", text="Căn hộ studio gần biển.", source_type="seo_body"),
            ],
            "cta": {"type": "contact_us", "target_url": "https://tripc.vn"},
        }

        res = auditor.audit_single_pack(bad_pack)
        assert res.guardrail_passed is False
        assert res.passed is False
        assert any("500k" in v or "PRICE" in v for v in res.violations)

    def test_weekly_audit_batch_run_and_report_generation(self, tmp_path):
        auditor = ContentSampleAuditor(sample_rate=0.20, min_samples=3, seed=42)
        posts = [
            {
                "pack_id": f"sp_batch_{i}",
                "workspace_id": "ws_tripc",
                "channels": ["facebook"],
                "caption": f"TripC Studio cách biển 200m mẫu {i}.\n\nLiên hệ hotline.",
                "extracted_facts": [
                    {"fact_id": "f01", "text": f"TripC Studio cách biển 200m mẫu {i}."}
                ],
                "cta": {"target_url": "https://tripc.vn"},
            }
            for i in range(10)
        ]

        report = auditor.run_weekly_audit(published_posts=posts, period_days=7)
        assert report.total_published_in_period == 10
        assert report.sample_size == 3
        assert report.compliance_rate_percent == 100.0
        assert report.status == "AUDIT_PASSED"

        json_file, md_file = auditor.save_report(report, output_dir=tmp_path)
        assert json_file.exists()
        assert md_file.exists()
        assert "AUDIT_PASSED" in md_file.read_text(encoding="utf-8")


class TestInstantBundleRollback:
    """Test suite for CM-31 configuration-based rollback in < 60 seconds."""

    def test_rollback_completes_in_under_60_seconds(self):
        """Verifies rollback execution time is strictly < 60s (SLA benchmark)."""
        current_id = get_active_bundle_id()
        start = time.perf_counter()

        result = rollback_to_previous_bundle(reason="Automated pytest test_rollback")
        elapsed = time.perf_counter() - start

        assert result["success"] is True
        assert result["under_60_seconds"] is True
        assert elapsed < 60.0
        # In reality, file config swap executes in < 0.05 seconds
        assert elapsed < 1.0

        new_active = get_active_bundle_id()
        assert new_active != current_id

        # Revert back to original bundle
        switch_result = switch_bundle(current_id, reason="Pytest restore")
        assert switch_result["success"] is True
        assert get_active_bundle_id() == current_id

    def test_bundle_metadata_retrieval(self):
        """Verifies active bundle metadata loads successfully."""
        bundle_info = get_active_bundle()
        assert "bundle_id" in bundle_info
        assert bundle_info.get("bundle_id") in ("content_agent_release_v2", "content_agent_release_v1")
