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
from ..agents.growth_lead.pipeline import PROMPT_VERSION as LEAD_PROMPT, run_growth_lead, validate_growth_lead
from ..agents.growth_lead.schemas import GrowthLeadPayload
from ..agents.seo.pipeline import PROMPT_VERSION as SEO_PROMPT, run_seo, validate_seo
from ..agents.seo.schemas import SeoPayload
from ..agents.content.pipeline import PROMPT_VERSION as CONTENT_PROMPT, run_content, validate_content
from ..agents.content.schemas import ContentPayload
from ..agents.community.pipeline import PROMPT_VERSION as COMMUNITY_PROMPT, run_community, validate_community
from ..agents.community.schemas import CommunityPayload
from ..agents.performance.pipeline import PROMPT_VERSION as PERFORMANCE_PROMPT, run_performance, validate_performance
from ..agents.performance.schemas import PerformancePayload
from ..agents.growth_lead.learning import PROMPT_VERSION as LEARNING_PROMPT, run_learning, validate_learning, LearningPayload


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
    *(Operation(name, SEO_PROMPT, run_seo, SeoPayload, validate_seo) for name in ("seo.audit", "seo.local_draft", "content.refresh")),
    *(Operation(name, CONTENT_PROMPT, run_content, ContentPayload, validate_content) for name in ("content.generate", "content.repurpose", "content.quality_check")),
    Operation("community.response", COMMUNITY_PROMPT, run_community, CommunityPayload, validate_community),
    *(Operation(name, PERFORMANCE_PROMPT, run_performance, PerformancePayload, validate_performance) for name in ("analytics.report", "experiment.hypothesis")),
    Operation("learning.analyze", LEARNING_PROMPT, run_learning, LearningPayload, validate_learning),
    *(Operation(name, LEAD_PROMPT, run_growth_lead, GrowthLeadPayload, validate_growth_lead)
      for name in ("opportunity.score", "strategy.generate", "brief.generate")),
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
