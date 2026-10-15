import { describe, it, expect } from 'vitest';
import { createPublicContentRoutes } from '../../src/modules/publicContent/routes';
import { InMemoryPublicContentRepository } from '../../src/modules/publicContent/repository';

/**
 * W1-MY-05 — Public posts/landing read.
 * Mock seed có chủ đích record draft/member/lead/other-site → chứng minh
 * whitelist chặn tuyệt đối dữ liệu không công khai.
 */

const PUBLIC_KEYS = ['body', 'meta', 'published_at', 'slug', 'title'];
const PUBLIC_META_KEYS = ['description', 'locale', 'og_image', 'tags'];

/** Mọi item public chỉ được có đúng 5 field; meta chỉ key public. */
function expectPublicShapeOnly(dto: unknown): void {
  expect(dto).not.toBeNull();
  expect(Object.keys(dto as object).sort()).toEqual(PUBLIC_KEYS);
  const meta = (dto as { meta: Record<string, unknown> }).meta;
  for (const key of Object.keys(meta)) {
    expect(PUBLIC_META_KEYS).toContain(key);
  }
}

function routes() {
  return createPublicContentRoutes({ repo: new InMemoryPublicContentRepository() });
}

describe('GET /public/v1/sites/{site_id}/posts (W1-MY-05)', () => {
  it('list chỉ trả published snapshot của site, mới nhất trước, đúng whitelist 5 field', async () => {
    const r = routes();
    const res = await r.handleListPosts({ params: { site_id: 'tripc-pilot' } });

    expect(res.status).toBe(200);
    const items = res.body.items as unknown[];
    expect(items).toHaveLength(2); // draft + other-site bị loại
    expect((items[0] as { slug: string }).slug).toBe('coworking-da-nang'); // mới nhất trước
    expect((items[1] as { slug: string }).slug).toBe('housing-guide-da-nang');
    for (const item of items) expectPublicShapeOnly(item);
    expect(res.body.next_cursor).toBeNull();
  });

  it('meta key lạ (internal_ranking) bị strip', async () => {
    const r = routes();
    const res = await r.handleGetPost({ params: { site_id: 'tripc-pilot', slug: 'housing-guide-da-nang' } });
    expect(res.status).toBe(200);
    const meta = res.body.meta as Record<string, unknown>;
    expect(meta.internal_ranking).toBeUndefined();
    expect(meta).toMatchObject({ description: 'Synthetic housing guide.', locale: 'en' });
  });

  it('GET by slug published → 200 và whitelist 5 field', async () => {
    const r = routes();
    const res = await r.handleGetPost({ params: { site_id: 'tripc-pilot', slug: 'coworking-da-nang' } });
    expect(res.status).toBe(200);
    expectPublicShapeOnly(res.body);
    expect(res.body.title).toBe('Best Coworking Spots in Da Nang');
  });

  it('draft slug → 404, không lộ draft body/preview', async () => {
    const r = routes();
    const res = await r.handleGetPost({ params: { site_id: 'tripc-pilot', slug: 'draft-housing-unapproved' } });
    expect(res.status).toBe(404);
    expect((res.body.error as Record<string, unknown>).code).toBe('PUBLIC_POST_NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('DRAFT-BODY');
    expect(JSON.stringify(res.body)).not.toContain('PREVIEW-INTERNAL-DRAFT');
  });

  it('post của tenant khác (other-site) không đọc được từ tripc-pilot', async () => {
    const r = routes();
    const res = await r.handleGetPost({ params: { site_id: 'tripc-pilot', slug: 'other-tenant-post' } });
    expect(res.status).toBe(404);

    const list = await r.handleListPosts({ params: { site_id: 'tripc-pilot' } });
    const slugs = (list.body.items as Array<{ slug: string }>).map((p) => p.slug);
    expect(slugs).not.toContain('other-tenant-post');
  });

  it('response list không chứa bất kỳ marker dữ liệu nội bộ nào (draft/member/lead/source/evidence)', async () => {
    const r = routes();
    const list = await r.handleListPosts({ params: { site_id: 'tripc-pilot' } });
    const detail = await r.handleGetPost({ params: { site_id: 'tripc-pilot', slug: 'housing-guide-da-nang' } });
    const serialized = JSON.stringify([list.body, detail.body]);

    for (const marker of [
      'DRAFT-BODY',
      'OTHER-TENANT',
      'MEMBER-INTERNAL',
      'author-internal@tripc.internal',
      'LEADS-INTERNAL-MUST-NOT-LEAK',
      'SRC-INTERNAL-1',
      'EVIDENCE-INTERNAL-1',
      'REVIEW-INTERNAL-NOTE',
      'PREVIEW-INTERNAL-TOKEN',
      'secret-internal-score',
      'workspace_id',
      'member_id',
      'lead_capture',
      'source_refs',
      'evidence',
      'preview_token',
      'content_version',
      'status',
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it('site không tồn tại → 404 SITE_NOT_FOUND', async () => {
    const r = routes();
    const res = await r.handleListPosts({ params: { site_id: 'no-such-site' } });
    expect(res.status).toBe(404);
    expect((res.body.error as Record<string, unknown>).code).toBe('SITE_NOT_FOUND');
  });
});

describe('GET landing (W1-MY-05)', () => {
  it('landing published → 200 whitelist 5 field, không lộ lead/member', async () => {
    const r = routes();
    const res = await r.handleGetLanding({ params: { site_id: 'tripc-pilot', slug: 'living-in-da-nang' } });

    expect(res.status).toBe(200);
    expectPublicShapeOnly(res.body);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('LEADS-INTERNAL-MUST-NOT-LEAK');
    expect(serialized).not.toContain('MEMBER-INTERNAL-80');
  });

  it('draft landing → 404', async () => {
    const r = routes();
    const res = await r.handleGetLanding({ params: { site_id: 'tripc-pilot', slug: 'draft-landing' } });
    expect(res.status).toBe(404);
    expect((res.body.error as Record<string, unknown>).code).toBe('PUBLIC_LANDING_NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('DRAFT-LANDING-BODY');
  });
});