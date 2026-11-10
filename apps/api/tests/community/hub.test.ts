import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import {
  CommunityHubService,
  classifyMemberInterests,
  classifyVietnamCalendarWeek,
  getDiscussionImageAssets,
  getTopicImageAssets,
  matchAssetForTopic,
  normalizePublishTarget,
  sanitizeFbAdminName,
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

  it('classifyVietnamCalendarWeek isolates November weeks 1-4 from December week 5+', () => {
    expect(classifyVietnamCalendarWeek('2026-11-01').weekNumber).toBe(0);
    expect(classifyVietnamCalendarWeek('2026-11-02')).toEqual({
      weekNumber: 1,
      dateRange: '02/11/2026 – 08/11/2026',
      weekRangeLabel: 'Tuần 1 (02/11/2026 00:00 – 08/11/2026 23:59)',
    });
    expect(classifyVietnamCalendarWeek('2026-11-08').weekNumber).toBe(1);
    expect(classifyVietnamCalendarWeek('2026-11-10').weekNumber).toBe(2);
    expect(classifyVietnamCalendarWeek('2026-11-22').weekNumber).toBe(3);
    expect(classifyVietnamCalendarWeek('2026-11-30').weekNumber).toBe(4);
    expect(classifyVietnamCalendarWeek('2026-12-01')).toEqual({
      weekNumber: 5,
      dateRange: '01/12/2026 – 07/12/2026',
      weekRangeLabel: 'Tuần 5 (01/12/2026 00:00 – 07/12/2026 23:59)',
    });
    expect(classifyVietnamCalendarWeek('2026-12-07').weekNumber).toBe(5);
    expect(classifyVietnamCalendarWeek('2026-12-08').weekNumber).toBe(6);
  });

  it('provides 27 unique topic assets and 5 disjoint discussion assets with 0% overlap and accurate slug matching', () => {
    const topicAssets = getTopicImageAssets(WORKSPACE_ID);
    const discussionAssets = getDiscussionImageAssets(WORKSPACE_ID);

    expect(topicAssets).toHaveLength(27);
    expect(discussionAssets).toHaveLength(5);

    const topicUrls = new Set(topicAssets.map((a) => a.url));
    const discussionUrls = new Set(discussionAssets.map((a) => a.url));
    expect(topicUrls.size).toBe(27);
    expect(discussionUrls.size).toBe(5);
    for (const url of discussionUrls) {
      expect(topicUrls.has(url)).toBe(false);
    }

    const esimAsset = matchAssetForTopic(
      'eSIM or Local SIM in Vietnam: Which Should You Buy?',
      topicAssets,
      new Set(),
      'https://tripc.ai/blog/vietnam-esim-vs-sim-card',
    );
    expect(esimAsset.match_slug).toBe('vietnam-esim-vs-sim-card');
    expect(esimAsset.url).toContain('photo-1511707171634-5f897ff02aa9');

    const phoAsset = matchAssetForTopic(
      'Cẩm nang Ẩm thực & Quán Phở Ngon tại Đà Nẵng',
      topicAssets,
      new Set(),
      'https://tripc.ai/blog/da-nang-food-and-pho-guide',
    );
    expect(phoAsset.match_slug).toBe('da-nang-food-and-pho-guide');
    expect(phoAsset.url).toContain('photo-1582878826629-29b7ad1cdc43');

    const creditCardAsset = matchAssetForTopic(
      'Do Foreign Credit Cards Work in Vietnam?',
      topicAssets,
      new Set(),
      'https://tripc.ai/blog/credit-cards-in-vietnam',
    );
    expect(creditCardAsset.match_slug).toBe('credit-cards-in-vietnam');
    expect(creditCardAsset.url).toContain('photo-1563013544-824ae1b704d3');
  });

  it('classifyMemberInterests uses word boundaries so similar/simple do not trigger eSIM tags', () => {
    const similarRes = classifyMemberInterests('Looking for a similar place in Da Nang next month');
    expect(similarRes.interest_tags).not.toContain('eSIM & Kết nối Internet');

    const esimRes = classifyMemberInterests('Which eSIM or local SIM works best in Hanoi?');
    expect(esimRes.interest_tags).toContain('eSIM & Kết nối Internet');

    const phoRes = classifyMemberInterests('Xin gợi ý quán phở ngon ở Đà Nẵng');
    expect(phoRes.interest_tags).toContain('Ẩm thực Địa phương');
  });

  it('sendSafeCommunityInvites disables when auto_invite_enabled is false and enforces daily quota ceiling', async () => {
    const queryDisabled = vi.fn(async (sql: string) => {
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
              group_member_count: 5,
              week1_target: 5,
              week2_target: 10,
              week3_target: 18,
              week4_target: 30,
              auto_invite_enabled: false,
              daily_invite_limit: 12,
              updated_at: new Date(),
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const serviceDisabled = new CommunityHubService({ query: queryDisabled } as unknown as Pool);
    const disabledRes = await serviceDisabled.sendSafeCommunityInvites(WORKSPACE_ID);
    expect(disabledRes.disabled).toBe(true);
    expect(disabledRes.invited_count).toBe(0);

    // Now test daily cap reached (sent_today === daily_invite_limit = 12)
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const queryCapReached = vi.fn(async (sql: string) => {
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
              group_member_count: 5,
              week1_target: 5,
              week2_target: 10,
              week3_target: 18,
              week4_target: 30,
              auto_invite_enabled: true,
              daily_invite_limit: 12,
              updated_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes('FROM community_invite_logs') && sql.includes('count(*)::int AS n')) {
        return { rows: [{ n: 12 }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const serviceCap = new CommunityHubService({ query: queryCapReached } as unknown as Pool);
    const capRes = await serviceCap.sendSafeCommunityInvites(WORKSPACE_ID);
    expect(capRes.cap_reached).toBe(true);
    expect(capRes.remaining_today).toBe(0);
    expect(capRes.invited_count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('syncPageComments ingests real Fanpage comments while skipping self-comments from own Page ID', async () => {
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'test-page-token';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'post_1',
                permalink_url: 'https://www.facebook.com/1381196421750749/posts/1',
                comments: {
                  data: [
                    {
                      id: 'cmt_visitor_1',
                      message: 'Cho mình hỏi kinh nghiệm thuê studio ở An Thượng?',
                      created_time: '2026-11-10T08:00:00+0000',
                      from: { id: '999888777', name: 'Hoàng Nam' },
                    },
                    {
                      id: 'cmt_self_page',
                      message: 'Cảm ơn bạn đã quan tâm!',
                      from: { id: '1381196421750749', name: 'Dịch vụ hỗ trợ du lịch' },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const insertedParams: unknown[][] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
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
              group_member_count: 5,
              week1_target: 5,
              week2_target: 10,
              week3_target: 18,
              week4_target: 30,
              updated_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO community_messages')) {
        insertedParams.push(params ?? []);
        return { rows: [{ id: 'cm-new-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const service = new CommunityHubService({ query } as unknown as Pool);
    const res = await service.syncPageComments(WORKSPACE_ID);
    expect(res.ingested).toBe(1);
    expect(res.checked_posts).toBe(1);
    expect(insertedParams).toHaveLength(1);
    expect(insertedParams[0][1]).toBe('cmt_visitor_1');
    expect(insertedParams[0][2]).toBe('Hoàng Nam');
  });

  it('discoverSearxngCommunityOpportunities normalizes outside-FB demand opportunities gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'Kinh nghiệm thuê căn hộ Đà Nẵng 2026',
                url: 'https://www.reddit.com/r/VietNam/comments/abc123/danang',
                content: 'Mình sắp chuyển ra Đà Nẵng làm việc từ xa...',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const service = new CommunityHubService({ query: vi.fn() } as unknown as Pool);
    const opps = await service.discoverSearxngCommunityOpportunities();
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0]).toMatchObject({
      title: 'Kinh nghiệm thuê căn hộ Đà Nẵng 2026',
      domain: 'reddit.com',
    });
  });

  it('getHubData returns post_metrics, engagement_snapshots, growth deltas, calendar engagement, and group recent_comments with rag_reply_text fallback', async () => {
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

    const publishedAt = new Date('2026-11-08T02:00:00.000Z');
    const capturedSqls: string[] = [];

    const query = vi.fn(async (sql: string) => {
      capturedSqls.push(sql);
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
              group_member_count: 7,
              week1_target: 5,
              week2_target: 18,
              week3_target: 33,
              week4_target: 53,
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
      if (sql.includes('FROM community_hub_members')) return { rows: [] };
      if (sql.includes('FROM community_hub_discussions') && sql.includes('ORDER BY created_at DESC')) return { rows: [] };
      if (sql.includes("ch.platform_name IN ('facebook_group', 'facebook')") && sql.includes("j.status IN ('published'")) {
        return {
          rows: [
            {
              source_id: SOURCE_ID,
              status: 'published',
              scheduled_for: publishedAt,
              platform_name: 'facebook_group',
            },
          ],
        };
      }
      if (sql.includes("j.status = 'published'") && sql.includes("ch.platform_name IN ('facebook_group', 'facebook')")) {
        return {
          rows: [
            {
              job_id: 'job-grp-1',
              external_post_id: 'https://www.facebook.com/groups/1134282109069209/posts/999',
              published_at: publishedAt,
              platform_name: 'facebook_group',
              utm_url: 'https://www.facebook.com/groups/1134282109069209',
              source_id: SOURCE_ID,
              img_url: null,
              body_text: 'Checklist xem căn hộ',
            },
          ],
        };
      }
      if (sql.includes('FROM community_group_posts')) {
        return {
          rows: [
            {
              id: 'gp-1',
              source_id: SOURCE_ID,
              publishing_job_id: 'job-grp-1',
              post_title: 'Apartment Viewing Checklist in Vietnam',
              group_url: 'https://www.facebook.com/groups/1134282109069209',
              facebook_post_url: 'https://www.facebook.com/groups/1134282109069209/posts/999',
              image_url: null,
              body_text: 'Checklist xem căn hộ',
              status: 'published',
              error_message: null,
              published_at: publishedAt,
              updated_at: publishedAt,
            },
          ],
        };
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
      if (sql.includes('FROM community_post_metrics')) {
        return {
          rows: [
            {
              id: 'pm-1',
              source_id: SOURCE_ID,
              channel: 'group',
              external_post_key: '999',
              post_title: 'Apartment Viewing Checklist in Vietnam',
              post_url: 'https://www.facebook.com/groups/1134282109069209/posts/999',
              likes_count: 12,
              comments_count: 4,
              shares_count: 2,
              sync_source: 'playwright_group_bot',
              published_at: publishedAt,
              last_synced_at: new Date('2026-11-10T10:00:00.000Z'),
            },
            {
              id: 'pm-2',
              source_id: SOURCE_ID,
              channel: 'fanpage',
              external_post_key: '1381196421750749_1220987777',
              post_title: 'Apartment Viewing Checklist in Vietnam (Page)',
              post_url: 'https://www.facebook.com/1381196421750749_1220987777',
              likes_count: 6,
              comments_count: 2,
              shares_count: 1,
              sync_source: 'meta_graph_api',
              published_at: publishedAt,
              last_synced_at: new Date('2026-11-10T10:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM community_member_snapshots') && sql.includes('ORDER BY captured_at ASC')) {
        return {
          rows: [
            {
              id: 'ms-1',
              group_member_count: 5,
              page_followers_count: 10,
              identified_prospects_count: 3,
              invites_sent_count: 0,
              replies_sent_count: 2,
              campaign_week: 1,
              captured_at: new Date('2026-11-05T09:00:00.000Z'),
            },
            {
              id: 'ms-2',
              group_member_count: 7,
              page_followers_count: 14,
              identified_prospects_count: 6,
              invites_sent_count: 5,
              replies_sent_count: 8,
              campaign_week: 2,
              captured_at: new Date('2026-11-10T10:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM community_member_snapshots') && sql.includes('ORDER BY captured_at DESC')) {
        return {
          rows: [{ group_member_count: 7, page_followers_count: 14, captured_at: new Date() }],
        };
      }
      if (sql.includes('FROM community_post_metric_snapshots')) {
        return {
          rows: [
            {
              id: 'es-1',
              total_posts_tracked: 1,
              total_likes: 4,
              total_comments: 1,
              total_shares: 0,
              group_likes: 3,
              group_comments: 1,
              group_shares: 0,
              page_likes: 1,
              page_comments: 0,
              page_shares: 0,
              group_members: 5,
              captured_at: new Date('2026-11-08T09:00:00.000Z'),
            },
            {
              id: 'es-2',
              total_posts_tracked: 2,
              total_likes: 18,
              total_comments: 6,
              total_shares: 3,
              group_likes: 12,
              group_comments: 4,
              group_shares: 2,
              page_likes: 6,
              page_comments: 2,
              page_shares: 1,
              group_members: 7,
              captured_at: new Date('2026-11-10T10:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM community_messages m')) {
        return {
          rows: [
            {
              id: 'cm-grp-1',
              platform: 'facebook_comment',
              external_id: 'grpcmt:999:abc',
              author_name: 'Tuấn Trần',
              author_contact: 'grpcmt:999:abc',
              content: 'Khu nào thuê căn hộ tiện gần biển?',
              post_url: 'https://www.facebook.com/groups/1134282109069209/posts/999',
              status: 'replied',
              metadata: {
                comment_source: 'group',
                private_invite_sent: true,
                reply_text: 'An Thượng và Sơn Trà rất tiện gần biển.',
              },
              received_at: new Date('2026-11-10T09:00:00.000Z'),
              updated_at: new Date('2026-11-10T09:05:00.000Z'),
              rag_reply_text: 'An Thượng và Sơn Trà rất tiện gần biển.',
              reply_artifact_id: null,
            },
          ],
        };
      }
      if (sql.includes('comments_received_count') && sql.includes('FROM community_messages')) {
        return {
          rows: [
            {
              comments_received_count: 3,
              comments_replied_count: 2,
              messages_received_count: 1,
              messages_replied_count: 1,
              pending_questions_count: 0,
            },
          ],
        };
      }
      if (sql.includes('approved_sources') && sql.includes('embedded_chunks')) {
        return {
          rows: [{ approved_sources: 26, total_chunks: 430, embedded_chunks: 430, inbound_messages: 6, grounded_replies: 6 }],
        };
      }
      return { rows: [] };
    });

    const service = new CommunityHubService({ query, connect: vi.fn() } as unknown as Pool);
    const hub = await service.getHubData(WORKSPACE_ID);

    expect(hub.post_metrics).toHaveLength(2);
    expect(hub.engagement_snapshots).toHaveLength(2);
    expect(hub.stats.total_post_likes).toBe(18);
    expect(hub.stats.total_post_comments).toBe(6);
    expect(hub.stats.total_post_shares).toBe(3);
    expect(hub.stats.total_post_engagement).toBe(27);
    expect(hub.stats.member_growth_delta).toBe(2);
    expect(hub.stats.engagement_growth_delta).toBe(22);

    expect(hub.calendar.daily[0].engagement).toMatchObject({
      likes: 18,
      comments: 6,
      shares: 3,
      total_engagement: 27,
      group_likes: 12,
      page_likes: 6,
    });

    expect(
      capturedSqls.some((s) => s.includes("COALESCE(a.payload->'result'->>'reply', m.metadata->>'reply_text') AS rag_reply_text")),
    ).toBe(true);
    expect(hub.recent_comments[0]).toMatchObject({
      source_channel: 'group_comment',
      status: 'replied',
      rag_reply_text: 'An Thượng và Sơn Trà rất tiện gần biển.',
      invite_sent: true,
    });
  });

  it('syncPostEngagementStats syncs Graph API likes/comments/shares into community_post_metrics and captures snapshot', async () => {
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'test-page-token';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: '1381196421750749_111',
                message: 'Apartment Viewing Checklist in Vietnam',
                permalink_url: 'https://www.facebook.com/1381196421750749/posts/111',
                created_time: '2026-11-08T02:00:00+0000',
                reactions: { summary: { total_count: 14 } },
                comments: { summary: { total_count: 5 } },
                shares: { count: 2 },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const sqlCalls: { sql: string; params?: unknown[] }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      sqlCalls.push({ sql, params });
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
              group_member_count: 7,
              week1_target: 5,
              week2_target: 18,
              week3_target: 33,
              week4_target: 53,
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
      if (sql.includes('SELECT count(*)::int AS n FROM community_hub_discussions')) return { rows: [{ n: 1 }] };
      if (sql.includes('FROM community_hub_discussions') && sql.includes('LIKE')) return { rows: [{ n: 0 }] };
      if (sql.includes('FROM publishing_jobs j') && sql.includes("ch.platform_name = 'facebook'")) {
        return {
          rows: [
            {
              external_post_id: '1381196421750749_111',
              source_id: SOURCE_ID,
              title: 'Apartment Viewing Checklist in Vietnam',
              published_at: new Date('2026-11-08T02:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM community_messages') && sql.includes('GROUP BY 1, 2')) return { rows: [] };
      if (sql.includes('total_posts_tracked') && sql.includes('FROM community_post_metrics')) {
        return {
          rows: [
            {
              total_posts_tracked: 1,
              total_likes: 14,
              total_comments: 5,
              total_shares: 2,
              group_likes: 0,
              group_comments: 0,
              group_shares: 0,
              page_likes: 14,
              page_comments: 5,
              page_shares: 2,
            },
          ],
        };
      }
      if (sql.includes('FROM community_post_metric_snapshots')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });

    const service = new CommunityHubService({ query, connect: vi.fn() } as unknown as Pool);
    const result = await service.syncPostEngagementStats(WORKSPACE_ID, { includeGroupBot: false });

    expect(result.fanpage_posts_synced).toBe(1);
    expect(result.total_likes).toBe(14);
    expect(result.total_comments).toBe(5);
    expect(result.total_shares).toBe(2);

    const metricUpsert = sqlCalls.find((c) => c.sql.includes('INSERT INTO community_post_metrics'));
    expect(metricUpsert).toBeTruthy();
    expect(metricUpsert?.params).toEqual(
      expect.arrayContaining([WORKSPACE_ID, SOURCE_ID, '1381196421750749_111', 14, 5, 2]),
    );
    const snapInsert = sqlCalls.find((c) => c.sql.includes('INSERT INTO community_post_metric_snapshots'));
    expect(snapInsert).toBeTruthy();
    expect(snapInsert?.params).toEqual(expect.arrayContaining([WORKSPACE_ID, 1, 14, 5, 2, 7]));
  });

  it('completeGroupBotLogin detects missing vs saved temp FB_SESSION_FILE without touching real worker session or leaking cookies', async () => {
    const tmpSession = path.join(os.tmpdir(), `vitest-complete-login-${Date.now()}.json`);
    process.env.FB_SESSION_FILE = tmpSession;
    try {
      const service = new CommunityHubService({ query: vi.fn(), connect: vi.fn() } as unknown as Pool);

      const missingRes = await service.completeGroupBotLogin(WORKSPACE_ID);
      expect(missingRes.completed).toBe(false);
      expect(missingRes.session).toEqual({ isLoggedIn: false, sessionSource: 'none' });

      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      fs.writeFileSync(
        tmpSession,
        JSON.stringify({
          cookies: [
            { name: 'c_user', value: '10009988776655', domain: '.facebook.com', expires: futureExp },
            { name: 'xs', value: 'super-secret-xs-value', domain: '.facebook.com', expires: futureExp },
            { name: 'i_user', value: '61596152213281', domain: '.facebook.com', expires: futureExp },
          ],
        }),
        'utf8',
      );

      const savedRes = await service.completeGroupBotLogin(WORKSPACE_ID);
      expect(savedRes.completed).toBe(true);
      expect(savedRes.session).toEqual({
        isLoggedIn: true,
        sessionSource: 'file',
        usingPageProfile: true,
        accountIdMask: '***3281',
      });
      expect(JSON.stringify(savedRes)).not.toContain('super-secret-xs-value');
      expect(JSON.stringify(savedRes)).not.toContain('61596152213281');
      expect(JSON.stringify(savedRes)).not.toContain('10009988776655');
    } finally {
      try {
        if (fs.existsSync(tmpSession)) fs.unlinkSync(tmpSession);
      } catch {}
    }
  });

  it('sanitizeFbAdminName & getCommunitySettings loại bỏ nhãn chrome UI và chỉ giữ tên quản trị viên thật', async () => {
    expect(sanitizeFbAdminName('Tài khoản, trang cá nhân của bạn')).toBeNull();
    expect(sanitizeFbAdminName('Trang cá nhân của bạn')).toBeNull();
    expect(sanitizeFbAdminName('Your profile')).toBeNull();
    expect(sanitizeFbAdminName('Dịch vụ hỗ trợ du lịch')).toBe('Dịch vụ hỗ trợ du lịch');
    expect(sanitizeFbAdminName('Bình luận dưới tên Minh Tuấn')).toBe('Minh Tuấn');

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
              positioning: 'Cộng đồng du lịch Việt Nam',
              group_member_count: 7,
              week1_target: 7,
              week2_target: 18,
              week3_target: 33,
              week4_target: 53,
              fb_admin_name: 'Tài khoản, trang cá nhân của bạn',
              updated_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const service = new CommunityHubService({ query, connect: vi.fn() } as unknown as Pool);
    const settings = await service.getCommunitySettings(WORKSPACE_ID);
    expect(settings.fb_admin_name).toBeNull();
  });

  it('getTelegramBotStatus & syncTelegramBot expose safe bot metadata & counters without leaking TELEGRAM_BOT_TOKEN', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("platform = 'telegram_message'") && sql.includes('conversations_count')) {
        return {
          rows: [{ conversations_count: 4, messages_received_count: 11, messages_replied_count: 9, invites_sent_count: 3 }],
        };
      }
      return { rows: [] };
    });

    const service = new CommunityHubService({ query, connect: vi.fn() } as unknown as Pool);

    const unconfigured = await service.getTelegramBotStatus(WORKSPACE_ID);
    expect(unconfigured).toMatchObject({
      configured: false,
      bot_username: null,
      t_me_url: null,
      conversations_count: 4,
      messages_received_count: 11,
      messages_replied_count: 9,
      invites_sent_count: 3,
    });

    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:SUPER_SECRET_BOT_TOKEN');
    vi.stubEnv('TELEGRAM_BOT_MODE', 'polling');
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { username: 'tripc_helper_bot', first_name: 'TripC Buddy' } }));
      }
      if (url.endsWith('/getWebhookInfo')) {
        return new Response(JSON.stringify({ ok: true, result: { url: '', pending_update_count: 0 } }));
      }
      if (url.endsWith('/setMyCommands') || url.endsWith('/deleteWebhook')) {
        return new Response(JSON.stringify({ ok: true, result: true }));
      }
      return new Response(JSON.stringify({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const synced = await service.syncTelegramBot(WORKSPACE_ID);
      expect(synced.success).toBe(true);
      expect(synced.telegram_bot).toMatchObject({
        configured: true,
        mode: 'polling',
        bot_username: 'tripc_helper_bot',
        bot_name: 'TripC Buddy',
        t_me_url: 'https://t.me/tripc_helper_bot',
        conversations_count: 4,
        invites_sent_count: 3,
      });
      expect(JSON.stringify(synced)).not.toContain('SUPER_SECRET_BOT_TOKEN');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

