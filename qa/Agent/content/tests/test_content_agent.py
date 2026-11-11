from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from conftest import run_job
from src.app.schemas import EvidenceRef, Usage

CTA = "Request the Da Nang living guide"
SOURCE_TEXT = (
    "Quiet river districts in Da Nang suit newcomers who want shops within "
    "walking distance. Families can compare living areas before choosing a home."
)
SUPPORTED = "Quiet river districts in Da Nang suit newcomers who want shops within walking distance."


def content_job(
    *,
    channels: list[str] | None = None,
    approved_asset: bool = False,
    real_product: bool = False,
) -> dict[str, Any]:
    """Create a hash-valid SEO artifact and approved source for the real Content handler."""
    workspace_id = str(uuid4())
    source_id = str(uuid4())
    snapshot_id = str(uuid4())
    article_id = str(uuid4())
    source_url = "https://example.org/da-nang-living-areas"
    quote = SOURCE_TEXT
    evidence = EvidenceRef(
        source_id=source_id,
        source_version=1,
        chunk_id="living-guide",
        locator="paragraph:1",
        quote=quote,
        source_url=source_url,
        license="Synthetic QA source",
        attribution="Content Agent QA",
    )
    evidence_data = [evidence.model_dump(mode="json")]
    article = {
        "article_id": article_id,
        "workspace_id": workspace_id,
        "context_snapshot_id": snapshot_id,
        "profile_version": 1,
        "version": 1,
        "status": "draft",
        "missing_facts": [],
        "input_artifact_refs": [],
        "requires_human_approval": True,
        "applied": False,
        "synthetic": True,
        "title": "Living areas for newcomers in Da Nang",
        "meta_description": "Compare Da Nang living areas for newcomers.",
        "primary_keyword": "living areas",
        "headings": ["Living areas", "Quiet river districts"],
        "body_markdown": f"## Living areas\n\n{SUPPORTED}\n\n## Quiet river districts\n\n"
        "Families can compare living areas before choosing a home.",
        "cta": CTA,
        "citations": evidence_data,
        "seo_checks": {
            "title": True,
            "meta": True,
            "headings": True,
            "internal_link": True,
            "citations": True,
        },
        "strategy_alignment": None,
    }
    digest = hashlib.sha256(
        json.dumps(
            {"result": article, "evidence": evidence_data},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()

    assets: list[dict[str, Any]] = []
    if approved_asset:
        assets.append(
            {
                "asset_id": str(uuid4()),
                "workspace_id": workspace_id,
                "version": 1,
                "url": "https://example.org/approved-photo.jpg",
                "content_hash": "a" * 64,
                "license": "enterprise_owned",
                "attribution": "Synthetic Content Agent QA",
                "status": "approved",
                "synthetic": True,
            }
        )

    return {
        "job_id": str(uuid4()),
        "workspace_id": workspace_id,
        "operation": "content.repurpose",
        "input_version": 1,
        "trace_id": "content-agent-qa",
        "synthetic": True,
        "context_snapshot_id": snapshot_id,
        "approved_source_versions": [{"source_id": source_id, "version": 1}],
        "constraints": {"timeout_seconds": 600},
        "payload": {
            "workspace_id": workspace_id,
            "business_profile": {
                "company": "TripC",
                "workspace_id": workspace_id,
                "version": 1,
                "locations": ["Da Nang"],
                "audiences": ["newcomers"],
                "products": ["living areas"],
                "voice": "Friendly and practical",
            },
            "snapshot": {
                "workspace_id": workspace_id,
                "snapshot_id": snapshot_id,
                "sources": [
                    {
                        "source_id": source_id,
                        "workspace_id": workspace_id,
                        "version": 1,
                        "status": "approved",
                        "provenance": {
                            "license": "Synthetic QA source",
                            "attribution": "Content Agent QA",
                            "source_url": source_url,
                            "retrieved_at": datetime.now(timezone.utc).isoformat(),
                        },
                        "chunks": [
                            {
                                "chunk_id": "living-guide",
                                "text": SOURCE_TEXT,
                                "locator": "paragraph:1",
                            }
                        ],
                    }
                ],
            },
            "source_article": {
                "artifact": {
                    "artifact_id": str(uuid4()),
                    "workspace_id": workspace_id,
                    "version": 1,
                    "content_hash": digest,
                    "context_snapshot_id": snapshot_id,
                    "role": "seo",
                    "storage": "ai_run_store",
                },
                "result": article,
                "evidence": evidence_data,
            },
            "cta": CTA,
            "assets": assets,
            "target_channels": channels or ["facebook"],
            "brand_voice": "Friendly and practical",
            "draft_tiktok_script": False,
            "allow_ai_image": False,
            "real_product": real_product,
        },
    }


def provider_draft(
    *,
    body: str = SUPPORTED,
    hook: str = "Choosing a living area?",
    question: str | None = None,
    hashtags: list[str] | None = None,
    caption: str = "Da Nang living areas\n\nRequest the Da Nang living guide",
    alt_text: str = "Quiet river districts with shops nearby",
) -> dict[str, Any]:
    return {
        "caption": caption,
        "alt_text": alt_text,
        "facebook": {
            "hook": hook,
            "body": f"• {body}",
            "discussion_question": question,
            "hashtags": hashtags or [],
        },
    }


def script_draft(
    *,
    hook: str = "Choosing a living area?",
    voiceover: str = SUPPORTED,
    scenes: int = 4,
) -> dict[str, Any]:
    return {
        "hook": hook,
        "scenes": [
            {"voiceover": voiceover, "visual": "Quiet river district street"}
            for _ in range(scenes)
        ],
    }


class ContentProvider:
    """Return scripted caption/Facebook/TikTok drafts while recording production prompts."""

    model_version = "test/content-agent"
    embedding_model_version = "test/embedding"

    def __init__(
        self,
        content: dict[str, Any] | None = None,
        tiktok: dict[str, Any] | None = None,
    ) -> None:
        self.content = content or provider_draft()
        self.tiktok = tiktok or script_draft()
        self.prompts: list[dict[str, Any]] = []
        self.schemas: list[dict[str, Any]] = []

    async def chat_json(
        self, *, schema: dict[str, Any], user: str, **kwargs: Any
    ) -> tuple[str, Usage]:
        self.schemas.append(schema)
        prompt = user.split("\n\nYour previous reply", maxsplit=1)[0]
        self.prompts.append(json.loads(prompt))
        if "scenes" in schema.get("properties", {}):
            output: dict[str, Any] = self.tiktok
        elif "facebook" in schema.get("properties", {}):
            output = self.content
        else:
            output = {
                key: value
                for key, value in self.content.items()
                if key in {"caption", "alt_text"}
            }
        return json.dumps(output), Usage(llm_calls=1)


def result_of(run: dict[str, Any]) -> dict[str, Any]:
    assert run["result"] is not None, run
    return run["result"]["result"]


def poll_run(client: TestClient, run_id: str, timeout: float = 5.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while True:
        run = client.get(f"/internal/v1/runs/{run_id}").json()
        if run["status"] in {"completed", "failed"} or time.monotonic() > deadline:
            return run
        time.sleep(0.01)


def change_article(job: dict[str, Any], update: Any) -> None:
    research = job["payload"]["source_article"]
    update(research["result"])
    research["artifact"]["content_hash"] = hashlib.sha256(
        json.dumps(
            {"result": research["result"], "evidence": research["evidence"]},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()


def test_facebook_pack_is_grounded_versioned_and_kept_for_human_review(
    client: TestClient, make_ai_client: Any
) -> None:
    """Decision table accepts supported copy and state ends in an unapplied review draft."""
    job = content_job()
    provider = ContentProvider(
        provider_draft(
            question="Which area are you considering?",
            hashtags=["#DaNang", "not-a-tag"],
        )
    )
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)

    assert run["status"] == "completed", run
    result = result_of(run)
    facebook = result["facebook"]
    assert result["status"] == "draft"
    assert result["channels"] == ["facebook"]
    assert result["parent_content_id"] == job["payload"]["source_article"]["result"]["article_id"]
    assert result["parent_version"] == 1
    assert result["requires_human_approval"] is True
    assert result["applied"] is False
    assert result["cta"] == CTA
    assert facebook["cta"] == CTA
    assert facebook["text"].endswith(CTA + "\n\n#DaNang")
    assert facebook["hashtags"] == ["#DaNang"]
    assert len(provider.prompts) == 1
    assert result["citations"][0]["quote"] == SOURCE_TEXT
    assert result["sentence_fact_map"]
    assert any("MANUAL_PACK_REQUIRES_APPROVAL" in item for item in run["result"]["warnings"])


@pytest.mark.parametrize(
    ("case_id", "mutation", "error"),
    [
        pytest.param("foreign-tenant", "workspace", "TENANT_SCOPE_VIOLATION", id="ep-foreign-parent-tenant"),
        pytest.param("wrong-role", "role", "INVALID_ARTIFACT_ROLE", id="decision-parent-must-be-seo"),
        pytest.param("stale-context", "context", "STALE_ARTIFACT_CONTEXT", id="decision-parent-snapshot-mismatch"),
        pytest.param("tampered-result", "hash", "ARTIFACT_HASH_MISMATCH", id="decision-tampered-parent"),
        pytest.param("version-mismatch", "version", "ARTIFACT_VERSION_MISMATCH", id="bva-parent-version"),
        pytest.param("unapproved-evidence", "revoked", "UNGROUNDED_ARTIFACT", id="decision-revoked-citation"),
        pytest.param("foreign-image", "asset", "TENANT_SCOPE_VIOLATION", id="ep-cross-tenant-image"),
    ],
)
def test_input_integrity_and_tenant_boundaries_fail_before_provider(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    mutation: str,
    error: str,
) -> None:
    """EP and Decision Table reject stale, altered, revoked or cross-tenant inputs."""
    del case_id
    job = content_job(approved_asset=mutation == "asset")
    article = job["payload"]["source_article"]
    if mutation == "workspace":
        article["artifact"]["workspace_id"] = str(uuid4())
    elif mutation == "role":
        article["artifact"]["role"] = "research"
    elif mutation == "context":
        article["artifact"]["context_snapshot_id"] = str(uuid4())
    elif mutation == "hash":
        article["artifact"]["content_hash"] = "0" * 64
    elif mutation == "version":
        article["artifact"]["version"] = 2
    elif mutation == "revoked":
        job["payload"]["snapshot"]["sources"][0]["status"] = "revoked"
    elif mutation == "asset":
        job["payload"]["assets"][0]["workspace_id"] = str(uuid4())
    provider = ContentProvider()
    response = make_ai_client(provider=provider, provider_mode="live").post(
        "/internal/v1/runs", json=job
    )

    assert response.status_code == 422, response.text
    assert error in response.text
    assert provider.prompts == []


@pytest.mark.parametrize(
    ("case_id", "channel", "status", "expected_channels"),
    [
        pytest.param("facebook", "facebook", 202, ["facebook"], id="ep-facebook"),
        pytest.param("tiktok", "tiktok", 202, ["tiktok"], id="ep-tiktok"),
        pytest.param(
            "unsupported",
            "instagram",
            422,
            None,
            id="ep-unsupported-channel-rejected",
        ),
    ],
)
def test_channel_partition_rejects_unsupported_targets(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    channel: str,
    status: int,
    expected_channels: list[str] | None,
) -> None:
    """EP checks channel branches, including current default fallback for unknown channels."""
    del case_id
    job = content_job(channels=[channel], approved_asset=(channel == "tiktok"))
    provider = ContentProvider()
    service = make_ai_client(provider=provider, provider_mode="live")
    response = service.post("/internal/v1/runs", json=job)
    assert response.status_code == status, response.text
    if status == 422:
        assert "INVALID_CHANNELS" in response.text
        assert provider.prompts == []
        return
    run = poll_run(service, response.json()["run_id"])
    assert run["status"] == "completed", run
    assert expected_channels is not None
    assert result_of(run)["channels"] == expected_channels
    assert (result_of(run)["facebook"] is not None) is ("facebook" in expected_channels)


@pytest.mark.parametrize(
    ("case_id", "cta", "status"),
    [
        pytest.param("empty", "", 422, id="bva-empty-cta"),
        pytest.param("minimum", "X", 202, id="bva-one-character-cta"),
        pytest.param("maximum", "x" * 200, 202, id="bva-maximum-cta"),
        pytest.param("over-maximum", "x" * 201, 422, id="bva-cta-over-maximum"),
    ],
)
def test_call_to_action_schema_boundaries(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    cta: str,
    status: int,
) -> None:
    """BVA exercises CTA field bounds without calling a model for invalid inputs."""
    del case_id
    job = content_job()
    job["payload"]["cta"] = cta
    response = make_ai_client().post("/internal/v1/runs", json=job)
    assert response.status_code == status


@pytest.mark.parametrize(
    ("case_id", "body", "error"),
    [
        pytest.param("external-url", "Read more at https://example.com", "UNSUPPORTED_CONTENT_CLAIM", id="decision-no-links"),
        pytest.param("invented-promotion", "Save 50% this week", "UNSUPPORTED_CONTENT_CLAIM", id="decision-no-unbacked-promotion"),
        pytest.param("invented-price", "Rent costs 900 dollars per month", "UNSUPPORTED_CONTENT_CLAIM", id="decision-no-unbacked-price"),
    ],
)
def test_facebook_policy_rejects_urls_and_unverified_commercial_claims(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    body: str,
    error: str,
) -> None:
    """Decision Table rejects URL, promotion, and pricing claims absent from approved evidence."""
    del case_id
    provider = ContentProvider(provider_draft(body=body))
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), content_job()
    )
    assert run["status"] == "failed"
    assert run["error_code"] == error


def test_unsupported_factual_sentence_is_removed_from_facebook_copy(
    client: TestClient, make_ai_client: Any
) -> None:
    """Decision Table keeps source-backed sentence and strips unsupported amenities."""
    provider = ContentProvider(
        provider_draft(body=f"{SUPPORTED} Every building has a rooftop swimming pool.")
    )
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), content_job()
    )
    assert run["status"] == "completed", run
    body = result_of(run)["facebook"]["text"]
    assert SUPPORTED in body
    assert "rooftop swimming pool" not in body


