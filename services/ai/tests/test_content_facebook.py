import json
from uuid import uuid4

import pytest

from conftest import run_job
from examples.six_role_requests import artifact_input, image, mock_research_request, request
from src.app.schemas import Usage


def run(client, job):
    body = run_job(client, job)
    assert body["status"] == "completed", body
    return body


def content_job(client, channels=None, assets=True, locations=None):
    base = mock_research_request()
    if locations is not None:
        base["payload"]["business_profile"]["locations"] = locations
    research = run(client, base)["result"]
    seo = run(client, request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"}))["result"]
    payload = {"source_article": artifact_input(seo), "cta": "Request the guide", "assets": [image(base)] if assets else []}
    if channels is not None:
        payload["target_channels"] = channels
    return seo, request(base, "content.repurpose", payload)


class FacebookProvider:
    """Live-like provider: answers the content schema with a supplied Facebook object."""
    model_version = "test/facebook"
    embedding_model_version = "test/embed"

    def __init__(self, facebook, caption="Living areas guide\n\nRequest the guide"):
        self.facebook, self.caption, self.calls = facebook, caption, 0

    async def chat_json(self, *, schema, **kwargs):
        self.calls += 1
        draft = {"caption": self.caption, "alt_text": "Living room photo"}
        if "facebook" in schema.get("properties", {}):
            draft["facebook"] = self.facebook
        return json.dumps(draft), Usage(llm_calls=1)


def test_facebook_post_is_part_of_social_pack(client):
    seo, job = content_job(client)
    body = run(client, job)
    result = body["result"]["result"]
    post = result["facebook"]
    assert body["provider_calls"] == 1  # Facebook rides the caption call, leaving room for a repair
    assert post["cta"] == "Request the guide"
    assert post["text"].startswith(post["hook"]) and post["body"] in post["text"]
    # Hook -> body -> CTA -> hashtags, separated by blank lines for Facebook readability.
    assert post["text"].index(post["body"]) < post["text"].index("Request the guide")
    assert "\n\n" in post["text"] and len(post["hashtags"]) <= 2
    assert all(text not in post["text"] for text in ("http://", "https://", "www."))
    assert result["parent_content_id"] == seo["result"]["article_id"]
    assert result["requires_human_approval"] is True and result["applied"] is False


def test_facebook_only_pack_needs_no_image(client):
    _, job = content_job(client, channels=["facebook"], assets=False)
    result = run(client, job)["result"]["result"]
    assert result["status"] == "draft" and result["channels"] == ["facebook"]
    assert result["facebook"]["text"]


def test_tiktok_only_pack_has_no_facebook_post(client):
    _, job = content_job(client, channels=["tiktok"])
    result = run(client, job)["result"]["result"]
    assert result["channels"] == ["tiktok"] and result["facebook"] is None


def test_live_facebook_draft_is_assembled_with_exact_cta(client, make_client):
    _, job = content_job(client, channels=["facebook"])
    provider = FacebookProvider({"hook": "Choosing a living area?", "body": "• Living areas guide",
        "discussion_question": "Which area are you considering?", "hashtags": ["#Guide", "not a tag"]})
    result = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]
    post = result["facebook"]
    assert provider.calls == 1
    assert post["hashtags"] == ["#Guide"]
    assert post["text"] == ("Choosing a living area?\n\n• Living areas guide\n\nWhich area are you considering?"
                            "\n\nRequest the guide\n\n#Guide")


@pytest.mark.parametrize("body", ["Read more at https://example.com", "Visit www.example.com", "Save 50% this week"])
def test_live_facebook_draft_rejects_links_and_invented_numbers(client, make_client, body):
    _, job = content_job(client, channels=["facebook"])
    provider = FacebookProvider({"hook": "Living areas guide", "body": body, "discussion_question": None, "hashtags": []})
    out = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert out["status"] == "failed" and out["error_code"] == "UNSUPPORTED_CONTENT_CLAIM", out


