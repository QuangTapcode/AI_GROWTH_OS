from conftest import run_job
from examples.six_role_requests import aggregate, artifact_input, metrics, mock_research_request, request
from test_kpi_baseline import measured


def test_partial_provider_coverage_never_claims_comparable_lift(client):
    base = mock_research_request()
    current, previous = measured(base), measured(base, previous=True)
    current['result']['coverage'] = {'clicks': {'status': 'partial', 'timezone': 'America/Los_Angeles'}}
    previous['result']['coverage'] = {'clicks': {'status': 'available', 'timezone': 'America/Los_Angeles'}}
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, current['result']),
        'baseline_metrics': aggregate(base, previous['result'])}))['result']['result']
    comparison = next(c for c in result['kpi_comparisons'] if c['metric_name'] == 'clicks')
    assert comparison['status'] == 'incomplete_coverage'
    assert comparison['relative_change_pct'] is None
    assert result['status'] == 'insufficient_data'


def test_future_experiment_proposal_is_valid_without_future_measurements(client):
    base = mock_research_request()
    experiment = {'hypothesis': 'A clearer CTA may improve conversion', 'control_variant': 'Ask TripC',
        'treatment_variant': 'Request the guide', 'primary_metric': 'leads', 'grouping': 'visitor',
        'period': {'start': '2099-01-01T00:00:00Z', 'end': '2099-01-08T00:00:00Z'}}
    result = run_job(client, request(base, 'experiment.hypothesis', {'metrics': metrics(base), 'experiment': experiment}))
    assert result['status'] == 'completed'
    assert result['result']['result']['spend_mutation_allowed'] is False


def test_learning_does_not_combine_real_leads_from_a_different_window(client):
    base = mock_research_request()
    source = metrics(base)
    performance = run_job(client, request(base, 'analytics.report', {'metrics': source}))['result']
    summary = aggregate(base, {'workspace_id': base['workspace_id'], 'version': 1, 'count': 3, 'synthetic': False,
        'metrics_artifact_id': source['artifact']['artifact_id'], 'window_start': '2026-09-01T00:00:00+00:00',
        'window_end': '2026-09-08T00:00:00+00:00'})
    result = run_job(client, request(base, 'learning.analyze', {'performance': artifact_input(performance), 'lead_summary': summary}))['result']['result']
    assert result['next_tasks'] == []
    assert 'matching_lead_measurement_window' in result['missing_facts']


def test_top_article_is_selected_by_measured_engagement_not_input_order(client):
    base = mock_research_request()
    data = metrics(base)['result']
    data['content_metrics'] = [{'slug': 'low', 'title': 'Low engagement', 'page_views': 100, 'cta_clicks': 0},
        {'slug': 'high', 'title': 'High engagement', 'page_views': 20, 'cta_clicks': 5}]
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data)}))['result']['result']
    assert any("Top article 'High engagement'" in observation for observation in result['observations'])


def test_cvr_uses_converted_sessions_and_never_guesses_from_raw_lead_count(client):
    base = mock_research_request()
    data = metrics(base)['result']
    data.update(qualified_visits=10, converted_visits=2, leads=100)
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data)}))['result']['result']
    assert result['metrics']['cvr'] == 20
    data.pop('converted_visits')
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data)}))['result']['result']
    assert 'cvr' not in result['metrics']


def test_cpl_uses_leads_in_the_provider_window_and_rejects_partial_or_mismatched_coverage(client):
    base = mock_research_request()
    data = metrics(base)['result']
    coverage = {'from': '2026-10-01', 'to': '2026-10-07', 'timezone': 'America/Los_Angeles', 'status': 'available'}
    data.update(ad_spend=700, leads=100, spend_window_leads=10, currency='USD',
                coverage={'ad_spend': coverage, 'cpl': dict(coverage)})
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data)}))['result']['result']
    assert result['metrics']['cpl'] == 70  # Rolling-window leads would incorrectly produce 7.
    data['coverage']['cpl']['to'] = '2026-10-06'
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data)}))['result']['result']
    assert 'cpl' not in result['metrics']
    data['coverage'] = {'ad_spend': {**coverage, 'status': 'partial'}, 'cpl': {**coverage, 'status': 'partial'}}
    result = run_job(client, request(base, 'analytics.report', {'metrics': aggregate(base, data)}))['result']['result']
    assert 'cpl' not in result['metrics']
