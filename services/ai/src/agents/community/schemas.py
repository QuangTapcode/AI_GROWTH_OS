from pydantic import BaseModel, ConfigDict, Field
from ...app.schemas import EvidenceRef
from ..contracts import DraftResult, MarketingContext


class CommunityPayload(MarketingContext):
    question: str = Field(min_length=1, max_length=1000)


class ReplyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply: str = Field(min_length=1, max_length=500)


class CommunityReply(DraftResult):
    reply: str
    citations: list[EvidenceRef]
    escalation_required: bool
    escalation_reason: str | None
    lead_proposal: dict | None
