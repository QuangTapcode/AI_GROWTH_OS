"""Six marketing roles and their existing operation codes.

This is routing metadata, not a tool permission enforcement layer. The role
handlers are registered in ``app.operations``; backend/executor code still
enforces tools, tenant scope and human approval. Knowledge ingest/answer and
growth_map.suggest remain shared services.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AgentRole:
    name: str
    operations: tuple[str, ...]


AGENT_ROLES: dict[str, AgentRole] = {
    "research": AgentRole("Research & Trend", ("research.run",)),
    "growth_lead": AgentRole("Growth Lead & Analyst", (
        "opportunity.score", "strategy.generate", "brief.generate", "learning.analyze",
    )),
    "seo": AgentRole("SEO Worker", (
        "seo.audit", "seo.local_draft", "content.refresh",
    )),
    "content": AgentRole("Content Marketing", (
        "content.generate", "content.repurpose", "content.quality_check",
    )),
    "community": AgentRole("Community & Lead Intake", ("community.response",)),
    "performance": AgentRole("Performance Marketing", (
        "analytics.report", "experiment.hypothesis",
    )),
}

AGENT_OPERATIONS: dict[str, str] = {
    operation: role_id
    for role_id, role in AGENT_ROLES.items()
    for operation in role.operations
}

# Gateway capabilities are declarative here; only the backend executor grants them.
ROLE_TOOLS: dict[str, tuple[str, ...]] = {
    "research": ("knowledge.read", "content.inventory.read", "research.sources.read"),
    "growth_lead": ("knowledge.read", "campaign.plan.propose", "task.propose", "metrics.aggregate.read"),
    "seo": ("knowledge.read", "content.inventory.read", "content.draft", "seo.audit"),
    "content": ("knowledge.read", "content.inventory.read", "content.draft", "asset.draft"),
    "community": ("knowledge.read", "publication.read", "reply.draft", "lead.propose"),
    "performance": ("metrics.read", "ads.insights.read", "lead.aggregate.read", "experiment.propose"),
}


def role_for_operation(operation: str) -> str | None:
    return "growth_lead" if operation == "growth_map.suggest" else AGENT_OPERATIONS.get(operation)
