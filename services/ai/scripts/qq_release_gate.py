"""Build an evidence-based sandbox/release verdict without fabricating reviewer approvals."""
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'qa/evidence/qq-all-2026-10-17'


def main():
    checks = []
    files = ['six-role-fake-eval.json', 'six-role-live-eval.json', 'baseline-fake-eval.json', 'baseline-live-eval.json', 'fake-db-pipeline.json', 'live-db-pipeline.json', 'api-unit.json', 'worker-unit.json', 'fake-db-summary.json', 'live-db-summary.json', 'verification-summary.json']
    for name in files:
        path = EVIDENCE / name
        if not path.exists(): checks.append(dict(file=name, passed=False, reason='missing')); continue
        value = json.loads(path.read_text(encoding='utf-8'))
        if name.startswith('baseline-'): passed = value['summary']['meets_thresholds'] and value['summary']['all']['passed'] == 30
        elif name in ('api-unit.json', 'worker-unit.json'): passed = value['numFailedTests'] == 0 and value['numPassedTests'] > 0
        else: passed = value.get('passed') is True
        checks.append(dict(file=name, passed=passed, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    suites = ET.parse(EVIDENCE / 'ai-unit.xml').getroot().findall('testsuite')
    tests = sum(int(s.attrib['tests']) for s in suites)
    checks.append(dict(file='ai-unit.xml', passed=tests > 0 and all(int(s.attrib['failures']) + int(s.attrib['errors']) == 0 for s in suites), tests=tests))
    fake = json.loads((EVIDENCE / 'six-role-fake-eval.json').read_text(encoding='utf-8'))
    live = json.loads((EVIDENCE / 'six-role-live-eval.json').read_text(encoding='utf-8'))
    checks.append(dict(check='frozen_fake_live_inputs', passed=all(fake[key] == live[key] for key in ('dataset_sha256', 'prompt_hashes', 'contract_sha256', 'rubric'))))
    current = ROOT / 'contracts/schemas/ai-six-role-contracts.json'
    checks.append(dict(check='current_contract_matches_eval', passed=hashlib.sha256(current.read_bytes()).hexdigest() == live['contract_sha256']))
    passed = all(c['passed'] for c in checks)
    decision = dict(candidate='QQ-01 through QQ-09', synthetic=True, automated_checks_passed=passed,
        sandbox_decision='ready_for_independent_review' if passed else 'hold_for_fixes', production_decision='HOLD', checks=checks,
        independent_approvals=None, remaining=['Business source/profile/CTA/asset rights', 'Real metrics/lead aggregate connector and owner consent', 'Website publish/form/dashboard staging UAT', 'Independent BA/QA/API/worker review and dependency signoff', 'Backup/restore and kill-test timeout investigation if recurrent'])
    (EVIDENCE / 'release-decision.json').write_text(json.dumps(decision, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(automated_checks_passed=passed, production_decision='HOLD')))
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__': main()
