import { submitLead, type SubmitLeadDeps } from './service';
import { httpError, httpOk, newRequestId, type HttpResult } from '../../lib/http';

/**
 * Framework-agnostic handlers (W1-MY-04). Core router Next.js của Thiệu Quang
 * (W1-BE-01) sẽ map `POST /public/v1/sites/{site_id}/leads` → handleCreateLead.
 */
export interface PublicHttpRequest {
  params: Record<string, string>;
  /** keys nên viết thường; lookup chuẩn hóa case-insensitive */
  headers: Record<string, string | undefined>;
  body: unknown;
  request_id?: string;
}

export function getHeader(req: PublicHttpRequest, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === wanted && v !== undefined && v !== '') return v;
  }
  return null;
}

export interface LeadRoutes {
  handleCreateLead(req: PublicHttpRequest): Promise<HttpResult>;
}

export function createLeadRoutes(deps: SubmitLeadDeps): LeadRoutes {
  return {
    async handleCreateLead(req: PublicHttpRequest): Promise<HttpResult> {
      const requestId = req.request_id ?? newRequestId();
      const siteId = req.params.site_id ?? '';
      const idempotencyKey = getHeader(req, 'idempotency-key');

      const result = await submitLead(deps, {
        siteId,
        idempotencyKey,
        body: req.body,
        requestId,
      });

      switch (result.kind) {
        case 'created':
          return httpOk(201, {
            submission_id: result.submission_id,
            status: 'persisted',
            deduplicated: false,
          });
        case 'duplicate':
          return httpOk(200, {
            submission_id: result.submission_id,
            status: 'persisted',
            deduplicated: true,
          });
        case 'site_not_found':
          return httpError(404, 'SITE_NOT_FOUND', 'site not found or not active', { request_id: requestId });
        case 'invalid_key':
          return httpError(422, 'VALIDATION_ERROR', 'Idempotency-Key header is required', {
            request_id: requestId,
            field_errors: [{ field: 'Idempotency-Key', code: 'required', message: 'missing idempotency key' }],
          });
        case 'invalid':
          return httpError(422, 'VALIDATION_ERROR', 'request payload failed validation', {
            request_id: requestId,
            field_errors: result.field_errors,
          });
        case 'conflict':
          return httpError(
            409,
            'IDEMPOTENCY_PAYLOAD_MISMATCH',
            'same Idempotency-Key was already used with a different payload',
            { request_id: requestId, details: { submission_id: result.existing_submission_id } },
          );
        case 'server_error':
          return httpError(500, 'INTERNAL_ERROR', 'failed to persist lead', { request_id: requestId });
      }
    },
  };
}