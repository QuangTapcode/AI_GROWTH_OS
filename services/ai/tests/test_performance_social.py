"""Contract acceptance with controlled observations, never live-provider acceptance."""
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError
from conftest import run_job
from examples.six_role_requests import aggregate, artifact_input, leads, mock_research_request, request
from src.agents.performance.schemas import MetricsData
from src.agents.performance.baseline import metric_value
from src.agents.research.schemas import ResearchPayload
from src.app.schemas import Usage


def measured(base):
    return {"workspace_id": base["workspace_id"], "snapshot_id": str(uuid4()), "version": 1,
            "window_start": "2026-10-01T00:00:00Z", "window_end": "2026-10-08T00:00:00Z",
            "captured_at": "2026-10-08T01:00:00Z", "synthetic": True,
            "qualified_visits": 8, "leads": 1, "clicks": 20, "impressions": 500,
            "ad_clicks": 3, "ad_impressions": 100,
            "social_posts": [{"workspace_id": base["workspace_id"], "publishing_job_id": str(uuid4()),
                "content_id": str(uuid4()), "artifact_id": str(uuid4()), "artifact_version": 2,
                "external_post_id": "123_456", "published_at": "2026-10-02T00:00:00Z",
                "captured_at": "2026-10-08T00:30:00Z", "counters": {"reactions": 0, "comments": None, "shares": 4},
                "missing_reasons": {"comments": "COUNTER_NOT_RETURNED"}}]}


def test_advertising_ctr_does_not_use_organic_clicks():
    data = MetricsData.model_validate(measured(mock_research_request()))
    assert metric_value(data, 'ctr') == 4
    assert metric_value(data, 'ad_ctr') == 3


@pytest.mark.parametrize('change', ['tenant', 'future', 'outside_window', 'negative'])
def test_reject_unscoped_or_invalid_social_observations(change):
    data = measured(mock_research_request())
    post = data['social_posts'][0]
    if change == 'tenant':
        post['workspace_id'] = str(uuid4())
    elif change == 'future':
        post['captured_at'] = '2026-10-09T00:00:00Z'
    elif change == 'outside_window':
        post['published_at'] = '2026-09-30T00:00:00Z'
    else:
        post['counters']['shares'] = -1
    with pytest.raises(ValidationError):
        MetricsData.model_validate(data)


def test_performance_learning_passes_versioned_channel_observations_to_research(client):
    base = mock_research_request()
    data = measured(base)
    performance = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data, role='performance')}))
    assert performance['status'] == 'completed', performance
    report = performance['result']['result']
    assert report['status'] == 'draft', report
    assert report['social_posts'][0]['counters']['comments'] is None
    learning = run_job(client, request(base, 'learning.analyze', {'performance': artifact_input(performance['result']), 'lead_summary': leads(base, count=1)}))
    assert learning['status'] == 'completed', learning
    result = learning['result']['result']
    assert result['next_tasks'][0]['requires_human_approval'] is True
    lesson = result['lessons']['channel_observations'][0]
    assert 'v2' in lesson and 'shares=4' in lesson and 'lifetime' in lesson
    assert 'comments=0' not in lesson
    ResearchPayload.model_validate({**base['payload'], 'lessons': result['lessons']})


def test_channel_learning_reaches_research_provider_prompt(make_client):
    from test_research import research_job

    class Provider:
        model_version = 'test/channel-lessons'
        embedding_model_version = 'test/embed'
        called = False

        async def chat_json(self, *, user, fake, **kwargs):
            assert json.loads(user)['lessons']['channel_observations'] == ['Post 123_456: shares=4; lifetime observation, not causal.']
            self.called = True
            return json.dumps(fake()), Usage(llm_calls=1)

    provider = Provider()
    job = research_job()
    job['payload']['lessons'] = {'channel_observations': ['Post 123_456: shares=4; lifetime observation, not causal.']}
    out = run_job(make_client(provider=provider), job)
    assert out['status'] == 'completed', out
    assert provider.called


def test_group_native_period_is_preserved_and_new_members_not_inferred(client):
    base = mock_research_request()
    data = measured(base)
    post = data['social_posts'][0]
    post.update(provider='facebook_group', group_id='1134282109069209', external_post_id='1234567')
    data['group_metrics'] = [{'workspace_id': base['workspace_id'], 'group_id': '1134282109069209',
        'source': 'facebook_group_browser', 'captured_at': '2026-10-08T00:30:00Z',
        'period_from': '2026-09-01', 'period_to': '2026-09-28', 'timezone': 'provider_unspecified',
        'source_url': 'https://www.facebook.com/groups/1134282109069209/insights/?section=engagement',
        'total_members': 7, 'metrics': {'posts': 6, 'comments': 1, 'reactions': 2, 'new_members': None},
        'missing_reasons': {'new_members': 'COUNTER_NOT_VISIBLE'}}]
    output = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data, role='performance')}))
    assert output['status'] == 'completed', output
    report = output['result']['result']
    assert report['group_metrics'][0]['period_to'] == '2026-09-28'
    assert report['group_metrics'][0]['metrics']['new_members'] is None
    assert report['social_posts'][0]['provider'] == 'facebook_group'
    learning = run_job(client, request(base, 'learning.analyze', {'performance': artifact_input(output['result']), 'lead_summary': leads(base, count=1)}))
    assert learning['status'] == 'completed', learning
    notes = learning['result']['result']['lessons']['channel_observations']
    assert any('facebook_group post' in note for note in notes)
    assert any('2026-09-28' in note and 'new_members=unavailable' in note for note in notes)
    data['group_metrics'][0]['workspace_id'] = str(uuid4())
    with pytest.raises(ValidationError):
        MetricsData.model_validate(data)
