import json
from copy import deepcopy
from uuid import uuid4

import pytest

from conftest import run_job
from examples.six_role_requests import aggregate
from src.agents.research.pipeline import fallback_quote
from test_research_trends import ClaimProvider, LandscapeProvider, long_source_job, signal


class IncompleteExplanationProvider(LandscapeProvider):
    """Model-like output with grounded content but omitted terminal punctuation."""

    async def chat_json(self, *, user, **kwargs):
        content, usage = await super().chat_json(user=user, **kwargs)
        draft = json.loads(content)
        for key in ("audience_fit", "offer_fit", "rationale", "user_need"):
            draft["ideas"][0][key] = draft["ideas"][0][key].rstrip(".!?")
        return json.dumps(draft), usage


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


def test_incomplete_model_idea_can_fallback_to_grounded_excerpt(make_client):
    job = long_source_job()
    job['payload']['trend_signals'] = [signal('Coworking spaces in Da Nang for expats')]
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'), job)
    result = out['result']['result']
    assert result['status'] == 'ready_for_handoff'
    assert len(result['findings']) == 1
    assert all(result['findings'][0][key].endswith('.') for key in
               ('audience_fit', 'offer_fit', 'rationale', 'user_need'))
    assert result['findings'][0]['evidence']['quote']
    assert 'INCOMPLETE_BRIEF_DROPPED' in out['result']['warnings']
    assert 'GROUNDED_FALLBACK_USED' in out['result']['warnings']


def community_events_job(products):
    job = long_source_job()
    job['payload']['business_profile']['products'] = products
    job['payload']['snapshot']['sources'][0]['chunks'][-1]['text'] = (
        'Community events in Da Nang, such as language exchanges and sports meetups, help new expats meet people quickly.')
    job['payload']['trend_signals'] = [{**signal('Expat meetups and community events in Da Nang'),
                                        'query': 'Da Nang community events expats'}]
    return job


def test_fallback_relates_topic_to_the_offer_it_names_not_the_first_offer(make_client):
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'),
                  community_events_job(['housing', 'events']))
    finding = out['result']['result']['findings'][0]
    assert finding['topic'] == 'community events'
    assert 'events offering' in finding['offer_fit'] and 'housing' not in finding['offer_fit']
    assert 'GROUNDED_FALLBACK_USED' in out['result']['warnings']


def test_fallback_does_not_repropose_an_excerpt_existing_content_already_cites(make_client):
    job = community_events_job(['events'])
    quote = job['payload']['snapshot']['sources'][0]['chunks'][-1]['text']
    job['payload']['content_inventory'] = [{'content_id': str(uuid4()), 'workspace_id': job['workspace_id'], 'version': 1,
                                            'title': 'Meeting people in a new city', 'evidence_quotes': [quote]}]
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'), job)
    assert out['result']['result']['findings'] == []
    assert out['result']['result']['status'] == 'insufficient_data'
    assert 'DUPLICATE_TOPIC_DROPPED' in out['result']['warnings']


def test_fallback_does_not_repropose_a_topic_existing_content_already_covers(make_client):
    job = community_events_job(['events'])
    job['payload']['content_inventory'] = [{'content_id': str(uuid4()), 'workspace_id': job['workspace_id'], 'version': 1,
                                            'title': 'Community events in Da Nang for new expats'}]
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'), job)
    assert out['result']['result']['findings'] == []
    assert 'DUPLICATE_TOPIC_DROPPED' in out['result']['warnings']


def test_fallback_prefers_the_offer_the_owner_asked_for(make_client):
    job = long_source_job()
    job['payload']['business_profile']['products'] = ['coworking', 'food']
    job['payload']['snapshot']['sources'][0]['chunks'].append({'chunk_id': 'food', 'locator': 'paragraph:100',
        'text': 'Street food markets in Da Nang serve expats fresh local dishes every evening near the river.'})
    job['payload']['trend_signals'] = [signal('Coworking spaces in Da Nang for expats'),
                                       {**signal('Street food guide for Da Nang expats', rank=2), 'query': 'Da Nang food expats'}]
    job['payload']['goal_context'] = {'objective': 'Quảng bá ẩm thực Đà Nẵng cho khách nước ngoài', 'focus_offers': ['food']}
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'), job)
    assert out['status'] == 'completed', out
    finding = out['result']['result']['findings'][0]
    assert finding['topic'] == 'food' and finding['evidence']['chunk_id'] == 'food'


