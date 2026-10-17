import type { JobOperator } from './JobState';
import type { OperationHandler } from './JobRunner';
import { PermanentJobError } from './JobRunner';
import { PublishJobProcessor } from '../publish/PublishJobProcessor.js';
import { createGatewayCheck } from '../publish/GatewayRecheckClient.js';
import { defaultRegistry } from '../publish/CmsPublisher.js';
import { LeadIntakeService } from '../leads/LeadIntakeService.js';
import { MetricsIngestionStub } from '../metrics/MetricsIngestionStub.js';

/**
 * Registry operation → handler (W1-MY-01, bổ sung typed routing MY-01, wiring MY-04/05/06).
 *
 * - Operation AI-backed được map sang mã operation phía AI service (CR-001);
 *   HttpAiAdapter dùng `aiOperation` khi dựng JobRequest.
 * - publish → CMS executor (MY-04/05); metrics → ingestion stub (MY-06);
 *   lead → intake service (MY-06); integrations → gateway passthrough (TQ-06).
 * - ingest_revoke/ingest_delete vẫn fail `OPERATION_NOT_WIRED` chờ snapshot scoping (TQ-02).
 */
export type OperationHandlers = Record<JobOperator, OperationHandler>;

/** Worker operation → AI operation theo registry sáu role (CR-002). */
export const WORKER_TO_AI_OPERATION: Partial<Record<JobOperator, string>> = {
  ingest: 'knowledge.ingest',
  research: 'research.run',
  score: 'opportunity.score',
  strategy: 'strategy.generate',
  content: 'content.generate',
};

/**
 * Operation không gọi LLM. Owner/task wiring:
 * ingest_revoke/ingest_delete → snapshot scoping phía BE (TQ-02);
 * publish → CMS executor (MY-04/05, đã wiring);
 * metrics → ingestion stub (MY-06, đã wiring);
 * lead → intake service (MY-06, đã wiring);
 * integrations → connector passthrough (MY-02/06, đã wiring cơ bản).
 */
export const NON_AI_OPERATIONS: readonly JobOperator[] = [
  'ingest_revoke',
  'ingest_delete',
];

const WIRE_HINTS: Record<string, string> = {
  ingest_revoke: 'snapshot scoping phía BE (TQ-02)',
  ingest_delete: 'snapshot scoping phía BE (TQ-02)',
  publish: 'CMS executor (MY-04/MY-05)',
  metrics: 'metrics ingestion GA4/GSC/Meta (MY-06)',
  lead: 'community intake/persistence (MY-06)',
  integrations: 'connector adapter (MY-02/MY-06)',
};

/** Handler AI-backed: gửi đúng context JobRequest (idempotency = job_id+operation+input_version). */
function aiBackedHandler(aiOperation: string): OperationHandler {
  return async (ctx) => {
    await ctx.progress(10);
    const snapshot = ctx.job.payload as {
      context_snapshot_id?: string;
      approved_source_versions?: Array<{ source_id: string; version: number }>;
    };
    const res = await ctx.ai.run({
      operation: ctx.job.operation,
      aiOperation,
      input: ctx.job.payload,
      job_id: ctx.job.id,
      workspace_id: ctx.job.workspace_id,
      input_version: ctx.job.input_version,
      trace_id: ctx.job.trace_id,
      context_snapshot_id: snapshot?.context_snapshot_id ?? null,
      approved_source_versions: snapshot?.approved_source_versions ?? [],
      // Khóa theo contract CR-001; resend cùng attempt không tạo run mới.
      idempotency_key: `${ctx.job.id}:${aiOperation}:${ctx.job.input_version}`,
    });
    await ctx.progress(90);
    return {
      ...res.output,
      model: res.model,
      schema_version: res.schema_version,
      ...(res.run_id ? { ai_run_id: res.run_id } : {}),
      ...(res.artifact ? { artifact: res.artifact } : {}),
      ...(res.evidence ? { evidence: res.evidence } : {}),
    };
  };
}

export function buildOperationHandlers(): OperationHandlers {
  const handlers = {} as OperationHandlers;
  for (const [operation, aiOperation] of Object.entries(WORKER_TO_AI_OPERATION)) {
    handlers[operation as JobOperator] = aiBackedHandler(aiOperation!);
  }
  // Wired non-LLM executors (MY-04/05/06) — lazy import để tránh cycle
  handlers['publish'] = createWiredHandler('publish');
  handlers['lead'] = createWiredHandler('lead');
  handlers['metrics'] = createWiredHandler('metrics');
  handlers['integrations'] = createWiredHandler('integrations');
  for (const operation of NON_AI_OPERATIONS) {
    handlers[operation] = async () => {
      throw new PermanentJobError(
        `operation ${operation} không đi qua LLM generic; chưa được wiring (${WIRE_HINTS[operation]})`,
        'OPERATION_NOT_WIRED',
      );
    };
  }
  return handlers;
}

