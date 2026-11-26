"""Unit tests for GpuWorkerImageProvider and asynchronous pipeline integration.

Tests reverse-connecting GPU worker architecture:
1. submit() calls POST /api/v1/image-jobs (AUTOMATION_INTERNAL_TOKEN + workspace_id + post_id/article_id) and returns job_id immediately without blocking.
2. poll() calls GET /api/v1/image-jobs/{id} across queued, running, completed, needs_assets, and failed states.
3. Factory get_image_provider returns GpuWorkerImageProvider for 'gpu_worker'.
4. GuardedImagePipeline bypasses local retry loop and local OCR guardrail for GpuWorkerImageProvider.
5. End-to-end pipeline sets post status to 'image_pending' without blocking.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest

from src.agents.content.image_client import (
    FakeImageProvider,
    FluxImageProvider,
    GpuWorkerImageProvider,
    ImageClient,
    ImageGenerationRequest,
    ImageProviderError,
    get_image_provider,
)
from src.agents.content.image_guardrail import (
    GuardedImagePipeline,
    ImageGuardrail,
    MockOcrEngine,
)
from src.agents.content.pipeline import generated_image, run_content
from src.agents.content.schemas import (
    ContentDraft,
    ContentFacebookDraft,
    ContentPayload,
    FacebookDraft,
    ImageSuggestion,
)
from src.app.config import Settings
from src.app.runtime import RunContext
from src.app.schemas import JobRequest


CLOUD_BASE = "https://cloud-api.tripc.local"
AUTH_TOKEN = "test_internal_token_xyz"
WS_ID = "00000000-0000-0000-0000-000000000001"


def sample_request(aspect_ratio: str = "1:1") -> ImageGenerationRequest:
    return ImageGenerationRequest(
        prompt="A cozy modern coffee shop in Da Nang, cinematic lighting",
        negative_prompt="text, watermark, numbers, price",
        aspect_ratio=aspect_ratio,
        width=1080,
        height=1080,
        seed=42,
        workspace_id=WS_ID,
    )


# ==============================================================================
# 1. SUBMIT TESTS (POST /api/v1/image-jobs)
# ==============================================================================

def test_gpu_worker_provider_submit_success():
    """submit() calls POST /api/v1/image-jobs with AUTOMATION_INTERNAL_TOKEN and returns job_id immediately."""
    recorded_requests: list[httpx.Request] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        recorded_requests.append(request)
        assert request.method == "POST"
        assert str(request.url) == f"{CLOUD_BASE}/api/v1/image-jobs"
        assert request.headers["authorization"] == f"Bearer {AUTH_TOKEN}"
        assert request.headers["x-workspace-id"] == WS_ID

        payload = json.loads(request.content.decode("utf-8"))
        assert payload["prompt"].startswith("A cozy modern coffee shop")
        assert payload["negative_prompt"] == "text, watermark, numbers, price"
        assert payload["aspect_ratio"] == "1:1"
        assert payload["seed"] == 42
        assert payload["workspace_id"] == WS_ID
        assert payload["article_id"] == "art_12345"
        assert payload["post_id"] == "post_67890"

        return httpx.Response(
            201,
            json={
                "job_id": "job_001_success",
                "root_job_id": "job_001_success",
                "attempt": 1,
                "status": "queued",
                "created_at": "2026-11-12T10:00:00Z",
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    provider = GpuWorkerImageProvider(
        api_base_url=CLOUD_BASE,
        automation_token=AUTH_TOKEN,
        client=client,
    )

    req = sample_request()
    job_id = provider.submit(
        req,
        workspace_id=WS_ID,
        article_id="art_12345",
        post_id="post_67890",
    )

    assert job_id == "job_001_success"
    assert len(recorded_requests) == 1


def test_gpu_worker_provider_submit_failure_raises_error():
    """submit() raises ImageProviderError when Cloud API returns 4xx/5xx."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "INVALID_ASPECT_RATIO", "message": "Ratio not supported"})

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    provider = GpuWorkerImageProvider(
        api_base_url=CLOUD_BASE,
        automation_token=AUTH_TOKEN,
        client=client,
    )

    with pytest.raises(ImageProviderError) as exc_info:
        provider.submit(sample_request())

    assert exc_info.value.code == "IMAGE_PROVIDER_FAILED"
    assert "400" in str(exc_info.value)


def test_gpu_worker_provider_unconfigured_raises_error():
    """submit() raises IMAGE_PROVIDER_NOT_CONFIGURED if base_url or token is missing."""
    provider = GpuWorkerImageProvider(api_base_url="", automation_token="")
    assert provider.is_configured is False

    with pytest.raises(ImageProviderError) as exc_info:
        provider.submit(sample_request())

    assert exc_info.value.code == "IMAGE_PROVIDER_NOT_CONFIGURED"


# ==============================================================================
# 2. POLL TESTS (GET /api/v1/image-jobs/{id})
# ==============================================================================

