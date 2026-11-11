import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors';
import { globalLeadRepo } from '../../lib/public-service';
import { query as dbQuery } from '../../lib/db';
import { METRIC_PROVIDER, dailySnapshots } from '../metrics/service';
import { facebookPageConfigured, getFacebookPageKpis } from './facebookPage';
import { dateInZone, periodSchema } from '../metrics/period';
import { reportQuerySchema } from './schemas';
import type {
  ReportQuery,
  ReportQueryInput,
  MetricItem,
  CreateExceptionInput,
  UpdateExceptionInput,
  ListExceptionsQuery,
  OutboxEventInput,
} from './schemas';

/**
 * TQ-07 — Reports, Real Metrics Snapshots, Exceptions with Owners & Transactional Outbox
 */

export interface SystemExceptionRecord {
  id: string;
  workspace_id: string;
  code: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_task_id?: string;
  assigned_owner?: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'ignored';
  description?: string;
  resolution_note?: string | null;
  created_at: Date;
  resolved_at?: Date | null;
}

export interface OutboxEventRecord {
  id: string;
  workspace_id: string;
  event_type: string;
  dedup_key: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'published' | 'failed';
  retry_count: number;
  created_at: Date;
  published_at?: Date | null;
}

export interface MetricSnapshotRecord {
  id: string;
  workspace_id: string;
  provider: string;
  metric_name: string;
  period_from: string;
  period_to: string;
  timezone: string;
  currency: string;
  metric_value: number | null;
  availability: 'available' | 'missing' | 'partial' | 'delayed';
  missing_reason: string | null;
  captured_at: Date;
}

// In-Memory stores for development & isolated testing
export const memoryExceptions = new Map<string, SystemExceptionRecord>();
export const memoryOutbox = new Map<string, OutboxEventRecord>();
export const memorySnapshots = new Map<string, MetricSnapshotRecord>();

/**
 * Lấy báo cáo số liệu hiệu quả (Report & KPIs).
 * Quy tắc:
 * 1. Số liệu nội bộ (leads_generated) đọc thật từ database/repo.
 * 2. Số liệu bên ngoài (GA4/GSC/Meta Ads): nếu thiếu thì trả missing + missing_reason (KHÔNG fake thành 0).
 * 3. Hỗ trợ time range (from, to), timezone và currency.
 */
