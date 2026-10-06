"""Environment configuration for the local-first AI service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[2]

# Seed domains from docs/coordination/PILOT_DATASET.json; URL ingest is denied elsewhere.
DEFAULT_URL_ALLOWLIST = (
    "danangfantasticity.com",
    "vietnam.travel",
    "hiyorigardentower.com",
    "enostaspace.com",
    "booking.cali.vn",
)


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def _list_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return tuple(item.strip().lower() for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    """Small, explicit configuration surface for the W1 AI service.

    The service deliberately does not implement a cloud fallback. A live mode
    must point at the local Ollama HTTP API and is opt-in through the environment.
    Limits mirror docs/coordination/PILOT_LIMITS.md.
    """

    port: int = 5000
    app_env: str = "local"
    provider_mode: str = "fake"
    ollama_base_url: str = "http://127.0.0.1:11434"
    llm_model: str = "qwen3:4b-instruct"
    embedding_model: str = "embeddinggemma:latest"
    embedding_dim: int = 768
    internal_ai_auth_token: str = ""
    max_context_tokens: int = 4096
    max_input_tokens: int = 2800
    max_output_tokens: int = 1024
    max_provider_calls: int = 2
    max_run_attempts: int = 2
    provider_timeout_seconds: int = 240
    job_deadline_seconds: int = 600
    embedding_timeout_seconds: int = 120
    embedding_job_deadline_seconds: int = 300
    embedding_batch_size: int = 8
    max_chunk_tokens: int = 512
    max_chunks_per_source: int = 200
    max_source_bytes: int = 5 * 1024 * 1024
    max_request_bytes: int = 8 * 1024 * 1024
    max_retrieved_chunks: int = 6
    url_fetch_timeout_seconds: int = 30
    ingest_url_allowlist: tuple[str, ...] = DEFAULT_URL_ALLOWLIST
    run_store_path: str = str(SERVICE_ROOT / "var" / "runs.sqlite3")

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            port=_int_env("PORT", 5000),
            app_env=os.getenv("APP_ENV", "local"),
            provider_mode=os.getenv("LLM_PROVIDER_MODE", "fake").strip().lower(),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
            llm_model=os.getenv("LLM_MODEL", "qwen3:4b-instruct"),
            embedding_model=os.getenv("EMBEDDING_MODEL", "embeddinggemma:latest"),
            embedding_dim=_int_env("EMBEDDING_DIM", 768),
            internal_ai_auth_token=os.getenv("INTERNAL_AI_AUTH_TOKEN", ""),
            max_context_tokens=_int_env("AI_CONTEXT_TOKENS", 4096),
            max_input_tokens=_int_env("AI_MAX_INPUT_TOKENS", 2800),
            max_output_tokens=_int_env("AI_MAX_OUTPUT_TOKENS", 1024),
            max_provider_calls=_int_env("AI_MAX_PROVIDER_CALLS", 2),
            max_run_attempts=_int_env("AI_MAX_RUN_ATTEMPTS", 2),
            provider_timeout_seconds=_int_env("AI_PROVIDER_TIMEOUT_SECONDS", 240),
            job_deadline_seconds=_int_env("AI_JOB_DEADLINE_SECONDS", 600),
            embedding_timeout_seconds=_int_env("AI_EMBEDDING_TIMEOUT_SECONDS", 120),
            embedding_job_deadline_seconds=_int_env("AI_EMBEDDING_JOB_DEADLINE_SECONDS", 300),
            embedding_batch_size=_int_env("AI_EMBEDDING_BATCH_SIZE", 8),
            max_chunk_tokens=_int_env("AI_MAX_CHUNK_TOKENS", 512),
            max_chunks_per_source=_int_env("AI_MAX_CHUNKS_PER_SOURCE", 200),
            max_source_bytes=_int_env("AI_MAX_SOURCE_BYTES", 5 * 1024 * 1024),
            max_request_bytes=_int_env("AI_MAX_REQUEST_BYTES", 8 * 1024 * 1024),
            max_retrieved_chunks=_int_env("AI_MAX_RETRIEVED_CHUNKS", 6),
            url_fetch_timeout_seconds=_int_env("AI_URL_FETCH_TIMEOUT_SECONDS", 30),
            ingest_url_allowlist=_list_env("AI_INGEST_URL_ALLOWLIST", DEFAULT_URL_ALLOWLIST),
            run_store_path=os.getenv("AI_RUN_STORE_PATH", str(SERVICE_ROOT / "var" / "runs.sqlite3")),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.provider_mode not in {"fake", "live"}:
            raise ValueError("LLM_PROVIDER_MODE must be fake or live")
        if self.max_input_tokens > self.max_context_tokens:
            raise ValueError("AI_MAX_INPUT_TOKENS cannot exceed AI_CONTEXT_TOKENS")
        if self.max_output_tokens <= 0 or self.max_provider_calls <= 0 or self.max_run_attempts <= 0:
            raise ValueError("AI output, provider-call and attempt limits must be positive")
        if self.provider_timeout_seconds <= 0 or self.job_deadline_seconds <= 0:
            raise ValueError("AI timeouts must be positive")
        if self.embedding_batch_size <= 0 or self.max_chunk_tokens <= 0 or self.embedding_dim <= 0:
            raise ValueError("Embedding batch, chunk and dimension limits must be positive")
