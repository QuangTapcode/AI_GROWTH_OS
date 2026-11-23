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

import hashlib
import hmac
import io
import logging
import os
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
from PIL import Image, ImageOps

from .social_pack_v2 import AIImageMetadata, AssetV2

logger = logging.getLogger(__name__)


@dataclass
class ImageGenerationRequest:
    """Request payload for generating an AI image."""

    prompt: str
    negative_prompt: str
    aspect_ratio: str = "1:1"
    width: int = 1080
    height: int = 1080
    seed: int | None = None
    workspace_id: UUID | str = "00000000-0000-0000-0000-000000000001"
    model_name: str = "flux-1-dev"
    alt_text_description: str = "Đồ họa phong cách tối giản phục vụ minh họa bài viết"
    steps: int | None = None
    cfg_scale: float | None = None
    scheduler: str | None = None


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

    @property
    def is_configured(self) -> bool:
        """Whether the provider is configured and available."""
        return True

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


class GpuWorkerImageProvider(BaseImageProvider):
    """Asynchronous GPU Worker provider backed by Cloud API image_jobs queue.

    Designed for the reverse-connecting GPU worker architecture:
    - Does NOT block the content pipeline: submit() calls POST /api/v1/image-jobs
      (AUTOMATION_INTERNAL_TOKEN + workspace_id + post_id/article_id) and returns job_id immediately.
    - poll() calls GET /api/v1/image-jobs/{id} to query job progress, status, and results.
    - Cloud handles lease management, heartbeat, pre-guardrail OCR, and retries.
    - Posts enter status 'image_pending' instead of waiting on the generation queue.
    - When the job completes, Cloud attaches the generated media_asset to the post/article.
    """

    def __init__(
        self,
        api_base_url: str | None = None,
        automation_token: str | None = None,
        client: httpx.Client | None = None,
        timeout_seconds: float = 30.0,
        model_key: str | None = None,
    ) -> None:
        self.api_base_url = (
            api_base_url
            if api_base_url is not None
            else (os.getenv("CLOUD_API_BASE_URL") or os.getenv("NEXT_PUBLIC_APP_URL") or "http://localhost:3000")
        ).rstrip("/")
        self.automation_token = (
            automation_token
            if automation_token is not None
            else (os.getenv("AUTOMATION_INTERNAL_TOKEN") or "dev_internal_secret_token_123")
        )
        self.timeout_seconds = timeout_seconds
        self.client = client or httpx.Client(timeout=self.timeout_seconds)
        self.model_key = model_key or os.getenv(
            "GPU_WORKER_MODEL_KEY", "sdxl-default"
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.api_base_url and self.automation_token)

    def submit(
        self,
        request: ImageGenerationRequest,
        workspace_id: UUID | str | None = None,
        article_id: UUID | str | None = None,
        post_id: UUID | str | None = None,
        model_key: str | None = None,
        idempotency_key: str | None = None,
    ) -> str:
        """Submit image generation request to Cloud API without blocking.

        Calls POST /api/v1/image-jobs with AUTOMATION_INTERNAL_TOKEN + workspace_id + post_id/article_id.
        Returns job_id immediately.
        """
        if not self.is_configured:
            raise ImageProviderError(
                "IMAGE_PROVIDER_NOT_CONFIGURED",
                "GpuWorkerImageProvider requires CLOUD_API_BASE_URL and AUTOMATION_INTERNAL_TOKEN",
            )

        target_workspace_id = (
            workspace_id
            or request.workspace_id
            or os.getenv("DEFAULT_WORKSPACE_ID")
            or "00000000-0000-0000-0000-000000000001"
        )
        headers = {
            "Authorization": f"Bearer {self.automation_token}",
            "Content-Type": "application/json",
            "x-workspace-id": str(target_workspace_id),
        }
        if idempotency_key:
            headers["Idempotency-Key"] = str(idempotency_key)

        body: dict[str, Any] = {
            "workspace_id": str(target_workspace_id),
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "aspect_ratio": request.aspect_ratio,
            "preferred_provider": "gpu_worker",
        }
        if request.seed is not None:
            body["seed"] = request.seed
        if request.steps is not None:
            body["steps"] = request.steps
        if request.cfg_scale is not None:
            body["cfg_scale"] = request.cfg_scale
        if request.scheduler is not None:
            body["scheduler"] = request.scheduler
        resolved_model = model_key or self.model_key
        if resolved_model:
            body["model_key"] = resolved_model
        if article_id:
            body["article_id"] = str(article_id)
        if post_id:
            body["post_id"] = str(post_id)

        url = f"{self.api_base_url}/api/v1/image-jobs"
        try:
            resp = self.client.post(url, headers=headers, json=body)
        except (httpx.HTTPError, OSError) as exc:
            raise ImageProviderError(
                "IMAGE_PROVIDER_FAILED",
                f"Failed to submit image job to Cloud API: {exc}",
            ) from exc

        if resp.status_code >= 400:
            raise ImageProviderError(
                "IMAGE_PROVIDER_FAILED",
                f"Cloud API rejected image job submission: HTTP {resp.status_code} - {resp.text}",
            )

        data = resp.json()
        job_id = data.get("job_id")
        if not job_id:
            raise ImageProviderError(
                "IMAGE_PROVIDER_FAILED",
                f"Cloud API did not return job_id: {data}",
            )
        return str(job_id)

    def poll(
        self,
        job_id: str,
        workspace_id: UUID | str | None = None,
    ) -> dict[str, Any]:
        """Poll the state of an image job from Cloud API.

        Calls GET /api/v1/image-jobs/{job_id}.
        """
        if not self.is_configured:
            raise ImageProviderError(
                "IMAGE_PROVIDER_NOT_CONFIGURED",
                "GpuWorkerImageProvider requires CLOUD_API_BASE_URL and AUTOMATION_INTERNAL_TOKEN",
            )

        target_workspace_id = (
            workspace_id
            or os.getenv("DEFAULT_WORKSPACE_ID")
            or "00000000-0000-0000-0000-000000000001"
        )
        headers = {
            "Authorization": f"Bearer {self.automation_token}",
            "x-workspace-id": str(target_workspace_id),
        }
        url = f"{self.api_base_url}/api/v1/image-jobs/{job_id}"
        try:
            resp = self.client.get(url, headers=headers)
        except (httpx.HTTPError, OSError) as exc:
            raise ImageProviderError(
                "IMAGE_PROVIDER_FAILED",
                f"Failed to poll image job {job_id} from Cloud API: {exc}",
            ) from exc

        if resp.status_code == 404:
            raise ImageProviderError(
                "JOB_NOT_FOUND",
                f"Image job {job_id} not found on Cloud API",
            )
        if resp.status_code >= 400:
            raise ImageProviderError(
                "IMAGE_PROVIDER_FAILED",
                f"Failed to poll image job {job_id}: HTTP {resp.status_code} - {resp.text}",
            )

        return resp.json()

    def generate(self, request: ImageGenerationRequest) -> ProviderImageOutput:
        """Synchronous wrapper for generate; calls submit and polls until completed or failed."""
        job_id = self.submit(request)
        max_polls = 60
        poll_interval = 2.0
        start_time = time.perf_counter()

        for _ in range(max_polls):
            time.sleep(poll_interval)
            info = self.poll(job_id, workspace_id=request.workspace_id)
            status = info.get("status")
            if status == "completed":
                image_url = info.get("image_url")
                if not image_url:
                    raise ImageProviderError("IMAGE_PROVIDER_FAILED", "Job completed without image_url")
                try:
                    dl_url = image_url if image_url.startswith("http") else f"{self.api_base_url}{image_url}"
                    img_resp = self.client.get(dl_url)
                    if img_resp.status_code >= 400:
                        raise ImageProviderError("IMAGE_PROVIDER_FAILED", f"Failed to download generated image: HTTP {img_resp.status_code}")
                    img_bytes = img_resp.content
                except Exception as exc:
                    raise ImageProviderError("IMAGE_PROVIDER_FAILED", f"Error downloading image: {exc}") from exc

                return ProviderImageOutput(
                    image_bytes=img_bytes,
                    mime_type="image/webp",
                    model_name=info.get("provider_used") or "Juggernaut XL v9",
                    seed=info.get("seed") or (request.seed or 0),
                    cost_usd=0.0,
                    latency_s=round(time.perf_counter() - start_time, 4),
                    width=info.get("width") or request.width,
                    height=info.get("height") or request.height,
                )
            elif status in ("failed", "cancelled", "needs_assets"):
                err_code = info.get("error_code") or "IMAGE_PROVIDER_FAILED"
                err_msg = info.get("error_message") or f"Job terminated with status '{status}'"
                raise ImageProviderError(err_code, err_msg)

        raise ImageProviderError("IMAGE_PROVIDER_TIMEOUT", f"Image job {job_id} timed out waiting for GPU worker")


