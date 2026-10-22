"""Frozen six-role contract eval; fake/live reports and independent review stay separate."""
import argparse
import hashlib
import json
import tempfile
import time
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4
from fastapi.testclient import TestClient
from src.app.config import Settings
from src.app.main import create_app
from examples.six_role_requests import artifact_input, mock_research_request, growth_lead_request, request, metrics, leads, image

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['fake', 'live'], required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    dataset_path = Path(__file__).with_name('six_roles_dataset.json')
    dataset = json.loads(dataset_path.read_text(encoding='utf-8'))
    report = dict(mode=args.mode, synthetic=True, dataset_version=dataset['version'],
        dataset_sha256=hashlib.sha256(dataset_path.read_bytes()).hexdigest(), rubric=dataset['rubric'], cases=[], artifacts=[])
    report['prompt_hashes'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT / 'prompts').glob('*.md'))}
    report['contract_sha256'] = hashlib.sha256((ROOT.parents[1] / 'contracts/schemas/ai-six-role-contracts.json').read_bytes()).hexdigest()
    if args.mode == 'live':
        with urlopen('http://127.0.0.1:11434/api/tags', timeout=10) as response:
            report['model_digests'] = [{'name': m['name'], 'digest': m['digest']} for m in json.load(response)['models']]
    with tempfile.TemporaryDirectory(prefix='qq-eval-') as directory:
        settings = replace(Settings(), provider_mode=args.mode, run_store_path=str(Path(directory) / 'runs.sqlite3'))
        report['limits'] = dict(context_tokens=settings.max_context_tokens, output_tokens=settings.max_output_tokens, provider_calls=settings.max_provider_calls, concurrent_llm_jobs=1)
        with TestClient(create_app(settings)) as client:
            def run(job):
                post = client.post('/internal/v1/runs', json=job)
                assert post.status_code in (200, 202), post.text
                deadline = time.monotonic() + 600
                while time.monotonic() < deadline:
                    body = client.get('/internal/v1/runs/' + post.json()['run_id']).json()
                    if body['status'] in ('completed', 'failed'):
                        assert body['status'] == 'completed', body
                        out = body['result']
                        report['artifacts'].append(dict(artifact=out['artifact'], prompt_version=out['prompt_version'], model_version=out['model_version'], usage=out['usage']))
                        assert out['usage']['llm_calls'] <= 2
                        return out
                    time.sleep(.05)
                raise AssertionError('Run deadline exceeded')

            base = mock_research_request()
            jobs, outputs = {'research': base}, {}
            for case in dataset['cases']:
                name = case['scenario']
                try:
                    if name in ('research', 'plan', 'seo', 'content', 'community', 'performance', 'learning'):
                        if name == 'plan': jobs[name] = growth_lead_request(base, outputs['research'])
                        elif name == 'seo': jobs[name] = request(base, 'seo.local_draft', {'research': artifact_input(outputs['research']), 'cta': 'Request the guide'})
                        elif name == 'content': jobs[name] = request(base, 'content.repurpose', {'source_article': artifact_input(outputs['seo']), 'cta': 'Request the guide', 'assets': [image(base)]})
                        elif name == 'community': jobs[name] = request(base, 'community.response', {'question': 'Can you explain living areas for newcomers?'})
                        elif name == 'performance': jobs[name] = request(base, 'analytics.report', {'metrics': metrics(base)})
                        elif name == 'learning': jobs[name] = request(base, 'learning.analyze', {'performance': artifact_input(outputs['performance']), 'lead_summary': leads(base)})
                        out = run(jobs[name]); outputs[name] = out; result = out['result']
                        assert result['synthetic'] is True and result['requires_human_approval'] is True
                        assert result.get('applied', False) is False
                        if name == 'research':
                            assert result['status'] == 'ready_for_handoff' and not result['missing_facts']
                            assert all(f['keywords'] and f['user_need'] and f['url'] and f['fetched_at'] for f in result['findings'])
                        elif name == 'plan':
                            assert result['status'] == 'proposed' and result['opportunity_score']['score'] == 729 and result['opportunity_score']['estimated']
                            assert len(result['tasks']) == 2 and all(t['deadline'] for t in result['tasks'])
                        else:
                            assert result['status'] == 'draft'
                            if name == 'seo': assert all(result['seo_checks'].values()) and result['citations']
                            elif name == 'content': assert result['image_assets'] and result['parent_content_id'] == outputs['seo']['result']['article_id'] and result['parent_version'] == outputs['seo']['artifact']['version']
                            elif name == 'community': assert result['citations'] and not result['escalation_required']
                            elif name == 'performance': assert result['window'] and result['metric_snapshot_id'] and result['spend_mutation_allowed'] is False
                            elif name == 'learning': assert len(result['next_tasks']) == 1 and result['next_tasks'][0]['dedup_key'] and result['next_tasks'][0]['input_artifact_refs']
                    elif ':' in name:
                        guard, role = name.split(':'); job = deepcopy(jobs[role]); job['job_id'] = str(uuid4())
                        if guard == 'tenant': job['payload']['workspace_id'] = str(uuid4())
                        else: job['constraints'] = {'human_approval_required': False}
                        assert client.post('/internal/v1/runs', json=job).status_code == 422
                    elif name.startswith('tampered_'):
                        role, field = ('seo', 'research') if name == 'tampered_seo_parent' else ('content', 'source_article')
                        job = deepcopy(jobs[role]); job['job_id'] = str(uuid4()); job['payload'][field]['result']['workspace_id'] = str(uuid4())
                        assert client.post('/internal/v1/runs', json=job).status_code == 422
                    elif name == 'foreign_asset':
                        job = deepcopy(jobs['content']); job['job_id'] = str(uuid4()); job['payload']['assets'][0]['workspace_id'] = str(uuid4())
                        assert client.post('/internal/v1/runs', json=job).status_code == 422
                    elif name in ('missing_metrics', 'zero_metrics'):
                        out = run(request(base, 'analytics.report', {'metrics': metrics(base, missing=name == 'missing_metrics', zero=name == 'zero_metrics')}))['result']
                        assert out['status'] == ('insufficient_data' if name == 'missing_metrics' else 'draft')
                        assert all(v is None if name == 'missing_metrics' else v == 0 for v in out['metrics'].values())
                    elif name.startswith('learning_') or name == 'missing_learning_metrics':
                        extra = {k: deepcopy(v) for k, v in jobs['learning']['payload'].items() if k in ('performance', 'lead_summary')}
                        if name == 'learning_quota': extra['task_quota'] = 0; expected = 'task_quota'
                        elif name == 'learning_max': extra['iteration'] = 3; expected = 'max_iterations'
                        else: extra['performance'] = None; expected = 'insufficient_data'
                        out = run(request(base, 'learning.analyze', extra))['result']
                        assert out['next_tasks'] == [] and out['stopped_reason'] == expected
                    elif name == 'community_price':
                        out = run(request(base, 'community.response', {'question': 'What is the monthly rent?'}))['result']
                        assert out['escalation_required'] and out['status'] == 'insufficient_data' and not out['citations']
                    else: raise AssertionError('Unknown frozen scenario')
                    report['cases'].append({**case, 'passed': True})
                except Exception as error:
                    report['cases'].append({**case, 'passed': False, 'error': str(error)})
            client.app.state.store.close()
    report['passed'] = len(report['cases']) == 30 and all(c['passed'] for c in report['cases'])
    report['independent_qa_approval'] = None
    output = Path(args.out); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'mode': args.mode, 'passed': sum(c['passed'] for c in report['cases']), 'total': len(report['cases']), 'output': str(output)}))
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
