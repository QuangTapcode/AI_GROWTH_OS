"""Prompt builder for standalone AI Image Generation.

Prepares and standardizes positive and negative prompts for diffusion models
without dependencies on Content Marketing or external agent business logic.
"""

from __future__ import annotations

import re


DEFAULT_NEGATIVE_PROMPT = (
    "ugly, deformed, disfigured, poor details, bad anatomy, bad quality, blurry, "
    "distorted, low resolution, watermark, signature, text, logo, out of frame, "
    "cropped, worst quality, low quality"
)


class PromptBuilder:
    """Builds and standardizes prompts for InvokeAI image generation."""

    def __init__(self, default_negative: str = DEFAULT_NEGATIVE_PROMPT) -> None:
        self.default_negative = default_negative

    def build_positive_prompt(self, raw_prompt: str) -> str:
        """Standardize and clean user-provided positive prompt.

        Does not invent facts or brand details; preserves user intent while
        normalizing spaces and formatting.
        """
        if not raw_prompt or not raw_prompt.strip():
            raise ValueError("Prompt cannot be empty")

        cleaned = re.sub(r"\s+", " ", raw_prompt.strip())
        return cleaned

    def build_negative_prompt(self, user_negative: str | None = None) -> str:
        """Combine user-specified negative prompt with quality defaults.

        If user provides negative prompt, merge avoiding exact duplicates.
        """
        if not user_negative or not user_negative.strip():
            return self.default_negative

        cleaned_user = re.sub(r"\s+", " ", user_negative.strip())
        # Split tokens/phrases by comma to dedup against defaults
        user_parts = [p.strip() for p in cleaned_user.split(",") if p.strip()]
        default_parts = [p.strip() for p in self.default_negative.split(",") if p.strip()]

        combined = list(user_parts)
        for dp in default_parts:
            if not any(dp.lower() == up.lower() for up in user_parts):
                combined.append(dp)

        return ", ".join(combined)

    def build_prompts(self, prompt: str, negative_prompt: str | None = None) -> tuple[str, str]:
        """Convenience method to build both positive and negative prompts."""
        pos = self.build_positive_prompt(prompt)
        neg = self.build_negative_prompt(negative_prompt)
        return pos, neg

