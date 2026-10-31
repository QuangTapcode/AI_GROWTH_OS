from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from ...app.schemas import EvidenceRef
from ..contracts import ArtifactInput, DraftResult, MarketingContext


class SeoPayload(MarketingContext):
    research: ArtifactInput
    finding_index: int = Field(default=0, ge=0, le=2)
    cta: str = Field(min_length=1, max_length=200)


class SeoSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    heading: str = Field(min_length=1, max_length=90)
    body: str = Field(min_length=1, max_length=1500)


class SeoDraft(BaseModel):
    """Model-written parts; code renders the Markdown so headings always exist in the body."""
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=70)
    meta_description: str = Field(min_length=1, max_length=160)
    sections: list[SeoSection] = Field(min_length=2, max_length=5)


class SeoArticle(DraftResult):
    article_id: UUID
    title: str
    meta_description: str
    primary_keyword: str
    headings: list[str]
    body_markdown: str
    cta: str
    citations: list[EvidenceRef]
    seo_checks: dict[str, bool]