# ==============================================================================
# 2. STORAGE ADAPTERS (CLOUDFLARE R2 / S3)
# ==============================================================================

class BaseStorageClient(ABC):
    """Abstract interface for storing generated media assets."""

    @property
    def is_configured(self) -> bool:
        """Whether the storage client is configured and available."""
        return True

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


class LocalStorageClient(BaseStorageClient):
    """Local file storage client saving assets to apps/api/public/uploads/generated for offline/staging environments."""

    def __init__(
        self,
        upload_dir: str | Path | None = None,
        public_base_url: str | None = None,
        base_url: str | None = None,
    ) -> None:
        if upload_dir is not None:
            self.upload_dir = Path(upload_dir).resolve()
        elif os.getenv("LOCAL_STORAGE_DIR"):
            self.upload_dir = Path(os.environ["LOCAL_STORAGE_DIR"]).resolve()
        else:
            repo_root = Path(__file__).resolve().parents[5]
            self.upload_dir = (repo_root / "apps" / "api" / "public" / "uploads" / "generated").resolve()

        resolved_base = (
            base_url
            or public_base_url
            or os.getenv("LOCAL_STORAGE_BASE_URL", "http://localhost:3000")
            or "http://localhost:3000"
        )
        self.public_base_url = resolved_base.rstrip("/")
        self.base_url = self.public_base_url
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def upload(self, data: bytes, filename: str, content_type: str = "image/webp") -> str:
        if (
            not filename
            or "/" in filename
            or "\\" in filename
            or ".." in filename
            or "\x00" in filename
        ):
            raise ImageProviderError("INVALID_FILENAME", f"Path traversal detected in filename: '{filename}'")

        clean_name = Path(filename).name
        if clean_name != filename or not clean_name:
            raise ImageProviderError("INVALID_FILENAME", f"Path traversal detected in filename: '{filename}'")

        target_path = (self.upload_dir / clean_name).resolve()
        if not target_path.is_relative_to(self.upload_dir.resolve()):
            raise ImageProviderError("INVALID_FILENAME", f"Path traversal detected in filename: '{filename}'")

        self.upload_dir.mkdir(parents=True, exist_ok=True)
        try:
            target_path.write_bytes(data)
        except OSError as exc:
            raise ImageProviderError("IMAGE_STORAGE_FAILED", f"Local storage write failed: {exc}") from exc

        return f"{self.public_base_url}/uploads/generated/{clean_name}"


