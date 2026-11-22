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

    def __init__(self, settings: Settings, *, fake_on_exhaustion: bool = True, quota: Any = None) -> None:
        self.settings = settings
        # Hybrid mode hands an exhausted quota to the local model instead of returning fake output.
        self.fake_on_exhaustion = fake_on_exhaustion
        # GeminiQuota: counts each request and skips a model already closed for today (gemini_quota.py).
        self.quota = quota
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
            if self.quota is not None and self.quota.closed_today(model_name):
                # Its daily quota is spent (or the key cannot use it): asking again only costs a round trip.
                last_exc = last_exc or RuntimeError(f"429 RESOURCE_EXHAUSTED: {model_name} closed for today")
                continue
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
                if self.quota is not None:
                    self.quota.record_call(model_name)
                break
            except Exception as exc:
                last_exc = exc
                err_text = str(exc)
                if self.quota is not None:
                    self.quota.record_failure(model_name, err_text)
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
                 budget: tuple[int, int] | None = None, local_input_tokens: int | None = None,
                 local: Provider | None = None) -> None:
        self.chain = chain
        # The local model: an answer from it (not from another cloud model in the chain) is the downgrade to report.
        self.local = local if local is not None else chain[-1]
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
        prompt_tokens = estimate_tokens(system) + estimate_tokens(user)
        for index, provider in enumerate(self.chain):
            limit = self.local_input_tokens if provider is self.local and index > 0 else getattr(provider, "input_limit", None)
            if limit and prompt_tokens > limit:
                # A prompt sized for the first model would be truncated by a smaller context window (the local
                # model) or refused by a per-minute token limit (Groq); pass it over and report the earlier failure.
                continue
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
            self.fell_back = self.fell_back or (index > 0 and provider is self.local)
            return content, usage
        if last_exc is None:
            raise ProviderError("PROVIDER_QUOTA_EXHAUSTED", "The prompt is too long for every model left", retryable=True)
        raise last_exc

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        return await self.embedder.embed(texts)


class HybridProvider:
    """Local model (Ollama) for routine work and all embeddings; Gemini for customer-facing writing.

    Quality operations fall back to the local model when every Gemini model is exhausted. Routine
    operations never touch the API key, so a busy day of research and scoring costs no quota.
    """

    def __init__(self, settings: Settings, *, local: Provider | None = None, cloud: Provider | None = None,
                 quota: Any = None, free_apis: list[Any] | None = None) -> None:
        self.settings = settings
        self.local = local or OllamaProvider(settings)
        if free_apis is None and local is None and cloud is None:
            from .free_providers import free_api_providers

            free_apis = free_api_providers(settings)
        # Groq and OpenRouter's free models: after Gemini's spare, before the local model (free_providers.py).
        self.free_apis = list(free_apis or [])
        self.free_api_operations = frozenset(op.lower() for op in settings.free_api_operations)
        if quota is None and cloud is None and settings.gemini_api_key:
            from .gemini_quota import GeminiQuota, parse_limits

            quota = GeminiQuota(settings.run_store_path, primary_model=settings.gemini_model,
                                default_limit=settings.gemini_daily_limit, limits=parse_limits(settings.gemini_daily_limits),
                                agent_reserve_min=settings.gemini_agent_reserve_min,
                                spare_operations=settings.gemini_spare_operations)
        # Today's Gemini requests: the agents' share is kept, the spare goes to the Community bot's answers.
        self.quota = quota
        if cloud is None and settings.gemini_api_key:
            cloud = GeminiProvider(settings, fake_on_exhaustion=False, quota=quota)
        self.cloud = cloud
        self.quality_operations = frozenset(settings.quality_operations)
        self.model_version = self.local.model_version
        self.embedding_model_version = self.local.embedding_model_version

    def is_quality(self, operation: str) -> bool:
        return self.cloud is not None and operation.lower() in self.quality_operations

    def spare_spent(self, operation: str) -> bool:
        """A spare-only operation (the Community bot) with no Gemini request left beyond the agents' daily share."""
        if self.quota is None or not self.quota.uses_spare(operation) or not self.is_quality(operation):
            return False
        try:
            return self.quota.spare() <= 0
        except Exception:  # an accounting fault must never stop an answer
            return False

    def free_apis_for(self, operation: str) -> list[Any]:
        """The free APIs with a request to spare today for this operation."""
        if operation.lower() not in self.free_api_operations:
            return []
        usable = []
        for api in self.free_apis:
            try:
                if api.quota.spare() > 0:
                    usable.append(api)
            except Exception:  # an accounting fault must never stop an answer
                continue
        return usable

    def for_operation(self, operation: str) -> RoutedProvider:
        spent = self.spare_spent(operation)
        quality = self.is_quality(operation) and not spent
        free = self.free_apis_for(operation) if (quality or spent) else []
        chain = [*([self.cloud] if quality else []), *free, self.local]
        budget = ((self.settings.cloud_max_input_tokens, self.settings.cloud_max_retrieved_chunks) if quality
                  else (min(api.input_limit for api in free), self.settings.cloud_max_retrieved_chunks) if free
                  else (self.settings.max_input_tokens, self.settings.max_retrieved_chunks))
        routed = RoutedProvider(chain, self.local, quality=quality or bool(free), budget=budget,
                                local_input_tokens=self.settings.max_input_tokens, local=self.local)
        # With Gemini's spare spent and no free API left, the local model writes it: reported like any downgrade.
        routed.fell_back = spent and not free
        routed.spare_spent = spent
        return routed

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