def test_facebook_question_is_not_duplicated_and_hook_is_capped(
    client: TestClient, make_ai_client: Any
) -> None:
    """BVA hook is shortened and duplicate discussion question appears only once."""
    question = "Which area are you considering?"
    provider = ContentProvider(
        provider_draft(
            hook="Choosing a living area? " * 12,
            body=f"{SUPPORTED}\n\n{question}",
            question=question,
        )
    )
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), content_job()
    )
    facebook = result_of(run)["facebook"]
    assert len(facebook["hook"]) <= 150
    assert facebook["text"].count(question) == 1
    assert facebook["discussion_question"] is None


def test_facebook_only_pack_without_image_is_still_a_draft_with_image_suggestion(
    client: TestClient, make_ai_client: Any
) -> None:
    """State: no approved image on a Facebook-only target is non-blocking."""
    job = content_job(channels=["facebook"], approved_asset=False)
    run = run_job(
        make_ai_client(provider=ContentProvider(), provider_mode="live"), job
    )
    result = result_of(run)
    assert result["status"] == "draft"
    assert "approved_image_asset" not in result["missing_facts"]
    assert result["image_assets"] == []
    assert result["image_suggestion"] is not None
    assert result["generated_image"] is None


def test_tiktok_target_requires_approved_media_asset(
    client: TestClient, make_ai_client: Any
) -> None:
    """State: TikTok target with no asset is held at needs_assets, despite a draft script."""
    provider = ContentProvider(tiktok=script_draft())
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"),
        content_job(channels=["tiktok"], approved_asset=False),
    )
    result = result_of(run)
    assert result["status"] == "needs_assets"
    assert "approved_image_asset" in result["missing_facts"]
    assert result["tiktok"] is not None
    assert result["facebook"] is None


