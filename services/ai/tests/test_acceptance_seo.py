"""SEO Worker against what it was built to do: AC-SEO-01..03 in DU-01 and module M09 in SCOPE.

Each test goes through /internal/v1/runs with a scripted model, the way the worker calls it.
xfail(strict) marks a requirement the agent does not meet yet; the reason names the gap in
docs/reports/AGENT-ACCEPTANCE-2026-11-04.md. Fixing the gap makes the test pass and strict turns that into a failure,
so the marker has to be removed with the fix.
"""
import json

import pytest

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, request
from src.app.schemas import Usage

GROUNDED = "The guide compares living areas for newcomers."
LONGER = ("The guide compares living areas for newcomers. Quiet river districts suit families who want shops within walking distance. "
          "Newcomers often read the guide before choosing living areas.")


class ScriptedSeo:
    """Live-like provider: answers the SEO schema with the draft it was given."""
    model_version = "test/seo"
    embedding_model_version = "test/embed"

    def __init__(self, title="Living areas guide for newcomers", meta="A cited guide that compares living areas for newcomers.", sections=None):
        self.draft = {"title": title, "meta_description": meta, "sections": sections or [
            {"heading": "Living areas", "body": GROUNDED},
            {"heading": "Quiet districts", "body": "Quiet river districts suit families who want shops within walking distance."}]}

    async def chat_json(self, **kwargs):
        return json.dumps(self.draft), Usage(llm_calls=1)


def seo_job(client, operation="seo.local_draft"):
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"] = LONGER
    research = run_job(client, base)["result"]
    return request(base, operation, {"research": artifact_input(research), "cta": "Request the guide"})


def article(make_client, job, **draft):
    out = run_job(make_client(provider=ScriptedSeo(**draft), provider_mode="live"), job)
    assert out["status"] == "completed", out
    return out["result"]["result"]


# --- AC-SEO-01: an article about to be published passes the on-page checks.

def test_ac_seo_01_article_has_title_meta_and_headings_in_its_body(client, make_client):
    result = article(make_client, seo_job(client))
    assert result["title"] and result["meta_description"]
    assert len(result["headings"]) >= 2
    assert all(f"## {heading}" in result["body_markdown"] for heading in result["headings"])
    assert result["seo_checks"] == {"title": True, "meta": True, "headings": True, "internal_link": True, "citations": True}


@pytest.mark.xfail(strict=True, reason="GAP-SEO-1: seo_checks only tests that a title and meta exist, not whether they carry the keyword or a usable length")
def test_ac_seo_01_a_title_and_meta_that_ignore_the_keyword_fail_the_on_page_check(client, make_client):
    result = article(make_client, seo_job(client), title="Welcome", meta="Read this.")
    assert not all(result["seo_checks"].values())


# --- AC-SEO-02: facts match the knowledge base, with provenance for each passage.

def test_ac_seo_02_a_price_no_source_states_never_reaches_the_article(client, make_client):
    sections = [{"heading": "Living areas", "body": f"{GROUNDED} Studios in these living areas cost $300 per month."},
                {"heading": "Next steps", "body": "Compare the living areas before choosing."}]
    out = run_job(make_client(provider=ScriptedSeo(sections=sections), provider_mode="live"), seo_job(client))
    if out["status"] == "completed":
        assert "$300" not in out["result"]["result"]["body_markdown"]
    else:
        assert out["error_code"] == "UNSUPPORTED_CONTENT_CLAIM"


def test_ac_seo_02_a_sentence_no_source_supports_is_removed(client, make_client):
    sections = [{"heading": "Living areas", "body": f"{GROUNDED} Every building includes a rooftop swimming pool and free airport pickup."},
                {"heading": "Next steps", "body": "Compare the living areas before choosing."}]
    result = article(make_client, seo_job(client), sections=sections)
    assert "rooftop" not in result["body_markdown"]


def test_ac_seo_02_citations_are_verbatim_quotes_of_approved_sources(client, make_client):
    result = article(make_client, seo_job(client))
    assert result["citations"]
    assert all(c["quote"] in LONGER and c["source_url"] for c in result["citations"])


@pytest.mark.xfail(strict=True, reason="GAP-SEO-2: sources are listed once at the end of the article, so no section can be traced to its source")
def test_ac_seo_02_every_section_says_which_source_it_came_from(client, make_client):
    result = article(make_client, seo_job(client))
    prose = result["body_markdown"].split("## ")[1:]
    # The source lines are written after the last section, so only the last one would match without its own citation.
    assert all("[source:" in section for section in prose[:-1])


# From the tune split of data/adversarial: on that split the SEO path stops 71% of what an obedient model writes, the Content path 89%.
@pytest.mark.xfail(strict=True, reason="GAP-SEO-7: the promotion, testimonial and worded-price checks run on Facebook posts only, not on articles")
@pytest.mark.parametrize("sentence, phrase", [
    ("Chi phí trọn gói tám triệu một tháng không phát sinh thêm.", "tám triệu"),
    ("Nhận ngay quà tặng đặc biệt khi liên hệ đặt phòng trực tiếp.", "quà tặng"),
    ("Chị Lan - Designer tự do nhận xét: 'View biển Mỹ Khê mang lại cảm hứng sáng tạo vô tận'.", "Chị Lan"),
])
def test_ac_seo_02_invented_offers_and_testimonials_do_not_reach_the_article(client, make_client, sentence, phrase):
    sections = [{"heading": "Living areas", "body": f"{GROUNDED} {sentence}"},
                {"heading": "Next steps", "body": "Compare the living areas before choosing."}]
    out = run_job(make_client(provider=ScriptedSeo(sections=sections), provider_mode="live"), seo_job(client))
    if out["status"] == "completed":
        assert phrase not in out["result"]["result"]["body_markdown"]


@pytest.mark.xfail(strict=True, reason="GAP-SEO-3: all words of a reversed claim are in the source, and the checks only compare words")
def test_ac_seo_02_a_sentence_that_reverses_the_source_is_removed(client, make_client):
    sections = [{"heading": "Living areas", "body": "The guide does not compare living areas for newcomers."},
                {"heading": "Quiet districts", "body": "Quiet river districts suit families who want shops within walking distance."}]
    result = article(make_client, seo_job(client), sections=sections)
    assert "does not compare" not in result["body_markdown"]


# --- A draft never goes past its reviewer.

def test_ac_seo_03_an_article_is_a_versioned_draft_for_a_person(client, make_client):
    result = article(make_client, seo_job(client))
    assert result["version"] == 1
    assert result["requires_human_approval"] is True and result["applied"] is False


def test_a_thin_article_waits_for_a_person_instead_of_failing_at_publish(client, make_client):
    result = article(make_client, seo_job(client))
    assert result["status"] == "insufficient_data" and "article_too_short" in result["missing_facts"]


# --- M09: audit and refresh are their own jobs, not another article.

@pytest.mark.xfail(strict=True, reason="GAP-SEO-4: seo.audit runs the article writer; no operation audits a page's title, meta, headings or links")
def test_m09_seo_audit_reports_issues_instead_of_writing_an_article(client, make_client):
    result = article(make_client, seo_job(client, "seo.audit"))
    assert "body_markdown" not in result
    assert "issues" in result


@pytest.mark.xfail(strict=True, reason="GAP-SEO-5: content.refresh runs the article writer and never looks at metrics, so it can imply decay it did not measure")
def test_m09_a_refresh_without_measured_metrics_reports_the_missing_data(client, make_client):
    result = article(make_client, seo_job(client, "content.refresh"))
    assert result["status"] == "insufficient_data"
    assert any("metric" in fact for fact in result["missing_facts"])
