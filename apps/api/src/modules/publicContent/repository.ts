import type { ContentSnapshot } from './dto';

/**
 * Seed mock CHO W1-MY-05 (W1 dùng labeled seed/mocks; M10 publish W3 sẽ
 * thay bằng snapshot thật). Có chủ đích record draft/member/lead/other-site
 * để test chứng minh chúng KHÔNG ra public.
 * Tất cả dữ liệu synthetic, không phải facts thật.
 */
export const MOCK_SNAPSHOTS: ContentSnapshot[] = [
  {
    id: '10000000-0000-4000-8000-000000000101',
    kind: 'post',
    site_id: 'tripc-pilot',
    workspace_id: '10000000-0000-4000-8000-000000000001',
    status: 'published',
    title: 'Housing Guide for Expats in Da Nang',
    slug: 'housing-guide-da-nang',
    body: 'Synthetic overview of rental options in Da Nang.',
    meta: {
      description: 'Synthetic housing guide.',
      tags: ['housing', 'da-nang'],
      locale: 'en',
      og_image: '/mock/housing.png',
      // key lạ phải bị strip
      internal_ranking: 'secret-internal-score',
    },
    published_at: '2026-10-01T02:00:00.000Z',
    // internal-only markers — nếu lọt ra response là test fail
    member_id: 'MEMBER-INTERNAL-77',
    author_email: 'author-internal@tripc.internal',
    lead_capture: { list: 'LEADS-INTERNAL-MUST-NOT-LEAK' },
    source_refs: [{ source_id: 'SRC-INTERNAL-1', locator: 'paragraph:2' }],
    evidence: [{ fact: 'EVIDENCE-INTERNAL-1' }],
    review_notes: 'REVIEW-INTERNAL-NOTE',
    preview_token: 'PREVIEW-INTERNAL-TOKEN',
    content_version: 3,
  },
  {
    id: '10000000-0000-4000-8000-000000000102',
    kind: 'post',
    site_id: 'tripc-pilot',
    workspace_id: '10000000-0000-4000-8000-000000000001',
    status: 'published',
    title: 'Best Coworking Spots in Da Nang',
    slug: 'coworking-da-nang',
    body: 'Synthetic coworking round-up.',
    meta: { description: 'Synthetic coworking guide.', tags: ['coworking'], locale: 'en' },
    published_at: '2026-10-03T02:00:00.000Z',
    member_id: 'MEMBER-INTERNAL-78',
    author_email: 'author-internal@tripc.internal',
  },
  {
    id: '10000000-0000-4000-8000-000000000103',
    kind: 'post',
    site_id: 'tripc-pilot',
    workspace_id: '10000000-0000-4000-8000-000000000001',
    status: 'draft',
    title: 'Draft: Unapproved Housing Claims',
    slug: 'draft-housing-unapproved',
    body: 'DRAFT-BODY-SHOULD-NOT-APPEAR',
    meta: { description: 'draft' },
    published_at: null,
    member_id: 'MEMBER-INTERNAL-79',
    author_email: 'draft-author@tripc.internal',
    review_notes: 'REVIEW-INTERNAL-DRAFT',
    preview_token: 'PREVIEW-INTERNAL-DRAFT',
  },
  {
    id: '20000000-0000-4000-8000-000000000101',
    kind: 'post',
    site_id: 'other-site',
    workspace_id: '20000000-0000-4000-8000-000000000001',
    status: 'published',
    title: 'Other Tenant Published Post',
    slug: 'other-tenant-post',
    body: 'OTHER-TENANT-BODY-MUST-NOT-APPEAR',
    meta: { description: 'other tenant' },
    published_at: '2026-10-02T02:00:00.000Z',
  },
  {
    id: '10000000-0000-4000-8000-000000000110',
    kind: 'landing',
    site_id: 'tripc-pilot',
    workspace_id: '10000000-0000-4000-8000-000000000001',
    status: 'published',
    title: 'Living in Da Nang',
    slug: 'living-in-da-nang',
    body: 'Synthetic landing copy for the TripC pilot.',
    meta: { description: 'Synthetic landing.', locale: 'en', tags: ['landing'] },
    published_at: '2026-10-01T02:00:00.000Z',
    lead_capture: { form: 'LEADS-INTERNAL-MUST-NOT-LEAK' },
    member_id: 'MEMBER-INTERNAL-80',
  },
  {
    id: '10000000-0000-4000-8000-000000000111',
    kind: 'landing',
    site_id: 'tripc-pilot',
    workspace_id: '10000000-0000-4000-8000-000000000001',
    status: 'draft',
    title: 'Draft Landing',
    slug: 'draft-landing',
    body: 'DRAFT-LANDING-BODY-MUST-NOT-APPEAR',
    meta: {},
    published_at: null,
    preview_token: 'PREVIEW-INTERNAL-LANDING',
  },
];

export interface PublicContentRepository {
  all(): Promise<ContentSnapshot[]>;
}

export class InMemoryPublicContentRepository implements PublicContentRepository {
  constructor(private readonly snapshots: ContentSnapshot[] = MOCK_SNAPSHOTS) {}

  async all(): Promise<ContentSnapshot[]> {
    return structuredClone(this.snapshots);
  }
}