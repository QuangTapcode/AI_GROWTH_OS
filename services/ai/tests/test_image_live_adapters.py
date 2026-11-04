"""The real Replicate and R2 adapters, driven through fake HTTP: no key means an error, never a pretend image."""
import hashlib
import io
import json
from dataclasses import replace

import httpx
import pytest
from PIL import Image

from src.agents.content.image_client import (FakeImageProvider, FakeStorageClient, FluxImageProvider, ImageClient, ImageGenerationRequest,
                                             ImageProviderError, R2StorageClient, s3_authorization)
from src.agents.content.image_guardrail import GuardedImagePipeline, ImageGuardrail, MockOcrEngine, TesseractOcrEngine

PREDICTIONS = "https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions"
FILE_URL = "https://replicate.delivery/result/out-0.webp"


def picture(width=1024, height=1024) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color=(120, 90, 60)).save(buffer, format="WEBP")
    return buffer.getvalue()


def flux(handler, **options) -> FluxImageProvider:
    return FluxImageProvider(api_key="r8_test", client=httpx.Client(transport=httpx.MockTransport(handler)), **options)


def request(aspect_ratio="1:1", width=1080, height=1080, seed=7) -> ImageGenerationRequest:
    return ImageGenerationRequest(prompt="A bowl of noodle soup on a wooden table", negative_prompt="text, letters, numbers",
                                  aspect_ratio=aspect_ratio, width=width, height=height, seed=seed)


def finished(calls=None, size=(1024, 1024)):
    def handler(http):
        if calls is not None:
            calls.append(http)
        if http.method == "POST":
            return httpx.Response(201, json={"status": "succeeded", "output": [FILE_URL], "urls": {"get": PREDICTIONS + "/p1"}})
        return httpx.Response(200, content=picture(*size))
    return handler


def test_a_prediction_asks_flux_for_the_prompt_and_waits_for_the_file():
    calls = []
    output = flux(finished(calls)).generate(request())
    create, download = calls
    assert str(create.url) == PREDICTIONS and create.headers["authorization"] == "Bearer r8_test"
    assert create.headers["prefer"] == "wait=60"
    sent = json.loads(create.content)["input"]
    assert sent["aspect_ratio"] == "1:1" and sent["seed"] == 7 and sent["output_format"] == "webp"
    assert sent["prompt"].startswith("A bowl of noodle soup")
    # Flux has no negative prompt input, and an image with lettering is refused later, so the prompt says it.
    assert "text, letters, numbers" in sent["prompt"]
    # Replicate serves output files only to the token's owner.
    assert str(download.url) == FILE_URL and download.headers["authorization"] == "Bearer r8_test"
    assert output.seed == 7 and output.model_name == "flux-dev"


@pytest.mark.parametrize(("ratio", "size", "wanted"), [("1:1", (1024, 1024), (1080, 1080)), ("9:16", (768, 1344), (1080, 1920))])
def test_a_file_at_one_megapixel_is_fitted_to_what_the_guardrail_accepts(ratio, size, wanted):
    output = flux(finished(size=size)).generate(request(ratio, *wanted))
    assert Image.open(io.BytesIO(output.image_bytes)).size == wanted and (output.width, output.height) == wanted


def test_a_prediction_still_running_after_the_wait_is_followed_until_it_finishes():
    states = iter(["processing", "succeeded"])

    def handler(http):
        if http.method == "POST":
            return httpx.Response(201, json={"status": "starting", "output": None, "urls": {"get": PREDICTIONS + "/p1"}})
        if str(http.url).endswith("/p1"):
            state = next(states)
            return httpx.Response(200, json={"status": state, "output": [FILE_URL] if state == "succeeded" else None,
                                             "urls": {"get": PREDICTIONS + "/p1"}})
        return httpx.Response(200, content=picture())

    assert flux(handler, poll_seconds=0).generate(request()).image_bytes


def test_a_prediction_that_never_finishes_is_an_error():
    def handler(http):
        return httpx.Response(200, json={"status": "processing", "output": None, "urls": {"get": PREDICTIONS + "/p1"}})

    with pytest.raises(ImageProviderError) as error:
        flux(handler, poll_seconds=0, max_polls=2).generate(request())
    assert error.value.code == "IMAGE_PROVIDER_TIMEOUT"


@pytest.mark.parametrize("state", ["failed", "canceled"])
def test_a_failed_prediction_is_an_error(state):
    def handler(http):
        return httpx.Response(201, json={"status": state, "error": "NSFW content", "output": None, "urls": {"get": PREDICTIONS + "/p1"}})

    with pytest.raises(ImageProviderError) as error:
        flux(handler).generate(request())
    assert error.value.code == "IMAGE_PROVIDER_FAILED" and "NSFW" in str(error.value)


def test_a_refused_token_is_an_error():
    with pytest.raises(ImageProviderError) as error:
        flux(lambda http: httpx.Response(401, json={"detail": "Unauthenticated"})).generate(request())
    assert error.value.code == "IMAGE_PROVIDER_FAILED"


