import { toPublicPost, type ContentSnapshot, type PublicPostDto } from './dto';
import type { PublicContentRepository } from './repository';
import { resolveSite } from '../../lib/sites';

/**
 * W1-MY-05 — public read service.
 * - Chỉ current published snapshot của site đang truy vấn (khách truy cập
 *   không có quyền workspace; site resolve server-side).
 * - Mọi item đi qua DTO whitelist (title/slug/body/meta/published_at).
 */
export interface PublicContentDeps {
  repo: PublicContentRepository;
}

async function publishedPosts(deps: PublicContentDeps, siteId: string): Promise<PublicPostDto[]> {
  const site = resolveSite(siteId);
  if (!site) return [];
  const snaps = await deps.repo.all();
  return snaps
    .filter((s) => s.kind === 'post' && s.site_id === siteId && s.status === 'published' && !!s.published_at)
    .map((s) => toPublicPost(s))
    .filter((dto): dto is PublicPostDto => dto !== null)
    .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0));
}

export async function listPublishedPosts(deps: PublicContentDeps, siteId: string): Promise<PublicPostDto[]> {
  return publishedPosts(deps, siteId);
}

export async function getPublishedPost(
  deps: PublicContentDeps,
  siteId: string,
  slug: string,
): Promise<PublicPostDto | null> {
  const posts = await publishedPosts(deps, siteId);
  return posts.find((p) => p.slug === slug) ?? null;
}

export async function getLanding(
  deps: PublicContentDeps,
  siteId: string,
  slug: string = 'living-in-da-nang',
): Promise<PublicPostDto | null> {
  const site = resolveSite(siteId);
  if (!site) return null;
  const snaps = await deps.repo.all();
  const snap: ContentSnapshot | undefined = snaps.find(
    (s) => s.kind === 'landing' && s.site_id === siteId && s.slug === slug,
  );
  if (!snap) return null;
  return toPublicPost(snap); // draft landing → null (404)
}