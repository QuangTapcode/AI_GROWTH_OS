"""Per-run execution context shared by operation handlers."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

from pydantic import BaseModel, ValidationError

from .config import Settings
from .providers import Provider, ProviderError
from .run_store import RunStore
from .schemas import EvidenceRef, JobRequest, Usage


ModelT = TypeVar("ModelT", bound=BaseModel)


class OperationError(Exception):
    """A run failure with a stable code; ``retryable`` tells the worker whether to resend."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass
class OperationOutcome:
    result: dict[str, Any]
    evidence: list[EvidenceRef] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class CallBudget:
    """LLM call cap per job_id, persisted so retries and restarts never reset it."""

    def __init__(self, store: RunStore, job_id: str, cap: int) -> None:
        self.store = store
        self.job_id = job_id
        self.cap = cap

    def consume(self) -> None:
        if not self.store.try_consume_call(self.job_id, self.cap):
            raise OperationError(
                "CALL_CAP_EXCEEDED",
                f"Job already used its {self.cap} provider call(s)",
                retryable=False,
            )

    def remaining(self) -> int:
        return max(0, self.cap - self.store.provider_calls(self.job_id))


@dataclass
class RunContext:
    job: JobRequest
    payload: Any
    settings: Settings
    provider: Provider
    budget: CallBudget
    logger: logging.Logger
    usage: Usage = field(default_factory=Usage)

    async def call_json(
        self,
        *,
        system: str,
        user: str,
        model: type[ModelT],
        fake: Callable[[], dict[str, Any]],
    ) -> ModelT:
        """One structured LLM call plus at most one repair call, both counted against the cap."""

        schema = model.model_json_schema()
        max_tokens = min(self.job.constraints.max_output_tokens, self.settings.max_output_tokens)
        messages_user = user
        last_error = "no attempt"
        for attempt in range(2):
            if attempt == 1 and self.budget.remaining() == 0:
                break
            self.budget.consume()
            content, usage = await self.provider.chat_json(
                system=system, user=messages_user, schema=schema, max_output_tokens=max_tokens, fake=fake
            )
            self.usage.add(usage)
            try:
                return model.model_validate_json(content)
            except (ValidationError, ValueError) as exc:
                last_error = exc.__class__.__name__
                messages_user = (
                    f"{user}\n\nYour previous reply did not match the JSON schema ({last_error}). "
                    "Reply again with JSON that matches the schema exactly."
                )
        raise ProviderError("INVALID_STRUCTURED_OUTPUT", f"Model output did not match schema ({last_error})")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        batch_size = self.settings.embedding_batch_size
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            batch_vectors, usage = await self.provider.embed(batch)
            self.usage.add(usage)
            if len(batch_vectors) != len(batch):
                raise OperationError("EMBEDDING_COUNT_MISMATCH", "Embedding provider returned a different count")
            for vector in batch_vectors:
                if len(vector) != self.settings.embedding_dim:
                    raise OperationError(
                        "EMBEDDING_DIMENSION_MISMATCH",
                        f"Expected {self.settings.embedding_dim} dimensions, got {len(vector)}",
                    )
            vectors.extend(batch_vectors)
        return vectors