def test_approved_asset_clears_tiktok_asset_gate_and_preserves_parent_reference(
    client: TestClient, make_ai_client: Any
) -> None:
    """State: pending media requirement -> approved asset -> reviewable draft."""
    job = content_job(channels=["tiktok"], approved_asset=True)
    run = run_job(
        make_ai_client(provider=ContentProvider(tiktok=script_draft()), provider_mode="live"),
        job,
    )
    result = result_of(run)
    assert result["status"] == "draft"
    assert result["missing_facts"] == []
    assert len(result["image_assets"]) == 1
    assert result["parent_content_id"] == job["payload"]["source_article"]["result"]["article_id"]


def test_requested_tiktok_script_uses_exact_cta_and_flags_short_duration(
    client: TestClient, make_ai_client: Any
) -> None:
    """State: Facebook-only request can optionally create a TikTok review script."""
    job = content_job(channels=["facebook"])
    job["payload"]["draft_tiktok_script"] = True
    run = run_job(
        make_ai_client(
            provider=ContentProvider(tiktok=script_draft(scenes=3)),
            provider_mode="live",
        ),
        job,
    )
    result = result_of(run)
    assert result["channels"] == ["facebook"]
    assert result["tiktok"]["cta"] == CTA
    assert result["tiktok"]["within_length"] is False
    assert "approved_image_asset" not in result["missing_facts"]
    assert result["status"] == "draft"


