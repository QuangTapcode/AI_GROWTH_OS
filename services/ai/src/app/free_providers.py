"""Groq and OpenRouter's free models, as extra writers for the Community bot's answers (see free_quota.py).

Both speak the OpenAI chat API. Neither is given the reply schema as a strict JSON Schema (Pydantic's schemas use
features their strict modes reject): the schema goes in the system prompt, the request asks for a JSON object, and
an answer that is not one counts as a failure, so the chain moves on to the next model.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Callable

import httpx

from .config import Settings
from .free_quota import FreeTierQuota
from .providers import ProviderError
from .schemas import Usage

GROQ_URL = "https://api.groq.com/openai/v1"
OPENROUTER_URL = "https://openrouter.ai/api/v1"
# OpenRouter re-reads the key's free-model count at most this often (GET /key costs no request).
REFRESH_SECONDS = 300
# Groq: with fewer tokens than this left in the minute, a Community prompt (1-3k tokens plus the answer) would be refused.
TOKENS_FOR_ONE_ANSWER = 3500

_PER_DAY = re.compile(r"per[ -]?day|\bRPD\b|free-models-per-day", re.IGNORECASE)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def json_object(text: str) -> str | None:
    """The answer's JSON object, without a Markdown fence or words around it."""
    text = _FENCE.sub("", (text or "").strip())
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        return json.dumps(json.loads(text[start:end + 1]), ensure_ascii=False)
    except ValueError:
        return None


def retry_after_seconds(headers: httpx.Headers) -> float:
    value = headers.get("retry-after") or ""
    try:
        return float(value)
    except ValueError:
        return 60.0


