"""Orchestrator service for standalone AI Image Generation.

Coordinates prompt normalization, InvokeAI graph execution, status tracking,
and local storage persistence.
"""

from __future__ import annotations

import datetime
import random
import uuid
from typing import Any

from .invokeai_client import InvokeAIClient, InvokeAIError, DEFAULT_SDXL_MODEL
from .prompt_builder import PromptBuilder
from .schemas import (
    ImageGenerationHealth,
    ImageGenerationRequest,
    ImageGenerationResponse,
    ImageGenerationStatus,
)
from .storage import ImageStorage


class ImageGenerationService:
    """Manages the full lifecycle of standalone image generation tasks."""

    def __init__(
        self,
        invokeai_client: InvokeAIClient | None = None,
        prompt_builder: PromptBuilder | None = None,
        storage: ImageStorage | None = None,
    ) -> None:
        self.client = invokeai_client or InvokeAIClient()
        self.prompt_builder = prompt_builder or PromptBuilder()
        self.storage = storage or ImageStorage()
        # In-memory registry of generation tasks keyed by generation_id
        self._tasks: dict[str, ImageGenerationResponse] = {}

    def get_task(self, generation_id: str) -> ImageGenerationResponse | None:
        """Retrieve the recorded status/result of a generation task."""
        return self._tasks.get(generation_id)

    async def health_check(self) -> ImageGenerationHealth:
        """Check availability of AI service and InvokeAI server."""
        try:
            version = await self.client.get_version()
            queue = await self.client.get_queue_status()
            return ImageGenerationHealth(
                ai_service_status="ok",
                invokeai_status="connected",
                invokeai_version=version,
                default_model=DEFAULT_SDXL_MODEL["name"],
                error=None,
            )
        except Exception as exc:
            return ImageGenerationHealth(
                ai_service_status="ok",
                invokeai_status="disconnected",
                invokeai_version=None,
                default_model=DEFAULT_SDXL_MODEL["name"],
                error=str(exc),
            )

    async def generate_image(
        self,
        request: ImageGenerationRequest,
    ) -> ImageGenerationResponse:
        """Execute image generation through InvokeAI and persist to local storage.

        Guarantees that a 'completed' status is only returned when an actual image
        has been generated, downloaded, and safely saved to disk.
        """
        gen_id = f"gen-{uuid.uuid4()}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Build prompts
        positive_prompt, negative_prompt = self.prompt_builder.build_prompts(
            request.prompt, request.negative_prompt
        )

        # Determine seed
        seed = request.seed if request.seed is not None else random.randint(0, 2**32 - 1)

        # Initial in-progress record
        record = ImageGenerationResponse(
            generation_id=gen_id,
            status=ImageGenerationStatus.IN_PROGRESS.value,
            prompt=positive_prompt,
            negative_prompt=negative_prompt,
            width=request.width,
            height=request.height,
            seed=seed,
            created_at=now_iso,
        )
        self._tasks[gen_id] = record

        try:
            # 1. Resolve model
            model = await self.client.resolve_model(request.model_id)
            record.model_name = model.get("name")

            # 2. Build executable graph
            graph = self.client.build_executable_graph(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=request.width,
                height=request.height,
                seed=seed,
                model=model,
            )

            # 3. Enqueue to InvokeAI
            _, item_id = await self.client.enqueue_graph(graph)

            # 4. Poll until completed
            image_name = await self.client.poll_item_until_complete(item_id)

            # 5. Download image bytes
            image_bytes = await self.client.download_image(image_name)
            if not image_bytes:
                raise InvokeAIError("Received empty image payload from InvokeAI")

            # 6. Save to local storage
            ext = ".png" if image_name.endswith(".png") else ".webp"
            file_path, filename, public_url = self.storage.save_image(
                image_bytes=image_bytes,
                prefix="standalone",
                extension=ext,
            )

            # 7. Update task record to completed
            completed_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            record.status = ImageGenerationStatus.COMPLETED.value
            record.image_url = public_url
            record.image_path = str(file_path)
            record.filename = filename
            record.completed_at = completed_iso
            self._tasks[gen_id] = record
            return record

        except Exception as exc:
            record.status = ImageGenerationStatus.FAILED.value
            record.error = str(exc)
            record.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self._tasks[gen_id] = record
            raise

