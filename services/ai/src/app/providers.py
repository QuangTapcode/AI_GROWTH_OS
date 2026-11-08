"""Provider adapters. Agents depend on this module, never on Ollama or Gemini directly."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import re
import time
from typing import Any, Callable, Protocol

import httpx

from .config import Settings
from .schemas import Usage


def estimate_tokens(text: str) -> int:
    # rag.chunking imports app.runtime, which imports this module: import when called.
    from ..rag.chunking import estimate_tokens as estimate

    return estimate(text)


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


def clean_schema_for_gemini(node: Any) -> Any:
    """Sanitize Pydantic JSON Schema for Gemini's strict Schema protobuf parser."""
    if isinstance(node, dict):
        res = {}
        for k, v in node.items():
            if k in ("additionalProperties", "additional_properties", "$schema"):
                continue
            if k == "const" and not isinstance(v, str):
                continue
            res[k] = clean_schema_for_gemini(v)
        return res
    elif isinstance(node, list):
        return [clean_schema_for_gemini(x) for x in node]
    return node


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
                        # Thinking models (qwen3) otherwise spend num_predict on hidden reasoning and return no JSON.
                        "think": False,
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


class GeminiProvider:
    """Official Google Gemini API provider supporting fast hybrid inference and 768-dim embeddings."""

    def __init__(self, settings: Settings, *, fake_on_exhaustion: bool = True) -> None:
        self.settings = settings
        # Hybrid mode hands an exhausted quota to the local model instead of returning fake output.
        self.fake_on_exhaustion = fake_on_exhaustion
        self.model_version = f"gemini/{settings.gemini_model}"
        self.embedding_model_version = f"gemini/{settings.gemini_embedding_model}"
        from google import genai

        self.client = genai.Client(api_key=settings.gemini_api_key)

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
        from google.genai import types

        sanitized_schema = clean_schema_for_gemini(schema)
        candidate_models = [self.settings.gemini_model]
        for fallback_model in ("gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-flash-latest"):
            if fallback_model not in candidate_models:
                candidate_models.append(fallback_model)

        content: str | None = None
        input_tokens = 0
        output_tokens = 0
        last_exc: Exception | None = None

        for model_name in candidate_models:
            try:
                def _call_gemini(target_model: str = model_name):
                    cfg_kwargs: dict[str, Any] = {
                        "system_instruction": system,
                        "response_mime_type": "application/json",
                        "response_schema": sanitized_schema,
                        "max_output_tokens": max(4096, min(max_output_tokens, self.settings.max_output_tokens)),
                        "temperature": 0.0,
                    }
                    if "2.5" in target_model:
                        cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                    return self.client.models.generate_content(
                        model=target_model,
                        contents=user,
                        config=types.GenerateContentConfig(**cfg_kwargs),
                    )

                response = await asyncio.to_thread(_call_gemini)
                content = response.text or "{}"
                input_tokens = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
                output_tokens = getattr(response.usage_metadata, "candidates_token_count", 0) or 0
                break
            except Exception as exc:
                last_exc = exc
                err_text = str(exc)
                if "429" in err_text or "RESOURCE_EXHAUSTED" in err_text or "503" in err_text or "UNAVAILABLE" in err_text or "404" in err_text or "NOT_FOUND" in err_text:
                    continue
                break

        if content is None:
            err_text = str(last_exc or "")
            exhausted = "429" in err_text or "RESOURCE_EXHAUSTED" in err_text or "503" in err_text or "UNAVAILABLE" in err_text or "404" in err_text or "NOT_FOUND" in err_text
            if exhausted and not self.fake_on_exhaustion:
                raise ProviderError("PROVIDER_QUOTA_EXHAUSTED", "Every Gemini model is rate-limited or unavailable", retryable=True) from last_exc
            if exhausted:
                content = json.dumps(fake(), ensure_ascii=False)
                input_tokens = estimate_tokens(system) + estimate_tokens(user)
                output_tokens = estimate_tokens(content)
            else:
                raise ProviderError("PROVIDER_UNAVAILABLE", f"Gemini API request failed: {last_exc}", retryable=True) from last_exc

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
        vectors: list[list[float]] = []
        calls = 0
        batch_size = 80
        try:
            from google.genai import types

            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]

                def _call_embed(b: list[str] = batch):
                    return self.client.models.embed_content(
                        model=self.settings.gemini_embedding_model,
                        contents=b,
                        config=types.EmbedContentConfig(output_dimensionality=self.settings.embedding_dim),
                    )

                res = await asyncio.to_thread(_call_embed)
                vectors.extend(item.values for item in res.embeddings)
                calls += 1
        except Exception as exc:
            raise ProviderError("EMBEDDING_UNAVAILABLE", f"Gemini embedding request failed: {exc}", retryable=True) from exc

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return vectors, Usage(
            latency_ms=elapsed_ms,
            embedding_calls=calls,
            embedding_input_tokens=0,
        )


