import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { AppError, handleApiError } from "@/lib/errors";
import pool from "@/lib/db";
import {
  tickAutomation,
  automationTaskId,
} from "@/modules/campaignPlans/automation";
import { enqueueAiTask } from "@/modules/campaignPlans/aiTasks";
import { workspaceAlerts } from "@/modules/campaignPlans/alerts";
import { PlanError } from "@/modules/campaignPlans/service";

const schema = z
  .object({
    enabled: z.boolean(),
    interval_hours: z.number().int().min(1).max(168),
    cta: z.string().trim().min(1).max(200),
    auto_approve_outputs: z.boolean().default(false),
    auto_publish_facebook: z.boolean().default(false),
    auto_publish_website: z.boolean().default(false),
    run_now: z.boolean().optional(),
  })
  .strict();
type Context = { params: { workspace_id: string } };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    await resolveTenantContext(authenticateUser(req), params.workspace_id);
    const settings =
      (
        await pool.query(
          "SELECT * FROM agent_automation WHERE workspace_id=$1",
          [params.workspace_id],
        )
      ).rows[0] ?? null;
    const tasks = (
      await pool.query(
        `SELECT t.id,t.role,t.operation,t.status,t.started_at,t.completed_at,t.created_at,t.updated_at,t.error_details,t.result_ref,
      COALESCE(t.payload->>'synthetic'='true',false) AS synthetic,
      o.status AS queue_status,o.attempts,o.error_code FROM workflow_tasks t LEFT JOIN plan_task_outbox o ON o.task_id=t.id AND o.input_version=t.input_version
      WHERE t.workspace_id=$1 ORDER BY t.created_at DESC LIMIT 100`,
        [params.workspace_id],
      )
    ).rows;
    return NextResponse.json({
      settings,
      tasks,
      alerts: await workspaceAlerts(pool, params.workspace_id),
      observed_at: new Date().toISOString(),
    });
  } catch (e) {
    return handleApiError(
      e instanceof PlanError ? new AppError(e.status, e.code, e.message) : e,
    );
  }
}
export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const tenant = await resolveTenantContext(
      authenticateUser(req),
      params.workspace_id,
    );
    requireRole(tenant, ["owner"]);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success)
      throw new AppError(
        422,
        "INVALID_AUTOMATION",
        "Provide enabled, interval_hours (1–168) and CTA",
      );
    const b = parsed.data;
    await pool.query(
      `INSERT INTO agent_automation(workspace_id,actor_id,enabled,interval_hours,cta,auto_approve_outputs,auto_publish_facebook,auto_publish_website)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(workspace_id) DO UPDATE SET actor_id=$2,enabled=$3,interval_hours=$4,cta=$5,
         auto_approve_outputs=$6,auto_publish_facebook=$7,auto_publish_website=$8,updated_at=now()`,
      [params.workspace_id, tenant.user.id, b.enabled, b.interval_hours, b.cta,
       b.auto_approve_outputs, b.auto_publish_facebook, b.auto_publish_website],
    );
    if (b.run_now) await tickAutomation(pool, params.workspace_id, true);
    return NextResponse.json({ status: "saved" });
  } catch (e) {
    return handleApiError(
      e instanceof PlanError ? new AppError(e.status, e.code, e.message) : e,
    );
  }
}

/** Authenticated connectors may push events; the AI never receives connector credentials. */
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const tenant = await resolveTenantContext(
      authenticateUser(req),
      params.workspace_id,
    );
    requireRole(tenant, ["owner", "editor"]);
    const eventSchema = z
      .object({
        event_id: z.string().min(1).max(200),
        input: z.discriminatedUnion("operation", [
          z
            .object({
              operation: z.literal("community.response"),
              question: z.string().min(1).max(1000),
            })
            .strict(),
          z
            .object({
              operation: z.literal("analytics.report"),
              metrics_artifact_id: z.string().uuid(),
            })
            .strict(),
          z
            .object({
              operation: z.literal("experiment.hypothesis"),
              metrics_artifact_id: z.string().uuid().optional(),
              experiment: z
                .object({
                  hypothesis: z.string().min(1).max(500),
                  control_variant: z.string().min(1).max(200),
                  treatment_variant: z.string().min(1).max(200),
                  primary_metric: z.string().min(1).max(100),
                  period: z
                    .object({
                      start: z.string().datetime({ offset: true }),
                      end: z.string().datetime({ offset: true }),
                    })
                    .strict(),
                  grouping: z.string().min(1).max(100),
                })
                .strict(),
            })
            .strict(),
        ]),
      })
      .strict();
    const event = eventSchema.safeParse(await req.json());
    if (!event.success)
      throw new AppError(
        422,
        "INVALID_EVENT",
        "Provide event_id and typed community/metrics/experiment input",
      );
    const context = (
      await pool.query(
        "SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id=$1 AND current",
        [params.workspace_id],
      )
    ).rows[0];
    if (!context)
      throw new AppError(
        422,
        "MISSING_CONTEXT",
        "Create an approved knowledge context first",
      );
    const result = await enqueueAiTask(
      pool,
      params.workspace_id,
      tenant.user.id,
      {
        task_id: automationTaskId(
          `event:${params.workspace_id}:${event.data.event_id}`,
        ),
        context_snapshot_id: context.snapshot_id,
        input: event.data.input,
      },
    );
    return NextResponse.json(result, {
      status: result.deduplicated ? 200 : 202,
    });
  } catch (e) {
    return handleApiError(
      e instanceof PlanError ? new AppError(e.status, e.code, e.message) : e,
    );
  }
}