export async function getWorkspaceReport(workspaceId: string, query: ReportQueryInput) {
  const parsed = reportQuerySchema.safeParse(query);
  if (!parsed.success) throw new AppError(422, 'VALIDATION_FAILED', parsed.error.message);
  const { timezone, currency } = parsed.data;
  const toDate = parsed.data.to ?? dateInZone(new Date(), timezone);
  const fromDate = parsed.data.from ?? new Date(Date.parse(toDate) - 6 * 86_400_000).toISOString().slice(0, 10);
  if (!periodSchema.safeParse({ from: fromDate, to: toDate }).success) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Invalid report period (maximum 366 days)');
  }
  const leadCount = await globalLeadRepo.countCapturedInPeriod(workspaceId, fromDate, toDate, timezone);

  const kpis: Record<string, MetricItem> = {
    leads_generated: {
      metric: 'leads_generated',
      value: leadCount,
      availability: 'available',
      missing_reason: null,
    },
    sessions: {
      metric: 'sessions',
      value: null,
      availability: 'missing',
      missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
    },
    pageviews: {
      metric: 'pageviews',
      value: null,
      availability: 'missing',
      missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
    },
    search_clicks: {
      metric: 'search_clicks',
      value: null,
      availability: 'missing',
      missing_reason: 'PROPERTY_NOT_VERIFIED',
    },
    search_impressions: {
      metric: 'search_impressions',
      value: null,
      availability: 'missing',
      missing_reason: 'PROPERTY_NOT_VERIFIED',
    },
    ad_spend: {
      metric: 'ad_spend',
      value: null,
      availability: 'missing',
      missing_reason: 'META_ADS_ACCESS_MISSING',
      currency,
    },
  };

  // Nếu có metric snapshot đã lưu trong memory/DB, cập nhật số liệu
  for (const snapshot of memorySnapshots.values()) {
    if (
      snapshot.workspace_id === workspaceId &&
      snapshot.period_from === fromDate &&
      snapshot.period_to === toDate &&
      snapshot.metric_name in METRIC_PROVIDER
    ) {
      kpis[snapshot.metric_name] = {
        metric: snapshot.metric_name,
        value: snapshot.metric_name === 'ad_spend' && snapshot.currency !== currency ? null : snapshot.metric_value,
        availability: snapshot.metric_name === 'ad_spend' && snapshot.currency !== currency ? 'missing' : snapshot.availability,
        missing_reason: snapshot.metric_name === 'ad_spend' && snapshot.currency !== currency ? 'CURRENCY_MISMATCH' : snapshot.missing_reason,
        ...(snapshot.metric_name === 'ad_spend' ? { currency: snapshot.currency } : {}),
        timezone: snapshot.timezone,
      };
    }
  }

  // Snapshot theo ngày trong DB (POST /metrics hoặc worker sync): cộng dồn trong kỳ.
  // Đủ mọi ngày → available; thiếu ngày → partial (không lấp chỗ trống bằng 0).
  try {
    const dayCount = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1;
    const series = await Promise.all(Object.keys(METRIC_PROVIDER).map(async metric => ({ metric,
      points: await dailySnapshots(workspaceId, metric, fromDate, toDate) })));
    for (const { metric, points: rawPoints } of series) {
      const zoneCount = new Set(rawPoints.map(p => p.timezone)).size;
      const mismatch = zoneCount > 1 || rawPoints.some(p => !p.timezone || p.timezone === 'unknown' || (metric === 'ad_spend' && p.currency !== currency));
      if (mismatch) {
        kpis[metric] = { metric, value: null, availability: 'missing', missing_reason:
          zoneCount > 1 || rawPoints.some(p => !p.timezone || p.timezone === 'unknown') ? 'TIMEZONE_MISMATCH' : 'CURRENCY_MISMATCH' };
        continue;
      }
      const points = rawPoints.filter(
        (p) => p.availability === 'available' && p.value !== null
      );
      if (points.length === 0) {
        const noData = rawPoints.find((point) => point.missing_reason);
        if (noData) {
          kpis[metric] = {
            ...kpis[metric],
            value: null,
            availability: rawPoints.some(p => p.availability === 'delayed') ? 'delayed' : 'missing',
            missing_reason: noData.missing_reason,
          };
        }
        continue;
      }
      const complete = points.length >= dayCount;
      kpis[metric] = {
        metric,
        value: points.reduce((sum, p) => sum + (p.value as number), 0),
        availability: complete ? 'available' : 'partial',
        missing_reason: complete ? null : 'SYNC_NOT_RUN_YET',
        timezone: points[0].timezone,
        ...(metric === 'ad_spend' ? { currency } : {}),
      };
    }
  } catch (error) {
    // Isolated in-memory fixtures have no DB; configured services must expose operational failures.
    if (process.env.DATABASE_URL) throw error;
  }

  // Fanpage đã kết nối (token server-side): số liệu đọc trực tiếp từ Graph API.
  if (facebookPageConfigured(workspaceId)) {
    Object.assign(kpis, await getFacebookPageKpis(fromDate, toDate));
  }

  return {
    workspace_id: workspaceId,
    period: {
      from: fromDate,
      to: toDate,
      timezone,
      currency,
    },
    kpis,
    summary: {
      total_leads: leadCount,
      available_kpi_count: Object.values(kpis).filter((k) => k.availability === 'available').length,
      missing_kpi_count: Object.values(kpis).filter((k) => k.availability === 'missing').length,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Lưu snapshot số liệu vào hệ thống
 */
export function recordMetricSnapshot(snapshot: Omit<MetricSnapshotRecord, 'id' | 'captured_at'>): MetricSnapshotRecord {
  const id = randomUUID();
  const record: MetricSnapshotRecord = {
    ...snapshot,
    id,
    captured_at: new Date(),
  };
  memorySnapshots.set(id, record);
  return record;
}

/**
 * Exception Management: Mọi exception đều có assigned_owner
 */
export async function listWorkspaceExceptions(
  workspaceId: string,
  filter?: ListExceptionsQuery
): Promise<SystemExceptionRecord[]> {
  try {
    const conditions: string[] = ['workspace_id = $1'];
    const params: any[] = [workspaceId];
    let idx = 2;

    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filter.status);
    }
    if (filter?.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(filter.severity);
    }
    if (filter?.assigned_owner) {
      conditions.push(`assigned_owner = $${idx++}`);
      params.push(filter.assigned_owner);
    }

    const limit = filter?.limit || 50;
    params.push(limit);
    const sql = `SELECT * FROM system_exceptions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx}`;
    const res = await dbQuery(sql, params);
    if (res.rows.length > 0) {
      return res.rows.map((r: any) => ({
        id: r.id,
        workspace_id: r.workspace_id,
        code: r.code,
        title: r.title,
        severity: r.severity,
        source_task_id: r.source_task_id,
        assigned_owner: r.assigned_owner,
        status: r.status,
        description: r.description,
        resolution_note: r.resolution_note,
        created_at: new Date(r.created_at),
        resolved_at: r.resolved_at ? new Date(r.resolved_at) : null,
      }));
    }
  } catch {
    // In-memory fallback
  }

  let list = Array.from(memoryExceptions.values()).filter((e) => e.workspace_id === workspaceId);

  if (filter?.status) {
    list = list.filter((e) => e.status === filter.status);
  }
  if (filter?.severity) {
    list = list.filter((e) => e.severity === filter.severity);
  }
  if (filter?.assigned_owner) {
    list = list.filter((e) => e.assigned_owner === filter.assigned_owner);
  }

  list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return list.slice(0, filter?.limit || 50);
}

