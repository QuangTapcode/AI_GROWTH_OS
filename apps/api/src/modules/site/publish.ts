import type { Pool, PoolClient } from 'pg';
import { siteForWorkspace } from '../../lib/sites';

type Db = Pool | PoolClient;

export class PublishError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}

export function slugify(title: string): string {
  // "Đ/đ" has no decomposition, so it is mapped explicitly before stripping diacritics.
  return title.replace(/[Đđ]/g, 'd').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'post';
}

/**
 * Publish an approved, grounded SEO article as a post on the workspace's own site.
 * Only the exact approved artifact version/hash is published; drafts with missing facts,
 * synthetic data or no approval are refused. Re-publishing the same artifact is a no-op.
 */
export async function publishSeoArtifact(db: Db, workspaceId: string, artifactId: string, actorId: string | null) {
  const site = siteForWorkspace(workspaceId);
  if (!site) throw new PublishError('SITE_NOT_CONFIGURED', 'Workspace has no public site');
  const row = (await db.query(
    `SELECT a.id, a.version, a.content_hash, a.context_snapshot_id, a.role, a.payload FROM content_artifacts a
     WHERE a.workspace_id=$1 AND a.id=$2`, [workspaceId, artifactId],
  )).rows[0];
  if (!row || row.role !== 'seo') throw new PublishError('ARTIFACT_NOT_SEO', 'Only SEO articles can be published to the site', 404);
  const result = row.payload?.result ?? {};
  if (result.synthetic === true) throw new PublishError('SYNTHETIC_NOT_PUBLISHABLE', 'Synthetic drafts are never published');
  if (result.status !== 'draft' || (result.missing_facts ?? []).length) throw new PublishError('ARTICLE_NOT_READY', 'Resolve missing facts before publishing');
  const approved = (await db.query(
    `SELECT 1 FROM approvals WHERE workspace_id=$1 AND target_type='artifact' AND target_id=$2 AND target_version=$3
       AND target_hash=$4 AND status='approved'`, [workspaceId, row.id, row.version, row.content_hash],
  )).rowCount;
  if (!approved) throw new PublishError('APPROVAL_REQUIRED', 'Approve this exact article version before publishing', 409);

  const existing = (await db.query('SELECT id, slug FROM contents WHERE workspace_id=$1 AND artifact_id=$2', [workspaceId, row.id])).rows[0];
  if (existing?.slug) return { content_id: existing.id as string, slug: existing.slug as string, site_id: site.site_id, published: false };
  const base = slugify(String(result.title ?? 'post'));
  let slug = base;
  for (let n = 2; (await db.query('SELECT 1 FROM contents WHERE site_id=$1 AND slug=$2', [site.site_id, slug])).rowCount; n++) slug = `${base}-${n}`;
  const content = (await db.query(
    `INSERT INTO contents (workspace_id, title, body_markdown, type, status, created_by, approved_by, published_at, current_version,
       content_hash, context_snapshot_id, artifact_id, site_id, slug, meta_description)
     VALUES ($1, $2, $3, 'blog_post', 'published', 'ai', $4, now(), $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [workspaceId, String(result.title).slice(0, 255), result.body_markdown, actorId, row.version, row.content_hash,
      row.context_snapshot_id, row.id, site.site_id, slug, String(result.meta_description ?? '').slice(0, 300) || null],
  )).rows[0];
  return { content_id: content.id as string, slug, site_id: site.site_id, published: true };
}
