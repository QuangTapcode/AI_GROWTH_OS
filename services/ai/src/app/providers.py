"""Provider adapters. Agents depend on this module, never on Ollama directly."""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from typing import Any, Callable, Protocol

import httpx

from .config import Settings
from .schemas import Usage


class ProviderError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class Provider(Protocol):
    model_version: str
    embedding_model_version: str

    async def chat_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_output_tokens: int,
        fake: Callable[[], dict[str, Any]],
    ) -> tuple[str, Usage]: ...

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]: ...


_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


def hashed_embedding(text: str, dim: int) -> list[float]:
    """Deterministic bag-of-words vector so fake-mode retrieval stays lexical and repeatable."""

    vector = [0.0] * dim
    for token in _TOKEN_PATTERN.findall(text.lower()):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        vector[index] += 1.0 if digest[4] % 2 == 0 else -1.0
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


class FakeProvider:
    """Deterministic provider for contract/unit tests; never presented as live AI evidence."""

    model_version = "fake/w1-deterministic-1"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.embedding_model_version = f"fake/hashed-{settings.embedding_dim}"

    async def chat_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_output_tokens: int,
        fake: Callable[[], dict[str, Any]],
    ) -> tuple[str, Usage]:
        started = time.perf_counter()
        content = json.dumps(fake(), ensure_ascii=False)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return content, Usage(latency_ms=elapsed_ms, llm_calls=1)

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        vectors = [hashed_embedding(text, self.settings.embedding_dim) for text in texts]
        return vectors, Usage(embedding_calls=1)


class OllamaProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.model_version = f"ollama/{settings.llm_model}"
        self.embedding_model_version = f"ollama/{settings.embedding_model}"

    async def chat_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_output_tokens: int,
        fake: Callable[[], dict[str, Any]],
    ) -> tuple[str, Usage]:
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.settings.provider_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url}/api/chat",
                    json={
                        "model": self.settings.llm_model,
                        "stream": False,
                        "format": schema,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "options": {
                            "num_ctx": self.settings.max_context_tokens,
                            "num_predict": min(max_output_tokens, self.settings.max_output_tokens),
                            "temperature": 0,
                        },
                    },
                )
                response.raise_for_status()
                body = response.json()
            content = body["message"]["content"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise ProviderError("PROVIDER_UNAVAILABLE", "Local Ollama request failed", retryable=True) from exc

        input_tokens = int(body.get("prompt_eval_count") or 0)
        output_tokens = int(body.get("eval_count") or 0)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return content, Usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            latency_ms=elapsed_ms,
            llm_calls=1,
        )

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.settings.embedding_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url}/api/embed",
                    # Chunks are sized below the model context; truncation would silently drop text.
                    json={"model": self.settings.embedding_model, "input": texts, "truncate": False},
                )
                response.raise_for_status()
                body = response.json()
            vectors = body["embeddings"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise ProviderError("EMBEDDING_UNAVAILABLE", "Local Ollama embedding request failed", retryable=True) from exc

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return vectors, Usage(
            latency_ms=elapsed_ms,
            embedding_calls=1,
            embedding_input_tokens=int(body.get("prompt_eval_count") or 0),
        )


def build_provider(settings: Settings) -> Provider:
    if settings.provider_mode == "live":
        return OllamaProvider(settings)
    return FakeProvider(settings)
