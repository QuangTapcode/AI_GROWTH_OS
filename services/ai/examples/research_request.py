"""Build a validated request from a backend-issued knowledge snapshot.

The backend remains responsible for authenticated snapshot issuance and source
approval. This helper never promotes a source from imported to approved.
"""
from __future__ import annotations

from uuid import UUID

from src.agents.research.schemas import ResearchPayload
from src.app.schemas import ApprovedSourceVersion, JobRequest, KnowledgeSnapshot


def research_request(*, job_id: UUID, workspace_id: UUID, snapshot: dict,
                     business_profile: dict, input_version: int, trace_id: str,
                     goal_context: dict | None = None, content_inventory: list[dict] | None = None,
                     synthetic: bool = False) -> JobRequest:
    knowledge = KnowledgeSnapshot.model_validate(snapshot)
    payload = ResearchPayload(workspace_id=workspace_id, business_profile=business_profile,
                              snapshot=knowledge, goal_context=goal_context,
                              content_inventory=content_inventory or [])
    return JobRequest(job_id=job_id, workspace_id=workspace_id, operation="research.run",
                      input_version=input_version, trace_id=trace_id,
                      context_snapshot_id=knowledge.snapshot_id,
                      approved_source_versions=[ApprovedSourceVersion(source_id=s.source_id, version=s.version)
                                                for s in knowledge.sources
                                                if s.status == "approved" and s.deleted_at is None
                                                and s.workspace_id == workspace_id],
                      prompt_version="research-v5", synthetic=synthetic,
                      payload=payload.model_dump(mode="json"))
