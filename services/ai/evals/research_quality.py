"""Run bounded Research quality cases against an exported backend JobRequest.

No fixture or source approval is manufactured. Outputs stay in an isolated run
store; a technical pass is not semantic acceptance or production publication.
"""
import argparse
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from fastapi.testclient import TestClient

from src.app.config import Settings
from src.app.main import create_app
from evals.run_single_role import run_job


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--topics', nargs='+', default=['housing', 'coworking', 'food'])
    parser.add_argument('--mode', choices=['live', 'gemini'], default='live')
    args = parser.parse_args()
    base = json.loads(args.request.read_text(encoding='utf-8'))
    reports = []
    args.out.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='research-quality-') as directory:
        settings = replace(Settings.from_env(), provider_mode=args.mode, run_store_path=str(Path(directory) / 'runs.sqlite3'))
        with TestClient(create_app(settings)) as client:
            for topic in args.topics[:3]:
                job = deepcopy(base)
                job['job_id'] = str(uuid4())
                job['trace_id'] = f'research-quality:{topic}'
                job['payload']['business_profile']['topic_priority'] = [topic]
                record = {'requested_topic': topic, 'request': job, 'context_origin': 'backend_snapshot_with_evaluation_focus',
                          'production_publication': False}
                try:
                    output = run_job(client, job)
                    replay = run_job(client, job)
                    record.update(output=output, replay_identical=output == replay,
                                  verdict='REQUIRES_SEMANTIC_REVIEW' if output['result']['findings'] else 'INSUFFICIENT_FINDINGS')
                except Exception as error:
                    record.update(verdict='RUN_FAILED', error=str(error))
                path = args.out / f'{topic}.json'
                path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                reports.append({'topic': topic, 'verdict': record['verdict'], 'file': path.name})
                print(json.dumps(reports[-1]), flush=True)
            client.app.state.store.close()
    summary = {'generated_at': datetime.now(timezone.utc).isoformat(), 'cases': reports,
               'semantic_acceptance': 'pending_review', 'gsc_live': 'requires_configured_workspace_property'}
    (args.out / 'run-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
