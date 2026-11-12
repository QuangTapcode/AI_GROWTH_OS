from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from ...app.schemas import EvidenceRef
from ..contracts import DraftResult, MarketingContext


class ConversationTurn(BaseModel):
    """An earlier message of this customer: context for a follow-up, never a source of facts."""
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=1000)
    reply: str | None = Field(default=None, max_length=1000)


class CommunityPayload(MarketingContext):
    question: str = Field(min_length=1, max_length=1000)
    history: list[ConversationTurn] = Field(default_factory=list, max_length=10)


class ReplyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Ollama enforces this limit while generating, so it must sit well above the length asked for in the
    # prompt: at 500 the model was stopped mid-sentence.
    reply: str = Field(min_length=1, max_length=1500)


class GeneralDraft(BaseModel):
    """A reply from general knowledge, when no approved guide answers: small talk, or general guidance."""
    model_config = ConfigDict(extra="forbid")
    reply: str = Field(min_length=1, max_length=1500)
    kind: Literal["chat", "info"]


class CommunityReply(DraftResult):
    reply: str
    citations: list[EvidenceRef]
    escalation_required: bool
    escalation_reason: str | None
    lead_proposal: dict | None
