"""A job may make three provider calls, and the optional third can never cost the job its main output."""
from datetime import datetime, timedelta, timezone

from src.app.config import Settings
from src.app.runtime import CallBudget, RunContext


class Calls:
    def __init__(self, used):
        self.used = used

    def provider_calls(self, job_id):
        return self.used


def context(seconds_left, used=1, provider_timeout=240):
    return RunContext(job=None, payload=None, settings=Settings(provider_timeout_seconds=provider_timeout), provider=None,
                      budget=CallBudget(Calls(used), "job", 3), logger=None,
                      deadline_at=datetime.now(timezone.utc) + timedelta(seconds=seconds_left))


def test_a_job_may_make_three_provider_calls():
    assert Settings().max_provider_calls == 3


def test_an_optional_call_runs_while_the_slowest_call_still_fits_before_the_deadline():
    assert context(seconds_left=300).optional_call_blocker() is None


def test_an_optional_call_is_refused_when_a_slow_call_would_hit_the_job_deadline():
    assert context(seconds_left=200).optional_call_blocker() == "NOT_ENOUGH_TIME"


def test_an_optional_call_is_refused_when_the_job_has_no_calls_left():
    assert context(seconds_left=300, used=3).optional_call_blocker() == "NO_PROVIDER_CALLS_LEFT"
