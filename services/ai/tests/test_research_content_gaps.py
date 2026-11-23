"""Research looks at searched topics the business is absent from before the ones it already covers."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from src.agents.research.pipeline import content_gaps_first, leading_domains, own_domain, trend_topics


def signal(query: str, domain: str, rank: int = 1):
    return SimpleNamespace(query=query, domain=domain, rank=rank, observed_at=datetime.now(timezone.utc))


def payload(signals, inventory_titles=(), own=("tripc.ai",)):
    return SimpleNamespace(
        trend_signals=signals,
        own_domains=list(own),
        business_profile=SimpleNamespace(locations=["Da Nang"]),
        content_inventory=[SimpleNamespace(title=t) for t in inventory_titles],
    )


def test_own_domain_matches_subdomains_and_www_only():
    assert own_domain("www.tripc.ai", ["tripc.ai"])
    assert own_domain("blog.tripc.ai", ["tripc.ai"])
    assert not own_domain("nottripc.ai", ["tripc.ai"])
    assert not own_domain("tripc.ai", [])


def test_absent_and_unwritten_topics_come_first_most_crowded_first():
    signals = [
        # The business already ranks here.
        signal("Da Nang esim expats", "tripc.ai"), signal("Da Nang esim expats", "a.com"),
        # Absent, three competitors.
        signal("Da Nang food expats", "a.com"), signal("Da Nang food expats", "b.com"), signal("Da Nang food expats", "c.com"),
        # Absent, but the business's blog already has the article.
        signal("Da Nang coworking expats", "a.com"), signal("Da Nang coworking expats", "b.com"),
        signal("Da Nang coworking expats", "c.com"), signal("Da Nang coworking expats", "d.com"),
        # Absent, one competitor.
        signal("Da Nang transport expats", "a.com"),
    ]
    rows = content_gaps_first(payload(signals, inventory_titles=["Best coworking spaces in Da Nang"]))
    assert [r[1] for r in rows] == ["food", "transport", "coworking", "esim"]
    by_topic = {r[1]: r for r in rows}
    assert by_topic["esim"][5] is True and by_topic["esim"][6] is False
    assert by_topic["coworking"][5] is False and by_topic["coworking"][6] is True
    assert len(by_topic["food"][4]) == 3


def test_leading_domains_are_the_best_ranked_ones():
    signals = [signal("q", "c.com", 3), signal("q", "a.com", 1), signal("q", "b.com", 2), signal("q", "a.com", 5),
               signal("q", "d.com", 4), signal("other", "z.com", 1)]
    assert leading_domains(signals, "q") == ["a.com", "b.com", "c.com"]


def test_audience_wording_is_not_part_of_the_topic():
    rows = trend_topics([signal("Da Nang coworking for foreigners", "a.com"), signal("Da Nang coworking expats", "a.com")], ["Da Nang"])
    assert {r[1] for r in rows} == {"coworking"}
