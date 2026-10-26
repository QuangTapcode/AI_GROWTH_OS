import pool from '../../lib/db';
import type { ContentSnapshot } from './dto';
import type { PublicContentRepository } from './repository';

/**
 * Published site posts from Postgres (contents with a site slug). The public service still
 * filters by site/status and maps through the DTO whitelist, so internal columns never leak.
 */
export class PgPublicContentRepository implements PublicContentRepository {
  async all(): Promise<ContentSnapshot[]> {
    const rows = (await pool.query(
      `SELECT id, workspace_id, site_id, status, title, slug, body_markdown, meta_description, published_at
       FROM contents WHERE site_id IS NOT NULL AND slug IS NOT NULL AND status='published' ORDER BY published_at DESC LIMIT 200`,
    )).rows;
    return rows.map((r) => ({
      id: r.id, kind: 'post' as const, site_id: r.site_id, workspace_id: r.workspace_id, status: 'published' as const,
      title: r.title, slug: r.slug, body: r.body_markdown ?? '',
      meta: { description: r.meta_description ?? undefined, locale: 'en' },
      published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
    }));
  }
}