def test_question_already_in_body_is_posted_once(client, make_client):
    _, job = content_job(client, channels=["facebook"])
    question = "Which area are you considering?"
    provider = FacebookProvider({"hook": "Choosing a living area?", "body": "• Living areas guide\n\n" + question,
                                 "discussion_question": question, "hashtags": []})
    post = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]["facebook"]
    assert post["text"].count(question) == 1 and post["discussion_question"] is None


def test_truncated_cta_line_from_the_model_is_dropped(client, make_client):
    _, job = content_job(client, channels=["facebook"], assets=False)
    provider = FacebookProvider({"hook": "Choosing a living area?", "body": "• Living areas guide\n\nRequest the gui",
                                 "discussion_question": None, "hashtags": []})
    post = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]["facebook"]
    # The exact CTA is appended by code; a cut-off copy of it from the model must not be posted.
    assert post["text"].count("Request the gui") == 1 and "Request the guide" in post["text"]


def test_sentence_cut_off_mid_word_is_not_posted(client, make_client):
    _, job = content_job(client, channels=["facebook"], assets=False)
    provider = FacebookProvider({"hook": "Choosing a living area?", "body": "• Living areas guide\n\nThe living area guide doesn",
                                 "discussion_question": None, "hashtags": []})
    out = run(make_client(provider=provider, provider_mode="live"), job)
    assert "doesn" not in out["result"]["result"]["facebook"]["text"]
    assert "TRUNCATED_SENTENCE_REMOVED:1" in out["result"]["warnings"]


def test_facebook_post_spells_the_location_as_the_profile_does(client, make_client):
    _, job = content_job(client, channels=["facebook"], assets=False, locations=["Da Nang"])
    provider = FacebookProvider({"hook": "Choosing a living area in Da N-ang?", "body": "• Living areas guide",
                                 "discussion_question": None, "hashtags": []})
    post = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]["facebook"]
    assert "Da Nang" in post["text"] and "N-ang" not in post["text"]


def test_failed_content_run_keeps_its_error_code_when_metrics_fail(client, make_client, monkeypatch):
    # Content metrics are best effort: a broken tracker must not replace the agent's own error code.
    import src.agents.content.monitoring as monitoring

    class BrokenTracker:
        def record_run(self, **_):
            raise RuntimeError("metrics store unavailable")

    monkeypatch.setattr(monitoring, "get_metrics_tracker", lambda: BrokenTracker())
    _, job = content_job(client, channels=["facebook"])
    provider = FacebookProvider({"hook": "Living areas guide", "body": "Save 50% this week", "discussion_question": None, "hashtags": []})
    out = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert out["status"] == "failed" and out["error_code"] == "UNSUPPORTED_CONTENT_CLAIM", out


def test_facebook_post_links_each_claim_to_a_cited_fact(client, make_client):
    # Reviewers see which cited quote backs each sentence; hook and CTA carry no claim.
    _, job = content_job(client, channels=["facebook"])
    provider = FacebookProvider({"hook": "Choosing a living area?", "body": "• The guide compares living areas for newcomers.",
                                 "discussion_question": "Which area are you considering?", "hashtags": []})
    result = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]
    facts = {f["fact_id"]: f["text"] for f in result["extracted_facts"]}
    rows = [(r["sentence_type"], r["text"], r["fact_id"], r["entailment_status"]) for r in result["sentence_fact_map"]]
    assert facts == {"f01": "The guide compares living areas for newcomers."}
    assert rows == [
        ("hook", "Choosing a living area?", "NONE", "supported"),
        ("factual", "The guide compares living areas for newcomers.", ["f01"], "supported"),
        ("cta", "Request the guide", "SYSTEM_CTA", "supported"),
    ]


@pytest.mark.parametrize("claim", ["free for every newcomer", "rated 5 sao by expats"])
def test_facebook_post_with_a_promotional_claim_the_sources_lack_is_rejected(client, make_client, claim):
    _, job = content_job(client, channels=["facebook"])
    provider = FacebookProvider({"hook": "Choosing a living area?",
                                 "body": f"• The guide compares living areas for newcomers, {claim}.",
                                 "discussion_question": None, "hashtags": []})
    out = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert out["status"] == "failed" and out["error_code"] == "UNSUPPORTED_CONTENT_CLAIM", out
