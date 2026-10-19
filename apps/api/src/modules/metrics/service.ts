import { z } from "zod";
import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import { getConnectionStatus } from "../integrations/stubs";
import { providerSchema, type IntegrationProvider } from "../integrations/types";

/**
 * Chuỗi số liệu theo ngày từ metrics_snapshots (migration 004).
 * Snapshot ngày = period_from = period_to. Không có dữ liệu → availability=missing + missing_reason
 * theo integration matrix, không trả 0 giả.
 */
export const METRIC_PROVIDER: Record<string, IntegrationProvider> = {
  sessions: "ga4",
  pageviews: "ga4",
  search_clicks: "gsc",
  search_impressions: "gsc",
  ad_spend: "meta_ads",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const metricSeriesQuerySchema = z.object({
  metric: z.enum(Object.keys(METRIC_PROVIDER) as [string, ...string[]]),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const recordSnapshotSchema = z
  .object({
    provider: providerSchema,
    metric_name: z.enum(Object.keys(METRIC_PROVIDER) as [string, ...string[]]),
    date: isoDate,
    value: z.number().finite().nullable(),
    availability: z.enum(["available", "missing", "partial", "delayed"]).default("available"),
    missing_reason: z.string().max(100).nullable().optional(),
    currency: z.string().length(3).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((s) => s.availability !== "available" || s.value !== null, {
    message: "value is required when availability is available",
    path: ["value"],
  })
  .refine((s) => s.availability === "available" || Boolean(s.missing_reason), {
    message: "missing_reason is required when data is not available",
    path: ["missing_reason"],
  });

function defaultRange(from?: string, to?: string) {
  const end = to ?? new Date().toISOString().slice(0, 10);
  const start = from ?? new Date(new Date(end).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  if (start > end) throw new AppError(422, "VALIDATION_FAILED", "'from' must be on or before 'to'");
  return { from: start, to: end };
}

interface SnapshotRow {
  date: string;
  metric_value: string | null;
  availability: string;
  missing_reason: string | null;
  provider: string;
}

/** Snapshot mới nhất cho từng ngày trong khoảng. */
export async function dailySnapshots(workspaceId: string, metric: string, from: string, to: string) {
  const res = await query<SnapshotRow>(
    `SELECT DISTINCT ON (period_from) to_char(period_from, 'YYYY-MM-DD') AS date, metric_value, availability,
            missing_reason, provider
     FROM metrics_snapshots
     WHERE workspace_id = $1 AND metric_name = $2 AND period_from = period_to
       AND period_from BETWEEN $3::date AND $4::date
     ORDER BY period_from, captured_at DESC`,
    [workspaceId, metric, from, to]
  );
  return res.rows.map((r) => ({
    date: r.date,
    value: r.metric_value === null ? null : Number(r.metric_value),
    availability: r.availability,
    missing_reason: r.missing_reason,
    provider: r.provider,
  }));
}

export async function getMetricSeries(user: AuthUser, workspaceId: string, rawQuery: unknown) {
  await resolveTenantContext(user, workspaceId);
  const parsed = metricSeriesQuerySchema.safeParse(rawQuery);
  if (!parsed.success) throw new AppError(422, "VALIDATION_FAILED", parsed.error.issues.map((i) => i.message).join("; "));
  const { from, to } = defaultRange(parsed.data.from, parsed.data.to);
  const points = await dailySnapshots(workspaceId, parsed.data.metric, from, to);
  const available = points.filter((p) => p.availability === "available");
  const provider = METRIC_PROVIDER[parsed.data.metric];
  return {
    metric: parsed.data.metric,
    provider,
    from,
    to,
    points,
    availability: available.length === 0 ? "missing" : "available",
    missing_reason: available.length === 0 ? getConnectionStatus(workspaceId, provider).missing_reason : null,
  };
}

export async function recordMetricSnapshotForWorkspace(user: AuthUser, workspaceId: string, rawInput: unknown) {
  const ctx = await resolveTenantContext(user, workspaceId);
  requireRole(ctx, ["owner", "editor"]);
  const parsed = recordSnapshotSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "(root)";
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid metric snapshot", fieldErrors);
  }
  const s = parsed.data;
  if (METRIC_PROVIDER[s.metric_name] !== s.provider) {
    throw new AppError(422, "VALIDATION_FAILED", `${s.metric_name} must come from ${METRIC_PROVIDER[s.metric_name]}`);
  }
  const res = await query(
    `INSERT INTO metrics_snapshots (workspace_id, provider, metric_name, period_from, period_to, timezone, currency,
       metric_value, availability, missing_reason, metadata)
     VALUES ($1, $2, $3, $4, $4, 'Asia/Ho_Chi_Minh', $5, $6, $7, $8, $9)
     RETURNING id, provider, metric_name, to_char(period_from, 'YYYY-MM-DD') AS date, metric_value, availability,
       missing_reason, captured_at`,
    [workspaceId, s.provider, s.metric_name, s.date, s.currency ?? "VND", s.value, s.availability,
     s.missing_reason ?? null, JSON.stringify({ ...(s.metadata ?? {}), recorded_by: user.id })]
  );
  return res.rows[0];
}
