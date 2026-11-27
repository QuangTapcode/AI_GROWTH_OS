"""An AI illustration is paid for and public, so it is off by default and can never cost the post it goes with."""
import hashlib
import io
import json

import pytest
from PIL import Image

from src.agents.content import pipeline as content_pipeline
from src.agents.content.image_client import (
    BaseImageProvider,
    FakeImageProvider,
    FakeStorageClient,
    ImageClient,
    ImageProviderError,
    ProviderImageOutput,
)
from src.agents.content.image_guardrail import GuardedImagePipeline, ImageGuardrail, MockOcrEngine
from test_content_facebook import content_job, run
from test_content_tiktok_and_image import PackProvider, script


def make_dummy_image(width: int = 1080, height: int = 1080) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(80, 120, 160)).save(buf, format="WEBP")
    return buf.getvalue()


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


def rehash_source_article(job):
    item = job["payload"]["source_article"]
    ev = [x.model_dump(mode="json") if hasattr(x, "model_dump") else x for x in item.get("evidence", [])]
    digest = hashlib.sha256(json.dumps({"result": item["result"], "evidence": ev},
        sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    item["artifact"]["content_hash"] = digest


def test_real_room_text_in_article_needs_assets_and_never_calls_provider(client, make_client, studio):
    _, job = content_job(client, channels=["facebook"], assets=False)
    job["payload"]["source_article"]["result"]["title"] = "Căn hộ Studio tại TripC Da Nang cách biển Mỹ Khê 200m"
    job["payload"]["source_article"]["result"]["body_markdown"] = (
        "The guide compares living areas for newcomers.\n\n"
        "Căn hộ có diện tích 45m2, đầy đủ nội thất phòng ngủ, ban công riêng và bồn tắm, giá thuê 8.5tr."
    )
    job["payload"]["real_product"] = None
    rehash_source_article(job)
    out = run(make_client(provider=PackProvider(script()), provider_mode="live", ai_image_generation=True), job)["result"]
    assert out["result"]["image_suggestion"]["status"] == "needs_assets"
    assert out["result"]["image_suggestion"]["reason"] is not None
    assert out["result"]["generated_image"] is None
    assert studio.image_client.provider.calls == 0


def test_real_room_article_never_calls_image_provider(client, make_client, monkeypatch):
    calls = 0

    class SpyImageProvider(BaseImageProvider):
        @property
        def is_configured(self) -> bool:
            return True

        def generate(self, request):

            nonlocal calls
            calls += 1
            return super().generate(request)

    spy_provider = SpyImageProvider()
    pipeline = GuardedImagePipeline(ImageClient(spy_provider, FakeStorageClient()), ImageGuardrail(MockOcrEngine()))
    monkeypatch.setattr(content_pipeline, "GuardedImagePipeline", lambda: pipeline)

    _, job = content_job(client, channels=["facebook"], assets=False)
    job["payload"]["source_article"]["result"]["title"] = "Khách sạn TripC Da Nang sang trọng"
    job["payload"]["source_article"]["result"]["body_markdown"] = (
        "The guide compares living areas for newcomers.\n\n"
        "Dịch vụ đặt phòng và check-in 24/7 với hồ bơi riêng và view biển tuyệt đẹp."
    )
    job["payload"]["real_product"] = None
    rehash_source_article(job)

    out = run(make_client(provider=PackProvider(script()), provider_mode="live", ai_image_generation=True), job)["result"]
    assert out["result"]["image_suggestion"]["status"] == "needs_assets"
    assert out["result"]["generated_image"] is None
    assert calls == 0


def test_lifestyle_and_workspace_article_calls_image_provider(client, make_client, monkeypatch):
    calls = 0

    class SpyImageProvider(BaseImageProvider):
        @property
        def is_configured(self) -> bool:
            return True

        def generate(self, request):

            nonlocal calls
            calls += 1
            return ProviderImageOutput(
                image_bytes=make_dummy_image(request.width, request.height),
                mime_type="image/webp",
                model_name="Juggernaut XL v9",
                seed=request.seed or 42,
                cost_usd=0.0,
                latency_s=0.01,
                width=request.width,
                height=request.height,
            )

    spy_provider = SpyImageProvider()
    pipeline = GuardedImagePipeline(
        ImageClient(spy_provider, FakeStorageClient(cdn_base_url="https://media.example.com")),
        ImageGuardrail(MockOcrEngine()),
    )
    monkeypatch.setattr(content_pipeline, "GuardedImagePipeline", lambda: pipeline)

    _, job = content_job(client, channels=["facebook"], assets=False)
    # Lifestyle / Travel / Workspace guide
    job["payload"]["source_article"]["result"]["title"] = "Phong cách sống và xu hướng làm việc từ xa tại Đà Nẵng 2026"
    job["payload"]["source_article"]["result"]["body_markdown"] = (
        "The guide compares living areas for newcomers.\n\n"
        "Không gian làm việc số sáng tạo, kết nối tốc độ cao và tự do khám phá văn hóa cà phê ven biển."
    )
    job["payload"]["real_product"] = None
    rehash_source_article(job)

    out = run(make_client(provider=PackProvider(script()), provider_mode="live", ai_image_generation=True), job)["result"]
    assert out["result"]["image_suggestion"]["status"] == "draft"
    assert out["result"]["generated_image"] is not None
    assert out["result"]["generated_image"]["model_name"] == "Juggernaut XL v9"
    assert out["result"]["generated_image"]["cost_usd"] == 0.0
    assert calls == 1


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
    for name in ("REPLICATE_API_TOKEN", "R2_BUCKET_NAME", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL", "AI_IMAGE_PROVIDER"):
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