def test_invalid_optional_tiktok_script_does_not_discard_facebook_pack(
    client: TestClient, make_ai_client: Any
) -> None:
    """State: failed optional TikTok draft is skipped while required Facebook copy survives."""
    job = content_job(channels=["facebook"])
    job["payload"]["draft_tiktok_script"] = True
    provider = ContentProvider(tiktok={"wrong": "shape"})
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)
    assert run["status"] == "completed", run
    result = result_of(run)
    assert result["facebook"]["text"]
    assert result["tiktok"] is None
    assert any(item.startswith("TIKTOK_SCRIPT_SKIPPED") for item in run["result"]["warnings"])


@pytest.mark.parametrize(
    ("case_id", "asset_status", "approved_count"),
    [
        pytest.param("pending", "pending", 0, id="ep-pending-asset"),
        pytest.param("revoked", "revoked", 0, id="ep-revoked-asset"),
        pytest.param("approved", "approved", 1, id="ep-approved-asset"),
    ],
)
def test_only_approved_licensed_attributed_assets_are_attached(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    asset_status: str,
    approved_count: int,
) -> None:
    """EP asset states; only approved assets with provenance pass into the pack."""
    del case_id
    job = content_job(approved_asset=True)
    job["payload"]["assets"][0]["status"] = asset_status
    run = run_job(
        make_ai_client(provider=ContentProvider(), provider_mode="live"), job
    )
    assert run["status"] == "completed", run
    assert len(result_of(run)["image_assets"]) == approved_count