def test_an_excerpt_from_a_source_chunk_existing_content_is_built_on_is_not_reproposed(make_client):
    job = community_events_job(['events'])
    # Existing article cites another sentence of the same source chunk.
    job['payload']['content_inventory'] = [{'content_id': str(uuid4()), 'workspace_id': job['workspace_id'], 'version': 1,
                                            'title': 'Meeting people in a new city', 'evidence_chunk_ids': ['work']}]
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'), job)
    assert out['status'] == 'completed', out
    assert out['result']['result']['findings'] == []
    assert 'DUPLICATE_TOPIC_DROPPED' in out['result']['warnings']


def test_fallback_without_a_matching_offer_stays_insufficient(make_client):
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'),
                  community_events_job(['housing']))
    result = out['result']['result']
    assert result['findings'] == [] and result['status'] == 'insufficient_data'
    assert 'FALLBACK_NO_MATCHING_OFFER' in out['result']['warnings']
    # Clean excerpts existed; the gap is the offer, not the guardrails.
    assert 'no_eligible_chunks_after_guardrails' not in result['missing_facts']


def test_fallback_quote_cites_whole_sentences_not_a_mid_sentence_window():
    sentence = ('Da Nang is a strong choice too, with fast café Wi-Fi, though its coworking scene '
                'is smaller than the two big cities.')
    text = f'Choosing a city.\n\n{sentence} Never sign a monthly lease before testing the connection.'
    assert fallback_quote(text, ['coworking']) == sentence


def test_fallback_quote_prefers_the_profile_location_over_another_city():
    other = 'Ho Chi Minh City has the largest and best-equipped coworking scene in the country.'
    local = 'Da Nang has fast café Wi-Fi, though its coworking scene is smaller than the two big cities.'
    assert fallback_quote(f'{other} {local}', ['coworking'], ['Da Nang']) == local


def test_seo_keyword_metadata_is_not_cited_over_article_text(make_client):
    job = community_events_job(['events'])
    job['payload']['snapshot']['sources'][0]['chunks'].insert(0, {'chunk_id': 'meta', 'locator': 'paragraph:0', 'text': (
        'TripC official website. Description: Discover community events in Da Nang. Keywords: Da Nang community events, '
        'Da Nang expat events, Da Nang coworking, Da Nang food guide')})
    out = run_job(make_client(provider=IncompleteExplanationProvider(), provider_mode='live'), job)
    assert out['result']['result']['findings'][0]['evidence']['chunk_id'] == 'work'
    assert 'METADATA_EXCERPT_EXCLUDED' in out['result']['warnings']


def test_fallback_quote_from_a_long_excerpt_fits_the_brief_limit(make_client):
    job = community_events_job(['events'])
    job['payload']['snapshot']['sources'][0]['chunks'][-1]['text'] = (
        'Community events in Da Nang help newcomers meet neighbours through '
        + 'multilingual conversation evenings and weekend volunteering projects ' * 12).strip()
    provider = ClaimProvider(topic='Cancer treatment', keywords=['oncology'],
                             quote='Community events in Da Nang help newcomers meet neighbours')
    out = run_job(make_client(provider=provider, provider_mode='live'), job)
    assert out['status'] == 'completed', out
    finding = out['result']['result']['findings'][0]
    assert finding['topic'] == 'community events' and len(finding['evidence']['quote']) <= 400


def test_search_topic_can_recover_one_grounded_finding_after_off_topic_model_draft(make_client):
    job = long_source_job()
    job['payload']['trend_signals'] = [signal('Coworking spaces in Da Nang for expats')]
    out = run_job(make_client(provider=ClaimProvider(topic='Cancer treatment', keywords=['oncology']), provider_mode='live'), job)
    result = out['result']['result']
    assert result['status'] == 'ready_for_handoff'
    assert result['findings'][0]['topic'] == 'coworking'
    assert result['findings'][0]['evidence']['chunk_id'] == 'work'
    assert 'GROUNDED_FALLBACK_USED' in out['result']['warnings']


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


def test_large_inventory_is_bounded_in_prompt_but_all_items_are_deduplicated(make_client):
    job = long_source_job()
    items = [{'content_id': str(uuid4()), 'workspace_id': job['workspace_id'], 'version': 1,
              'title': f'Article {i}: ' + 'unrelated background content and archived guide ' * 3} for i in range(99)]
    items.append({'content_id': str(uuid4()), 'workspace_id': job['workspace_id'], 'version': 1,
                  'title': 'Coworking spaces for remote-working expats'})
    job['payload']['content_inventory'] = items
    provider = LandscapeProvider()
    body = run_job(make_client(provider=provider, provider_mode='live'), job)
    assert body['status'] == 'completed', body
    assert len(provider.user['inventory']) <= 12
    assert body['result']['result']['findings'] == []
    assert 'DUPLICATE_TOPIC_DROPPED' in body['result']['warnings']