@pytest.mark.parametrize("status,customer_status,extra", [
    ("queued", "queued", {}),
    ("claimed", "generating", {}),
    ("running", "generating", {}),
    ("completed", "completed", {
        "image_url": "/uploads/generated/2026/11/12/asset_job1.webp",
        "content_hash": "a" * 64,
        "media_asset_id": "ast_999",
    }),
    ("needs_assets", "needs_assets", {
        "error_code": "GUARDRAIL_PRICE_DETECTED",
        "error_message": "Exhausted 3 attempts due to detected price text",
    }),
    ("failed", "failed", {
        "error_code": "MODEL_NOT_SUPPORTED",
        "error_message": "Requested model is not installed on worker",
    }),
])
def test_gpu_worker_provider_poll_across_states(status, customer_status, extra):
    """poll() queries Cloud API and parses response accurately across all lifecycle states."""
    target_job_id = "job_test_lifecycle"

    def mock_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url) == f"{CLOUD_BASE}/api/v1/image-jobs/{target_job_id}"
        assert request.headers["authorization"] == f"Bearer {AUTH_TOKEN}"
        assert request.headers["x-workspace-id"] == WS_ID

        return httpx.Response(
            200,
            json={
                "job_id": target_job_id,
                "root_job_id": target_job_id,
                "attempt": 1,
                "delivery_count": 1,
                "status": status,
                "customer_status": customer_status,
                "width": 1080,
                "height": 1080,
                "aspect_ratio": "1:1",
                "seed": 42,
                **extra,
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    provider = GpuWorkerImageProvider(
        api_base_url=CLOUD_BASE,
        automation_token=AUTH_TOKEN,
        client=client,
    )

    info = provider.poll(target_job_id, workspace_id=WS_ID)
    assert info["job_id"] == target_job_id
    assert info["status"] == status
    assert info["customer_status"] == customer_status
    if status == "completed":
        assert info["image_url"] == "/uploads/generated/2026/11/12/asset_job1.webp"
        assert info["content_hash"] == "a" * 64
        assert info["media_asset_id"] == "ast_999"
    elif status == "needs_assets":
        assert info["error_code"] == "GUARDRAIL_PRICE_DETECTED"


def test_gpu_worker_provider_poll_not_found():
    """poll() raises JOB_NOT_FOUND on HTTP 404."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "NOT_FOUND", "message": "Job not found"})

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    provider = GpuWorkerImageProvider(
        api_base_url=CLOUD_BASE,
        automation_token=AUTH_TOKEN,
        client=client,
    )

    with pytest.raises(ImageProviderError) as exc_info:
        provider.poll("job_unknown", workspace_id=WS_ID)

    assert exc_info.value.code == "JOB_NOT_FOUND"


# ==============================================================================
# 3. FACTORY TESTS (AI_IMAGE_PROVIDER selection)
# ==============================================================================

def test_factory_returns_gpu_worker_provider(monkeypatch):
    """Factory instantiates GpuWorkerImageProvider when AI_IMAGE_PROVIDER=gpu_worker."""
    monkeypatch.setenv("AI_IMAGE_PROVIDER", "gpu_worker")
    monkeypatch.setenv("CLOUD_API_BASE_URL", CLOUD_BASE)
    monkeypatch.setenv("AUTOMATION_INTERNAL_TOKEN", AUTH_TOKEN)

    provider = get_image_provider()
    assert isinstance(provider, GpuWorkerImageProvider)
    assert provider.api_base_url == CLOUD_BASE
    assert provider.automation_token == AUTH_TOKEN


def test_factory_supports_fake_and_flux(monkeypatch):
    """Factory still supports fake and flux providers."""
    monkeypatch.setenv("AI_IMAGE_PROVIDER", "fake")
    assert isinstance(get_image_provider(), FakeImageProvider)

    monkeypatch.setenv("AI_IMAGE_PROVIDER", "flux")
    monkeypatch.setenv("REPLICATE_API_TOKEN", "r8_dummy")
    assert isinstance(get_image_provider(), FluxImageProvider)


# ==============================================================================
# 4. GUARDED IMAGE PIPELINE INTEGRATION (BYPASS RETRIES & OCR)
# ==============================================================================

def test_guarded_image_pipeline_bypasses_retry_and_ocr_for_gpu_worker():
    """GuardedImagePipeline delegates to submit() without retry loop or local OCR, returning status='image_pending'."""
    ocr_mock = MagicMock(spec=MockOcrEngine)
    guardrail = ImageGuardrail(ocr_engine=ocr_mock)

    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"job_id": "job_async_123", "status": "queued"})

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    gpu_provider = GpuWorkerImageProvider(
        api_base_url=CLOUD_BASE,
        automation_token=AUTH_TOKEN,
        client=client,
    )
    image_client = ImageClient(provider=gpu_provider)
    pipeline = GuardedImagePipeline(image_client=image_client, guardrail=guardrail, max_retries=2)

    req = sample_request()
    outcome = pipeline.generate_guarded_image(
        request=req,
        workspace_id=WS_ID,
        article_id="art_001",
        post_id="post_001",
    )

    # 1. Status is immediately image_pending
    assert outcome.status == "image_pending"
    assert outcome.job_id == "job_async_123"
    assert outcome.attempts_made == 1

    # 2. Local OCR was NEVER called because GPU worker runs pre-guardrail
    assert ocr_mock.extract_text.called is False


def test_guarded_image_pipeline_submit_failure_yields_needs_assets():
    """When submit() fails on Cloud API, pipeline returns status='needs_assets'."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "INTERNAL_ERROR"})

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    gpu_provider = GpuWorkerImageProvider(
        api_base_url=CLOUD_BASE,
        automation_token=AUTH_TOKEN,
        client=client,
    )
    pipeline = GuardedImagePipeline(image_client=ImageClient(provider=gpu_provider))

    outcome = pipeline.generate_guarded_image(sample_request(), workspace_id=WS_ID)
    assert outcome.status == "needs_assets"
    assert len(outcome.failure_reasons) > 0


# ==============================================================================
# 5. PIPELINE END-TO-END (POST ENTERS STATUS 'image_pending')
# ==============================================================================

def test_generated_image_sets_suggestion_to_image_pending():
    """generated_image() in pipeline returns AI_IMAGE_SUBMITTED warning and marks suggestion as 'image_pending'."""
    async def _async_test():
        def mock_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(201, json={"job_id": "job_pipe_456", "status": "queued"})

        client = httpx.Client(transport=httpx.MockTransport(mock_handler))
        gpu_provider = GpuWorkerImageProvider(
            api_base_url=CLOUD_BASE,
            automation_token=AUTH_TOKEN,
            client=client,
        )
        pipeline = GuardedImagePipeline(image_client=ImageClient(provider=gpu_provider))

        # Mock ctx and payload
        ctx = MagicMock()
        ctx.settings = Settings(ai_image_generation=True, provider_mode="live")
        ctx.job = MagicMock()
        ctx.job.workspace_id = WS_ID
        ctx.job.job_id = "post_pipe_001"
        ctx.seconds_left.return_value = 300

        payload = MagicMock()
        payload.allow_ai_image = True
        payload.source_article = MagicMock()
        payload.source_article.result = {"article_id": "art_pipe_001"}

        suggestion = ImageSuggestion(
            status="draft",
            prompt="A serene beach view in Da Nang",
            negative_prompt="text, logo",
            aspect_ratio="1:1",
        )

        # Patch GuardedImagePipeline inside generated_image
        import src.agents.content.pipeline as pipe_mod
        orig_pipeline = pipe_mod.GuardedImagePipeline
        pipe_mod.GuardedImagePipeline = lambda: pipeline

        try:
            illustration, warnings = await generated_image(ctx, payload, suggestion, "Alt text description")

            assert illustration is None
            assert any("AI_IMAGE_SUBMITTED:job_pipe_456" in w for w in warnings)
            assert suggestion.status == "image_pending"
        finally:
            pipe_mod.GuardedImagePipeline = orig_pipeline

    asyncio.run(_async_test())


def test_run_content_sets_social_pack_status_to_image_pending(client, make_client):
    """run_content() sets post status to 'image_pending' when suggestion is image_pending."""
    async def _async_test():
        def mock_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(201, json={"job_id": "job_sp_789", "status": "queued"})

        mock_http = httpx.Client(transport=httpx.MockTransport(mock_handler))
        gpu_provider = GpuWorkerImageProvider(
            api_base_url=CLOUD_BASE,
            automation_token=AUTH_TOKEN,
            client=mock_http,
        )
        pipeline = GuardedImagePipeline(image_client=ImageClient(provider=gpu_provider))

        import src.agents.content.pipeline as pipe_mod
        orig_pipeline = pipe_mod.GuardedImagePipeline
        pipe_mod.GuardedImagePipeline = lambda: pipeline

        try:
            from test_content_facebook import content_job, run
            from test_content_tiktok_and_image import PackProvider, script

            _, job = content_job(client, channels=["facebook"], assets=False)

            # Ensure AI image generation is active
            settings = Settings(
                ai_image_generation=True,
                provider_mode="live",
                ai_image_provider="gpu_worker",
            )

            ctx = MagicMock()
            ctx.settings = settings
            ctx.job = MagicMock()
            ctx.job.workspace_id = WS_ID
            ctx.job.job_id = "post_e2e_001"
            ctx.job.context_snapshot_id = uuid4()
            ctx.seconds_left.return_value = 300
            ctx.optional_call_blocker.return_value = None
            ctx.call_json = AsyncMock(side_effect=lambda system, user, model, fake, **kwargs: model.model_validate(fake()))

            # Construct ContentPayload
            p = ContentPayload.model_validate(job["payload"])
            ctx.payload = p
            p.allow_ai_image = True
            # Real product = False ensures image_suggestion generates draft prompt
            p.real_product = False

            # Run pipeline
            outcome = await run_content(ctx)
            result = outcome.result

            assert result["status"] == "image_pending"
            assert result["image_suggestion"]["status"] == "image_pending"
            assert result["generated_image"] is None
            assert any("AI_IMAGE_SUBMITTED:job_sp_789" in w for w in outcome.warnings)
        finally:
            pipe_mod.GuardedImagePipeline = orig_pipeline

    asyncio.run(_async_test())
