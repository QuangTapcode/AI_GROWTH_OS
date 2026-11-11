"""FastAPI router for standalone AI Image Generation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, Response

from .image_service import ImageGenerationService
from .schemas import (
    ImageGenerationHealth,
    ImageGenerationRequest,
    ImageGenerationResponse,
)
from .storage import StorageError


image_generation_router = APIRouter(
    prefix="/internal/v1/image-generation",
    tags=["Image Generation"],
)

_service = ImageGenerationService()


def get_image_service() -> ImageGenerationService:
    """Dependency injector for image service."""
    return _service


@image_generation_router.get(
    "/health",
    response_model=ImageGenerationHealth,
    summary="Health check for Image Generation module and InvokeAI connectivity",
)
async def check_health() -> ImageGenerationHealth:
    return await _service.health_check()


@image_generation_router.post(
    "/generate",
    response_model=ImageGenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate an image from description using local InvokeAI",
)
async def generate_image(request: ImageGenerationRequest) -> ImageGenerationResponse:
    try:
        return await _service.generate_image(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"IMAGE_GENERATION_FAILED: {exc}",
        ) from exc


@image_generation_router.get(
    "/{generation_id}",
    response_model=ImageGenerationResponse,
    summary="Retrieve status of an image generation task",
)
async def get_generation_status(generation_id: str) -> ImageGenerationResponse:
    task = _service.get_task(generation_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generation task '{generation_id}' not found",
        )
    return task


@image_generation_router.get(
    "/media/{filename}",
    summary="Serve a locally stored generated image file",
)
async def serve_generated_media(filename: str) -> Response:
    try:
        data, mime_type = _service.storage.read_image(filename)
        return Response(content=data, media_type=mime_type)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image file not found")
    except StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
