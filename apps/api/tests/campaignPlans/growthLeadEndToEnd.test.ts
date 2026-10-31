import { describe, it, expect } from "vitest";
import { MockPlanRepository } from "../../src/modules/campaignPlans/mockRepository";
import { submitCampaignPlan } from "../../src/modules/campaignPlans/service";
import { canonicalJson, sha256Hex } from "../../src/lib/hash";
import type { CampaignPlan } from "../../src/modules/campaignPlans/schemas";

describe("Growth Lead & Analyst: Full End-to-End Campaign Flow Suite", () => {
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const snapshotId = "20000000-0000-4000-8000-000000000001";
  const sourceId = "30000000-0000-4000-8000-000000000001";
  const researchArtifactId = "40000000-0000-4000-8000-000000000001";
  const planId = "50000000-0000-4000-8000-000000000001";
  const seoTaskId = "60000000-0000-4000-8000-000000000001";
  const socialTaskId = "60000000-0000-4000-8000-000000000002";

  // Nguồn tri thức hợp lệ đã được phê duyệt trong snapshot
  const approvedSource = {
    source_id: sourceId,
    version: 1,
    title: "Vietnam Tourism Da Nang City Guide",
    url_or_blob: "https://vietnam.travel/things-to-do/da-nang-city-guide",
  };

  const researchFinding = {
    topic: "An Thuong vs My Khe for Tech Expats",
    audience_fit: "English-speaking remote workers looking for walkable community",
    offer_fit: "TripC curated housing guide with verified amenities",
    rationale: "High concentration of coworking spaces and expat cafes within 500m of beach",
    evidence: {
      source_id: sourceId,
      source_version: 1,
      chunk_id: "chunk-an-thuong-01",
      locator: "paragraph:3",
      quote: "An Thuong expat quarter offers walkable amenities and vibrant coworking hubs.",
      source_url: "https://vietnam.travel/things-to-do/da-nang-city-guide",
      license: "CC-BY-4.0",
      attribution: "Vietnam Tourism",
    },
    url: "https://vietnam.travel/things-to-do/da-nang-city-guide",
    fetched_at: "2026-10-15T10:00:00Z",
    confidence: "hypothesis" as const,
    demand_estimate: null,
    keywords: ["da nang expats", "an thuong"],
    user_need: "Find best expat neighborhood in Da Nang",
  };

  const researchBriefResult = {
    workspace_id: workspaceId,
    context_snapshot_id: snapshotId,
    profile_version: 1,
    status: "ready_for_handoff",
    findings: [researchFinding],
    missing_facts: [],
    synthetic: false,
  };

  const researchArtifactHash = sha256Hex(
    canonicalJson({
      result: researchBriefResult,
      evidence: [researchFinding.evidence],
    })
  );

  const researchArtifact = {
    ref: {
      artifact_id: researchArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: researchArtifactHash,
      role: "research" as const,
      context_snapshot_id: snapshotId,
      storage: "ai_run_store" as const,
    },
    result: researchBriefResult,
    evidence: [researchFinding.evidence],
  };

  const futureDeadline = new Date(Date.now() + 86400000 * 7).toISOString();
  const futureSocialDeadline = new Date(Date.now() + 86400000 * 10).toISOString();

  const planResult: CampaignPlan = {
    contract_version: "growth-lead-plan-v2",
    plan_id: planId,
    workspace_id: workspaceId,
    input_version: 1,
    profile_version: 1,
    context_snapshot_id: snapshotId,
    status: "proposed",
    objective: "Attract remote tech workers to TripC verified Da Nang accommodations",
    selection_method: "model_selection_from_grounded_research",
    selected_opportunity: researchFinding,
    research_artifact: researchArtifact.ref,
    tasks: [
      {
        task_id: seoTaskId,
        role: "seo",
        operation: "seo.local_draft",
        tools: ["knowledge.read", "content.draft"],
        depends_on: [],
        input_artifact_refs: [researchArtifact.ref],
        dependency_artifact_from: [],
        brief: {
          topic: researchFinding.topic,
          audience: ["remote workers", "tech expats"],
          offer: ["TripC Da Nang Long-Term Rentals"],
          audience_fit: researchFinding.audience_fit,
          offer_fit: researchFinding.offer_fit,
          intent: "informational",
          deliverable: "seo_article_draft",
          cta: "Book a verified stay in An Thuong",
          acceptance: [
            "Use cited research and verified snapshot facts only.",
            "Report missing facts; do not invent demand, price or availability.",
            "Return a draft for human review before publication.",
          ],
        },
        requires_human_approval: true,
        deadline: futureDeadline,
      },
      {
        task_id: socialTaskId,
        role: "content",
        operation: "content.repurpose",
        tools: ["knowledge.read", "content.draft"],
        depends_on: [seoTaskId], // Phụ thuộc vào kết quả của Task SEO
        input_artifact_refs: [researchArtifact.ref],
        dependency_artifact_from: [seoTaskId],
        brief: {
          topic: researchFinding.topic,
          audience: ["remote workers", "tech expats"],
          offer: ["TripC Da Nang Long-Term Rentals"],
          audience_fit: researchFinding.audience_fit,
          offer_fit: researchFinding.offer_fit,
          intent: "informational",
          deliverable: "social_pack_draft",
          cta: "Book a verified stay in An Thuong",
          acceptance: [
            "Use cited research and verified snapshot facts only.",
            "Report missing facts; do not invent demand, price or availability.",
            "Return a draft for human review before publication.",
            "Adapt the approved SEO draft; identify real image assets or report missing assets.",
          ],
        },
        requires_human_approval: true,
        deadline: futureSocialDeadline,
      },
    ],
    missing_facts: [],
    requires_human_approval: true,
    applied: false,
    synthetic: false,
    opportunity_score: {
      factors: {
        demand: 3,
        business_relevance: 3,
        growth_potential: 3,
        content_gap: 3,
        freshness: 3,
        conversion_potential: 3,
      },
      score: 729,
      estimated: true,
      label: "estimated",
      formula:
        "demand * business_relevance * growth_potential * content_gap * freshness * conversion_potential",
      source: "operator_estimate_not_search_volume",
    },
  };

  const planArtifactHash = sha256Hex(
    canonicalJson({
      result: planResult,
      evidence: [researchFinding.evidence],
    })
  );

  const planArtifact = {
    ref: {
      artifact_id: "70000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      version: 1,
      content_hash: planArtifactHash,
      role: "growth_lead" as const,
      context_snapshot_id: snapshotId,
      storage: "ai_run_store" as const,
    },
    result: planResult,
    evidence: [researchFinding.evidence],
  };

  function createSeededRepo() {
    const repo = new MockPlanRepository();
    repo.seedContext(workspaceId, {
      snapshot_id: snapshotId,
      profile_version: 1,
      approved_sources: [approvedSource],
    });
    repo.seedArtifact(researchArtifact);
    repo.seedArtifact(planArtifact);
    return repo;
  }

  it("Bước 1 & 2: Growth Lead sinh Campaign Plan từ Grounded Research với đủ 6 factors và DAG 2-node", () => {
    // 1. Thẩm định score calculation
    const factors = planResult.opportunity_score!.factors;
    const expectedScore = Object.values(factors).reduce((acc: number, v) => acc * (v ?? 1), 1);
    expect(planResult.opportunity_score?.score).toBe(expectedScore);
    expect(expectedScore).toBe(729);

    // 2. Thẩm định cấu trúc DAG
    expect(planResult.tasks).toHaveLength(2);
    const [seoTask, socialTask] = planResult.tasks;
    expect(seoTask.depends_on).toEqual([]);
    expect(socialTask.depends_on).toEqual([seoTask.task_id]);

    // 3. Thẩm định bảo toàn thông điệp và trích dẫn
    expect(planResult.selected_opportunity?.topic).toBe(researchFinding.topic);
    expect(seoTask.brief.topic).toBe(researchFinding.topic);
    expect(socialTask.brief.topic).toBe(researchFinding.topic);
    expect(planResult.applied).toBe(false);
    expect(planResult.requires_human_approval).toBe(true);
  });

  it("Bước 3: Gửi Campaign Plan vào API -> Ghi nhận plan, SEO sẵn sàng (ready), Social bị khóa (blocked)", async () => {
    const repo = createSeededRepo();
    const result = await submitCampaignPlan(
      { repo, allowSynthetic: false },
      workspaceId,
      planArtifact.ref
    );

    expect(result.deduplicated).toBe(false);
    expect(result.record.plan.plan_id).toBe(planId);
    expect(result.record.task_states[seoTaskId]).toBe("ready");
    expect(result.record.task_states[socialTaskId]).toBe("blocked");
    expect(result.record.outbox).toEqual([
      { task_id: seoTaskId, operation: "seo.local_draft" },
    ]);
  });

  it("Bước 4: Retry gửi lại cùng một Campaign Plan -> Idempotent deduplication (deduplicated: true)", async () => {
    const repo = createSeededRepo();
    // Lần 1: Chấp nhận
    const first = await submitCampaignPlan(
      { repo, allowSynthetic: false },
      workspaceId,
      planArtifact.ref
    );
    expect(first.deduplicated).toBe(false);
    expect(first.record.plan.plan_id).toBe(planId);

    // Lần 2 (Worker hoặc User retry): Không sinh thêm bản ghi
    const second = await submitCampaignPlan(
      { repo, allowSynthetic: false },
      workspaceId,
      planArtifact.ref
    );
    expect(second.deduplicated).toBe(true);
    expect(second.record.plan.plan_id).toBe(planId);
    expect(repo.records).toHaveLength(1);
  });

  it("Bước 5: Chặn đứng nếu nguồn Research bị thu hồi (SOURCE_NOT_APPROVED)", async () => {
    const repo = createSeededRepo();
    // Giả lập nguồn trong context đã bị thu hồi (approved_sources rỗng)
    repo.seedContext(workspaceId, {
      snapshot_id: snapshotId,
      profile_version: 1,
      approved_sources: [],
    });

    await expect(
      submitCampaignPlan(
        { repo, allowSynthetic: false },
        workspaceId,
        planArtifact.ref
      )
    ).rejects.toMatchObject({
      code: "SOURCE_NOT_APPROVED",
      status: 422,
    });
  });

  it("Bước 6: Chặn đứng nếu Campaign Plan tự bịa ra cơ hội không có trong Research (INVALID_RESEARCH)", async () => {
    const repo = createSeededRepo();
    const tamperedPlan = structuredClone(planResult);
    tamperedPlan.selected_opportunity = {
      ...researchFinding,
      topic: "Invented Topic Not Found in Research Brief",
    };
    const tamperedHash = sha256Hex(
      canonicalJson({ result: tamperedPlan, evidence: [researchFinding.evidence] })
    );

    const tamperedArtifact = {
      ref: {
        ...planArtifact.ref,
        artifact_id: "80000000-0000-4000-8000-000000000001",
        content_hash: tamperedHash,
      },
      result: tamperedPlan,
      evidence: [researchFinding.evidence],
    };
    repo.seedArtifact(tamperedArtifact);

    await expect(
      submitCampaignPlan(
        { repo, allowSynthetic: false },
        workspaceId,
        tamperedArtifact.ref
      )
    ).rejects.toMatchObject({
      code: "INVALID_RESEARCH",
      status: 422,
    });
  });
});