def test_real_product_without_real_asset_never_gets_ai_image_suggestion(
    client: TestClient, make_ai_client: Any
) -> None:
    """Decision Table: real product + no approved real image requires assets, not AI illustration."""
    job = content_job(channels=["facebook"], real_product=True)
    run = run_job(
        make_ai_client(provider=ContentProvider(), provider_mode="live"), job
    )
    result = result_of(run)
    assert result["image_suggestion"]["status"] == "needs_assets"
    assert result["image_suggestion"]["prompt"] == ""
    assert result["generated_image"] is None


def test_parent_missing_facts_propagate_to_social_pack_status(
    client: TestClient, make_ai_client: Any
) -> None:
    """State transition copies blocking SEO missing facts into the downstream pack."""
    job = content_job()
    job["payload"]["source_article"]["result"]["missing_facts"] = ["article_too_short"]
    result = job["payload"]["source_article"]["result"]
    job["payload"]["source_article"]["artifact"]["content_hash"] = hashlib.sha256(
        json.dumps(
            {"result": result, "evidence": job["payload"]["source_article"]["evidence"]},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    run = run_job(
        make_ai_client(provider=ContentProvider(), provider_mode="live"), job
    )
    assert result_of(run)["status"] == "insufficient_data"
    assert result_of(run)["missing_facts"] == ["article_too_short"]


def test_empty_parent_article_is_rejected_without_provider_call(
    client: TestClient, make_ai_client: Any
) -> None:
    """EP empty parent-content class fails explicitly before generation."""
    job = content_job()
    change_article(job, lambda article: article.update(body_markdown=""))
    provider = ContentProvider()
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)
    assert run["status"] == "failed"
    assert run["error_code"] == "MISSING_PARENT_CONTENT"
    assert provider.prompts == []


def test_content_operation_aliases_are_currently_bound_to_the_same_pack_handler(
    client: TestClient, make_ai_client: Any
) -> None:
    """Routing behavior check: registered content operations currently emit the same SocialPack shape."""
    for operation in ("content.generate", "content.quality_check"):
        job = content_job()
        job["operation"] = operation
        run = run_job(
            make_ai_client(provider=ContentProvider(), provider_mode="live"), job
        )
        assert run["status"] == "completed", run
        assert "facebook" in result_of(run)
        assert "passed" not in result_of(run)


def test_same_job_retry_returns_persisted_pack_without_a_second_provider_call(
    client: TestClient, make_ai_client: Any
) -> None:
    """State transition: completed job retry is idempotent and does not regenerate content."""
    provider = ContentProvider()
    service = make_ai_client(provider=provider, provider_mode="live")
    job = content_job()
    first = run_job(service, job)
    second = run_job(service, job)
    assert first["result"] == second["result"]
    assert len(provider.prompts) == 1
