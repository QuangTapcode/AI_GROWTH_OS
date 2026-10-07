import { v4 as uuid } from 'uuid';
import { createLeadBodySchema, idempotencyKeySchema, zodFieldErrors, type LeadContext } from './schemas';
import { newSubmissionId, type LeadRecord, type LeadRepository } from './repository';
import { resolveSite } from '../../lib/sites';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { assertNoPiiInParams, type AnalyticsSink } from '../../lib/analytics';
import type { FieldError } from '../../lib/http';

/**
 * W1-MY-04 — submitLead service.
 * Quy tắc (EXAMPLES.md §4):
 * - validate consent/email → 422; site không tồn tại → 404.
 * - cùng key + cùng payload → 200 cùng submission_id, deduplicated=true (không row mới).
 * - cùng key + khác payload → 409, không tạo record khác.
 * - 201 chỉ SAU transaction commit; commit fail → 500, 0 row, 0 event.
 * - analytics event (allowlist, không PII) chỉ ghi SAU commit success.
 */
export interface SubmitLeadDeps {
  repo: LeadRepository;
  analytics: AnalyticsSink;
  now?: () => Date;
}

export interface SubmitLeadRequest {
  siteId: string;
  idempotencyKey: string | null;
  body: unknown;
  requestId?: string;
}

export type SubmitLeadResult =
  | { kind: 'created'; submission_id: string; deduplicated: false }
  | { kind: 'duplicate'; submission_id: string; deduplicated: true }
  | { kind: 'site_not_found' }
  | { kind: 'invalid_key' }
  | { kind: 'invalid'; field_errors: FieldError[] }
  | { kind: 'conflict'; existing_submission_id: string }
  | { kind: 'server_error'; message: string };

export async function submitLead(deps: SubmitLeadDeps, req: SubmitLeadRequest): Promise<SubmitLeadResult> {
  const site = resolveSite(req.siteId);
  if (!site || site.status !== 'active') return { kind: 'site_not_found' };

  const key = idempotencyKeySchema.safeParse(req.idempotencyKey);
  if (!key.success) return { kind: 'invalid_key' };

  const parsed = createLeadBodySchema.safeParse(req.body);
  if (!parsed.success) return { kind: 'invalid', field_errors: zodFieldErrors(parsed.error) };
  const body = parsed.data;

  // consent phải chấp nhận thật (EXAMPLES: consent false → 422)
  if (body.consent.accepted !== true) {
    return {
      kind: 'invalid',
      field_errors: [{ field: 'consent.accepted', code: 'custom', message: 'consent must be accepted' }],
    };
  }

  const payloadHash = sha256Hex(canonicalJson(body));
  const now = deps.now ? deps.now() : new Date();

  let outcome: SubmitLeadResult;
  try {
    outcome = await deps.repo.withTransaction(async (tx) => {
      const existing = await tx.findByKey(site.site_id, key.data);
      if (existing) {
        if (existing.payload_hash !== payloadHash) {
          // cùng key khác payload → conflict; không insert gì cả
          return { kind: 'conflict' as const, existing_submission_id: existing.id };
        }
        return { kind: 'duplicate' as const, submission_id: existing.id, deduplicated: true as const };
      }

      const record: LeadRecord = {
        id: newSubmissionId(),
        site_id: site.site_id,
        workspace_id: site.workspace_id,
        organization_id: site.organization_id,
        email: body.email,
        name: body.name,
        interest_topic: body.interest_topic,
        consent_accepted: body.consent.accepted,
        consent_policy_version: body.consent.policy_version,
        context: (body.context ?? {}) as LeadContext,
        idempotency_key: key.data,
        payload_hash: payloadHash,
        created_at: now,
      };
      await tx.insertLead(record);
      return { kind: 'created' as const, submission_id: record.id, deduplicated: false as const };
    });
  } catch (err) {
    // DB fail → 500: không submission nào được persist, không event nào ghi
    return { kind: 'server_error', message: err instanceof Error ? err.message : 'db error' };
  }

  if (outcome.kind === 'created') {
    // Conversion = server đã persist; event chỉ携带 allowlist (không email/name)
    const params: Record<string, unknown> = {
      event_id: outcome.submission_id,
      ...(body.context?.content_id ? { content_id: body.context.content_id } : {}),
      ...(body.context?.campaign_id ? { campaign_id: body.context.campaign_id } : {}),
      ...(body.context?.assignment_id ? { assignment_id: body.context.assignment_id } : {}),
      ...(body.context?.utm_source ? { utm_source: body.context.utm_source } : {}),
      ...(body.context?.utm_medium ? { utm_medium: body.context.utm_medium } : {}),
      ...(body.context?.utm_campaign ? { utm_campaign: body.context.utm_campaign } : {}),
      ...(body.context?.utm_content ? { utm_content: body.context.utm_content } : {}),
      site_id: site.site_id,
    };
    assertNoPiiInParams(params);
    await deps.analytics.record({ name: 'generate_lead', params });
  }

  return outcome;
}