class RoutedProvider:
    """The hybrid provider as seen by one operation: an ordered chain of chat providers."""

    def __init__(self, chain: list[Provider], embedder: Provider, *, quality: bool,
                 budget: tuple[int, int] | None = None, local_input_tokens: int | None = None) -> None:
        self.chain = chain
        # (input tokens, retrieved chunks) the first model in the chain can read.
        self.budget = budget
        self.local_input_tokens = local_input_tokens
        self.embedder = embedder
        self.quality = quality
        self.model_version = chain[0].model_version
        self.embedding_model_version = embedder.embedding_model_version
        # What actually answered, so the run records the real model and any downgrade.
        self.models_used: list[str] = []
        self.fell_back = False

    async def chat_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_output_tokens: int,
        fake: Callable[[], dict[str, Any]],
    ) -> tuple[str, Usage]:
        last_exc: ProviderError | None = None
        for index, provider in enumerate(self.chain):
            if index > 0 and self.local_input_tokens and estimate_tokens(system) + estimate_tokens(user) > self.local_input_tokens:
                # A prompt sized for the cloud model would be truncated by the local context window and
                # answered without its instructions; report the cloud failure instead.
                break
            try:
                content, usage = await provider.chat_json(
                    system=system, user=user, schema=schema, max_output_tokens=max_output_tokens, fake=fake
                )
            except ProviderError as exc:
                if not exc.retryable:
                    raise
                last_exc = exc
                continue
            self.models_used.append(provider.model_version)
            self.fell_back = self.fell_back or index > 0
            return content, usage
        assert last_exc is not None
        raise last_exc

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        return await self.embedder.embed(texts)


class HybridProvider:
    """Local model (Ollama) for routine work and all embeddings; Gemini for customer-facing writing.

    Quality operations fall back to the local model when every Gemini model is exhausted. Routine
    operations never touch the API key, so a busy day of research and scoring costs no quota.
    """

    def __init__(self, settings: Settings, *, local: Provider | None = None, cloud: Provider | None = None) -> None:
        self.settings = settings
        self.local = local or OllamaProvider(settings)
        if cloud is None and settings.gemini_api_key:
            cloud = GeminiProvider(settings, fake_on_exhaustion=False)
        self.cloud = cloud
        self.quality_operations = frozenset(settings.quality_operations)
        self.model_version = self.local.model_version
        self.embedding_model_version = self.local.embedding_model_version

    def is_quality(self, operation: str) -> bool:
        return self.cloud is not None and operation.lower() in self.quality_operations

    def for_operation(self, operation: str) -> RoutedProvider:
        quality = self.is_quality(operation)
        chain = [self.cloud, self.local] if quality else [self.local]
        budget = ((self.settings.cloud_max_input_tokens, self.settings.cloud_max_retrieved_chunks) if quality
                  else (self.settings.max_input_tokens, self.settings.max_retrieved_chunks))
        return RoutedProvider(chain, self.local, quality=quality, budget=budget,
                              local_input_tokens=self.settings.max_input_tokens)

    def model_version_for(self, operation: str) -> str:
        return self.cloud.model_version if self.is_quality(operation) else self.local.model_version

    async def chat_json(self, **kwargs: Any) -> tuple[str, Usage]:
        return await self.local.chat_json(**kwargs)

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        return await self.local.embed(texts)


def build_provider(settings: Settings) -> Provider:
    if settings.provider_mode == "hybrid":
        return HybridProvider(settings)
    if settings.provider_mode == "gemini":
        return GeminiProvider(settings)
    if settings.provider_mode == "live":
        return OllamaProvider(settings)
    return FakeProvider(settings)
