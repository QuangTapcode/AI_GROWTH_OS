"""Performance reports which articles people read and acted on; Learning turns that into lessons for Research."""
from uuid import uuid4

from conftest import run_job
from examples.six_role_requests import aggregate, artifact_input, leads, mock_research_request, request

ARTICLES = [{"slug": "street-food", "title": "Street Food in Da Nang", "page_views": 40, "cta_clicks": 6},
            {"slug": "cafes", "title": "Cafes for Remote Work", "page_views": 30, "cta_clicks": 0},
            {"slug": "rare", "title": "A Rarely Read Note", "page_views": 2, "cta_clicks": 0}]


def metrics_with(base, content_metrics):
    return aggregate(base, {"workspace_id": base["workspace_id"], "snapshot_id": str(uuid4()), "version": 1,
                            "window_start": "2026-10-01T00:00:00Z", "window_end": "2026-10-08T00:00:00Z", "synthetic": True,
                            "qualified_visits": 8, "leads": 1, "clicks": 20, "impressions": 500, "content_metrics": content_metrics}, role="performance")


def report(client, content_metrics=ARTICLES):
    base = mock_research_request()
    body = run_job(client, request(base, "analytics.report", {"metrics": metrics_with(base, content_metrics)}))
    assert body["status"] == "completed", body
    return base, body["result"]


def test_the_report_says_which_articles_were_read_and_acted_on(client):
    _, out = report(client)
    result = out["result"]
    assert result["content_metrics"] == [{**article, "qualified_visits": None, "leads": None} for article in ARTICLES]
    assert any("Street Food in Da Nang" in line and "40" in line and "6" in line for line in result["observations"])


def test_the_report_without_article_data_stays_as_it_was(client):
    _, out = report(client, content_metrics=[])
    assert out["result"]["content_metrics"] == [] and not any("views" in line for line in out["result"]["observations"])


def learn(client, content_metrics=ARTICLES):
    base, performance = report(client, content_metrics)
    body = run_job(client, request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base, count=1)}))
    assert body["status"] == "completed", body
    return body["result"]["result"]


def test_learning_separates_what_readers_acted_on_from_what_they_only_read(client):
    lessons = learn(client)["lessons"]
    assert lessons == {"promising_titles": ["Street Food in Da Nang"], "weak_titles": ["Cafes for Remote Work"]}


def test_an_article_with_too_few_readers_teaches_nothing(client):
    lessons = learn(client, [{"slug": "rare", "title": "A Rarely Read Note", "page_views": 2, "cta_clicks": 0}])["lessons"]
    assert lessons == {"promising_titles": [], "weak_titles": []}


def test_learning_states_the_lesson_in_words_for_the_owner(client):
    result = learn(client)
    assert any("Street Food in Da Nang" in line for line in result["learning"])


def test_views_on_an_article_count_as_something_measured(client):
    # A visit without a CTA click is no qualified visit, yet readers came: not "nothing to learn from".
    base = mock_research_request()
    item = aggregate(base, {"workspace_id": base["workspace_id"], "snapshot_id": str(uuid4()), "version": 1,
                            "window_start": "2026-10-01T00:00:00Z", "window_end": "2026-10-08T00:00:00Z", "synthetic": True,
                            "qualified_visits": 0, "leads": 0, "clicks": 0, "impressions": 0, "content_metrics": ARTICLES[1:]}, role="performance")
    performance = run_job(client, request(base, "analytics.report", {"metrics": item}))["result"]
    result = run_job(client, request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base, count=0)}))["result"]["result"]
    assert result["stopped_reason"] is None and len(result["next_tasks"]) == 1
