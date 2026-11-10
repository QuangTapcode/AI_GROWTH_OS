"""Comprehensive tests for standalone AI Image Generation module.

Includes:
1. Unit tests for PromptBuilder
2. Unit tests for ImageStorage
3. Unit tests for InvokeAIClient using mock HTTP
4. Unit tests for ImageGenerationService
5. API tests using FastAPI TestClient
6. Live integration test with real InvokeAI server (activated via TEST_LIVE_INVOKEAI=1)
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from src.agents.image_generation.image_service import ImageGenerationService
from src.agents.image_generation.invokeai_client import (
    DEFAULT_SDXL_MODEL,
    DEFAULT_SDXL_VAE,
    InvokeAIClient,
    InvokeAIConnectionError,
    InvokeAIGenerationError,
    InvokeAITimeoutError,
)
from src.agents.image_generation.prompt_builder import DEFAULT_NEGATIVE_PROMPT, PromptBuilder
from src.agents.image_generation.schemas import (
    ImageGenerationRequest,
    ImageGenerationResponse,
    ImageGenerationStatus,
)
from src.agents.image_generation.storage import ImageStorage, StorageError
from src.app.config import Settings
from src.app.main import create_app


# ==============================================================================
# SECTION 1: PromptBuilder Unit Tests
# ==============================================================================

class TestPromptBuilder:
    def test_positive_prompt_cleaning(self):
        builder = PromptBuilder()
        raw = "  A majestic   mountain   landscape in Sapa, Vietnam \n\n with rice terraces   "
        expected = "A majestic mountain landscape in Sapa, Vietnam with rice terraces"
        assert builder.build_positive_prompt(raw) == expected

    def test_empty_positive_prompt_raises(self):
        builder = PromptBuilder()
        with pytest.raises(ValueError, match="cannot be empty"):
            builder.build_positive_prompt("   ")

    def test_negative_prompt_default_used_when_none(self):
        builder = PromptBuilder()
        assert builder.build_negative_prompt(None) == DEFAULT_NEGATIVE_PROMPT
        assert builder.build_negative_prompt("") == DEFAULT_NEGATIVE_PROMPT

    def test_negative_prompt_combines_user_and_defaults_without_duplicates(self):
        builder = PromptBuilder()
        user_neg = "people, blurry, crowd, watermark"
        combined = builder.build_negative_prompt(user_neg)
        assert "people" in combined
        assert "crowd" in combined
        assert "blurry" in combined
        assert "watermark" in combined
        # Check that 'blurry' is not duplicated
        tokens = [t.strip().lower() for t in combined.split(",")]
        assert tokens.count("blurry") == 1


# ==============================================================================
# SECTION 2: ImageStorage Unit Tests
# ==============================================================================

class TestImageStorage:
    def test_save_and_read_image(self, tmp_path):
        storage = ImageStorage(storage_dir=tmp_path, base_url="http://test/media")
        dummy_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"

        file_path, filename, public_url = storage.save_image(dummy_png, prefix="test", extension=".png")

        assert file_path.is_file()
        assert filename.startswith("test_")
        assert filename.endswith(".png")
        assert public_url == f"http://test/media/{filename}"

        # Read back
        data, mime = storage.read_image(filename)
        assert data == dummy_png
        assert mime == "image/png"

    def test_empty_bytes_raises_error(self, tmp_path):
        storage = ImageStorage(storage_dir=tmp_path)
        with pytest.raises(StorageError, match="empty image bytes"):
            storage.save_image(b"")

    def test_path_traversal_rejected(self, tmp_path):
        storage = ImageStorage(storage_dir=tmp_path)
        with pytest.raises(StorageError, match="Path traversal"):
            storage._sanitize_filename("../secret.png")

        with pytest.raises(StorageError, match="Path traversal"):
            storage._sanitize_filename("nested/sub.png")

    def test_unsupported_extension_rejected(self, tmp_path):
        storage = ImageStorage(storage_dir=tmp_path)
        with pytest.raises(StorageError, match="Unsupported image extension"):
            storage._sanitize_filename("script.exe")

    def test_read_missing_image_raises_file_not_found(self, tmp_path):
        storage = ImageStorage(storage_dir=tmp_path)
        with pytest.raises(FileNotFoundError):
            storage.read_image("non_existent_image.png")


# ==============================================================================
# SECTION 3: InvokeAIClient Unit Tests (Mock HTTP)
# ==============================================================================

class TestInvokeAIClient:
    @pytest.mark.anyio
    async def test_get_version(self):
        handler = httpx.MockTransport(lambda req: httpx.Response(200, json={"version": "7.0.0-alpha.4"}))
        async with httpx.AsyncClient(transport=handler) as mock_http:
            client = InvokeAIClient(client=mock_http)
            version = await client.get_version()
            assert version == "7.0.0-alpha.4"

    @pytest.mark.anyio
    async def test_get_version_connection_error(self):
        def raise_connect(req):
            raise httpx.ConnectError("Connection refused")

        async with httpx.AsyncClient(transport=httpx.MockTransport(raise_connect)) as mock_http:
            client = InvokeAIClient(client=mock_http)
            with pytest.raises(InvokeAIConnectionError):
                await client.get_version()

    def test_build_executable_graph_structure(self):
        client = InvokeAIClient()
        graph = client.build_executable_graph(
            prompt="A scenic beach",
            negative_prompt="blurry",
            width=1024,
            height=1024,
            seed=42,
            model=DEFAULT_SDXL_MODEL,
        )

        nodes = graph["nodes"]
        assert "sdxl_model_loader" in nodes
        assert "vae_loader" in nodes
        assert "pos_compel" in nodes
        assert "neg_compel" in nodes
        assert "noise" in nodes
        assert "denoise_latents" in nodes
        assert "l2i" in nodes

        assert nodes["noise"]["seed"] == 42
        assert nodes["noise"]["width"] == 1024
        assert nodes["noise"]["height"] == 1024
        assert len(graph["edges"]) >= 12

    @pytest.mark.anyio
    async def test_enqueue_graph_success(self):
        def handle(req):
            assert req.url.path == "/api/v1/queue/default/enqueue_batch"
            return httpx.Response(
                201,
                json={"batch": {"batch_id": "batch-123"}, "item_ids": [456], "queue_id": "default", "enqueued": 1, "requested": 1, "priority": 0},
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as mock_http:
            client = InvokeAIClient(client=mock_http)
            batch_id, item_id = await client.enqueue_graph({"nodes": {}, "edges": []})
            assert batch_id == "batch-123"
            assert item_id == 456

    @pytest.mark.anyio
    async def test_enqueue_graph_http_error(self):
        def handle(req):
            return httpx.Response(422, text="Invalid graph")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as mock_http:
            client = InvokeAIClient(client=mock_http)
            with pytest.raises(InvokeAIGenerationError, match="Enqueue failed"):
                await client.enqueue_graph({"nodes": {}, "edges": []})

    @pytest.mark.anyio
    async def test_poll_item_until_complete_success(self):
        poll_count = 0

        def handle(req):
            nonlocal poll_count
            poll_count += 1
            if poll_count == 1:
                return httpx.Response(200, json={"item_id": 10, "status": "in_progress"})
            return httpx.Response(
                200,
                json={
                    "item_id": 10,
                    "status": "completed",
                    "session": {
                        "results": {
                            "out_node": {
                                "type": "image_output",
                                "image": {"image_name": "final_render_123.png"},
                            }
                        }
                    },
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as mock_http:
            client = InvokeAIClient(client=mock_http)
            img_name = await client.poll_item_until_complete(10, poll_interval=0.01, max_duration=2.0)
            assert img_name == "final_render_123.png"

    @pytest.mark.anyio
    async def test_poll_item_failure_raises_generation_error(self):
        def handle(req):
            return httpx.Response(200, json={"item_id": 10, "status": "failed", "error_message": "CUDA OOM"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as mock_http:
            client = InvokeAIClient(client=mock_http)
            with pytest.raises(InvokeAIGenerationError, match="CUDA OOM"):
                await client.poll_item_until_complete(10, poll_interval=0.01, max_duration=1.0)


# ==============================================================================
# SECTION 4: ImageGenerationService Unit Tests
# ==============================================================================

class TestImageGenerationService:
    @pytest.mark.anyio
    async def test_generate_image_end_to_end_mocked(self, tmp_path):
        mock_client = MagicMock(spec=InvokeAIClient)
        mock_client.resolve_model = AsyncMock(return_value=DEFAULT_SDXL_MODEL)
        mock_client.build_executable_graph = MagicMock(return_value={"nodes": {}, "edges": []})
        mock_client.enqueue_graph = AsyncMock(return_value=("batch-1", 101))
        mock_client.poll_item_until_complete = AsyncMock(return_value="output.png")
        mock_client.download_image = AsyncMock(return_value=b"\x89PNG\r\n\x1a\nREAL_IMAGE_BYTES")

        storage = ImageStorage(storage_dir=tmp_path)
        service = ImageGenerationService(invokeai_client=mock_client, storage=storage)

        req = ImageGenerationRequest(
            prompt="Sunny beachfront café in Da Nang",
            width=1024,
            height=1024,
            seed=12345,
        )

        res = await service.generate_image(req)
        assert res.status == ImageGenerationStatus.COMPLETED.value
        assert res.width == 1024
        assert res.height == 1024
        assert res.seed == 12345
        assert res.image_path is not None
        assert Path(res.image_path).is_file()
        assert Path(res.image_path).read_bytes() == b"\x89PNG\r\n\x1a\nREAL_IMAGE_BYTES"

        # Verify task is recorded in registry
        stored_task = service.get_task(res.generation_id)
        assert stored_task is not None
        assert stored_task.status == ImageGenerationStatus.COMPLETED.value

    @pytest.mark.anyio
    async def test_generate_image_records_failure_on_error(self, tmp_path):
        mock_client = MagicMock(spec=InvokeAIClient)
        mock_client.resolve_model = AsyncMock(return_value=DEFAULT_SDXL_MODEL)
        mock_client.build_executable_graph = MagicMock(return_value={})
        mock_client.enqueue_graph = AsyncMock(side_effect=InvokeAIGenerationError("Out of VRAM"))

        service = ImageGenerationService(invokeai_client=mock_client, storage=ImageStorage(storage_dir=tmp_path))

        req = ImageGenerationRequest(prompt="Test prompt")
        with pytest.raises(InvokeAIGenerationError, match="Out of VRAM"):
            await service.generate_image(req)

        # Confirm registry recorded the failure
        tasks = list(service._tasks.values())
        assert len(tasks) == 1
        assert tasks[0].status == ImageGenerationStatus.FAILED.value
        assert "Out of VRAM" in (tasks[0].error or "")


# ==============================================================================
# SECTION 5: FastAPI Router API Tests
# ==============================================================================

class TestImageGenerationAPI:
    @pytest.fixture
    def client(self, tmp_path):
        settings = Settings(provider_mode="fake")
        app = create_app(settings=settings)
        return TestClient(app)

    def test_health_endpoint(self, client):
        resp = client.get("/internal/v1/image-generation/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_service_status"] == "ok"
        assert "invokeai_status" in data

    def test_request_validation_rejects_non_multiple_of_8(self, client):
        resp = client.post(
            "/internal/v1/image-generation/generate",
            json={"prompt": "test", "width": 1005, "height": 1024},
        )
        assert resp.status_code == 422
        assert "multiple of 8" in resp.text

    def test_request_validation_rejects_empty_prompt(self, client):
        resp = client.post(
            "/internal/v1/image-generation/generate",
            json={"prompt": ""},
        )
        assert resp.status_code == 422

    def test_get_nonexistent_generation_returns_404(self, client):
        resp = client.get("/internal/v1/image-generation/gen-unknown-12345")
        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
        assert "not found" in data["error"]["message"].lower()

    def test_serve_media_returns_404_for_missing(self, client):
        resp = client.get("/internal/v1/image-generation/media/missing_image.png")
        assert resp.status_code == 404

    def test_serve_media_returns_400_for_path_traversal(self, client):
        resp = client.get("/internal/v1/image-generation/media/.._etc_passwd.png")
        assert resp.status_code in (400, 404)


# ==============================================================================
# SECTION 6: Live Integration Test with InvokeAI (Conditional)
# ==============================================================================

@pytest.mark.skipif(
    os.getenv("TEST_LIVE_INVOKEAI") != "1",
    reason="Live test requires InvokeAI server running and TEST_LIVE_INVOKEAI=1",
)
class TestLiveInvokeAIIntegration:
    @pytest.mark.anyio
    async def test_live_generate_image_and_verify_real_file(self, tmp_path):
        """Full end-to-end integration test against live InvokeAI server."""
        service = ImageGenerationService(storage=ImageStorage(storage_dir=tmp_path))

        # Check health first
        health = await service.health_check()
        assert health.invokeai_status == "connected", f"InvokeAI is not connected: {health.error}"

        req = ImageGenerationRequest(
            prompt="A minimalist modern living room with large glass windows overlooking Danang beach, golden hour light, architectural photography, photorealistic",
            negative_prompt="blurry, distorted, low quality, watermark, text",
            width=1024,
            height=1024,
            seed=42,
        )

        res = await service.generate_image(req)
        assert res.status == ImageGenerationStatus.COMPLETED.value
        assert res.image_path is not None
        assert os.path.exists(res.image_path)

        # Verify real file content using PIL
        saved_bytes = Path(res.image_path).read_bytes()
        assert len(saved_bytes) > 20_000, "Generated image bytes are suspiciously small"

        with Image.open(io.BytesIO(saved_bytes)) as pil_img:
            assert pil_img.size == (1024, 1024)
            assert pil_img.format in ("PNG", "WEBP")
