import { z } from 'zod';

/**
 * W1-MY-04 — Public lead submission contract (POST /public/v1/sites/{site_id}/leads).
 * Tham chiếu EXAMPLES.md §4; consent=false hoặc email sai → 422.
 */

export const leadConsentSchema = z
  .object({
    accepted: z.boolean(),
    policy_version: z.string().trim().min(1).max(64),
  })
  .strict();

export const leadContextSchema = z
  .object({
    visitor_id: z.string().trim().min(1).max(128).optional(),
    content_id: z.string().trim().uuid().optional(),
    campaign_id: z.string().trim().min(1).max(128).optional(),
    assignment_id: z.string().trim().uuid().optional(),
    utm_source: z.string().trim().max(128).optional(),
    utm_medium: z.string().trim().max(128).optional(),
    utm_campaign: z.string().trim().max(128).optional(),
    utm_content: z.string().trim().max(128).optional(),
  })
  // không strict: UTM/context có thể mở rộng phía FE mà không chặn contract
  .strip();

export const createLeadBodySchema = z
  .object({
    email: z.string().trim().email(),
    name: z.string().trim().min(1).max(120),
    interest_topic: z.string().trim().min(1).max(64),
    consent: leadConsentSchema,
    context: leadContextSchema.optional(),
  })
  .strict();

export type CreateLeadBody = z.infer<typeof createLeadBodySchema>;
export type LeadContext = z.infer<typeof leadContextSchema>;

/** Header Idempotency-Key bắt buộc (contracts §5: scope theo action/site). */
export const idempotencyKeySchema = z.string().trim().min(1).max(200);

/** Convert zod error → field_errors envelope. */
export function zodFieldErrors(error: z.ZodError): Array<{ field: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    code: issue.code,
    message: issue.message,
  }));
}