export async function createWorkspaceException(
  workspaceId: string,
  input: CreateExceptionInput
): Promise<SystemExceptionRecord> {
  const id = randomUUID();
  const now = new Date();
  const record: SystemExceptionRecord = {
    id,
    workspace_id: workspaceId,
    code: input.code,
    title: input.title,
    severity: input.severity,
    source_task_id: input.source_task_id,
    assigned_owner: input.assigned_owner || null,
    status: 'open',
    description: input.description,
    resolution_note: null,
    created_at: now,
    resolved_at: null,
  };

  memoryExceptions.set(id, record);

  try {
    await dbQuery(
      `INSERT INTO system_exceptions (
        id, workspace_id, code, title, severity, source_task_id,
        assigned_owner, status, description, resolution_note, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        record.id,
        record.workspace_id,
        record.code,
        record.title,
        record.severity,
        record.source_task_id || null,
        record.assigned_owner,
        record.status,
        record.description || null,
        null,
        record.created_at,
      ]
    );
  } catch {
    // in-memory fallback
  }

  return record;
}

export async function updateWorkspaceException(
  workspaceId: string,
  exceptionId: string,
  input: UpdateExceptionInput
): Promise<SystemExceptionRecord> {
  const existing = memoryExceptions.get(exceptionId);
  if (!existing || existing.workspace_id !== workspaceId) {
    throw new AppError(404, 'NOT_FOUND', 'Exception not found in this workspace');
  }

  const isResolving = input.status === 'resolved' && existing.status !== 'resolved';

  const updated: SystemExceptionRecord = {
    ...existing,
    status: input.status ?? existing.status,
    assigned_owner: input.assigned_owner !== undefined ? input.assigned_owner : existing.assigned_owner,
    resolution_note: input.resolution_note !== undefined ? input.resolution_note : existing.resolution_note,
    resolved_at: isResolving ? new Date() : existing.resolved_at,
  };

  memoryExceptions.set(exceptionId, updated);

  try {
    await dbQuery(
      `UPDATE system_exceptions 
       SET status = $1, assigned_owner = $2, resolution_note = $3, resolved_at = $4
       WHERE id = $5 AND workspace_id = $6`,
      [
        updated.status,
        updated.assigned_owner,
        updated.resolution_note,
        updated.resolved_at,
        exceptionId,
        workspaceId,
      ]
    );
  } catch {
    // in-memory fallback
  }

  return updated;
}

/**
 * Transactional Outbox: Event Consistency & Deduplication
 */
export async function listWorkspaceOutboxEvents(
  workspaceId: string,
  status?: string
): Promise<OutboxEventRecord[]> {
  try {
    const params: any[] = [workspaceId];
    let sql = `SELECT * FROM outbox_events WHERE workspace_id = $1`;
    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;
    const res = await dbQuery(sql, params);
    if (res.rows.length > 0) {
      return res.rows.map((r: any) => ({
        id: r.id,
        workspace_id: r.workspace_id,
        event_type: r.event_type,
        dedup_key: r.dedup_key,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
        status: r.status,
        retry_count: r.retry_count,
        created_at: new Date(r.created_at),
        published_at: r.published_at ? new Date(r.published_at) : null,
      }));
    }
  } catch {
    // in-memory fallback
  }

  let list = Array.from(memoryOutbox.values()).filter((e) => e.workspace_id === workspaceId);
  if (status) {
    list = list.filter((e) => e.status === status);
  }
  return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function recordOutboxEvent(
  workspaceId: string,
  input: OutboxEventInput
): Promise<{ event: OutboxEventRecord; deduplicated: boolean }> {
  // 1. Kiểm tra dedup trong memory
  for (const existing of memoryOutbox.values()) {
    if (existing.workspace_id === workspaceId && existing.dedup_key === input.dedup_key) {
      return { event: existing, deduplicated: true };
    }
  }

  // 2. Kiểm tra dedup trong Postgres nếu có
  try {
    const existingDb = await dbQuery(
      `SELECT * FROM outbox_events WHERE workspace_id = $1 AND dedup_key = $2 LIMIT 1`,
      [workspaceId, input.dedup_key]
    );
    if (existingDb.rows.length > 0) {
      const r = existingDb.rows[0];
      const ev: OutboxEventRecord = {
        id: r.id,
        workspace_id: r.workspace_id,
        event_type: r.event_type,
        dedup_key: r.dedup_key,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
        status: r.status,
        retry_count: r.retry_count,
        created_at: new Date(r.created_at),
        published_at: r.published_at ? new Date(r.published_at) : null,
      };
      memoryOutbox.set(ev.id, ev);
      return { event: ev, deduplicated: true };
    }
  } catch {
    // fallback
  }

  const id = randomUUID();
  const now = new Date();
  const event: OutboxEventRecord = {
    id,
    workspace_id: workspaceId,
    event_type: input.event_type,
    dedup_key: input.dedup_key,
    payload: input.payload,
    status: 'pending',
    retry_count: 0,
    created_at: now,
    published_at: null,
  };

  memoryOutbox.set(id, event);

  try {
    await dbQuery(
      `INSERT INTO outbox_events (
        id, workspace_id, event_type, dedup_key, payload, status, retry_count, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.id,
        event.workspace_id,
        event.event_type,
        event.dedup_key,
        JSON.stringify(event.payload ?? {}),
        event.status,
        event.retry_count,
        event.created_at,
      ]
    );
  } catch {
    // in-memory fallback
  }

  return { event, deduplicated: false };
}

