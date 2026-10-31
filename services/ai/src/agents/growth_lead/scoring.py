"""Opportunity factors derived from Research signals when no operator estimate is supplied.

Every factor is a 0-5 heuristic over data the plan already cites (matched search titles,
rank movement, competing domains, evidence date, profile offer). It ranks visibility and
fit; it is never search volume, demand or a conversion forecast, and says so per factor.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ...rag.retrieval import terms
from ..research.pipeline import STALE_AFTER_YEARS

SOURCE = "derived_from_research_signals_not_search_volume"


def derive_factors(finding, coverage: list, profile, cta: str | None) -> tuple[dict[str, int], dict[str, str]]:
    signals = finding.trend_signals
    basis: dict[str, str] = {}

    # Visibility of the topic in search results, capped below the top of the scale.
    best = min((s.rank for s in signals), default=None)
    demand = 1 if not signals else min(4, 2 + (len(signals) >= 3) + (best is not None and best <= 3))
    basis["demand"] = (f"{len(signals)} matching search titles, best rank {best}; visibility proxy, not search volume"
                       if signals else "no matching search titles")

    offer = terms(" ".join([*profile.products, *profile.services]).replace("_", " "))
    named = offer & terms(" ".join([finding.topic, *finding.keywords, finding.offer_fit]))
    relevance = 1 if not named else 3 if len(named) == 1 else 4
    basis["business_relevance"] = f"profile offer terms in topic/keywords/offer fit: {sorted(named) or 'none'}"

    rising = [s for s in signals if s.is_new or (s.previous_rank is not None and s.previous_rank > s.rank)]
    falling = [s for s in signals if s.previous_rank is not None and s.previous_rank < s.rank]
    growth = 2 if not signals else 4 if rising else 2 if falling and not rising else 3
    basis["growth_potential"] = (f"{len(rising)} new/rising and {len(falling)} falling matched titles since the previous search"
                                 if signals else "no matched titles to compare")

    queries = {s.query for s in signals}
    crowded = max((c.distinct_domains for c in coverage if c.query in queries), default=None)
    gap = 3 if crowded is None else max(1, 5 - min(4, crowded // 3))
    basis["content_gap"] = (f"up to {crowded} distinct domains rank for {sorted(queries)}; more competitors, smaller gap"
                            if crowded is not None else "no ranking data for the topic")

    year = finding.evidence_updated
    stale = year is not None and year < datetime.now(timezone.utc).year - STALE_AFTER_YEARS
    fetched_days = (datetime.now(timezone.utc) - finding.fetched_at).days
    freshness = 1 if stale else 4 if fetched_days <= 30 else 3
    basis["freshness"] = (f"evidence dated {year}" if stale else f"source fetched {fetched_days} days ago")

    conversion = 3 if named and cta else 2
    basis["conversion_potential"] = ("offer and CTA present; no conversion data yet" if conversion == 3
                                     else "no matching offer or CTA; no conversion data yet")
    factors = {"demand": demand, "business_relevance": relevance, "growth_potential": growth,
               "content_gap": gap, "freshness": freshness, "conversion_potential": conversion}
    return factors, basis
