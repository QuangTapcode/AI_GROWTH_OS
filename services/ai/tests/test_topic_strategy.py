import json
import hashlib
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from conftest import run_job
from examples.six_role_requests import artifact_input, growth_lead_request, request
from src.agents.research.strategy import topic_alignment, priority_order, strategy_missing_data
from src.agents.research.schemas import ResearchIdea
from src.app.schemas import BusinessProfile
from test_research_trends import LandscapeProvider, long_source_job

PRESET = json.loads((Path(__file__).resolve().parents[3] / 'config/workspaces/tripc-research-strategy.json').read_text(encoding='utf-8'))


def test_topic_priority_is_not_measured_demand_and_unknown_topics_stay_unmapped():
    profile = BusinessProfile(company='TripC', research_strategy=PRESET, locations=['Da Nang'])
    living = topic_alignment('Coworking spaces for remote workers', profile)
    assert living['topic_id'] == 'PT-02' and living['priority'] == 'high'
    assert living['basis'] == 'operator_strategy_not_measured_demand'
    community = topic_alignment('Language exchange meetups', profile)
    assert community['topic_id'] == 'PT-05' and community['priority'] == 'medium'
    assert priority_order(living) < priority_order(community)
    assert topic_alignment('Quantum semiconductor fabrication', profile) is None


def test_strategy_flows_research_to_plan_and_drafts_within_the_default_budget(make_client):
    base = long_source_job()
    base['payload']['business_profile']['research_strategy'] = PRESET
    base['payload']['business_profile']['topic_priority'] = [t['title'] for t in PRESET['topics']]
    provider = LandscapeProvider()
    first = run_job(make_client(provider=provider, provider_mode='live'), base)
    assert first['status'] == 'completed', first
    research = first['result']
    finding = research['result']['findings'][0]
    assert finding['strategy_alignment']['topic_id'] == 'PT-02'
    assert finding['demand_estimate'] is None
    assert 'editorial_strategy' in provider.user
    assert 'research_strategy' not in provider.user['profile']  # Compact context, no duplicate strategy block.
    client = make_client()
    job = growth_lead_request(base, research)
    job['payload']['score_factors'] = {}
    plan = run_job(client, job)
    assert plan['status'] == 'completed', plan
    result = plan['result']['result']
    assert result['strategy_alignment']['topic_id'] == 'PT-02'
    assert result['tasks'][0]['brief']['strategy_alignment']['objective_metrics'] == ['qualified_visits', 'leads']
    assert result['opportunity_score']['estimated'] is True
    seo = run_job(client, request(base, 'seo.local_draft', {'research': artifact_input(research), 'cta': 'Request the guide'}))
    assert seo['status'] == 'completed', seo
    assert seo['result']['result']['strategy_alignment']['topic_id'] == 'PT-02'
    social = run_job(client, request(base, 'content.repurpose', {'source_article': artifact_input(seo['result']), 'cta': 'Request the guide', 'target_channels': ['facebook']}))
    assert social['status'] == 'completed', social
    assert social['result']['result']['strategy_alignment']['topic_id'] == 'PT-02'
    assert 'airport transfer' not in ' '.join(base['payload']['business_profile']['products'])

    # A selected opportunity cannot bypass a document-required verification gate.
    unverified = deepcopy(research)
    unverified['result']['findings'][0]['missing_data'].append('official_source_required')
    unverified['artifact']['content_hash'] = hashlib.sha256(json.dumps(
        {'result': unverified['result'], 'evidence': unverified['evidence']}, sort_keys=True,
        ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    blocked_job = growth_lead_request(base, unverified)
    blocked_job['job_id'] = str(uuid4())
    blocked_job['payload']['score_factors'] = {}
    blocked = run_job(client, blocked_job)
    assert blocked['status'] == 'completed', blocked
    assert blocked['result']['result']['status'] == 'blocked'
    assert 'official_source_required' in blocked['result']['result']['missing_facts']


def test_document_requirements_block_unverified_sensitive_and_commercial_claims():
    profile = BusinessProfile(company='TripC', products=['housing'], research_strategy=PRESET)
    idea = ResearchIdea(topic='Banking for new arrivals', audience_fit='Expats need help.',
        offer_fit='TripC offers housing and airport transfer.', rationale='Bank account guidance is useful.',
        chunk_id='c', quote='A bank account may be needed for local payments.', keywords=['banking'], user_need='Open a bank account.')
    missing = strategy_missing_data(idea, profile, 'https://tripc.ai/blog/example')
    assert 'official_source_required' in missing
    assert 'confirmed_service_capability_required' in missing
    assert 'official_source_required' not in strategy_missing_data(idea, profile, 'https://sbv.gov.vn/example')
