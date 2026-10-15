"""Operation registry: payload schema, create-time checks, handler and prompt version."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Literal

from pydantic import BaseModel

from ..agents.growth_map import PROMPT_VERSION as GROWTH_MAP_PROMPT, run_growth_map, validate_growth_map
from ..rag.answer import PROMPT_VERSION as ANSWER_PROMPT, run_answer, validate_answer
from ..rag.ingest import PROMPT_VERSION as INGEST_PROMPT, run_ingest, validate_ingest
from .config import Settings
from .runtime import OperationOutcome, RunContext
from .schemas import AnswerPayload, GrowthMapPayload, IngestPayload, JobRequest, PROMPT_VERSION
from .bootstrap import GENERIC_SYSTEM, run_generic
from ..agents.registry import AGENT_OPERATIONS
from ..agents.research.pipeline import PROMPT_VERSION as RESEARCH_PROMPT, run_research, validate_research
from ..agents.research.schemas import ResearchPayload


Validator = Callable[[JobRequest, Any, Settings], list[tuple[str, str]]]


@dataclass(frozen=True)
class Operation:
    name: str
    prompt_version: str
    handler: Callable[[RunContext], Awaitable[OperationOutcome]]
    payload_model: type[BaseModel] | None = None
    validate: Validator | None = None
    # Embedding-only work uses the embedding deadline from PILOT_LIMITS.
    deadline_kind: Literal["llm", "embedding"] = "llm"


_DEDICATED = (
    Operation("research.run", RESEARCH_PROMPT, run_research, ResearchPayload, validate_research),
    Operation("knowledge.ingest", INGEST_PROMPT, run_ingest, IngestPayload, validate_ingest, "embedding"),
    Operation("knowledge.answer", ANSWER_PROMPT, run_answer, AnswerPayload, validate_answer),
    Operation("growth_map.suggest", GROWTH_MAP_PROMPT, run_growth_map, GrowthMapPayload, validate_growth_map),
)

# Remaining operation codes from contracts/README.md §3, still on the bootstrap path.
_GENERIC_NAMES = ("health.check", *AGENT_OPERATIONS)


OPERATIONS: dict[str, Operation] = {
    **{name: Operation(name, PROMPT_VERSION, run_generic) for name in _GENERIC_NAMES},
    **{operation.name: operation for operation in _DEDICATED},
}
