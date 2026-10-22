"""Synthetic request factories for six-role contract/eval/demo scenarios."""
import hashlib
import json
from copy import deepcopy
from uuid import uuid4

from examples.growth_lead_request import mock_research_request, growth_lead_request


def artifact_input(output):
    return {key: deepcopy(output[key]) for key in ("artifact", "result", "evidence")}


def context(base):
    return {key: deepcopy(base["payload"][key]) for key in ("workspace_id", "business_profile", "snapshot", "goal_context") if key in base["payload"]}


def request(base, operation, extra):
    job = deepcopy(base)
    job.update(job_id=str(uuid4()), operation=operation, trace_id=f"six-role-{operation}")
    job.pop("prompt_version", None)
    job["payload"] = {**context(base), **extra}
    return job


def aggregate(base, result, role=None):
    digest = hashlib.sha256(json.dumps({"result": result, "evidence": []}, sort_keys=True,
        ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return {"artifact": {"artifact_id": str(uuid4()), "workspace_id": base["workspace_id"], "version": 1,
        "context_snapshot_id": base["context_snapshot_id"], "role": role, "content_hash": digest, "storage": "ai_run_store"},
        "result": result, "evidence": []}


def metrics(base, missing=False, zero=False):
    return aggregate(base, {"workspace_id": base["workspace_id"], "snapshot_id": str(uuid4()), "version": 1,
        "window_start": "2026-10-01T00:00:00Z", "window_end": "2026-10-07T00:00:00Z",
        "qualified_visits": None if missing else 0 if zero else 12,
        "leads": None if missing else 0 if zero else 2,
        "impressions": None if missing else 0 if zero else 100,
        "clicks": None if missing else 0 if zero else 20, "synthetic": True})


def leads(base, count=2):
    return aggregate(base, {"workspace_id": base["workspace_id"], "version": 1, "count": count, "synthetic": True})


def image(base):
    return {"asset_id": str(uuid4()), "workspace_id": base["workspace_id"], "version": 1,
        "url": "https://example.org/mock-image.png", "content_hash": "a" * 64,
        "license": "Synthetic test fixture, not a real TripC asset", "attribution": "QQ test fixture",
        "status": "approved", "synthetic": True}
