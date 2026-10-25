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


def content_job(client, channels=None, assets=True):
    base = mock_research_request()
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