# ==============================================================================
# 2.5 FACTORY FUNCTIONS (PROVIDER & STORAGE RESOLUTION)
# ==============================================================================

def get_image_provider(
    provider_name: str | None = None,
    app_env: str | None = None,
    **kwargs: Any,
) -> BaseImageProvider:
    """Factory selecting the image generation provider based on AI_IMAGE_PROVIDER.

    Supported options:
    - 'gpu_worker': Background GPU worker queue provider.
    - 'flux': Flux.1 [dev] on Replicate.
    - 'fake': In-memory deterministic mock provider.

    Graceful degradation:
    If provider is 'gpu_worker' and is_configured returns False:
    - In dev/test environments ('local', 'dev', 'development', 'test'):
      automatically falls back to FakeImageProvider and logs a warning.
    - In production ('production', 'prod'):
      retains GpuWorkerImageProvider so GuardedImagePipeline / pipeline
      gracefully yields status='needs_assets' without crashing.
    """
    selected = (
        provider_name
        if provider_name is not None
        else os.getenv("AI_IMAGE_PROVIDER", "")
    ).strip().lower()

    resolved_env = (
        app_env
        if app_env is not None
        else os.getenv("APP_ENV") or os.getenv("NODE_ENV") or "local"
    ).strip().lower()
    is_dev_test = resolved_env in {"local", "dev", "development", "test"}

    if selected in {"gpu_worker", "gpu-worker"}:
        provider = GpuWorkerImageProvider(**kwargs)
        if not provider.is_configured:
            if is_dev_test:
                logger.warning(
                    "GpuWorkerImageProvider is not configured at %s; gracefully falling back to FakeImageProvider in %s environment.",
                    getattr(provider, "api_base_url", "http://localhost:3000"),
                    resolved_env,
                )
                return FakeImageProvider()
            else:
                logger.warning(
                    "GpuWorkerImageProvider is not configured in %s environment; pipeline will return status='needs_assets'.",
                    resolved_env,
                )
        return provider

    elif selected == "fake":
        return FakeImageProvider(**kwargs)

    elif selected in {"flux", ""}:
        return FluxImageProvider(**kwargs)

    else:
        raise ValueError(
            f"Unknown AI_IMAGE_PROVIDER: '{selected}'. Supported: 'gpu_worker', 'flux', 'fake'"
        )


