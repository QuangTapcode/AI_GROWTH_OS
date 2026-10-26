import json

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, request
from src.app.schemas import Usage


class SectionProvider:
    """Live-like SEO model returning sections; headings may carry stray Markdown hashes."""
    model_version = "test/seo"
    embedding_model_version = "test/embed"

    def __init__(self, sections):
        self.sections = sections

    async def chat_json(self, **kwargs):
        return json.dumps({"title": "Living areas guide", "meta_description": "A cited guide to living areas.",
                           "sections": self.sections}), Usage(llm_calls=1)


def seo_job(client):
    base = mock_research_request()
    research = run_job(client, base)["result"]
    return request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"})


def test_sections_are_rendered_as_markdown_headings_in_code(client, make_client):
    sections = [{"heading": "## Overview?", "body": "The guide compares living areas for newcomers."},
                {"heading": "Next steps for newcomers", "body": "Compare the areas before you sign a lease."}]
    out = run_job(make_client(provider=SectionProvider(sections), provider_mode="live"), seo_job(client))
    assert out["status"] == "completed", out
    result = out["result"]["result"]
    assert result["headings"] == ["Overview?", "Next steps for newcomers"] and result["seo_checks"]["headings"] is True
    assert result["body_markdown"].startswith("## Overview?" + chr(10)) and "## Next steps for newcomers" in result["body_markdown"]
    assert result["body_markdown"].rstrip().endswith("Request the guide")
    assert out["result"]["prompt_version"] == "seo-v3"


def test_headings_that_are_only_hashes_do_not_count(client, make_client):
    sections = [{"heading": "##", "body": "The guide compares living areas for newcomers."},
                {"heading": "Living areas", "body": "The guide compares living areas for newcomers."}]
    out = run_job(make_client(provider=SectionProvider(sections), provider_mode="live"), seo_job(client))
    assert out["status"] == "failed" and out["error_code"] == "SEO_CHECK_FAILED" and "headings" in out["error_message"]


class RevisingProvider(SectionProvider):
    """First draft adds an unsupported "24/7"; the rewrite drops it only if asked."""
    def __init__(self, fixes):
        super().__init__([])
        self.fixes, self.systems = fixes, []

    async def chat_json(self, *, system, **kwargs):
        self.systems.append(system)
        claim = "Spaces are open 24/7." if (len(self.systems) == 1 or not self.fixes) else "Spaces suit focused work."
        self.sections = [{"heading": "Overview", "body": "The guide compares living areas for newcomers. " + claim},
                         {"heading": "Next steps", "body": "Compare the areas before you sign a lease."}]
        return await super().chat_json(**kwargs)


def test_unsupported_numbers_get_one_grounded_rewrite(client, make_client):
    provider = RevisingProvider(fixes=True)
    out = run_job(make_client(provider=provider, provider_mode="live"), seo_job(client))
    assert out["status"] == "completed", out
    assert len(provider.systems) == 2 and "24" in provider.systems[1] and "Revision required" in provider.systems[1]
    assert "24/7" not in out["result"]["result"]["body_markdown"]


def test_draft_that_keeps_inventing_numbers_is_still_rejected(client, make_client):
    provider = RevisingProvider(fixes=False)
    out = run_job(make_client(provider=provider, provider_mode="live"), seo_job(client))
    assert out["status"] == "failed" and out["error_code"] == "UNSUPPORTED_CONTENT_CLAIM" and len(provider.systems) == 2
