"""AI Image Generation Client & Storage Adapter for Content Marketing (CM-11).

Provides multi-provider image generation and storage pipeline:
- Providers:
  1. Flux.1 [dev] (via the Replicate HTTP API, ~$0.035/image); without a token there is no image, never a pretend one
  2. FakeImageProvider (Deterministic mock for test environments and offline CI, zero cost)
- Aspect ratios:
  - 1:1 (1080x1080) for Facebook / square post
  - 9:16 (1080x1920) for TikTok / vertical story
- Resilience:
  - Configurable timeouts
  - Exponential backoff retry mechanism (max 3 retries)
- Storage & Audit (Cloudflare R2 / S3):
  - Uploads image binary to Cloudflare R2 (or FakeStorage)
  - Computes SHA-256 content_hash
  - Generates media_assets payload matching Migration 012 schema with full ai_metadata:
    {model, prompt, seed, created_at, ocr_checked, cost_usd, latency_s, aspect_ratio}
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import os
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
from PIL import Image, ImageOps

from .social_pack_v2 import AIImageMetadata, AssetV2


@dataclass
class ImageGenerationRequest:
    """Request payload for generating an AI image."""

    prompt: str
    negative_prompt: str
    aspect_ratio: Literal["1:1", "9:16"] = "1:1"
    width: int = 1080
    height: int = 1080
    seed: int | None = None
    workspace_id: UUID | str = "00000000-0000-0000-0000-000000000001"
    model_name: str = "flux-1-dev"
    alt_text_description: str = "Đồ họa phong cách tối giản phục vụ minh họa bài viết"


@dataclass
class ProviderImageOutput:
    """Raw output returned by an AI image provider."""

    image_bytes: bytes
    mime_type: str
    model_name: str
    seed: int
    cost_usd: float
    latency_s: float
    width: int
    height: int


@dataclass
class ImageGenerationResult:
    """End-to-end outcome of generation, storage upload, and media_assets formatting."""

    asset: AssetV2
    media_asset_record: dict[str, Any]
    ai_metadata: AIImageMetadata
    cost_usd: float
    latency_s: float
    aspect_ratio: str
    content_hash: str
    storage_url: str


# ==============================================================================
# 1. PROVIDER ABSTRACTIONS & IMPLEMENTATIONS
# ==============================================================================

class BaseImageProvider(ABC):
    """Abstract interface for AI image generation providers."""

    is_configured = True

    @abstractmethod
    def generate(self, request: ImageGenerationRequest) -> ProviderImageOutput:
        """Execute synchronous or wrapped asynchronous generation."""
        ...


class FakeImageProvider(BaseImageProvider):
    """Deterministic, zero-cost fake provider for unit tests and local development."""

    def __init__(self, latency_s: float = 0.01, unit_cost: float = 0.035) -> None:
        self.latency_s = latency_s
        self.unit_cost = unit_cost
        self.call_count = 0

    def generate(self, request: ImageGenerationRequest) -> ProviderImageOutput:
        self.call_count += 1
        start_time = time.perf_counter()

        # Simulate minimal processing
        if self.latency_s > 0:
            time.sleep(self.latency_s)

        elapsed = time.perf_counter() - start_time
        resolved_seed = request.seed if request.seed is not None else 88392104

        # Generate valid in-memory WebP image bytes using Pillow
        try:
            from PIL import Image
            import io
            # Deterministic color tint based on seed
            r = (resolved_seed * 17) % 150 + 80
            g = (resolved_seed * 31) % 150 + 80
            b = (resolved_seed * 47) % 150 + 80
            img = Image.new("RGB", (request.width, request.height), color=(r, g, b))
            buf = io.BytesIO()
            img.save(buf, format="WEBP")
            mock_bytes = buf.getvalue()
        except Exception:
            content_seed = f"{request.model_name}:{request.aspect_ratio}:{resolved_seed}:{request.prompt}"
            mock_bytes = f"RIFF_FAKE_WEBP_{hashlib.sha256(content_seed.encode('utf-8')).hexdigest()}".encode("utf-8")

        return ProviderImageOutput(
            image_bytes=mock_bytes,
            mime_type="image/webp",
            model_name=request.model_name or "flux-1-dev",
            seed=resolved_seed,
            cost_usd=self.unit_cost,
            latency_s=round(elapsed, 4),
            width=request.width,
            height=request.height,
        )


class ImageProviderError(RuntimeError):
    """The image service delivered nothing; `code` says why."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def fit_image(data: bytes, width: int, height: int) -> bytes:
    """Flux returns about one megapixel (1024x1024, 768x1344) and the guardrail needs 1080 on the short side."""
    with Image.open(io.BytesIO(data)) as image:
        fitted = ImageOps.fit(image.convert("RGB"), (width, height), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    fitted.save(buffer, format="WEBP", quality=90)
    return buffer.getvalue()


class FluxImageProvider(BaseImageProvider):
    """Flux.1 [dev] on Replicate: create a prediction, wait for it, download the file (Replicate removes it after about an hour)."""

    ENDPOINT = "https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions"

    def __init__(
        self,
        api_key: str | None = None,
        unit_cost: float = 0.035,
        client: httpx.Client | None = None,
        poll_seconds: float = 2.0,
        max_polls: int = 30,
    ) -> None:
        self.api_key = api_key or os.getenv("REPLICATE_API_TOKEN") or ""
        self.unit_cost = unit_cost
        # Longer than the 60 seconds Replicate may hold the request open.
        self.client = client or httpx.Client(timeout=90)
        self.poll_seconds = poll_seconds
        self.max_polls = max_polls

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _checked(self, response: httpx.Response) -> httpx.Response:
        if response.status_code >= 400:
            raise ImageProviderError("IMAGE_PROVIDER_FAILED", f"Replicate answered HTTP {response.status_code}")
        return response

    def _finished(self, prediction: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        for _ in range(self.max_polls):
            status = prediction.get("status")
            if status == "succeeded":
                return prediction
            if status in ("failed", "canceled"):
                raise ImageProviderError("IMAGE_PROVIDER_FAILED", f"Prediction {status}: {prediction.get('error')}")
            time.sleep(self.poll_seconds)
            prediction = self._checked(self.client.get(prediction["urls"]["get"], headers=headers)).json()
        raise ImageProviderError("IMAGE_PROVIDER_TIMEOUT", "Prediction did not finish in time")

    def generate(self, request: ImageGenerationRequest) -> ProviderImageOutput:
        if not self.api_key:
            raise ImageProviderError("IMAGE_PROVIDER_NOT_CONFIGURED", "REPLICATE_API_TOKEN is not set")
        start_time = time.perf_counter()
        seed = request.seed if request.seed is not None else secrets.randbelow(1_000_000_000)
        headers = {"Authorization": f"Bearer {self.api_key}"}
        # Flux has no negative prompt input, so what to leave out goes in the prompt.
        prompt = f"{request.prompt}. Avoid: {request.negative_prompt}" if request.negative_prompt else request.prompt
        try:
            created = self._checked(self.client.post(
                self.ENDPOINT, headers={**headers, "Prefer": "wait=60"},
                json={"input": {"prompt": prompt, "aspect_ratio": request.aspect_ratio, "seed": seed,
                                "num_outputs": 1, "output_format": "webp"}})).json()
            prediction = self._finished(created, headers)
            files = prediction.get("output")
            if not isinstance(files, list) or not files:
                raise ImageProviderError("IMAGE_PROVIDER_FAILED", "Prediction succeeded without an output file")
            # Replicate serves output files only with the token that made them.
            data = self._checked(self.client.get(files[0], headers=headers, follow_redirects=True)).content
            image_bytes = fit_image(data, request.width, request.height)
        except (httpx.HTTPError, ValueError, OSError) as exc:
            raise ImageProviderError("IMAGE_PROVIDER_FAILED", f"Replicate call failed: {exc.__class__.__name__}") from exc
        return ProviderImageOutput(
            image_bytes=image_bytes,
            mime_type="image/webp",
            model_name="flux-dev",
            seed=seed,
            cost_usd=self.unit_cost,
            latency_s=round(time.perf_counter() - start_time, 4),
            width=request.width,
            height=request.height,
        )


# ==============================================================================
# 2. STORAGE ADAPTERS (CLOUDFLARE R2 / S3)
# ==============================================================================

class BaseStorageClient(ABC):
    """Abstract interface for storing generated media assets."""

    is_configured = True

    @abstractmethod
    def upload(self, data: bytes, filename: str, content_type: str = "image/webp") -> str:
        """Upload raw binary data and return public CDN URL."""
        ...


class FakeStorageClient(BaseStorageClient):
    """In-memory mock storage client returning deterministic CDN URLs."""

    def __init__(self, cdn_base_url: str = "https://cdn.tripc.vn") -> None:
        self.cdn_base_url = cdn_base_url.rstrip("/")
        self.stored_files: dict[str, bytes] = {}

    def upload(self, data: bytes, filename: str, content_type: str = "image/webp") -> str:
        self.stored_files[filename] = data
        return f"{self.cdn_base_url}/generated/{filename}"


def _hmac(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def s3_authorization(method: str, path: str, headers: dict[str, str], access_key_id: str, secret_access_key: str, region: str) -> str:
    """AWS Signature Version 4 over every given header; they must include Host, x-amz-date and x-amz-content-sha256."""
    signed = {name.lower(): value.strip() for name, value in headers.items()}
    names = sorted(signed)
    amz_date, day = signed["x-amz-date"], signed["x-amz-date"][:8]
    canonical = "\n".join([method, quote(path, safe="/-_.~"), "", *(f"{name}:{signed[name]}" for name in names), "",
                           ";".join(names), signed["x-amz-content-sha256"]])
    scope = f"{day}/{region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode("utf-8")).hexdigest()])
    key = f"AWS4{secret_access_key}".encode("utf-8")
    for part in (day, region, "s3", "aws4_request"):
        key = _hmac(key, part)
    signature = hmac.new(key, to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"AWS4-HMAC-SHA256 Credential={access_key_id}/{scope},SignedHeaders={';'.join(names)},Signature={signature}"


class R2StorageClient(BaseStorageClient):
    """Cloudflare R2 over its S3 API. A bucket is private until exposed, so the public address is a setting of its own."""

    def __init__(
        self,
        bucket_name: str | None = None,
        account_id: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        public_base_url: str | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.bucket_name = os.getenv("R2_BUCKET_NAME", "") if bucket_name is None else bucket_name
        self.account_id = os.getenv("R2_ACCOUNT_ID", "") if account_id is None else account_id
        self.access_key_id = os.getenv("R2_ACCESS_KEY_ID", "") if access_key_id is None else access_key_id
        self.secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY", "") if secret_access_key is None else secret_access_key
        self.public_base_url = (os.getenv("R2_PUBLIC_BASE_URL", "") if public_base_url is None else public_base_url).rstrip("/")
        self.client = client or httpx.Client(timeout=60)

    @property
    def is_configured(self) -> bool:
        return all([self.bucket_name, self.account_id, self.access_key_id, self.secret_access_key, self.public_base_url])

    def upload(self, data: bytes, filename: str, content_type: str = "image/webp") -> str:
        if not self.is_configured:
            raise ImageProviderError("IMAGE_STORAGE_NOT_CONFIGURED", "R2 settings are incomplete")
        host = f"{self.account_id}.r2.cloudflarestorage.com"
        key = f"generated/{filename}"
        path = f"/{self.bucket_name}/{key}"
        headers = {"Host": host, "Content-Type": content_type, "x-amz-content-sha256": hashlib.sha256(data).hexdigest(),
                   "x-amz-date": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}
        headers["Authorization"] = s3_authorization("PUT", path, headers, self.access_key_id, self.secret_access_key, "auto")
        try:
            response = self.client.put(f"https://{host}{path}", content=data, headers=headers)
        except httpx.HTTPError as exc:
            raise ImageProviderError("IMAGE_STORAGE_FAILED", f"R2 upload failed: {exc.__class__.__name__}") from exc
        if response.status_code >= 300:
            raise ImageProviderError("IMAGE_STORAGE_FAILED", f"R2 answered HTTP {response.status_code}")
        return f"{self.public_base_url}/{key}"


# ==============================================================================
# 3. FACADE CLIENT WITH TIMEOUT, RETRIES, AND METADATA RECORDING
# ==============================================================================

class ImageClient:
    """High-level client orchestrating AI image generation, retry policies, and R2 storage."""

    def __init__(
        self,
        provider: BaseImageProvider | None = None,
        storage: BaseStorageClient | None = None,
        max_retries: int = 3,
        timeout_seconds: float = 25.0,
    ) -> None:
        self.provider = provider or FluxImageProvider()
        self.storage = storage or R2StorageClient()
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds

    def generate_and_store(
        self,
        request: ImageGenerationRequest,
        workspace_id: UUID | str | None = None,
    ) -> ImageGenerationResult:
        """Execute image generation with retry policy, save to R2, and build media_assets record."""
        last_error: Exception | None = None

        # Exponential backoff retry loop
        for attempt in range(1, self.max_retries + 1):
            try:
                output = self.provider.generate(request)
                break
            except Exception as exc:
                last_error = exc
                if attempt == self.max_retries:
                    raise RuntimeError(
                        f"Failed to generate image after {self.max_retries} attempts: {exc}"
                    ) from exc
                time.sleep(0.1 * (2 ** (attempt - 1)))
        else:
            raise RuntimeError(f"Unexpected retry failure: {last_error}")
        return self.store(output, request, workspace_id)

    def store(
        self,
        output: ProviderImageOutput,
        request: ImageGenerationRequest,
        workspace_id: UUID | str | None = None,
        ocr_checked: bool = False,
    ) -> ImageGenerationResult:
        """Save an image already generated: inspecting one image and storing another would publish what nobody checked."""
        target_ws_id = workspace_id or request.workspace_id

        # Compute SHA-256 hash
        content_hash = hashlib.sha256(output.image_bytes).hexdigest()

        # Upload to Storage
        extension = "webp" if "webp" in output.mime_type else "jpg"
        filename = f"{content_hash[:16]}_{request.aspect_ratio.replace(':', 'x')}.{extension}"
        storage_url = self.storage.upload(output.image_bytes, filename, content_type=output.mime_type)

        created_at_iso = datetime.now(timezone.utc).isoformat()
        asset_id = f"ast_ai_{content_hash[:12]}"

        # Standard AI alt_text must start with [Ảnh minh họa AI]
        alt_prefix = "[Ảnh minh họa AI]"
        clean_desc = request.alt_text_description.strip()
        if not clean_desc.startswith(alt_prefix):
            full_alt_text = f"{alt_prefix} {clean_desc}"
        else:
            full_alt_text = clean_desc

        attribution = f"Generated by {output.model_name} via AI Growth OS on {created_at_iso[:10]}"

        # Construct Pydantic v2 AssetV2
        asset_v2 = AssetV2(
            asset_id=asset_id,
            url=storage_url,
            source_type="ai_generated",
            license="ai_generated",
            attribution=attribution,
            alt_text=full_alt_text,
        )

        # Construct Pydantic v2 AIImageMetadata
        ai_metadata = AIImageMetadata(
            model_name=output.model_name,
            prompt=request.prompt,
            seed=output.seed,
            created_at=created_at_iso,
            ocr_checked=ocr_checked,
        )

        # Database record matching Migration 012 `media_assets`
        media_asset_record = {
            "id": str(uuid4()),
            "workspace_id": str(target_ws_id),
            "source_type": "ai_generated",
            "url": storage_url,
            "license": "ai_generated",
            "attribution": attribution,
            "status": "approved",
            "content_hash": content_hash,
            "alt_text": full_alt_text,
            "ai_metadata": {
                "model_name": output.model_name,
                "prompt": request.prompt,
                "negative_prompt": request.negative_prompt,
                "seed": output.seed,
                "aspect_ratio": request.aspect_ratio,
                "width": output.width,
                "height": output.height,
                "cost_usd": output.cost_usd,
                "latency_s": output.latency_s,
                "created_at": created_at_iso,
                "ocr_checked": ocr_checked,
            },
        }

        return ImageGenerationResult(
            asset=asset_v2,
            media_asset_record=media_asset_record,
            ai_metadata=ai_metadata,
            cost_usd=output.cost_usd,
            latency_s=output.latency_s,
            aspect_ratio=request.aspect_ratio,
            content_hash=content_hash,
            storage_url=storage_url,
        )