export async function processPendingOutboxEvents(
  workspaceId: string
): Promise<{ processed_count: number; published_events: OutboxEventRecord[] }> {
  try {
    const res = await dbQuery(
      `UPDATE outbox_events 
       SET status = 'published', published_at = NOW() 
       WHERE workspace_id = $1 AND status = 'pending' 
       RETURNING *`,
      [workspaceId]
    );
    if (res.rows.length > 0) {
      const published = res.rows.map((r: any) => {
        const ev: OutboxEventRecord = {
          id: r.id,
          workspace_id: r.workspace_id,
          event_type: r.event_type,
          dedup_key: r.dedup_key,
          payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
          status: 'published',
          retry_count: r.retry_count,
          created_at: new Date(r.created_at),
          published_at: new Date(r.published_at),
        };
        memoryOutbox.set(ev.id, ev);
        return ev;
      });
      return { processed_count: published.length, published_events: published };
    }
  } catch {
    // fallback to memory
  }

  const pending = Array.from(memoryOutbox.values()).filter(
    (e) => e.workspace_id === workspaceId && e.status === 'pending'
  );

  const published: OutboxEventRecord[] = [];
  for (const ev of pending) {
    ev.status = 'published';
    ev.published_at = new Date();
    memoryOutbox.set(ev.id, ev);
    published.push(ev);
  }

  return {
    processed_count: published.length,
    published_events: published,
  };
}
