"""Compare measured artifacts only; configured targets and declared baselines are not evidence."""
from datetime import datetime, timezone

from .schemas import MetricsData


def metric_value(data, metric):
    if data is None:
        return None
    if metric == "ctr":
        return number(100 * data.clicks / data.impressions) if data.clicks is not None and data.impressions else None
    return getattr(data, metric, None) if metric in {"qualified_visits", "leads", "clicks", "impressions", "sessions", "pageviews", "ad_spend"} else None


def number(value):
    rounded = round(value, 6)
    return int(rounded) if rounded == int(rounded) else rounded


def compare_kpis(current: MetricsData | None, baseline: MetricsData | None, kpis, metrics):
    configured = {k.metric_name: k for k in kpis}
    comparisons = []
    now = datetime.now(timezone.utc)
    for metric in dict.fromkeys([*configured, *metrics]):
        kpi = configured.get(metric)
        value, initial = metric_value(current, metric), metric_value(baseline, metric)
        definition = current.metric_definitions.get(metric) if current else None
        previous = baseline.metric_definitions.get(metric) if baseline else None
        status = "compared"
        if current is None or value is None:
            status = "current_metric_missing"
        elif baseline is None or initial is None:
            status = "baseline_metric_missing"
        elif not definition or not previous or not current.timezone or not baseline.timezone:
            status = "measurement_unverified"
        elif (not current.captured_at or not baseline.captured_at
              or not current.captured_at.tzinfo or not baseline.captured_at.tzinfo
              or not current.window_end <= current.captured_at <= now
              or not baseline.window_end <= baseline.captured_at <= now):
            status = "measurement_unverified"
        elif definition != previous or current.timezone != baseline.timezone or (kpi and kpi.measurement and definition != kpi.measurement):
            status = "measurement_mismatch"
        elif (baseline.window_end > current.window_start
              or baseline.window_end - baseline.window_start != current.window_end - current.window_start):
            status = "window_mismatch"
        elif baseline.synthetic != current.synthetic:
            status = "synthetic_mismatch"
        elif initial == 0:
            status = "zero_baseline"
        comparable = status in {"compared", "zero_baseline"}
        comparisons.append({
            "metric_name": metric, "status": status,
            "baseline_value": initial, "current_value": value,
            "target_value": kpi.target_value if kpi else None,
            "measurement": definition.model_dump(mode="json") if definition else None,
            "absolute_change": number(value - initial) if comparable else None,
            "relative_change_pct": number((value - initial) / initial * 100) if status == "compared" else None,
        })
    return comparisons
