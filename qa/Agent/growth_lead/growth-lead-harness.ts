import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJson, sha256Hex } from "../../../apps/api/src/lib/hash";
import { MockPlanRepository } from "../../../apps/api/src/modules/campaignPlans/mockRepository";
import { createCampaignPlanRoutes } from "../../../apps/api/src/modules/campaignPlans/routes";
import { planSchema, type CampaignPlan } from "../../../apps/api/src/modules/campaignPlans/schemas";
import type { StoredArtifact } from "../../../apps/api/src/modules/campaignPlans/service";

type CaseName =
  | "valid"
  | "no_selected_opportunity"
  | "blocked_missing_fact"
  | "source_not_approved"
  | "stale_context"
  | "expired_deadline"
  | "invalid_score"
  | "invalid_tool"
  | "invalid_dependency"
  | "commit_failure";

type HarnessInput = { action: "scenario" | "boundaries"; scenario?: CaseName };

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "qa/evidence/qq04/mock-report.json"), "utf8"),
);
const workspaceId = fixture.plan.result.workspace_id as string;

function seedRepository() {
  const repo = new MockPlanRepository();
  const plan = structuredClone(fixture.plan.result) as CampaignPlan;
  for (const task of plan.tasks) task.deadline = "2099-01-01T00:00:00Z";

  const researchArtifact: StoredArtifact = {
    ref: structuredClone(fixture.research.artifact),
    result: structuredClone(fixture.research.result),
    evidence: structuredClone(fixture.research.evidence),
  };
  const planArtifact: StoredArtifact = {
    ref: structuredClone(fixture.plan.artifact),
    result: plan,
    evidence: structuredClone(fixture.plan.evidence),
  };
  const context = {
    snapshot_id: plan.context_snapshot_id,
    profile_version: plan.profile_version ?? 1,
    approved_sources: structuredClone(fixture.research_request.approved_source_versions),
  };

  repo.seedContext(workspaceId, context);
  repo.seedArtifact(researchArtifact);
  return { repo, plan, planArtifact, context };
}

function refreshPlanArtifactHash(planArtifact: StoredArtifact): void {
  planArtifact.ref.content_hash = sha256Hex(
    canonicalJson({ result: planArtifact.result, evidence: planArtifact.evidence }),
  );
}

function applyScenario(
  scenario: CaseName,
  plan: CampaignPlan,
  context: ReturnType<typeof seedRepository>["context"],
  repo: ReturnType<typeof seedRepository>["repo"],
): void {
  if (scenario === "no_selected_opportunity") plan.selected_opportunity = null;
  if (scenario === "blocked_missing_fact") plan.missing_facts.push("confirmed_offer");
  if (scenario === "source_not_approved") context.approved_sources = [];
  if (scenario === "stale_context") context.snapshot_id = "00000000-0000-4000-8000-000000000099";
  if (scenario === "expired_deadline") {
    for (const task of plan.tasks) task.deadline = "2000-01-01T00:00:00Z";
  }
  if (scenario === "invalid_score" && plan.opportunity_score) {
    plan.opportunity_score.score = 728;
  }
  if (scenario === "invalid_tool") {
    Reflect.set(plan.tasks[0], "tools", [...plan.tasks[0].tools, "publish"]);
  }
  if (scenario === "invalid_dependency") {
    plan.tasks[1].depends_on = [plan.tasks[1].task_id];
  }
  if (scenario === "commit_failure") repo.failNextCommit = true;
}

async function runScenario(scenario: CaseName) {
  const seeded = seedRepository();
  applyScenario(scenario, seeded.plan, seeded.context, seeded.repo);
  seeded.repo.seedContext(workspaceId, seeded.context);
  seeded.planArtifact.result = seeded.plan;
  refreshPlanArtifactHash(seeded.planArtifact);
  seeded.repo.seedArtifact(seeded.planArtifact);

  const routes = createCampaignPlanRoutes({ repo: seeded.repo, allowSynthetic: true });
  const first = await routes.handleSubmit(workspaceId, seeded.planArtifact.ref);
  const firstCode = (first.body.error as { code?: string } | undefined)?.code ?? null;
  let retry: { status: number; body: Record<string, unknown> } | null = null;
  if (scenario === "valid") {
    retry = await routes.handleSubmit(workspaceId, seeded.planArtifact.ref);
  } else if (scenario === "commit_failure") {
    retry = await routes.handleSubmit(workspaceId, seeded.planArtifact.ref);
  }
  return {
    status: first.status,
    code: firstCode,
    retryStatus: retry?.status ?? null,
    retryDeduplicated: retry?.body.deduplicated ?? null,
    recordCount: seeded.repo.records.length,
  };
}

async function runBoundaries() {
  const { plan } = seedRepository();

  const threeRanked = structuredClone(plan);
  threeRanked.ranked_opportunities = [0, 1, 2].map((finding_index) => ({
    finding_index,
    topic: `Opportunity ${finding_index}`,
    score: finding_index,
  }));
  const fourRanked = structuredClone(threeRanked);
  fourRanked.ranked_opportunities?.push({
    finding_index: 0,
    topic: "Opportunity over maximum",
    score: 4,
  });

  const tenAcceptance = structuredClone(plan);
  tenAcceptance.tasks[0].brief.acceptance = Array.from(
    { length: 10 },
    (_, index) => `Acceptance condition ${index + 1}`,
  );
  const elevenAcceptance = structuredClone(tenAcceptance);
  elevenAcceptance.tasks[0].brief.acceptance.push("Acceptance condition 11");

  return {
    rankedThreeAccepted: planSchema.safeParse(threeRanked).success,
    rankedFourAccepted: planSchema.safeParse(fourRanked).success,
    acceptanceTenAccepted: planSchema.safeParse(tenAcceptance).success,
    acceptanceElevenAccepted: planSchema.safeParse(elevenAcceptance).success,
  };
}

async function run(input: HarnessInput): Promise<unknown> {
  if (input.action === "boundaries") return runBoundaries();
  if (input.action === "scenario" && input.scenario) return runScenario(input.scenario);
  throw new Error(`Unsupported Growth Lead harness input: ${JSON.stringify(input)}`);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  void (async () => {
    try {
      const output = await run(JSON.parse(line) as HarnessInput);
      process.stdout.write(`${JSON.stringify({ ok: true, output })}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
    }
  })();
});