create_image_provider = get_image_provider


def get_storage_client(
    storage_name: str | None = None,
    **kwargs: Any,
) -> BaseStorageClient:
    """Factory selecting the storage client based on IMAGE_STORAGE_PROVIDER.

    Supported options:
    - 'local': Local file storage in apps/api/public/uploads/generated.
    - 'r2': Cloudflare R2 / S3 storage.
    - 'fake': In-memory mock storage.
    """
    selected = (
        storage_name
        if storage_name is not None
        else os.getenv("IMAGE_STORAGE_PROVIDER", "")
    ).strip().lower()

    if selected == "local":
        return LocalStorageClient(**kwargs)
    elif selected == "r2":
        return R2StorageClient(**kwargs)
    elif selected == "fake":
        return FakeStorageClient(**kwargs)
    elif selected == "":
        return R2StorageClient(**kwargs)
    else:
        raise ValueError(
            f"Unknown IMAGE_STORAGE_PROVIDER: '{selected}'. Supported: 'local', 'r2', 'fake'"
        )


create_storage_client = get_storage_client


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
        app_env: str | None = None,
    ) -> None:
        self.provider = provider if provider is not None else get_image_provider(app_env=app_env)
        self.storage = storage if storage is not None else get_storage_client()
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

        # Database record matching Migration 012/018 `media_assets` with AI attributes
        storage_key = f"generated/{filename}"
        media_asset_record = {
            "id": str(uuid4()),
            "workspace_id": str(target_ws_id),
            "source_type": "ai_generated",
            "is_ai_generated": True,
            "url": storage_url,
            "storage_key": storage_key,
            "prompt": request.prompt,
            "model_name": output.model_name,
            "seed": output.seed,
            "cost_usd": output.cost_usd,
            "width": output.width,
            "height": output.height,
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
                "storage_key": storage_key,
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
