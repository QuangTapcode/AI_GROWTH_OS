"""Compare measured artifacts only; configured targets and declared baselines are not evidence."""
from datetime import datetime, timedelta, timezone

from .schemas import MetricsData


def metric_value(data, metric):
    if data is None:
        return None
    if metric == "ctr":
        return number(100 * data.clicks / data.impressions) if data.clicks is not None and data.impressions else None
    if metric == "ad_ctr":
        return number(100 * data.ad_clicks / data.ad_impressions) if data.ad_clicks is not None and data.ad_impressions else None
    if metric == "cvr":
        return number(100 * data.converted_visits / data.qualified_visits) if data.converted_visits is not None and data.qualified_visits else None
    if metric == "cpl":
        coverage = data.coverage.get('ad_spend')
        if data.spend_window_leads is not None:
            # Both values are built against exactly the same provider dates and timezone.
            aligned = (coverage and coverage.get('status') == 'available'
                       and data.coverage.get('cpl') == coverage)
            return number(data.ad_spend / data.spend_window_leads) if aligned and data.ad_spend is not None and data.spend_window_leads else None
        if coverage and not aligned_spend_window(data, coverage):
            return None  # Do not divide spend and leads measured over different effective windows.
        return number(data.ad_spend / data.leads) if data.ad_spend is not None and data.leads else None
    metric = {"leads_generated": "leads", "search_clicks": "clicks", "search_impressions": "impressions"}.get(metric, metric)
    return getattr(data, metric, None) if metric in {"qualified_visits", "leads", "clicks", "impressions", "sessions", "pageviews", "ad_spend", "ad_clicks", "ad_impressions"} else None


def aligned_spend_window(data, coverage):
    try:
        return (coverage.get('timezone') == data.timezone and coverage.get('status') == 'available'
                and datetime.fromisoformat(coverage['from']).replace(tzinfo=timezone.utc) == data.window_start
                and (datetime.fromisoformat(coverage['to']) + timedelta(days=1)).replace(tzinfo=timezone.utc) == data.window_end)
    except (ValueError, TypeError, KeyError):
        return False


def number(value):
    rounded = round(value, 6)
    return int(rounded) if rounded == int(rounded) else rounded


def compatible_coverage(current, baseline, metric):
    left, right = current.coverage.get(metric), baseline.coverage.get(metric)
    if not left and not right:
        return True  # Existing verified first-party snapshots use the outer timestamp windows.
    if not left or not right:
        return False
    try:
        a, b = datetime.fromisoformat(left['from']), datetime.fromisoformat(left['to'])
        c, d = datetime.fromisoformat(right['from']), datetime.fromisoformat(right['to'])
        return a <= b and c <= d and d < a and b - a == d - c and left.get('timezone') == right.get('timezone')
    except (KeyError, ValueError, TypeError):
        return False


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
        elif metric in {"ad_spend", "cpl"} and (not current.currency or current.currency != baseline.currency):
            status = "currency_mismatch"
        elif any(d.coverage.get(metric, {}).get("status", "available") != "available" for d in (current, baseline)):
            status = "incomplete_coverage"
        elif current.coverage.get(metric, {}).get("timezone") != baseline.coverage.get(metric, {}).get("timezone"):
            status = "measurement_mismatch"
        elif not compatible_coverage(current, baseline, metric):
            status = "coverage_window_mismatch"
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
            "direction": "lower_is_better" if metric in {"cpl", "ad_spend"} else "higher_is_better",
            "target_progress_pct": number(value / kpi.target_value * 100) if value is not None and kpi and kpi.target_value else None,
        })
    return comparisons