class FreeApiProvider:
    def __init__(self, settings: Settings, *, name: str, base_url: str, api_key: str, model: str,
                 fallback_models: tuple[str, ...] = (), quota: FreeTierQuota, input_limit: int,
                 transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.settings = settings
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.fallback_models = tuple(m for m in fallback_models if m != model)
        self.quota = quota
        # Groq's free tier allows about 8,000 tokens a minute, prompt and answer together.
        self.input_limit = input_limit
        self.transport = transport
        self.model_version = f"{name}/{model}"
        self.embedding_model_version = ""

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self.transport)

    def _body(self, system: str, user: str, schema: dict[str, Any], max_output_tokens: int) -> dict[str, Any]:
        instruction = ("\n\nReply with one JSON object and nothing else. It must follow this JSON Schema:\n"
                       + json.dumps(schema, ensure_ascii=False, separators=(",", ":")))
        body: dict[str, Any] = {
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system + instruction}, {"role": "user", "content": user}],
        }
        # The free models think before they answer; a tight cap cuts the JSON off after the thinking.
        tokens = self.settings.max_output_tokens
        if self.name == "openrouter":
            body.update(models=[self.model, *self.fallback_models][:3], max_tokens=tokens, reasoning={"effort": "low"})
        else:
            body.update(model=self.model, max_completion_tokens=tokens)
            if self.model.startswith("openai/gpt-oss"):
                body["reasoning_effort"] = "low"
        return body

    async def refresh(self) -> None:
        """OpenRouter states the key's free-model requests left today (the video script's included)."""
        if self.name != "openrouter":
            return
        try:
            async with self._client(10) as client:
                response = await client.get(f"{self.base_url}/key", headers={"Authorization": f"Bearer {self.api_key}"})
                response.raise_for_status()
                daily = (response.json().get("data") or {}).get("free_model_daily_requests") or {}
        except (httpx.HTTPError, ValueError):
            return
        if isinstance(daily.get("remaining"), int):
            self.quota.record_reported(daily.get("limit"), daily["remaining"])

    async def _refresh_if_stale(self) -> None:
        seen = self.quota.reported_at()
        if self.name == "openrouter" and (seen is None or time.time() - seen.timestamp() > REFRESH_SECONDS):
            await self.refresh()

    async def chat_json(self, *, system: str, user: str, schema: dict[str, Any], max_output_tokens: int,
                        fake: Callable[[], dict[str, Any]]) -> tuple[str, Usage]:
        await self._refresh_if_stale()
        if self.quota.spare() <= 0:
            raise ProviderError("PROVIDER_QUOTA_EXHAUSTED", f"No spare {self.name} request today", retryable=True)
        started = time.perf_counter()
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if self.name == "openrouter":
            headers["X-Title"] = "TripC community answers"
        try:
            async with self._client(self.settings.provider_timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers,
                                             json=self._body(system, user, schema, max_output_tokens))
        except httpx.HTTPError as exc:
            raise ProviderError("PROVIDER_UNAVAILABLE", f"{self.name} request failed", retryable=True) from exc

        if response.status_code == 429:
            if _PER_DAY.search(response.text):
                self.quota.record_exhausted()
            else:
                self.quota.record_cooldown(retry_after_seconds(response.headers))
            raise ProviderError("PROVIDER_QUOTA_EXHAUSTED", f"{self.name} rate limit", retryable=True)
        # Every answered request counts, even one whose text is unusable.
        if response.status_code < 500 and response.status_code not in (401, 403, 404, 413):
            self.quota.record_call()
        if response.status_code >= 400:
            raise ProviderError("PROVIDER_UNAVAILABLE", f"{self.name} returned HTTP {response.status_code}", retryable=True)
        self._read_limits(response.headers)
        try:
            body = response.json()
            text = body["choices"][0]["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("PROVIDER_UNAVAILABLE", f"{self.name} answer had no message", retryable=True) from exc
        content = json_object(text)
        if content is None:
            finish = (body.get("choices") or [{}])[0].get("finish_reason")
            raise ProviderError("PROVIDER_UNAVAILABLE", f"{self.name} answer from {body.get('model') or self.model} was not a "
                                f"JSON object (finish_reason={finish})", retryable=True)
        usage = body.get("usage") or {}
        input_tokens = int(usage.get("prompt_tokens") or 0)
        output_tokens = int(usage.get("completion_tokens") or 0)
        if self.name == "openrouter" and body.get("model"):
            self.model_version = f"openrouter/{body['model']}"
        return content, Usage(input_tokens=input_tokens, output_tokens=output_tokens,
                              total_tokens=input_tokens + output_tokens,
                              latency_ms=int((time.perf_counter() - started) * 1000), llm_calls=1)

    def _read_limits(self, headers: httpx.Headers) -> None:
        """Groq: x-ratelimit-limit-requests is the key's daily limit, -remaining-requests what is left of it."""
        def number(key: str) -> int | None:
            value = headers.get(key)
            return int(value) if value and value.isdigit() else None

        remaining = number("x-ratelimit-remaining-requests")
        if self.name == "groq" and remaining is not None:
            self.quota.record_reported(number("x-ratelimit-limit-requests"), remaining)
        tokens_left = number("x-ratelimit-remaining-tokens")
        if self.name == "groq" and tokens_left is not None and tokens_left < TOKENS_FOR_ONE_ANSWER:
            # The next prompt would not fit in this minute's tokens: let the chain pass over Groq until they refill.
            reset = headers.get("x-ratelimit-reset-tokens") or ""
            match = re.fullmatch(r"(?:(\d+)m)?([\d.]+)(ms|s)", reset)
            seconds = 60.0
            if match:
                seconds = float(match.group(1) or 0) * 60 + float(match.group(2)) / (1000 if match.group(3) == "ms" else 1)
            self.quota.record_cooldown(seconds)

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Usage]:
        raise ProviderError("EMBEDDING_UNAVAILABLE", f"{self.name} does not embed here", retryable=False)


def free_api_providers(settings: Settings) -> list[FreeApiProvider]:
    """Groq, then OpenRouter's free models: whichever keys are set."""
    out: list[FreeApiProvider] = []
    if settings.groq_api_key:
        out.append(FreeApiProvider(
            settings, name="groq", base_url=GROQ_URL, api_key=settings.groq_api_key, model=settings.groq_model,
            quota=FreeTierQuota(settings.run_store_path, provider="groq", daily_limit=settings.groq_daily_limit,
                                reserve=settings.groq_reserve),
            input_limit=settings.groq_max_input_tokens))
    # Only free models: the key has a $1 limit and no credits, and a paid model must never be picked.
    free_models = tuple(m for m in settings.openrouter_models if m.endswith(":free") or m == "openrouter/free")
    if settings.openrouter_api_key and free_models:
        out.append(FreeApiProvider(
            settings, name="openrouter", base_url=OPENROUTER_URL, api_key=settings.openrouter_api_key,
            model=free_models[0], fallback_models=free_models[1:],
            quota=FreeTierQuota(settings.run_store_path, provider="openrouter",
                                daily_limit=settings.openrouter_daily_limit, reserve=settings.openrouter_reserve),
            input_limit=settings.cloud_max_input_tokens))
    return out
