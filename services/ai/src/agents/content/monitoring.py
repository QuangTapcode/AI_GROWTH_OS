"""Content Marketing Agent Monitoring & Telemetry Engine (CM-31).

Implements:
1. Rolling 50-article sliding window:
   - Tracks rejection rate over the last 50 processed articles.
   - Triggers P1 alert if rejection rate > 15% on the rolling window.
   - Triggers P1 alert if 3 consecutive articles violate factual integrity.
2. Low-volume time-based fallback:
   - Tracks 24-hour time window for early detection when daily throughput is low.
3. Reflection self-correction loop metrics:
   - Distribution and rolling average of reflection rounds (target <= 1.2).
4. LLM Judge scores:
   - Overall score (target >= 90/100) and 5 rubric sub-criteria.
5. Latency metrics:
   - P50, P90, P95, and P99 quantiles and step-by-step latency breakdown.
6. API error tracking:
   - Categorized by error code, channel, operation, and HTTP status.
7. Prometheus exposition format (/metrics).
"""

from __future__ import annotations

import collections
import dataclasses
import math
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Sequence


@dataclasses.dataclass
class ArticleRunRecord:
    run_id: str
    timestamp: float
    workspace_id: str
    operation: str
    channel: str
    status: str  # draft, needs_assets, insufficient_data, failed
    is_rejected: bool
    is_factual_violation: bool
    reflection_rounds: int
    judge_score: float | None
    judge_breakdown: dict[str, float]
    latency_seconds: float
    error_code: str | None = None


