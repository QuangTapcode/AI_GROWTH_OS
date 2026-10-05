"""Environment configuration for the local-first AI service."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


@dataclass(frozen=True)
class Settings:
    """Small, explicit configuration surface for W1-AI-01.

    The service deliberately does not implement a cloud fallback. A live mode
    must point at the local Ollama HTTP API and is opt-in through the environment.
    """

    port: int = 5000
    app_env: str = "local"
    provider_mode: str = "fake"
    ollama_base_url: str = "http://127.0.0.1:11434"
    llm_model: str = "qwen3:4b-instruct"
    embedding_model: str = "embeddinggemma:latest"
    internal_ai_auth_token: str = ""
    max_context_tokens: int = 4096
    max_input_tokens: int = 2800
    max_output_tokens: int = 1024
    max_provider_calls: int = 2
    provider_timeout_seconds: int = 240
    job_deadline_seconds: int = 600
    embedding_timeout_seconds: int = 120
    embedding_job_deadline_seconds: int = 300

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            port=_int_env("PORT", 5000),
            app_env=os.getenv("APP_ENV", "local"),
            provider_mode=os.getenv("LLM_PROVIDER_MODE", "fake").strip().lower(),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
            llm_model=os.getenv("LLM_MODEL", "qwen3:4b-instruct"),
            embedding_model=os.getenv("EMBEDDING_MODEL", "embeddinggemma:latest"),
            internal_ai_auth_token=os.getenv("INTERNAL_AI_AUTH_TOKEN", ""),
            max_context_tokens=_int_env("AI_CONTEXT_TOKENS", 4096),
            max_input_tokens=_int_env("AI_MAX_INPUT_TOKENS", 2800),
            max_output_tokens=_int_env("AI_MAX_OUTPUT_TOKENS", 1024),
            max_provider_calls=_int_env("AI_MAX_PROVIDER_CALLS", 2),
            provider_timeout_seconds=_int_env("AI_PROVIDER_TIMEOUT_SECONDS", 240),
            job_deadline_seconds=_int_env("AI_JOB_DEADLINE_SECONDS", 600),
            embedding_timeout_seconds=_int_env("AI_EMBEDDING_TIMEOUT_SECONDS", 120),
            embedding_job_deadline_seconds=_int_env("AI_EMBEDDING_JOB_DEADLINE_SECONDS", 300),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.provider_mode not in {"fake", "live"}:
            raise ValueError("LLM_PROVIDER_MODE must be fake or live")
        if self.max_input_tokens > self.max_context_tokens:
            raise ValueError("AI_MAX_INPUT_TOKENS cannot exceed AI_CONTEXT_TOKENS")
        if self.max_output_tokens <= 0 or self.max_provider_calls <= 0:
            raise ValueError("AI output and provider-call limits must be positive")
        if self.provider_timeout_seconds <= 0 or self.job_deadline_seconds <= 0:
            raise ValueError("AI timeouts must be positive")
