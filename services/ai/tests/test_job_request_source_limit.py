"""A knowledge context grows with every approved source; past 100 every Research and Community run was refused."""
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.app.schemas import JobRequest


def _request(n_sources: int) -> dict:
    return {
        "job_id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "operation": "research.run",
        "input_version": 1,
        "trace_id": "trace-1",
        "approved_source_versions": [{"source_id": str(uuid4()), "version": 1} for _ in range(n_sources)],
    }


def test_a_context_with_more_than_a_hundred_sources_is_accepted():
    assert len(JobRequest.model_validate(_request(106)).approved_source_versions) == 106


def test_the_source_list_still_has_an_upper_bound():
    with pytest.raises(ValidationError):
        JobRequest.model_validate(_request(501))
