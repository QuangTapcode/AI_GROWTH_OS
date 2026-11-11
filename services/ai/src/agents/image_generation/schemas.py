"""Schemas for standalone AI Image Generation module using InvokeAI."""

from __future__ import annotations

from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ImageGenerationStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class ImageGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Text prompt describing the desired image",
    )
    negative_prompt: str | None = Field(
        default=None,
        max_length=1000,
        description="Undesired elements to exclude from the generated image",
    )
    width: int = Field(
        default=1024,
        ge=512,
        le=2048,
        description="Image width in pixels (must be a multiple of 8)",
    )
    height: int = Field(
        default=1024,
        ge=512,
        le=2048,
        description="Image height in pixels (must be a multiple of 8)",
    )
    model_id: str | None = Field(
        default=None,
        description="Optional model key in InvokeAI (e.g. Juggernaut XL v9 key)",
    )
    seed: int | None = Field(
        default=None,
        ge=0,
        le=4294967295,
        description="Deterministic random seed (0 to 2^32 - 1)",
    )

    @field_validator("width", "height")
    @classmethod
    def validate_dimension_multiple_of_8(cls, v: int) -> int:
        if v % 8 != 0:
            raise ValueError(f"Dimension must be a multiple of 8, got {v}")
        return v


class ImageGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    generation_id: str = Field(..., description="Unique ID for this generation task")
    status: str = Field(..., description="Status: pending, in_progress, completed, failed")
    prompt: str = Field(..., description="Final prompt sent to the image model")
    negative_prompt: str | None = Field(default=None, description="Final negative prompt")
    image_url: str | None = Field(default=None, description="Accessible public or internal URL for the image")
    image_path: str | None = Field(default=None, description="Absolute local filesystem path of the saved image")
    filename: str | None = Field(default=None, description="Stored filename")
    width: int | None = Field(default=None, description="Final image width")
    height: int | None = Field(default=None, description="Final image height")
    seed: int | None = Field(default=None, description="Seed used for generation")
    model_name: str | None = Field(default=None, description="Model used for generation")
    error: str | None = Field(default=None, description="Error message if generation failed")
    created_at: str | None = Field(default=None, description="ISO timestamp when requested")
    completed_at: str | None = Field(default=None, description="ISO timestamp when finished")


class ImageGenerationHealth(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ai_service_status: str = Field(default="ok", description="Status of local AI service")
    invokeai_status: str = Field(..., description="'connected' or 'disconnected'")
    invokeai_version: str | None = Field(default=None, description="InvokeAI server version if reachable")
    default_model: str | None = Field(default=None, description="Default model name configured")
    error: str | None = Field(default=None, description="Connection error details if disconnected")