def test_without_a_token_there_is_no_image_at_all(monkeypatch):
    monkeypatch.delenv("REPLICATE_API_TOKEN", raising=False)
    with pytest.raises(ImageProviderError) as error:
        FluxImageProvider().generate(request())
    assert error.value.code == "IMAGE_PROVIDER_NOT_CONFIGURED"


def test_the_upload_signature_matches_the_example_aws_publishes():
    # "Example: PUT Object" in the AWS Signature Version 4 documentation for S3.
    payload_hash = hashlib.sha256(b"Welcome to Amazon S3.").hexdigest()
    headers = {"Date": "Fri, 24 May 2013 00:00:00 GMT", "Host": "examplebucket.s3.amazonaws.com",
               "x-amz-content-sha256": payload_hash, "x-amz-date": "20130524T000000Z", "x-amz-storage-class": "REDUCED_REDUNDANCY"}
    assert s3_authorization("PUT", "/test$file.text", headers, "AKIAIOSFODNN7EXAMPLE",
                            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1") == (
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,"
        "SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class,"
        "Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd")


def r2(handler, **options) -> R2StorageClient:
    settings = dict(bucket_name="tripc-media", account_id="acct", access_key_id="key", secret_access_key="secret",
                    public_base_url="https://media.example.com/")
    return R2StorageClient(**{**settings, **options}, client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_an_upload_puts_the_bytes_in_the_bucket_and_returns_the_public_address():
    calls = []

    def handler(http):
        calls.append(http)
        return httpx.Response(200)

    url = r2(handler).upload(b"image bytes", "abc_1x1.webp", content_type="image/webp")
    put = calls[0]
    assert put.method == "PUT" and str(put.url) == "https://acct.r2.cloudflarestorage.com/tripc-media/generated/abc_1x1.webp"
    assert put.content == b"image bytes" and put.headers["content-type"] == "image/webp"
    assert put.headers["x-amz-content-sha256"] == hashlib.sha256(b"image bytes").hexdigest()
    # R2 signs with the region "auto".
    assert put.headers["authorization"].startswith("AWS4-HMAC-SHA256 Credential=key/") and "/auto/s3/aws4_request" in put.headers["authorization"]
    assert url == "https://media.example.com/generated/abc_1x1.webp"


def test_a_refused_upload_gives_no_address():
    with pytest.raises(ImageProviderError) as error:
        r2(lambda http: httpx.Response(403)).upload(b"image bytes", "abc.webp")
    assert error.value.code == "IMAGE_STORAGE_FAILED"


@pytest.mark.parametrize("missing", ["bucket_name", "account_id", "access_key_id", "secret_access_key", "public_base_url"])
def test_incomplete_storage_settings_give_no_address(monkeypatch, missing):
    for name in ("R2_BUCKET_NAME", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    client = r2(lambda http: httpx.Response(200), **{missing: ""})
    assert client.is_configured is False
    with pytest.raises(ImageProviderError) as error:
        client.upload(b"image bytes", "abc.webp")
    assert error.value.code == "IMAGE_STORAGE_NOT_CONFIGURED"


class Paintings(FakeImageProvider):
    """Every call paints a different image, as a real model does, and is paid for."""

    def __init__(self):
        super().__init__(latency_s=0)
        self.painted = []

    def generate(self, request):
        output = replace(super().generate(request), image_bytes=picture_of(len(self.painted)))
        self.painted.append(output.image_bytes)
        return output


def picture_of(shade) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (1080, 1080), color=(20 + shade * 40, 80, 80)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_the_image_stored_is_the_one_inspected_and_it_is_paid_for_once():
    provider, storage = Paintings(), FakeStorageClient()
    pipeline = GuardedImagePipeline(ImageClient(provider, storage), ImageGuardrail(MockOcrEngine()))
    outcome = pipeline.generate_guarded_image(request())
    assert outcome.status == "approved" and len(provider.painted) == 1
    assert list(storage.stored_files.values()) == provider.painted
    assert outcome.result.ai_metadata.ocr_checked is True and outcome.result.media_asset_record["ai_metadata"]["ocr_checked"] is True


def test_an_image_nobody_inspected_is_not_recorded_as_checked():
    result = ImageClient(Paintings(), FakeStorageClient()).generate_and_store(request())
    assert result.ai_metadata.ocr_checked is False and result.media_asset_record["ai_metadata"]["ocr_checked"] is False


def test_without_an_ocr_engine_the_inspection_cannot_pass(monkeypatch):
    engine = TesseractOcrEngine()
    monkeypatch.setattr(engine, "is_available", lambda: False)
    report = ImageGuardrail(engine).inspect(picture_of(0))
    assert report.passed is False and any("OCR" in reason for reason in report.rejection_reasons)


def test_without_an_ocr_engine_no_money_is_spent_on_an_image_that_could_never_pass(monkeypatch):
    engine = TesseractOcrEngine()
    monkeypatch.setattr(engine, "is_available", lambda: False)
    provider, storage = Paintings(), FakeStorageClient()
    outcome = GuardedImagePipeline(ImageClient(provider, storage), ImageGuardrail(engine)).generate_guarded_image(request())
    assert outcome.status == "needs_assets" and outcome.attempts_made == 0
    assert provider.painted == [] and storage.stored_files == {}
    assert any("OCR" in reason for reason in outcome.failure_reasons)
