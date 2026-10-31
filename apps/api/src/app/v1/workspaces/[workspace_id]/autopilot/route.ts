import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import pool from '@/lib/db';
import { tickAutomation } from '@/modules/campaignPlans/automation';
import { PgPlanRepository } from '@/modules/campaignPlans/pgRepository';
import { PlanError } from '@/modules/campaignPlans/service';
import { activeGoal, goalInputSchema, setGoal } from '@/modules/growthGoals/service';
import { firstPartyMetricDefinitions } from '@/modules/site/measurement';
import { canonicalJson } from '@/lib/hash';

const schema = z.object({
  request: z.string().trim().min(5).max(255),
  cta: z.string().trim().min(1).max(200),
  interval_hours: z.number().int().min(1).max(168).default(24),
  publish_website: z.boolean().default(true),
  publish_facebook: z.boolean().default(false),
  // Owner-declared target for the leads KPI; required when the workspace has no goal yet.
  lead_target: z.number().int().min(0).max(1_000_000).optional(),
}).strict();

type StoredKpi = { metric_name: string; baseline_value: number | null; target_value: number | null; measurement: unknown };

/**
 * One owner request starts the unattended loop: the request becomes the goal objective that
 * Research and Growth Lead plan against, grounded outputs are auto-approved and published to the
 * chosen channels, and learning opens bounded follow-up rounds. Guardrails stay fail-closed:
 * outputs with missing facts, synthetic data or no citation still wait in Review Queue.
 */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner']);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new AppError(422, 'INVALID_AUTOPILOT', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const body = parsed.data;
    const goal = await activeGoal(pool, tenant.workspaceId);
    // Targets are owner declarations: never invent one when the workspace has no goal yet.
    if (!goal && body.lead_target === undefined)
      throw new AppError(422, 'LEAD_TARGET_REQUIRED', 'The workspace has no growth goal yet; give a lead target for this request');
    const kpis: { metric_name: string; baseline_value: number | null; target_value: number; measurement?: unknown }[] =
      (goal?.kpis ?? []).map((k: StoredKpi) => ({
      metric_name: k.metric_name, baseline_value: k.baseline_value, target_value: k.target_value ?? 0,
      ...(k.measurement ? { measurement: k.measurement } : {}),
    }));
    const leads = kpis.find((k) => k.metric_name === 'leads');
    const targetChanged = body.lead_target !== undefined && leads?.target_value !== body.lead_target;
    // A first-party leads KPI must carry the snapshots' exact definition; otherwise every
    // comparison is a measurement mismatch and Performance never produces a usable report.
    const firstParty = firstPartyMetricDefinitions(tenant.workspaceId).leads;
    if (body.lead_target !== undefined) {
      if (leads) leads.target_value = body.lead_target;
      else kpis.push({ metric_name: 'leads', baseline_value: null, target_value: body.lead_target, measurement: firstParty });
    }
    const definitionFixed = (leads?.measurement as { source?: string } | undefined)?.source === 'first_party' &&
      canonicalJson(leads!.measurement) !== canonicalJson(firstParty);
    if (definitionFixed) leads!.measurement = firstParty;
    const goalChanged = !goal || goal.title !== body.request || targetChanged || definitionFixed;
    if (goalChanged) {
      await setGoal(pool, tenant.workspaceId, goalInputSchema.parse({
        title: body.request, primary_conversion: goal?.primary_conversion ?? 'generate_lead', period_days: goal?.period_days ?? 30,
        budget_usd: goal?.budget_usd ?? 0, target_qualified_visits: goal?.target_qualified_visits ?? null, kpis,
      }));
      // Contexts pin the goal; a new one makes the next Research run against this request.
      await new PgPlanRepository(pool).issueContext(tenant.workspaceId);
    }
    await pool.query(
      `INSERT INTO agent_automation(workspace_id,actor_id,enabled,interval_hours,cta,auto_approve_outputs,auto_publish_facebook,auto_publish_website)
       VALUES($1,$2,true,$3,$4,true,$5,$6)
       ON CONFLICT(workspace_id) DO UPDATE SET actor_id=$2,enabled=true,interval_hours=$3,cta=$4,
         auto_approve_outputs=true,auto_publish_facebook=$5,auto_publish_website=$6,updated_at=now()`,
      [tenant.workspaceId, tenant.user.id, body.interval_hours, body.cta, body.publish_facebook, body.publish_website],
    );
    const tick = await tickAutomation(pool, tenant.workspaceId, true);
    return NextResponse.json({ status: 'started', goal_changed: goalChanged, tick }, { status: 202 });
  } catch (error) {
    return handleApiError(error instanceof PlanError ? new AppError(error.status, error.code, error.message) : error);
  }
}