class ContentMetricsTracker:
    """Thread-safe telemetry tracker for Content Marketing Agent."""

    def __init__(self, window_size: int = 50, low_volume_hours: int = 24) -> None:
        self.window_size = window_size
        self.low_volume_hours = low_volume_hours
        self._lock = threading.Lock()

        # Sliding window for up to window_size runs
        self._window: collections.deque[ArticleRunRecord] = collections.deque(maxlen=window_size)
        # All records within low_volume_hours (up to 1000)
        self._recent_records: collections.deque[ArticleRunRecord] = collections.deque(maxlen=1000)

        # Consecutive counters
        self._consecutive_rejections: int = 0
        self._consecutive_factual_violations: int = 0

        # Cumulative counters
        self._total_runs: int = 0
        self._total_rejections: int = 0
        self._total_factual_violations: int = 0
        self._api_errors: dict[str, int] = collections.defaultdict(int)

        # Histograms / Buckets
        self._reflection_rounds_hist: dict[int, int] = collections.defaultdict(int)
        self._judge_scores: list[float] = []
        self._judge_sub_scores: dict[str, list[float]] = collections.defaultdict(list)
        self._latencies: list[float] = []

    def record_run(
        self,
        run_id: str,
        workspace_id: str,
        operation: str,
        channel: str,
        status: str,
        rejection_reason: str | None = None,
        is_factual_violation: bool = False,
        reflection_rounds: int = 0,
        judge_score: float | None = None,
        judge_breakdown: dict[str, float] | None = None,
        latency_seconds: float = 0.0,
        error_code: str | None = None,
        timestamp: float | None = None,
    ) -> ArticleRunRecord:
        """Records a single content operation execution."""
        now = timestamp if timestamp is not None else time.time()
        is_rejected = status in {"needs_assets", "insufficient_data", "failed"}

        # Infer factual violation if explicit reason matches known patterns
        if rejection_reason and any(
            kw in rejection_reason.lower()
            for kw in ("bịa", "sai lệch", "unsupported", "không có trong fact", "zero-claim", "giá ảo")
        ):
            is_factual_violation = True

        record = ArticleRunRecord(
            run_id=run_id,
            timestamp=now,
            workspace_id=workspace_id,
            operation=operation,
            channel=channel,
            status=status,
            is_rejected=is_rejected,
            is_factual_violation=is_factual_violation,
            reflection_rounds=reflection_rounds,
            judge_score=judge_score,
            judge_breakdown=judge_breakdown or {},
            latency_seconds=latency_seconds,
            error_code=error_code,
        )

        with self._lock:
            self._window.append(record)
            self._recent_records.append(record)
            self._total_runs += 1

            # Update consecutive counters
            if is_rejected:
                self._consecutive_rejections += 1
                self._total_rejections += 1
            else:
                self._consecutive_rejections = 0

            if is_factual_violation:
                self._consecutive_factual_violations += 1
                self._total_factual_violations += 1
            else:
                self._consecutive_factual_violations = 0

            # Reflection rounds
            self._reflection_rounds_hist[reflection_rounds] += 1

            # Judge scores
            if judge_score is not None:
                self._judge_scores.append(judge_score)
                if len(self._judge_scores) > 200:
                    self._judge_scores.pop(0)

            if judge_breakdown:
                for k, v in judge_breakdown.items():
                    self._judge_sub_scores[k].append(v)
                    if len(self._judge_sub_scores[k]) > 200:
                        self._judge_sub_scores[k].pop(0)

            # Latency
            if latency_seconds > 0:
                self._latencies.append(latency_seconds)
                if len(self._latencies) > 500:
                    self._latencies.pop(0)

            # Errors
            if error_code:
                key = f"{operation}:{channel}:{error_code}"
                self._api_errors[key] += 1

        return record

    def get_rolling_metrics(self) -> dict[str, Any]:
        """Calculates current rolling 50-article window metrics."""
        with self._lock:
            records = list(self._window)
            consecutive_rejections = self._consecutive_rejections
            consecutive_factual_violations = self._consecutive_factual_violations

        sample_count = len(records)
        if sample_count == 0:
            return {
                "window_size": self.window_size,
                "sample_count": 0,
                "rejected_count": 0,
                "rejection_rate": 0.0,
                "factual_violation_count": 0,
                "factual_violation_rate": 0.0,
                "consecutive_rejections": 0,
                "consecutive_factual_violations": 0,
                "p1_alert_high_rejection": False,
                "p1_alert_factual_violation": False,
                "p1_alert_triggered": False,
            }

        rejected_count = sum(1 for r in records if r.is_rejected)
        rejection_rate = rejected_count / sample_count
        factual_violations = sum(1 for r in records if r.is_factual_violation)
        factual_rate = factual_violations / sample_count

        # P1 Alert Conditions
        # 1. Rejection rate > 15% on 50 consecutive posts (evaluated when window is sufficiently populated or consecutive)
        # Plan rule: "từ chối >15% trong 50 bài liên tiếp, hoặc 3 bài liên tiếp vi phạm sự thật"
        p1_high_rejection = (sample_count >= min(10, self.window_size)) and (rejection_rate > 0.15)
        # 2. 3 consecutive posts with factual violation
        p1_factual_violation = consecutive_factual_violations >= 3

        return {
            "window_size": self.window_size,
            "sample_count": sample_count,
            "rejected_count": rejected_count,
            "rejection_rate": round(rejection_rate, 4),
            "rejection_rate_percent": round(rejection_rate * 100, 2),
            "factual_violation_count": factual_violations,
            "factual_violation_rate": round(factual_rate, 4),
            "consecutive_rejections": consecutive_rejections,
            "consecutive_factual_violations": consecutive_factual_violations,
            "p1_alert_high_rejection": p1_high_rejection,
            "p1_alert_factual_violation": p1_factual_violation,
            "p1_alert_triggered": p1_high_rejection or p1_factual_violation,
        }

    def get_time_window_metrics(self, hours: int | None = None) -> dict[str, Any]:
        """Calculates time-based metrics for low-throughput periods (e.g. 24h window)."""
        target_hours = hours or self.low_volume_hours
        cutoff = time.time() - (target_hours * 3600)

        with self._lock:
            recent = [r for r in self._recent_records if r.timestamp >= cutoff]

        count = len(recent)
        if count == 0:
            return {
                "time_window_hours": target_hours,
                "sample_count": 0,
                "rejected_count": 0,
                "rejection_rate": 0.0,
                "factual_violation_count": 0,
                "p1_time_alert": False,
                "p2_time_alert": False,
            }

        rejected = sum(1 for r in recent if r.is_rejected)
        rate = rejected / count
        factual = sum(1 for r in recent if r.is_factual_violation)

        # Proposed time-based alerts for low-throughput:
        # P1: If >= 2 factual violations in the last 24h
        p1_time_alert = factual >= 2
        # P2: If >= 3 articles in 24h and rejection rate > 20%
        p2_time_alert = (count >= 3) and (rate > 0.20)

        return {
            "time_window_hours": target_hours,
            "sample_count": count,
            "rejected_count": rejected,
            "rejection_rate": round(rate, 4),
            "rejection_rate_percent": round(rate * 100, 2),
            "factual_violation_count": factual,
            "p1_time_alert": p1_time_alert,
            "p2_time_alert": p2_time_alert,
        }

    def get_reflection_metrics(self) -> dict[str, Any]:
        """Returns reflection loop self-correction metrics."""
        with self._lock:
            hist = dict(self._reflection_rounds_hist)

        total_rounds = sum(r * count for r, count in hist.items())
        total_runs = sum(hist.values())
        avg_rounds = (total_rounds / total_runs) if total_runs > 0 else 0.0

        return {
            "total_evaluated_runs": total_runs,
            "average_rounds": round(avg_rounds, 3),
            "compliant_with_target_1_2": avg_rounds <= 1.20,
            "rounds_distribution": hist,
        }

    def get_judge_metrics(self) -> dict[str, Any]:
        """Returns LLM Judge score statistics."""
        with self._lock:
            scores = list(self._judge_scores)
            sub_scores = {k: list(v) for k, v in self._judge_sub_scores.items()}

        if not scores:
            return {
                "sample_count": 0,
                "average_overall_score": 0.0,
                "pass_rate_90": 0.0,
                "sub_criteria_averages": {},
            }

        avg_score = sum(scores) / len(scores)
        pass_count = sum(1 for s in scores if s >= 90.0)
        pass_rate = pass_count / len(scores)

        sub_avgs = {k: round(sum(v) / len(v), 2) for k, v in sub_scores.items() if v}

        return {
            "sample_count": len(scores),
            "average_overall_score": round(avg_score, 2),
            "pass_rate_90": round(pass_rate, 4),
            "pass_rate_90_percent": round(pass_rate * 100, 2),
            "sub_criteria_averages": sub_avgs,
        }

    def get_latency_metrics(self) -> dict[str, Any]:
        """Calculates P50, P90, P95, P99 latency quantiles."""
        with self._lock:
            latencies = sorted(self._latencies)

        if not latencies:
            return {
                "sample_count": 0,
                "p50_seconds": 0.0,
                "p90_seconds": 0.0,
                "p95_seconds": 0.0,
                "p99_seconds": 0.0,
                "max_seconds": 0.0,
                "sla_p50_compliant": True,
                "sla_p95_compliant": True,
            }

        def quantile(q: float) -> float:
            idx = int(math.ceil(q * len(latencies))) - 1
            return round(latencies[max(0, min(idx, len(latencies) - 1))], 4)

        p50 = quantile(0.50)
        p90 = quantile(0.90)
        p95 = quantile(0.95)
        p99 = quantile(0.99)

        return {
            "sample_count": len(latencies),
            "p50_seconds": p50,
            "p90_seconds": p90,
            "p95_seconds": p95,
            "p99_seconds": p99,
            "max_seconds": round(max(latencies), 4),
            # SLA from spec: P50 <= 12s, P95 <= 30s
            "sla_p50_compliant": p50 <= 12.0,
            "sla_p95_compliant": p95 <= 30.0,
        }

    def get_api_error_metrics(self) -> dict[str, Any]:
        """Returns API error breakdown."""
        with self._lock:
            errors = dict(self._api_errors)
            total_runs = self._total_runs

        total_errors = sum(errors.values())
        error_rate = (total_errors / total_runs) if total_runs > 0 else 0.0

        return {
            "total_runs": total_runs,
            "total_errors": total_errors,
            "error_rate": round(error_rate, 4),
            "error_rate_percent": round(error_rate * 100, 2),
            "errors_by_category": errors,
        }

    def export_prometheus_text(self) -> str:
        """Renders all metrics in Prometheus text exposition format."""
        from .bundle_manager import get_active_bundle_id, get_active_bundle

        rolling = self.get_rolling_metrics()
        time_metrics = self.get_time_window_metrics()
        reflection = self.get_reflection_metrics()
        judge = self.get_judge_metrics()
        latency = self.get_latency_metrics()
        errors = self.get_api_error_metrics()

        active_bundle_id = get_active_bundle_id()
        bundle_info = get_active_bundle()
        bundle_version = bundle_info.get("bundle_version", "unknown")

        lines: list[str] = [
            "# HELP content_rolling_50_rejection_ratio Tỉ lệ từ chối bài viết trên cửa sổ 50 bài gần nhất",
            "# TYPE content_rolling_50_rejection_ratio gauge",
            f"content_rolling_50_rejection_ratio {rolling['rejection_rate']:.4f}",
            "",
            "# HELP content_rolling_50_samples_total Tổng số mẫu bài viết trong cửa sổ trượt hiện tại",
            "# TYPE content_rolling_50_samples_total gauge",
            f"content_rolling_50_samples_total {rolling['sample_count']}",
            "",
            "# HELP content_consecutive_factual_violations Số bài viết liên tiếp vi phạm sự thật (P1 alert nếu >= 3)",
            "# TYPE content_consecutive_factual_violations gauge",
            f"content_consecutive_factual_violations {rolling['consecutive_factual_violations']}",
            "",
            "# HELP content_p1_alert_active Cờ trạng thái cảnh báo P1 (1: Kích hoạt, 0: Bình thường)",
            "# TYPE content_p1_alert_active gauge",
            f"content_p1_alert_active {1 if rolling['p1_alert_triggered'] else 0}",
            "",
            "# HELP content_time_window_24h_rejection_ratio Tỉ lệ từ chối theo cửa sổ thời gian 24h",
            "# TYPE content_time_window_24h_rejection_ratio gauge",
            f"content_time_window_24h_rejection_ratio {time_metrics['rejection_rate']:.4f}",
            "",
            "# HELP content_time_window_24h_factual_violations Số bài vi phạm sự thật trong 24h gần nhất",
            "# TYPE content_time_window_24h_factual_violations gauge",
            f"content_time_window_24h_factual_violations {time_metrics['factual_violation_count']}",
            "",
            "# HELP content_reflection_rounds_avg Số vòng tự sửa phản tư trung bình (Mục tiêu <= 1.2)",
            "# TYPE content_reflection_rounds_avg gauge",
            f"content_reflection_rounds_avg {reflection['average_rounds']:.4f}",
            "",
            "# HELP content_judge_score_overall Điểm đánh giá LLM Judge trung bình (Thang 100, Mục tiêu >= 90)",
            "# TYPE content_judge_score_overall gauge",
            f"content_judge_score_overall {judge['average_overall_score']:.2f}",
            "",
        ]

        # Judge sub-criteria
        for crit, score in judge.get("sub_criteria_averages", {}).items():
            lines.append(f'content_judge_score_subcriterion{{criterion="{crit}"}} {score:.2f}')
        lines.append("")

        # Latency P50/P95
        lines.extend([
            "# HELP content_latency_p50_seconds Độ trễ trung vị P50 tính bằng giây",
            "# TYPE content_latency_p50_seconds gauge",
            f"content_latency_p50_seconds {latency['p50_seconds']:.4f}",
            "",
            "# HELP content_latency_p95_seconds Độ trễ phân vị P95 tính bằng giây (Mục tiêu <= 30s)",
            "# TYPE content_latency_p95_seconds gauge",
            f"content_latency_p95_seconds {latency['p95_seconds']:.4f}",
            "",
        ])

        # API errors
        lines.extend([
            "# HELP content_api_errors_total Tổng số lỗi API phát sinh",
            "# TYPE content_api_errors_total counter",
        ])
        if errors["errors_by_category"]:
            for key, count in errors["errors_by_category"].items():
                parts = key.split(":")
                op = parts[0] if len(parts) > 0 else "unknown"
                ch = parts[1] if len(parts) > 1 else "unknown"
                err = parts[2] if len(parts) > 2 else "unknown"
                lines.append(f'content_api_errors_total{{operation="{op}",channel="{ch}",error_code="{err}"}} {count}')
        else:
            lines.append('content_api_errors_total{operation="none",channel="none",error_code="none"} 0')
        lines.append("")

        # Active bundle
        lines.extend([
            "# HELP content_active_bundle_info Thông tin phiên bản Bundle Agent đang hoạt động",
            "# TYPE content_active_bundle_info gauge",
            f'content_active_bundle_info{{bundle_id="{active_bundle_id}",version="{bundle_version}"}} 1',
            "",
        ])

        return "\n".join(lines)


# Global singleton instance
_GLOBAL_TRACKER: ContentMetricsTracker | None = None
_GLOBAL_LOCK = threading.Lock()


def get_metrics_tracker() -> ContentMetricsTracker:
    """Returns singleton instance of ContentMetricsTracker."""
    global _GLOBAL_TRACKER
    with _GLOBAL_LOCK:
        if _GLOBAL_TRACKER is None:
            _GLOBAL_TRACKER = ContentMetricsTracker()
        return _GLOBAL_TRACKER
