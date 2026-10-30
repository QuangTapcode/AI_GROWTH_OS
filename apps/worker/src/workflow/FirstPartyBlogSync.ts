import type { Pool } from 'pg';

export type BlogLink = { url: string; title: string };
export type ListLinks = (indexUrl: string) => Promise<BlogLink[]>;

/** The business's own blog; articles under it are imported (and approved on ingest, see SourceIngestRunner). */
const BLOG_PREFIX = process.env.FIRST_PARTY_BLOG_PREFIX ?? 'https://tripc.ai/blog/';
const ARTICLE = new RegExp(`^${BLOG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]+$`);

/**
 * Keeps Research supplied with newly published first-party articles: browses the blog index and
 * queues every article a workspace does not have yet as an imported URL source. Only workspaces
 * that already use this blog as an approved source receive new articles.
 */
export class FirstPartyBlogSync {
  constructor(private pool: Pool, private listLinks: ListLinks) {}

  async runOnce() {
    const workspaces = (await this.pool.query(
      `SELECT DISTINCT workspace_id FROM sources WHERE url_or_blob LIKE $1 AND status='approved' AND deleted_at IS NULL`,
      [`${BLOG_PREFIX}%`])).rows.map((r: { workspace_id: string }) => r.workspace_id);
    if (!workspaces.length) return { imported: 0 };
    const articles = new Map((await this.listLinks(BLOG_PREFIX.replace(/\/$/, '')))
      .filter((link) => ARTICLE.test(link.url)).map((link) => [link.url, link.title.trim()]));
    let imported = 0;
    for (const workspaceId of workspaces) {
      const known = new Set((await this.pool.query(
        'SELECT url_or_blob FROM sources WHERE workspace_id=$1 AND url_or_blob LIKE $2 AND deleted_at IS NULL',
        [workspaceId, `${BLOG_PREFIX}%`])).rows.map((r: { url_or_blob: string }) => r.url_or_blob));
      for (const [url, title] of articles) {
        if (known.has(url)) continue;
        await this.pool.query(
          `INSERT INTO sources (workspace_id, title, kind, url_or_blob, category, status, license, attribution, source_url)
           VALUES ($1, $2, 'url', $3, 'content', 'imported', 'TripC first-party content', 'TripC', $3)`,
          [workspaceId, `${(title || url.slice(BLOG_PREFIX.length)).slice(0, 230)} (tripc.ai)`, url]);
        imported++;
      }
    }
    return { imported };
  }
}
