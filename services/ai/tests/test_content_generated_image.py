"""An AI illustration is paid for and public, so it is off by default and can never cost the post it goes with."""
import io

import pytest
from PIL import Image

from src.agents.content import pipeline as content_pipeline
from src.agents.content.image_client import FakeImageProvider, FakeStorageClient, ImageClient, ImageProviderError
from src.agents.content.image_guardrail import GuardedImagePipeline, ImageGuardrail, MockOcrEngine
from test_content_facebook import content_job, run
from test_content_tiktok_and_image import PackProvider, script


class Painter(FakeImageProvider):
    def __init__(self, failure=None):
        super().__init__(latency_s=0)
        self.failure, self.calls = failure, 0

    def generate(self, request):
        self.calls += 1
        if self.failure:
            raise self.failure
        return super().generate(request)


@pytest.fixture
def studio(monkeypatch):
    """The image pipeline Content will build, on fakes and with the settings of a configured deployment."""
    painter, storage = Painter(), FakeStorageClient(cdn_base_url="https://media.example.com")
    pipeline = GuardedImagePipeline(ImageClient(painter, storage), ImageGuardrail(MockOcrEngine()))
    monkeypatch.setattr(content_pipeline, "GuardedImagePipeline", lambda: pipeline)
    return pipeline


def pack(client, make_client, assets=False, **settings):
    _, job = content_job(client, channels=["facebook"], assets=assets)
    return job, run(make_client(provider=PackProvider(script()), provider_mode="live", **settings), job)["result"]


def test_no_image_is_generated_unless_the_deployment_turned_it_on(client, make_client, studio):
    _, out = pack(client, make_client)
    assert out["result"]["generated_image"] is None
    assert studio.image_client.provider.calls == 0
    assert not [w for w in out["warnings"] if w.startswith("AI_IMAGE")]


def test_an_enabled_deployment_attaches_the_checked_illustration_to_the_draft(client, make_client, studio):
    _, out = pack(client, make_client, ai_image_generation=True)
    image, result = out["result"]["generated_image"], out["result"]
    assert image["url"].startswith("https://media.example.com/generated/") and image["ocr_checked"] is True
    assert image["aspect_ratio"] == "1:1" and (image["width"], image["height"]) == (1080, 1080)
    assert image["prompt"] == result["image_suggestion"]["prompt"] and image["alt_text"].startswith("[Ảnh minh họa AI]")
    assert image["cost_usd"] > 0 and len(image["content_hash"]) == 64
    # A Facebook text post needs no image: the illustration adds to the draft and holds nothing up.
    assert result["status"] == "draft" and result["image_assets"] == [] and result["facebook"]["text"]


def test_a_draft_with_an_approved_photo_needs_no_illustration(client, make_client, studio):
    _, out = pack(client, make_client, assets=True, ai_image_generation=True)
    assert out["result"]["generated_image"] is None and studio.image_client.provider.calls == 0


def test_a_job_that_forbids_ai_images_gets_none(client, make_client, studio):
    _, job = content_job(client, channels=["facebook"], assets=False)
    job["payload"]["allow_ai_image"] = False
    out = run(make_client(provider=PackProvider(script()), provider_mode="live", ai_image_generation=True), job)["result"]
    assert out["result"]["generated_image"] is None and studio.image_client.provider.calls == 0


def test_real_premises_need_a_real_photo(client, make_client, studio):
    _, job = content_job(client, channels=["facebook"], assets=False)
    job["payload"]["real_product"] = True
    out = run(make_client(provider=PackProvider(script()), provider_mode="live", ai_image_generation=True), job)["result"]
    assert out["result"]["image_suggestion"]["status"] == "needs_assets"
    assert out["result"]["generated_image"] is None and studio.image_client.provider.calls == 0


def test_a_demo_run_never_spends_money(client, make_client, studio):
    _, job = content_job(client, channels=["facebook"], assets=False)
    out = run(make_client(ai_image_generation=True), job)["result"]
    assert out["result"]["generated_image"] is None and studio.image_client.provider.calls == 0


def test_a_failed_image_service_leaves_the_post_and_says_why(client, make_client, studio):
    studio.image_client.provider.failure = ImageProviderError("IMAGE_PROVIDER_FAILED", "Replicate answered HTTP 500")
    _, out = pack(client, make_client, ai_image_generation=True)
    assert out["result"]["facebook"]["text"] and out["result"]["generated_image"] is None
    assert "AI_IMAGE_SKIPPED:IMAGE_PROVIDER_FAILED" in out["warnings"]


def test_a_malformed_answer_from_the_image_service_cannot_cost_the_post(client, make_client, studio):
    studio.image_client.provider.failure = KeyError("urls")
    _, out = pack(client, make_client, ai_image_generation=True)
    assert out["result"]["facebook"]["text"] and out["result"]["generated_image"] is None
    assert "AI_IMAGE_SKIPPED:IMAGE_PIPELINE_ERROR" in out["warnings"]


def test_an_image_with_lettering_on_every_attempt_is_dropped_and_reported(client, make_client, studio):
    studio.guardrail = ImageGuardrail(MockOcrEngine(forced_text="50% OFF"))
    _, out = pack(client, make_client, ai_image_generation=True)
    assert out["result"]["generated_image"] is None and "AI_IMAGE_REJECTED:3" in out["warnings"]
    assert studio.image_client.storage.stored_files == {}


def test_an_enabled_deployment_missing_its_settings_is_told_which_one(client, make_client, monkeypatch):
    # The real pipeline, with nothing configured: Replicate, R2 and Tesseract are all absent.
    for name in ("REPLICATE_API_TOKEN", "R2_BUCKET_NAME", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    _, out = pack(client, make_client, ai_image_generation=True)
    assert out["result"]["facebook"]["text"] and out["result"]["generated_image"] is None
    assert "AI_IMAGE_SKIPPED:IMAGE_PROVIDER_NOT_CONFIGURED" in out["warnings"]


def test_the_image_step_is_skipped_when_it_could_run_into_the_job_deadline(client, make_client, studio):
    _, job = content_job(client, channels=["facebook"], assets=False)
    job["constraints"] = {**job["constraints"], "timeout_seconds": 100}
    out = run(make_client(provider=PackProvider(script()), provider_mode="live", ai_image_generation=True), job)["result"]
    assert out["result"]["generated_image"] is None and "AI_IMAGE_SKIPPED:NOT_ENOUGH_TIME" in out["warnings"]
    assert studio.image_client.provider.calls == 0


def test_the_fitted_image_really_is_what_the_guardrail_accepts():
    # The provider output above is 1080 square; nothing smaller may reach the draft.
    data = FakeImageProvider(latency_s=0).generate(content_pipeline.image_request("A quiet street", "text", "1:1", "A street", "ws")).image_bytes
    assert Image.open(io.BytesIO(data)).size == (1080, 1080)
