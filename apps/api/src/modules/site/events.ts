import { z } from 'zod';
import type { Pool } from 'pg';
import { resolveSite } from '../../lib/sites';

export const siteEventSchema = z.object({
  event_type: z.enum(['page_view', 'cta_click']),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  path: z.string().startsWith('/').max(300),
  content_slug: z.string().regex(/^[a-z0-9-]{1,160}$/).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
}).strict();

export type SiteEventInput = z.infer<typeof siteEventSchema>;

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^::1$/, /^fc/i, /^fd/i, /^::ffff:127\./];

/**
 * A visit is internal (operator preview/QA) when the client address is missing, loopback or
 * private. Behind the production proxy the first X-Forwarded-For hop is the visitor.
 */
export function isInternal(forwardedFor: string | null, realIp: string | null): boolean {
  const ip = (forwardedFor?.split(',')[0] ?? realIp ?? '').trim();
  return !ip || PRIVATE.some((pattern) => pattern.test(ip));
}

function referrerHost(referrer: string | null | undefined): string | null {
  try { return referrer ? new URL(referrer).hostname.slice(0, 255) : null; } catch { return null; }
}

/** Store one anonymous event; a page view repeated by the same session within 30 minutes is ignored. */
export async function recordSiteEvent(pool: Pool, siteId: string, input: SiteEventInput, internal: boolean) {
  const site = resolveSite(siteId);
  if (!site || site.status !== 'active') return { recorded: false, reason: 'SITE_NOT_FOUND' as const };
  const content = input.content_slug
    ? (await pool.query("SELECT id FROM contents WHERE site_id=$1 AND slug=$2 AND status='published'", [siteId, input.content_slug])).rows[0]
    : null;
  const inserted = await pool.query(
    `INSERT INTO site_events (workspace_id, site_id, content_id, event_type, session_id, path, referrer_host, internal)
     SELECT $1::uuid, $2::varchar, $3::uuid, $4::varchar, $5::varchar, $6::varchar, $7::varchar, $8::boolean
     WHERE $4::varchar <> 'page_view' OR NOT EXISTS (SELECT 1 FROM site_events WHERE site_id=$2::varchar AND session_id=$5::varchar AND path=$6::varchar
       AND event_type='page_view' AND occurred_at > now() - interval '30 minutes')`,
    [site.workspace_id, siteId, content?.id ?? null, input.event_type, input.session_id, input.path,
      referrerHost(input.referrer), internal],
  );
  return { recorded: inserted.rowCount === 1, internal };
}
