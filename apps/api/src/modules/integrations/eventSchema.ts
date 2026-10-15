import { z } from 'zod';

/**
 * W1-MY-06 — GA4 event schema (pilot).
 * `generate_lead` CHỈ ghi sau khi form persisted (contracts/PILOT).
 * Params là allowlist + strict: email/name/PII bị chặn ở tầng schema,
 * ngoài guard analytics chung (lib/analytics).
 */
export const GA4_EVENTS = {
  PAGE_VIEW: 'page_view',
  GENERATE_LEAD: 'generate_lead',
} as const;

export type Ga4EventName = (typeof GA4_EVENTS)[keyof typeof GA4_EVENTS];

/** Không bao giờ được xuất hiện trong params GA4 (PII policy). */
export const FORBIDDEN_PARAM_KEYS = ['email', 'name', 'phone', 'full_name', 'visitor_email'] as const;

export const generateLeadParamsSchema = z
  .object({
    event_id: z.string().min(1), // submission_id — dedup key
    site_id: z.string().min(1),
    content_id: z.string().uuid().optional(),
    campaign_id: z.string().min(1).optional(),
    assignment_id: z.string().uuid().optional(),
    variant: z.string().min(1).optional(), // M15 experiment CTA variant
    experiment_id: z.string().min(1).optional(),
    utm_source: z.string().max(128).optional(),
    utm_medium: z.string().max(128).optional(),
    utm_campaign: z.string().max(128).optional(),
    utm_content: z.string().max(128).optional(),
  })
  .strict();

export const pageViewParamsSchema = z
  .object({
    event_id: z.string().min(1).optional(),
    site_id: z.string().min(1),
    page_location: z.string().max(2048).optional(),
    page_path: z.string().max(2048).optional(),
  })
  .strict();

export type GenerateLeadParams = z.infer<typeof generateLeadParamsSchema>;

export type ValidateParamsResult =
  | { ok: true; params: GenerateLeadParams }
  | { ok: false; errors: Array<{ field: string; code: string; message: string }> };

/** Validate generate_lead params: chặn unknown key lẫn PII. */
export function validateGenerateLeadParams(params: unknown): ValidateParamsResult {
  const parsed = generateLeadParamsSchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => {
        // unrecognized_keys nằm ở root với danh sách keys — trích tên key cụ thể
        const keys = (i as unknown as { keys?: unknown }).keys;
        const field =
          i.path.length > 0
            ? i.path.join('.')
            : Array.isArray(keys) && keys.length > 0
              ? String(keys[0])
              : '(root)';
        return { field, code: i.code, message: i.message };
      }),
    };
  }
  for (const key of Object.keys(parsed.data)) {
    if ((FORBIDDEN_PARAM_KEYS as readonly string[]).includes(key.toLowerCase())) {
      return { ok: false, errors: [{ field: key, code: 'custom', message: 'PII field forbidden in GA4 params' }] };
    }
  }
  return { ok: true, params: parsed.data };
}