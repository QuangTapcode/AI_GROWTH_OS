"""HTTP client for interacting with the local InvokeAI v7 REST API.

Constructs executable generation graphs, enqueues batches, polls task execution,
and downloads output images using exact InvokeAI 7.0 OpenAPI contracts.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import os
import random
from typing import Any, AsyncIterator
import httpx


DEFAULT_BASE_URL = "http://127.0.0.1:9090"
DEFAULT_TIMEOUT = 120.0
DEFAULT_QUEUE_ID = "default"

# Verified default models installed in local InvokeAI server
DEFAULT_SDXL_MODEL = {
    "key": "9edc0941-ad97-4803-92d0-9f546b1392fe",
    "hash": "blake3:1f500a206b3b305723705d2c11800e8d0d6f1cdae637764ea9812a83f00e0ba5",
    "name": "Juggernaut XL v9",
    "base": "sdxl",
    "type": "main",
}

DEFAULT_SDXL_VAE = {
    "key": "1d549f9e-c88e-4d9f-9689-d4eea85ef18b",
    "hash": "blake3:9705ab1c31fa96b308734214fb7571a958621c7a9247eed82b7d277145f8d9fa",
    "name": "sdxl-vae-fp16-fix",
    "base": "sdxl",
    "type": "vae",
}


class InvokeAIError(Exception):
    """Base error for InvokeAI operations."""


class InvokeAIConnectionError(InvokeAIError):
    """Raised when InvokeAI cannot be reached."""


class InvokeAITimeoutError(InvokeAIError):
    """Raised when generation takes longer than configured timeout."""


class InvokeAIGenerationError(InvokeAIError):
    """Raised when InvokeAI reports an error during graph execution."""


class InvokeAIClient:
    """Async client for InvokeAI generation and model management."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
        queue_id: str = DEFAULT_QUEUE_ID,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = (
            base_url
            or os.getenv("INVOKEAI_BASE_URL")
            or DEFAULT_BASE_URL
        ).rstrip("/")
        timeout_val = timeout or float(os.getenv("INVOKEAI_TIMEOUT", str(DEFAULT_TIMEOUT)))
        self.timeout = timeout_val
        self.queue_id = queue_id
        self._external_client = client

    @asynccontextmanager
    async def _get_client(self) -> AsyncIterator[httpx.AsyncClient]:
        if self._external_client is not None:
            yield self._external_client
        else:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
                yield client

    async def get_version(self) -> str:
        """Fetch InvokeAI application version."""
        try:
            async with self._get_client() as client:
                res = await client.get(f"{self.base_url}/api/v1/app/version")
                res.raise_for_status()
                return res.json().get("version", "unknown")
        except httpx.ConnectError as exc:
            raise InvokeAIConnectionError(f"Cannot connect to InvokeAI at {self.base_url}: {exc}") from exc
        except httpx.HTTPError as exc:
            raise InvokeAIError(f"HTTP error fetching version: {exc}") from exc

    async def get_queue_status(self) -> dict[str, Any]:
        """Fetch status of the current generation queue."""
        try:
            async with self._get_client() as client:
                res = await client.get(f"{self.base_url}/api/v1/queue/{self.queue_id}/status")
                res.raise_for_status()
                return res.json()
        except httpx.ConnectError as exc:
            raise InvokeAIConnectionError(f"Cannot connect to InvokeAI at {self.base_url}: {exc}") from exc
        except httpx.HTTPError as exc:
            raise InvokeAIError(f"HTTP error fetching queue status: {exc}") from exc

    async def list_models(self) -> list[dict[str, Any]]:
        """Fetch list of installed models from InvokeAI v2 models endpoint."""
        try:
            async with self._get_client() as client:
                res = await client.get(f"{self.base_url}/api/v2/models/")
                res.raise_for_status()
                data = res.json()
                return data.get("models", [])
        except Exception:
            return [DEFAULT_SDXL_MODEL]

    async def resolve_model(self, model_id_or_key: str | None = None) -> dict[str, Any]:
        """Resolve full model identifier dict required by SDXL loader."""
        if not model_id_or_key:
            return dict(DEFAULT_SDXL_MODEL)

        models = await self.list_models()
        for m in models:
            if m.get("key") == model_id_or_key or m.get("name") == model_id_or_key:
                return {
                    "key": m.get("key"),
                    "hash": m.get("hash", DEFAULT_SDXL_MODEL["hash"]),
                    "name": m.get("name", DEFAULT_SDXL_MODEL["name"]),
                    "base": m.get("base", "sdxl"),
                    "type": m.get("type", "main"),
                }
        # Fallback to default if not matched
        return dict(DEFAULT_SDXL_MODEL)

    def build_executable_graph(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: int,
        model: dict[str, Any],
        vae: dict[str, Any] = DEFAULT_SDXL_VAE,
        steps: int = 30,
        cfg_scale: float = 7.0,
        scheduler: str = "euler_a",
    ) -> dict[str, Any]:
        """Build exact executable invocation graph accepted by InvokeAI v7."""
        return {
            "nodes": {
                "sdxl_model_loader": {
                    "type": "sdxl_model_loader",
                    "id": "sdxl_model_loader",
                    "model": model,
                },
                "vae_loader": {
                    "type": "vae_loader",
                    "id": "vae_loader",
                    "vae_model": vae,
                },
                "positive_prompt_text": {
                    "type": "string",
                    "id": "positive_prompt_text",
                    "value": prompt,
                },
                "negative_prompt_text": {
                    "type": "string",
                    "id": "negative_prompt_text",
                    "value": negative_prompt or "",
                },
                "pos_compel": {
                    "type": "sdxl_compel_prompt",
                    "id": "pos_compel",
                    "prompt": "",
                    "style": "",
                },
                "neg_compel": {
                    "type": "sdxl_compel_prompt",
                    "id": "neg_compel",
                    "prompt": "",
                    "style": "",
                },
                "noise": {
                    "type": "noise",
                    "id": "noise",
                    "seed": seed,
                    "width": width,
                    "height": height,
                    "use_cpu": False,
                },
                "denoise_latents": {
                    "type": "denoise_latents",
                    "id": "denoise_latents",
                    "steps": steps,
                    "cfg_scale": cfg_scale,
                    "denoising_start": 0.0,
                    "denoising_end": 1.0,
                    "scheduler": scheduler,
                },
                "l2i": {
                    "type": "l2i",
                    "id": "l2i",
                    "is_intermediate": False,
                    "use_cache": False,
                },
            },
            "edges": [
                # Model CLIP -> Compel conditioning nodes
                {"source": {"node_id": "sdxl_model_loader", "field": "clip"}, "destination": {"node_id": "pos_compel", "field": "clip"}},
                {"source": {"node_id": "sdxl_model_loader", "field": "clip2"}, "destination": {"node_id": "pos_compel", "field": "clip2"}},
                {"source": {"node_id": "sdxl_model_loader", "field": "clip"}, "destination": {"node_id": "neg_compel", "field": "clip"}},
                {"source": {"node_id": "sdxl_model_loader", "field": "clip2"}, "destination": {"node_id": "neg_compel", "field": "clip2"}},
                # Strings -> Compel prompt fields
                {"source": {"node_id": "positive_prompt_text", "field": "value"}, "destination": {"node_id": "pos_compel", "field": "prompt"}},
                {"source": {"node_id": "negative_prompt_text", "field": "value"}, "destination": {"node_id": "neg_compel", "field": "prompt"}},
                # UNet -> Denoiser
                {"source": {"node_id": "sdxl_model_loader", "field": "unet"}, "destination": {"node_id": "denoise_latents", "field": "unet"}},
                # Conditionings -> Denoiser
                {"source": {"node_id": "pos_compel", "field": "conditioning"}, "destination": {"node_id": "denoise_latents", "field": "positive_conditioning"}},
                {"source": {"node_id": "neg_compel", "field": "conditioning"}, "destination": {"node_id": "denoise_latents", "field": "negative_conditioning"}},
                # Noise -> Denoiser
                {"source": {"node_id": "noise", "field": "noise"}, "destination": {"node_id": "denoise_latents", "field": "noise"}},
                # Latents -> Latent to Image decoder
                {"source": {"node_id": "denoise_latents", "field": "latents"}, "destination": {"node_id": "l2i", "field": "latents"}},
                # VAE -> Latent to Image decoder
                {"source": {"node_id": "vae_loader", "field": "vae"}, "destination": {"node_id": "l2i", "field": "vae"}},
            ],
        }

    async def enqueue_graph(self, graph: dict[str, Any]) -> tuple[str, int]:
        """Enqueue execution graph to InvokeAI queue.

        Returns:
            (batch_id, item_id)
        """
        payload = {
            "prepend": False,
            "batch": {
                "graph": graph,
                "runs": 1,
            },
        }
        url = f"{self.base_url}/api/v1/queue/{self.queue_id}/enqueue_batch"
        try:
            async with self._get_client() as client:
                res = await client.post(url, json=payload)
                if res.status_code not in (200, 201):
                    raise InvokeAIGenerationError(f"Enqueue failed with HTTP {res.status_code}: {res.text}")
                data = res.json()
                batch_id = data["batch"]["batch_id"]
                item_ids = data.get("item_ids", [])
                if not item_ids:
                    raise InvokeAIGenerationError("InvokeAI did not return any queue item_ids")
                return batch_id, item_ids[0]
        except httpx.ConnectError as exc:
            raise InvokeAIConnectionError(f"Cannot connect to InvokeAI at {self.base_url}: {exc}") from exc
        except httpx.HTTPError as exc:
            raise InvokeAIError(f"HTTP error enqueueing batch: {exc}") from exc

    async def poll_item_until_complete(
        self,
        item_id: int,
        poll_interval: float = 2.0,
        max_duration: float | None = None,
    ) -> str:
        """Poll queue item until complete or failed.

        Returns:
            The generated image name (e.g. 'xyz.png')
        """
        timeout = max_duration or self.timeout
        elapsed = 0.0
        url = f"{self.base_url}/api/v1/queue/{self.queue_id}/i/{item_id}"

        async with self._get_client() as client:
            while elapsed < timeout:
                try:
                    res = await client.get(url)
                    res.raise_for_status()
                    item = res.json()
                except httpx.HTTPError as exc:
                    raise InvokeAIError(f"Error checking queue item {item_id}: {exc}") from exc

                status = item.get("status")
                if status == "completed":
                    # Extract image_name from session results
                    session = item.get("session") or {}
                    results = session.get("results") or {}
                    for _, out in results.items():
                        if isinstance(out, dict) and out.get("type") == "image_output":
                            img_obj = out.get("image") or {}
                            image_name = img_obj.get("image_name")
                            if image_name:
                                return image_name
                    # If not in typed output, search for image_name recursively
                    for _, out in results.items():
                        if isinstance(out, dict) and "image" in out and "image_name" in out["image"]:
                            return out["image"]["image_name"]

                    raise InvokeAIGenerationError(f"Queue item {item_id} completed but output image name was not found in results")

                elif status in {"failed", "canceled"}:
                    err_msg = item.get("error_message") or f"Item ended with status {status}"
                    raise InvokeAIGenerationError(f"InvokeAI generation {status}: {err_msg}")

                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

        raise InvokeAITimeoutError(f"Generation timed out after {timeout} seconds (item_id={item_id})")

    async def download_image(self, image_name: str) -> bytes:
        """Download raw generated image bytes from InvokeAI."""
        url = f"{self.base_url}/api/v1/images/i/{image_name}/full"
        try:
            async with self._get_client() as client:
                res = await client.get(url)
                res.raise_for_status()
                return res.content
        except httpx.ConnectError as exc:
            raise InvokeAIConnectionError(f"Cannot connect to InvokeAI image service: {exc}") from exc
        except httpx.HTTPError as exc:
            raise InvokeAIError(f"Failed to download image '{image_name}': {exc}") from exc
