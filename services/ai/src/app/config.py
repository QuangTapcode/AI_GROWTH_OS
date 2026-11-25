"""Environment configuration for the local-first AI service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


SERVICE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = SERVICE_ROOT.parents[1]


def _load_env_files() -> None:
    """Load apps/api/.env.local as primary source of truth, then fallback .env files without allowing empty values to shadow real tokens."""
    from dotenv import dotenv_values

    candidates = [
        REPO_ROOT / "apps" / "api" / ".env.local",
        REPO_ROOT / "apps" / "api" / ".env",
        REPO_ROOT / ".env",
        SERVICE_ROOT / ".env",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        for key, value in dotenv_values(path).items():
            if value is None or value.strip() == "":
                continue
            current = os.environ.get(key)
            if current is None or current.strip() == "":
                os.environ[key] = value.strip()


_load_env_files()

# Seed domains from docs/coordination/PILOT_DATASET.json; URL ingest is denied elsewhere.
DEFAULT_URL_ALLOWLIST = (
    "danangfantasticity.com",
    "vietnam.travel",
    "hiyorigardentower.com",
    "enostaspace.com",
    "booking.cali.vn",
    # TripC first-party site (client-rendered; the worker sends rendered HTML).
    "tripc.ai",
    "tripc.vn",
    # Open-license references (CC BY-SA 4.0) for research; attribution is stored per source.
    "en.wikivoyage.org",
    "en.wikipedia.org",
)
# Wikimedia and other publishers reject anonymous bots; identify the crawler and a contact URL.
DEFAULT_INGEST_USER_AGENT = "AI-Growth-OS-ingest/0.1 (+https://tripc.vn; research source ingest)"

# Hybrid mode: these operations write text that is published or shown to customers, or (research.run,
# one call per cycle) choose what everything downstream writes about, so they use the cloud model
# (Gemini) for quality. Every other operation, and all embeddings, stay on the local model.
DEFAULT_QUALITY_OPERATIONS = (
    "research.run",
    "content.generate",
    "content.repurpose",
    "content.refresh",
    "seo.local_draft",
    "community.response",
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
    """Configuration surface for the AI service supporting fake, Ollama, and Gemini."""

    port: int = 5000
    app_env: str = "local"
    provider_mode: str = "fake"
    ollama_base_url: str = "http://127.0.0.1:11434"
    llm_model: str = "qwen3:4b-instruct"
    embedding_model: str = "embeddinggemma:latest"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    quality_operations: tuple[str, ...] = DEFAULT_QUALITY_OPERATIONS
    embedding_dim: int = 768
    internal_ai_auth_token: str = ""
    max_context_tokens: int = 5120
    max_input_tokens: int = 2800
    max_output_tokens: int = 2048
    max_provider_calls: int = 3
    # Paid and public, so off until a deployment turns it on and configures Replicate, R2 and Tesseract.
    ai_image_generation: bool = False
    max_run_attempts: int = 2
    provider_timeout_seconds: int = 240
    job_deadline_seconds: int = 600
    embedding_timeout_seconds: int = 120
    embedding_job_deadline_seconds: int = 300
    embedding_batch_size: int = 8
    max_chunk_tokens: int = 512
    max_chunks_per_source: int = 200
    max_source_bytes: int = 5 * 1024 * 1024
    max_request_bytes: int = 32 * 1024 * 1024
    max_retrieved_chunks: int = 6
    # Input budget when an operation runs on the cloud model (hybrid/gemini). The local limits above
    # exist because an 8B model on an 8 GB GPU has a 5k context; Gemini reads far more evidence.
    cloud_max_input_tokens: int = 16000
    cloud_max_retrieved_chunks: int = 24
    url_fetch_timeout_seconds: int = 30
    ingest_url_allowlist: tuple[str, ...] = DEFAULT_URL_ALLOWLIST
    ingest_user_agent: str = DEFAULT_INGEST_USER_AGENT
    run_store_path: str = str(SERVICE_ROOT / "var" / "runs.sqlite3")
    # Gemini free-tier accounting (gemini_quota.py). A model's real limit replaces the estimate once a 429 states it.
    gemini_daily_limit: int = 20
    gemini_daily_limits: str = ""
    gemini_agent_reserve_min: int = 15
    gemini_spare_operations: tuple[str, ...] = ("community.response",)
    # Groq and OpenRouter's free models (free_providers.py): extra writers for these operations, after Gemini's spare
    # and before the local model. The reserves are left for the explainer-video script, which uses the same keys.
    free_api_operations: tuple[str, ...] = ("community.response",)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_daily_limit: int = 1000
    groq_reserve: int = 300
    groq_max_input_tokens: int = 5000
    openrouter_api_key: str = ""
    openrouter_models: tuple[str, ...] = ("google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free",
                                         "nvidia/nemotron-3.5-super-vl:free")
    openrouter_daily_limit: int = 50
    openrouter_reserve: int = 15

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            port=_int_env("PORT", 5000),
            app_env=os.getenv("APP_ENV", "local"),
            provider_mode=os.getenv("LLM_PROVIDER_MODE", "fake").strip().lower(),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
            llm_model=os.getenv("LLM_MODEL", "qwen3:4b-instruct"),
            embedding_model=os.getenv("EMBEDDING_MODEL", "embeddinggemma:latest"),
            gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            gemini_embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
            quality_operations=_list_env("LLM_QUALITY_OPERATIONS", DEFAULT_QUALITY_OPERATIONS),
            embedding_dim=_int_env("EMBEDDING_DIM", 768),
            internal_ai_auth_token=os.getenv("INTERNAL_AI_AUTH_TOKEN", ""),
            max_context_tokens=_int_env("AI_CONTEXT_TOKENS", 5120),
            max_input_tokens=_int_env("AI_MAX_INPUT_TOKENS", 2800),
            max_output_tokens=_int_env("AI_MAX_OUTPUT_TOKENS", 2048),
            max_provider_calls=_int_env("AI_MAX_PROVIDER_CALLS", 3),
            ai_image_generation=os.getenv("AI_IMAGE_GENERATION", "off").strip().lower() in {"1", "true", "on"},
            max_run_attempts=_int_env("AI_MAX_RUN_ATTEMPTS", 2),
            provider_timeout_seconds=_int_env("AI_PROVIDER_TIMEOUT_SECONDS", 240),
            job_deadline_seconds=_int_env("AI_JOB_DEADLINE_SECONDS", 600),
            embedding_timeout_seconds=_int_env("AI_EMBEDDING_TIMEOUT_SECONDS", 120),
            embedding_job_deadline_seconds=_int_env("AI_EMBEDDING_JOB_DEADLINE_SECONDS", 300),
            embedding_batch_size=_int_env("AI_EMBEDDING_BATCH_SIZE", 8),
            max_chunk_tokens=_int_env("AI_MAX_CHUNK_TOKENS", 512),
            max_chunks_per_source=_int_env("AI_MAX_CHUNKS_PER_SOURCE", 200),
            max_source_bytes=_int_env("AI_MAX_SOURCE_BYTES", 5 * 1024 * 1024),
            max_request_bytes=_int_env("AI_MAX_REQUEST_BYTES", 32 * 1024 * 1024),
            max_retrieved_chunks=_int_env("AI_MAX_RETRIEVED_CHUNKS", 6),
            cloud_max_input_tokens=_int_env("AI_CLOUD_MAX_INPUT_TOKENS", 16000),
            cloud_max_retrieved_chunks=_int_env("AI_CLOUD_MAX_RETRIEVED_CHUNKS", 24),
            url_fetch_timeout_seconds=_int_env("AI_URL_FETCH_TIMEOUT_SECONDS", 30),
            ingest_url_allowlist=_list_env("AI_INGEST_URL_ALLOWLIST", DEFAULT_URL_ALLOWLIST),
            ingest_user_agent=os.getenv("AI_INGEST_USER_AGENT", DEFAULT_INGEST_USER_AGENT).strip() or DEFAULT_INGEST_USER_AGENT,
            run_store_path=os.getenv("AI_RUN_STORE_PATH", str(SERVICE_ROOT / "var" / "runs.sqlite3")),
            gemini_daily_limit=_int_env("GEMINI_DAILY_LIMIT", 20),
            gemini_daily_limits=os.getenv("GEMINI_DAILY_LIMITS", ""),
            gemini_agent_reserve_min=_int_env("GEMINI_AGENT_RESERVE", 15),
            gemini_spare_operations=_list_env("GEMINI_SPARE_OPERATIONS", ("community.response",)),
            free_api_operations=_list_env("FREE_API_OPERATIONS", ("community.response",)),
            groq_api_key=os.getenv("GROQ_API_KEY", "").strip(),
            groq_model=os.getenv("GROQ_COMMUNITY_MODEL", "openai/gpt-oss-120b").strip() or "openai/gpt-oss-120b",
            groq_daily_limit=_int_env("GROQ_DAILY_LIMIT", 1000),
            # Defaults to the video script's own daily Groq cap, so both never want the same requests.
            groq_reserve=_int_env("GROQ_RESERVE", _int_env("VIDEO_GROQ_DAILY_CAP", 300)),
            groq_max_input_tokens=_int_env("GROQ_MAX_INPUT_TOKENS", 5000),
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY", "").strip(),
            openrouter_models=_list_env("OPENROUTER_COMMUNITY_MODELS", ("google/gemma-4-31b-it:free",
                                                                         "google/gemma-4-26b-a4b-it:free",
                                                                         "nvidia/nemotron-3.5-super-vl:free")),
            openrouter_daily_limit=_int_env("OPENROUTER_DAILY_LIMIT", 50),
            openrouter_reserve=_int_env("OPENROUTER_RESERVE", 15),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.provider_mode not in {"fake", "live", "gemini", "hybrid"}:
            raise ValueError("LLM_PROVIDER_MODE must be fake, live, gemini or hybrid")
        if self.provider_mode == "gemini" and not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required when LLM_PROVIDER_MODE=gemini")
        if self.max_input_tokens > self.max_context_tokens:
            raise ValueError("AI_MAX_INPUT_TOKENS cannot exceed AI_CONTEXT_TOKENS")
        if self.max_output_tokens <= 0 or self.max_provider_calls <= 0 or self.max_run_attempts <= 0:
            raise ValueError("AI output, provider-call and attempt limits must be positive")
        if self.provider_timeout_seconds <= 0 or self.job_deadline_seconds <= 0:
            raise ValueError("AI timeouts must be positive")
        if self.embedding_batch_size <= 0 or self.max_chunk_tokens <= 0 or self.embedding_dim <= 0:
            raise ValueError("Embedding batch, chunk and dimension limits must be positive")