/**
 * Wiring cho publish/lead/metrics/integrations (MY-04/05/06).
 * Static import trực tiếp — không cycle vì publish/leads/metrics không import operations.
 */
function createWiredHandler(operation: 'publish' | 'lead' | 'metrics' | 'integrations'): OperationHandler {
  return async (ctx) => {
    await ctx.progress(10);
    const payload = (ctx.job.payload ?? {}) as Record<string, unknown>;
    if (operation === 'publish') {
      const processor = new PublishJobProcessor(defaultRegistry);
      const version = typeof payload['expectedVersion'] === 'number' ? (payload['expectedVersion'] as number) : ctx.job.input_version;
      const channel = (payload['channel'] as 'Website' | 'Facebook' | 'Instagram' | 'Newsletter' | undefined) ?? 'Website';
      const idempotencyKey =
        (payload['idempotencyKey'] as string | undefined) ??
        PublishJobProcessor.buildDedupKey(
          ctx.job.workspace_id,
          String(payload['contentId'] ?? ctx.job.id),
          channel,
          version,
        );
      // MY-05: recheck gateway TQ-06 tại execution (có API_BASE_URL mới bật).
      const gatewayCheck = createGatewayCheck();
      const result = await processor.publish({
        jobId: ctx.job.id,
        workspaceId: ctx.job.workspace_id,
        contentId: String(payload['contentId'] ?? ctx.job.id),
        channel,
        scheduledAt: payload['scheduledAt'] ? new Date(String(payload['scheduledAt'])) : new Date(),
        idempotencyKey,
        bodyMarkdown: String(payload['bodyMarkdown'] ?? ''),
        metaTitle: payload['metaTitle'] as string | undefined,
        metaDescription: payload['metaDescription'] as string | undefined,
        slug: payload['slug'] as string | undefined,
        utmSource: payload['utmSource'] as string | undefined,
        utmMedium: payload['utmMedium'] as string | undefined,
        utmCampaign: payload['utmCampaign'] as string | undefined,
        expectedVersion: version,
        contentHash: String(payload['contentHash'] ?? ''),
        approvalId: payload['approvalId'] as string | undefined,
        ...(gatewayCheck ? { gatewayCheck } : {}),
      });
      await ctx.progress(90);
      if (!result.success) {
        throw new PermanentJobError(result.errorMessage ?? 'publish failed', result.errorCode ?? 'PUBLISH_FAILED');
      }
      return { ...result, idempotencyKey, channel };
    }
    if (operation === 'lead') {
      const service = new LeadIntakeService();
      const utm = payload as { utmSource?: string; utmMedium?: string; utmCampaign?: string };
      const res = await service.intake({
        workspaceId: ctx.job.workspace_id,
        contactName: payload['contactName'] as string | undefined,
        contactEmail: String(payload['contactEmail'] ?? payload['email'] ?? ''),
        phoneNumber: payload['phoneNumber'] as string | undefined,
        utmSource: String(utm.utmSource ?? payload['utm_source'] ?? ''),
        utmMedium: String(utm.utmMedium ?? payload['utm_medium'] ?? ''),
        utmCampaign: String(utm.utmCampaign ?? payload['utm_campaign'] ?? ''),
        consent: (payload['consent'] as boolean | undefined) ?? true,
      });
      await ctx.progress(90);
      if (!res.success) {
        throw new PermanentJobError(res.errorMessage ?? 'lead intake failed', res.errorCode ?? 'LEAD_INTAKE_FAILED');
      }
      return { lead: res.lead, duplicate: res.duplicate ?? false };
    }
    if (operation === 'metrics') {
      const stub = new MetricsIngestionStub();
      const sources = (payload['sources'] as Array<'ga4' | 'gsc' | 'meta_ads'> | undefined) ?? ['ga4', 'gsc'];
      const res = await stub.ingest(ctx.job.workspace_id, sources);
      await ctx.progress(90);
      return { snapshots: res.snapshots, allMissing: res.allMissing, missingReason: res.missingReason };
    }
    // integrations: passthrough theo MY-02 matrix (chưa có credential thật → manual/insufficient)
    await ctx.progress(90);
    return {
      provider: payload['provider'] ?? 'unknown',
      capability: payload['capability'] ?? 'unknown',
      action_type: payload['action_type'] ?? 'read',
      status: 'manual_or_insufficient',
      note: 'Connector chưa có credential thật (MY-02); social dùng manual pack, metrics insufficient_data.',
    };
  };
}