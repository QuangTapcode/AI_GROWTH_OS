import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import {
  CommunityHubService,
  normalizePublishTarget,
} from '../../src/modules/community/hub';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '11111111-1111-4000-8000-000000000001';
const GROUP_CHANNEL_ID = 'c2000000-0000-4000-8000-000000000002';
const FANPAGE_CHANNEL_ID = 'c1000000-0000-4000-8000-000000000002';
const SOURCE_ID = 's1000000-0000-4000-8000-000000000001';
const SNAPSHOT_ID = 'k1000000-0000-4000-8000-000000000001';

describe('CommunityHubService (Group-first publishing & honest state separation)', () => {
  const originalSessionFile = process.env.FB_SESSION_FILE;
  const originalCookie = process.env.FB_ADMIN_COOKIE;
  const originalPageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  beforeEach(() => {
    delete process.env.FB_ADMIN_COOKIE;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    process.env.FB_SESSION_FILE = path.join(os.tmpdir(), 'vitest-no-fb-session.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalSessionFile === undefined) delete process.env.FB_SESSION_FILE;
    else process.env.FB_SESSION_FILE = originalSessionFile;
    if (originalCookie === undefined) delete process.env.FB_ADMIN_COOKIE;
    else process.env.FB_ADMIN_COOKIE = originalCookie;
    if (originalPageToken === undefined) delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    else process.env.FACEBOOK_PAGE_ACCESS_TOKEN = originalPageToken;
  });

  it('normalizePublishTarget defaults unknown/empty values to group and accepts fanpage/both', () => {
    expect(normalizePublishTarget(undefined)).toBe('group');
    expect(normalizePublishTarget(null)).toBe('group');
    expect(normalizePublishTarget('invalid')).toBe('group');
    expect(normalizePublishTarget('group')).toBe('group');
    expect(normalizePublishTarget('fanpage')).toBe('fanpage');
    expect(normalizePublishTarget('both')).toBe('both');
  });

  it('getCommunitySettings initializes new workspaces with publish_target = "group"', async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM integration_connections')) {
        return { rows: [{ account_ref: '1381196421750749', display_name: 'Dịch vụ hỗ trợ du lịch' }] };
      }
      if (sql.includes('SELECT * FROM community_hub_settings')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const pool = { query, connect: vi.fn() } as unknown as Pool;
    const service = new CommunityHubService(pool);
    const settings = await service.getCommunitySettings(WORKSPACE_ID);

    expect(settings.publish_target).toBe('group');
    expect(settings.group_url).toBe('https://www.facebook.com/groups/1134282109069209');
    expect(
      calls.some((c) => c.sql.includes('INSERT INTO community_hub_settings') && c.sql.includes("'group'")),
    ).toBe(true);
  });

  it('migrateScheduledJobsToGroupChannel moves Fanpage scheduled jobs onto facebook_group and cancels duplicates', async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("platform_name = 'facebook_group'")) {
        return {
          rows: [
            {
              id: GROUP_CHANNEL_ID,
              channel_identifier: 'https://www.facebook.com/groups/1134282109069209',
              display_name: 'Cộng đồng Du lịch & Sống tại Việt Nam',
            },
          ],
        };
      }
      if (sql.includes('UPDATE publishing_jobs j') && sql.includes('SET channel_id = $2')) {
        return { rows: [{ id: 'job-moved-1' }, { id: 'job-moved-2' }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const pool = { query, connect: vi.fn() } as unknown as Pool;
    const service = new CommunityHubService(pool);
    const movedCount = await service.migrateScheduledJobsToGroupChannel(
      WORKSPACE_ID,
      'https://www.facebook.com/groups/1134282109069209',
      'Cộng đồng Du lịch & Sống tại Việt Nam',
    );

    expect(movedCount).toBe(2);
    expect(
      calls.some(
        (c) =>
          c.sql.includes('UPDATE outbox_events') &&
          c.params?.[1] === GROUP_CHANNEL_ID &&
          c.params?.[2] === 'publish:job-moved-1',
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.sql.includes("SET status = 'cancelled'") && c.sql.includes("ch.platform_name = 'facebook'"),
      ),
    ).toBe(true);
  });

  it('immediate publishFreshPlaybookPost fails closed when Group session is missing and never creates a Fanpage fallback job', async () => {
    const origExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (String(p).endsWith('.fb-session.json')) return false;
      return origExistsSync(p);
    });

    const recordedQueries: { sql: string; params?: unknown[] }[] = [];

    const handleQuery = async (sql: string, params?: unknown[]) => {
      recordedQueries.push({ sql, params });

      if (sql.includes('FROM integration_connections')) {
        return { rows: [{ account_ref: '1381196421750749', display_name: 'Dịch vụ hỗ trợ du lịch' }] };
      }
      if (sql.includes('SELECT * FROM community_hub_settings')) {
        return {
          rows: [
            {
              community_name: 'Cộng đồng Du lịch & Sống tại Việt Nam',
              group_url: 'https://www.facebook.com/groups/1134282109069209',
              publish_target: 'group',
              page_name: 'Dịch vụ hỗ trợ du lịch',
              page_url: 'https://www.facebook.com/profile.php?id=61596152213281',
              positioning: 'Cộng đồng du lịch Việt Nam',
              group_member_count: 10,
              week1_target: 5,
              week2_target: 50,
              week3_target: 150,
              week4_target: 300,
              updated_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes("platform_name = 'facebook_group'")) {
        return {
          rows: [
            {
              id: GROUP_CHANNEL_ID,
              channel_identifier: 'https://www.facebook.com/groups/1134282109069209',
              display_name: 'Cộng đồng Du lịch & Sống tại Việt Nam',
            },
          ],
        };
      }
      if (sql.includes('SELECT count(*)::int AS n FROM community_hub_discussions')) {
        return { rows: [{ n: 4 }] };
      }
      if (sql.includes('FROM community_hub_discussions') && sql.includes('LIKE')) {
        return { rows: [{ n: 0 }] };
      }
      if (sql.includes('SELECT id, image_url FROM community_hub_discussions')) {
        return { rows: [] };
      }
      if (sql.includes("WHERE workspace_id = $1 AND role = 'content'")) {
        return { rows: [] };
      }
      if (sql.includes('FROM sources') && sql.includes("https://tripc.ai/blog/%")) {
        return {
          rows: [
            {
              id: SOURCE_ID,
              title: 'Apartment Viewing Checklist in Vietnam',
              source_url: 'https://tripc.ai/blog/apartment-viewing-checklist-vietnam',
              version: 1,
              license: 'TripC',
              attribution: 'TripC',
            },
          ],
        };
      }
      if (sql.includes('SELECT snapshot_id FROM knowledge_contexts')) {
        return { rows: [{ snapshot_id: SNAPSHOT_ID }] };
      }
      if (sql.includes('FROM source_chunks')) {
        return {
          rows: [
            {
              id: 'chunk-1',
              text_content: 'Check mobile signal and water pressure during daytime apartment viewing.',
              citation_locator: 'p1',
            },
          ],
        };
      }
      if (sql.includes('FROM contents c') && sql.includes("c.type = 'blog_post'")) {
        // Pretend Website blog post & approved content artifact already exist (no duplicate `-2` web post)
        return {
          rows: [
            {
              content_id: 'blog-existing-1',
              slug: 'apartment-viewing-checklist-vietnam',
              artifact_id: 'seo-existing-1',
            },
          ],
        };
      }
      if (sql.includes("a.role = 'content'") && sql.includes("ap.status = 'approved'")) {
        return {
          rows: [
            {
              artifact_id: 'content-existing-1',
              content_hash: 'hash-existing-1',
              approval_id: 'approval-existing-1',
              payload: {
                result: {
                  facebook: { text: 'Checklist thuê căn hộ tại Việt Nam' },
                  image_assets: [{ url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267' }],
                  alt_text: 'Unsplash Apartment',
                },
              },
            },
          ],
        };
      }
      if (sql.includes("c.type = 'social_post'") || sql.includes("type = 'social_post'")) {
        return { rows: [{ id: 'social-existing-1' }] };
      }
      if (sql.includes('INSERT INTO publishing_jobs')) {
        return { rows: [{ id: 'group-job-1' }] };
      }
      return { rows: [], rowCount: 0 };
    };

    const client = { query: vi.fn(handleQuery), release: vi.fn() };
    const pool = {
      query: vi.fn(handleQuery),
      connect: vi.fn(async () => client),
    } as unknown as Pool;

    const service = new CommunityHubService(pool);
    const res = await service.publishFreshPlaybookPost(WORKSPACE_ID, ACTOR_ID, { source_id: SOURCE_ID });

    expect(res.status).toBe('group_session_required');
    expect((res as { error_code?: string }).error_code).toBe('FACEBOOK_GROUP_SESSION_MISSING');
    expect(res.website_slug).toBe('apartment-viewing-checklist-vietnam');
    expect(res.publishing_job_id).toBe('group-job-1');

    // Never queries/inserts a Fanpage ('facebook') channel job when publish_target === 'group'
    expect(
      recordedQueries.some(
        (q) => q.sql.includes("platform_name = 'facebook'") && q.sql.includes('SELECT id FROM channels'),
      ),
    ).toBe(false);
    // Inserts the publishing_jobs row onto the Group channel with 'publishing' before failing it closed
    expect(
      recordedQueries.some(
        (q) =>
          q.sql.includes('INSERT INTO publishing_jobs') &&
          q.params?.[1] === GROUP_CHANNEL_ID &&
          q.params?.[3] === 'publishing',
      ),
    ).toBe(true);
    // Marks the Group job and outbox_event as failed with FACEBOOK_GROUP_SESSION_MISSING
    expect(
      recordedQueries.some(
        (q) =>
          q.sql.includes("UPDATE publishing_jobs SET status = 'failed'") &&
          typeof q.params?.[1] === 'string' &&
          q.params[1].includes('FACEBOOK_GROUP_SESSION_MISSING'),
      ),
    ).toBe(true);
  });

  it('getHubData separates Group publishing state from historical Fanpage-only posts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        url: 'https://www.facebook.com/login',
        text: async () => '',
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );

    const origExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (String(p).endsWith('.fb-session.json')) return false;
      return origExistsSync(p);
    });

    const publishedAt = new Date('2026-11-06T07:52:00.000Z');
    const scheduledGroupAt = new Date('2026-11-10T02:00:00.000Z');

    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM integration_connections')) {
        return { rows: [{ account_ref: '1381196421750749', display_name: 'Dịch vụ hỗ trợ du lịch' }] };
      }
      if (sql.includes('SELECT * FROM community_hub_settings')) {
        return {
          rows: [
            {
              community_name: 'Cộng đồng Du lịch & Sống tại Việt Nam',
              group_url: 'https://www.facebook.com/groups/1134282109069209',
              publish_target: 'group',
              page_name: 'Dịch vụ hỗ trợ du lịch',
              page_url: 'https://www.facebook.com/profile.php?id=61596152213281',
              positioning: 'Cộng đồng',
              group_member_count: 10,
              week1_target: 5,
              week2_target: 50,
              week3_target: 150,
              week4_target: 300,
              updated_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes("platform_name = 'facebook_group'")) {
        return {
          rows: [
            {
              id: GROUP_CHANNEL_ID,
              channel_identifier: 'https://www.facebook.com/groups/1134282109069209',
              display_name: 'Cộng đồng Du lịch & Sống tại Việt Nam',
            },
          ],
        };
      }
      if (sql.includes('SELECT count(*)::int AS n FROM community_hub_discussions')) {
        return { rows: [{ n: 1 }] };
      }
      if (sql.includes('FROM community_hub_discussions') && sql.includes('LIKE')) {
        return { rows: [{ n: 0 }] };
      }
      if (sql.includes('FROM sources') && sql.includes("https://tripc.ai/blog/%")) {
        return {
          rows: [
            {
              id: SOURCE_ID,
              title: 'Apartment Viewing Checklist in Vietnam',
              source_url: 'https://tripc.ai/blog/apartment-viewing-checklist-vietnam',
              version: 1,
            },
          ],
        };
      }
      if (sql.includes('FROM community_hub_members')) {
        return { rows: [] };
      }
      if (sql.includes('FROM community_hub_discussions') && sql.includes('ORDER BY created_at DESC')) {
        return { rows: [] };
      }
      if (sql.includes("ch.platform_name IN ('facebook_group', 'facebook')") && sql.includes("j.status IN ('published'")) {
        return {
          rows: [
            {
              source_id: SOURCE_ID,
              status: 'published',
              scheduled_for: publishedAt,
              platform_name: 'facebook',
            },
          ],
        };
      }
      if (sql.includes("j.status = 'published'") && sql.includes("ch.platform_name IN ('facebook_group', 'facebook')")) {
        // Published ONLY on legacy Fanpage, NOT in Group
        return {
          rows: [
            {
              job_id: FANPAGE_CHANNEL_ID,
              external_post_id: '1381196421750749_1220987777',
              published_at: publishedAt,
              platform_name: 'facebook',
              utm_url: null,
              source_id: SOURCE_ID,
              img_url: null,
            },
          ],
        };
      }
      if (sql.includes("j.status IN ('scheduled', 'publishing', 'failed')")) {
        // Active scheduled job waiting for Facebook Group
        return {
          rows: [
            {
              job_id: 'group-sched-1',
              scheduled_for: scheduledGroupAt,
              status: 'scheduled',
              error_message: null,
              platform_name: 'facebook_group',
              utm_url: 'https://www.facebook.com/groups/1134282109069209',
              source_id: SOURCE_ID,
              img_url: null,
            },
          ],
        };
      }
      if (sql.includes('FROM community_group_posts')) {
        return { rows: [] };
      }
      if (sql.includes('FROM contents c') && sql.includes("c.type = 'blog_post'")) {
        return {
          rows: [
            {
              id: 'blog-1',
              title: 'Apartment Viewing Checklist in Vietnam',
              slug: 'apartment-viewing-checklist-vietnam',
              published_at: publishedAt,
              artifact_id: 'seo-1',
              source_id: SOURCE_ID,
            },
          ],
        };
      }
      if (sql.includes('approved_sources') && sql.includes('embedded_chunks')) {
        return {
          rows: [
            {
              approved_sources: 25,
              total_chunks: 430,
              embedded_chunks: 430,
              inbound_messages: 6,
              grounded_replies: 6,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { query, connect: vi.fn() } as unknown as Pool;
    const service = new CommunityHubService(pool);
    const hub = await service.getHubData(WORKSPACE_ID);

    expect(hub.group.publish_target).toBe('group');
    expect(hub.group.group_bot_session).toEqual({ isLoggedIn: false, sessionSource: 'none' });
    expect(hub.stats.published_group_count).toBe(0);
    expect(hub.stats.published_fanpage_count).toBe(1);
    expect(hub.stats.published_topics_count).toBe(0);
    expect(hub.stats.scheduled_group_count).toBe(1);

    expect(hub.calendar.daily).toHaveLength(1);
    const card = hub.calendar.daily[0];
    expect(card.is_published_fanpage).toBe(true);
    expect(card.is_published_group).toBe(false);
    expect(card.group_status).toBe('scheduled');
    expect(card.status).toBe('ready_to_publish');
    expect(card.job_status).toBe('scheduled');
    expect(card.group_post_url).toBeNull();
    expect(card.fanpage_post_url).toBe('https://www.facebook.com/1381196421750749_1220987777');
  });
});

