import json
from copy import deepcopy
from uuid import uuid4

import pytest

from conftest import run_job
from examples.six_role_requests import aggregate
from test_research_trends import ClaimProvider, LandscapeProvider, long_source_job


def search_snapshot(job):
    return aggregate(job, {"workspace_id": job['workspace_id'], "snapshot_id": str(uuid4()), "version": 1,
        "site_url": "sc-domain:tripc.ai", "window_start": "2026-09-01", "window_end": "2026-09-28",
        "observed_at": "2026-10-01T00:00:00Z", "timezone": "America/Los_Angeles", "scope": "website_property_only",
        "coverage": "top_queries_not_exhaustive", "synthetic": True,
        "rows": [{"query": "coworking da nang", "clicks": 0, "impressions": 20, "ctr": 0, "position": 8},
                 {"query": "da nang weather", "clicks": 3, "impressions": 30, "ctr": 0.1, "position": 5}]}, role='research')


def test_findings_separate_cited_facts_hypotheses_and_missing_demand(make_client):
    job = long_source_job()
    job['payload']['search_metrics'] = search_snapshot(job)
    out = run_job(make_client(provider=LandscapeProvider(), provider_mode='live'), job)['result']['result']
    finding = out['findings'][0]
    assert finding['source_facts'] == [finding['evidence']['quote']]
    assert finding['user_need'] in finding['hypotheses']
    assert finding['confidence'] == 'hypothesis' and finding['demand_estimate'] is None
    assert 'market_search_volume_not_measured' in finding['missing_data']
    assert finding['quality_status'] == 'requires_semantic_review'
    assert finding['quality_checks']['topic_supported_by_quote']
    assert [m['query'] for m in finding['website_search_metrics']] == ['coworking da nang']
    assert finding['website_search_metrics'][0]['clicks'] == 0
    assert out['search_metrics_ref'] == job['payload']['search_metrics']['artifact']


@pytest.mark.parametrize('claim', ['This topic is growing fast.', 'Coworking is trending among expats.', 'Nhu cầu đang tăng tại Đà Nẵng.'])
def test_search_visibility_never_becomes_growth_claim(make_client, claim):
    out = run_job(make_client(provider=ClaimProvider(rationale=claim), provider_mode='live'), long_source_job())
    assert out['result']['result']['findings'] == []
    assert 'DEMAND_CLAIM_DROPPED' in out['result']['warnings']


@pytest.mark.parametrize('override,warning', [
    ({'topic': 'Cancer treatment', 'keywords': ['oncology']}, 'OFF_TOPIC_EVIDENCE_DROPPED'),
    ({'offer_fit': 'TripC sells cancer treatments.'}, 'OFF_PROFILE_OFFER_DROPPED'),
    ({'user_need': 'Explore the topic for the target audience.'}, 'VAGUE_USER_NEED_DROPPED'),
    ({'audience_fit': 'Retired surgeons need advice.'}, 'AUDIENCE_MISMATCH_DROPPED'),
    ({'topic': 'Cancer treatment', 'keywords': ['coworking']}, 'OFF_TOPIC_EVIDENCE_DROPPED'),
])
def test_unrelated_source_or_offer_cannot_pass(make_client, override, warning):
    out = run_job(make_client(provider=ClaimProvider(**override), provider_mode='live'), long_source_job())
    assert out['result']['result']['findings'] == []
    assert warning in out['result']['warnings']


@pytest.mark.parametrize('change,code', [('hash','ARTIFACT_HASH_MISMATCH'), ('workspace','TENANT_SCOPE_VIOLATION'),
    ('context','STALE_ARTIFACT_CONTEXT'), ('future','INVALID_SEARCH_METRICS_WINDOW')])
def test_search_measurements_require_scoped_hash_verified_completed_snapshot(client, change, code):
    job = long_source_job(); data = search_snapshot(job)
    if change == 'hash': data['result']['rows'][0]['clicks'] = 999
    elif change == 'workspace': data['artifact']['workspace_id'] = str(uuid4())
    elif change == 'context': data['artifact']['context_snapshot_id'] = str(uuid4())
    else:
        data['result']['window_end'] = '2099-01-01'
        data = aggregate(job, data['result'], role='research')
    job['payload']['search_metrics'] = data
    response = client.post('/internal/v1/runs', json=job)
    assert response.status_code == 422 and code in response.text


def test_missing_gsc_stays_missing_and_never_becomes_a_zero(make_client):
    result = run_job(make_client(provider=LandscapeProvider(), provider_mode='live'), long_source_job())['result']['result']
    assert result['measurement_status'] == 'unavailable' and result['search_metrics_ref'] is None
    assert result['measurement_missing_facts'] == ['gsc_not_connected']
    assert result['findings'][0]['website_search_metrics'] == []


def test_old_fetch_and_duplicate_replay_remain_explicit(make_client):
    job = long_source_job()
    job['payload']['snapshot']['sources'][0]['provenance']['retrieved_at'] = '2025-01-01T00:00:00Z'
    client = make_client(provider=LandscapeProvider(), provider_mode='live')
    first = run_job(client, job); second = run_job(client, job)
    assert first['result'] == second['result'] and first['provider_calls'] == second['provider_calls'] == 1
    assert 'source_freshness_requires_reverification' in first['result']['result']['findings'][0]['missing_data']
    duplicate = deepcopy(job); duplicate['job_id'] = str(uuid4())
    duplicate['payload']['content_inventory'] = [{'content_id': str(uuid4()), 'workspace_id': job['workspace_id'], 'version': 1, 'title': 'Coworking spaces for remote-working expats'}]
    out = run_job(client, duplicate)
    assert out['result']['result']['findings'] == [] and 'DUPLICATE_TOPIC_DROPPED' in out['result']['warnings']


def test_used_source_quote_is_not_reproposed_under_a_different_title(make_client):
    job = long_source_job()
    quote = job['payload']['snapshot']['sources'][0]['chunks'][-1]['text']
    job['payload']['content_inventory'] = [{'content_id': str(uuid4()), 'workspace_id': job['workspace_id'],
        'version': 1, 'title': 'Existing article with another title', 'evidence_quotes': [quote]}]
    out = run_job(make_client(provider=LandscapeProvider(), provider_mode='live'), job)
    assert out['result']['result']['findings'] == []
    assert 'DUPLICATE_TOPIC_DROPPED' in out['result']['warnings']
