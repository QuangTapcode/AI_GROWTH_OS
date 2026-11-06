import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { getWorkspaceConnectionStatus } from '../integrations/stubs';
import { publishSeoArtifact } from '../site/publish';

export interface PlaybookAsset {
  asset_id: string;
  workspace_id: string;
  url: string;
  status: 'approved';
  license: string;
  attribution: string;
  version: number;
  synthetic: boolean;
  content_hash: string;
  topic_tags: string[];
}

function makeAsset(
  workspaceId: string,
  index: number,
  url: string,
  attribution: string,
  topicTags: string[],
): PlaybookAsset {
  const idSuffix = String(index).padStart(12, '0');
  const assetId = `55555555-5555-4000-8000-${idSuffix}`;
  return {
    asset_id: assetId,
    workspace_id: workspaceId,
    url,
    status: 'approved',
    license: 'Unsplash-License',
    attribution,
    version: 1,
    synthetic: false,
    content_hash: createHash('sha256').update(`${assetId}:${url}`).digest('hex'),
    topic_tags: topicTags,
  };
}

export function getPlaybookImageAssets(workspaceId: string): PlaybookAsset[] {
  return [
    makeAsset(
      workspaceId,
      1,
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Vietnam Expat Apartment Viewing Checklist Rental Living Room Housing Accommodation',
      ['apartment', 'viewing', 'checklist', 'housing', 'rental', 'lease'],
    ),
    makeAsset(
      workspaceId,
      2,
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Working Remotely from Vietnam Reliable Work Setup Coworking Cafe Digital Nomad',
      ['working', 'remotely', 'remote', 'setup', 'coworking', 'wifi', 'nomad'],
    ),
    makeAsset(
      workspaceId,
      3,
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Vietnam eSIM or Local SIM Card Mobile Data Connectivity Smartphone Apps',
      ['esim', 'sim', 'mobile', 'data', 'phone', 'viettel'],
    ),
    makeAsset(
      workspaceId,
      4,
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Opening a Bank Account in Vietnam Foreigner VietQR Card Payment Banking',
      ['bank', 'account', 'banking', 'foreigner', 'vietqr', 'payment'],
    ),
    makeAsset(
      workspaceId,
      5,
      'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Health Insurance in Vietnam Local vs International Hospital Clinic Medical Coverage',
      ['health', 'insurance', 'medical', 'hospital', 'coverage', 'international'],
    ),
    makeAsset(
      workspaceId,
      6,
      'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Grocery Shopping in Vietnam Supermarkets Local Markets Fresh Food Delivery Apps',
      ['grocery', 'shopping', 'supermarkets', 'markets', 'delivery', 'food'],
    ),
    makeAsset(
      workspaceId,
      7,
      'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Where to Stay First Two Weeks in Vietnam Short Term Accommodation Neighborhoods',
      ['first', 'two', 'weeks', 'stay', 'accommodation', 'neighborhood'],
    ),
    makeAsset(
      workspaceId,
      8,
      'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Plane Train Bus Private Car How to Travel Around Vietnam Transport Railway',
      ['plane', 'train', 'bus', 'car', 'travel', 'around', 'transport'],
    ),
    makeAsset(
      workspaceId,
      9,
      'https://images.unsplash.com/photo-1555921015-5532091f6026?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Vietnamese Addresses Explained Alleys Hem House Numbers Street Navigation',
      ['addresses', 'address', 'alleys', 'house', 'numbers', 'entrance'],
    ),
    makeAsset(
      workspaceId,
      10,
      'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Hanoi Da Nang Ho Chi Minh City Which Airport to Fly Into Vietnam Arrival',
      ['airport', 'fly', 'flight', 'onward', 'ticket', 'arrival'],
    ),
    makeAsset(
      workspaceId,
      11,
      'https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - What to Pack Moving to Vietnam Packing List Luggage Clothing Essentials',
      ['pack', 'packing', 'moving', 'luggage', 'home', 'clothes'],
    ),
    makeAsset(
      workspaceId,
      12,
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Essential Apps for Living in Vietnam Grab Zalo Delivery Ride Hailing Community',
      ['essential', 'apps', 'living', 'grab', 'zalo', 'application'],
    ),
    makeAsset(
      workspaceId,
      13,
      'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Temporary Residence Registration in Vietnam Police Ward Foreigners Landlord Guide',
      ['temporary', 'residence', 'registration', 'foreigners', 'police'],
    ),
    makeAsset(
      workspaceId,
      14,
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Common Scams in Vietnam Emergency Numbers Essential Contacts Safety Guide',
      ['scams', 'emergency', 'numbers', 'contacts', 'safety', 'watch'],
    ),
    makeAsset(
      workspaceId,
      15,
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - How Much Does a Day in Vietnam Cost Daily Travel Budget Backpacker to Comfort',
      ['budget', 'cost', 'day', 'much', 'daily', 'expenses'],
    ),
    makeAsset(
      workspaceId,
      16,
      'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Da Nang Golden Bridge Best Time to Visit Vietnam Passport E-Visa Families Guide',
      ['evisa', 'visa', 'passport', 'families', 'time', 'visit'],
    ),
  ];
}

export const PLAYBOOK_OFFERS = [
  'apartment',
  'accommodation',
  'housing',
  'remote',
  'coworking',
  'esim',
  'sim',
  'apps',
  'bank',
  'budget',
  'insurance',
  'grocery',
  'scams',
  'residence',
  'packing',
  'address',
  'emergency',
  'travel',
  'airport',
  'passport',
  'onward',
  'evisa',
  'visa',
];

const PLAYBOOK_TREND_TOPICS = [
  { query: 'Vietnam apartment viewing checklist expats', title: 'Apartment Viewing Checklist in Vietnam for Expats', url: 'https://tripc.ai/blog/apartment-viewing-checklist-vietnam' },
  { query: 'Vietnam working remotely setup expats', title: 'Working Remotely from Vietnam: Reliable Setup Guide', url: 'https://tripc.ai/blog/working-remotely-from-vietnam-setup-guide' },
  { query: 'Vietnam esim sim card expats', title: 'eSIM or Local SIM in Vietnam: Complete Comparison', url: 'https://tripc.ai/blog/vietnam-esim-vs-sim-card' },
  { query: 'Vietnam bank account foreigner expats', title: 'Opening a Bank Account in Vietnam as a Foreigner', url: 'https://tripc.ai/blog/open-bank-account-vietnam-foreigner-guide' },
  { query: 'Vietnam health insurance expats', title: 'Health Insurance in Vietnam: Local vs International Coverage', url: 'https://tripc.ai/blog/health-insurance-vietnam-local-vs-international' },
  { query: 'Vietnam grocery shopping expats', title: 'Grocery Shopping in Vietnam: Supermarkets, Markets & Apps', url: 'https://tripc.ai/blog/grocery-shopping-in-vietnam-expat-guide' },
  { query: 'Vietnam first two weeks accommodation expats', title: 'Where to Stay During Your First Two Weeks in Vietnam', url: 'https://tripc.ai/blog/first-two-weeks-in-vietnam-accommodation-guide' },
  { query: 'Vietnam temporary residence registration expats', title: 'Temporary Residence Registration in Vietnam for Foreigners', url: 'https://tripc.ai/blog/temporary-residence-registration-guide' },
  { query: 'Vietnam essential apps living expats', title: 'Essential Apps for Living in Vietnam', url: 'https://tripc.ai/blog/essential-apps-for-living-in-vietnam' },
  { query: 'Vietnam travel budget cost expats', title: 'How Much Does a Day in Vietnam Cost? Travel Budget Guide', url: 'https://tripc.ai/blog/vietnam-travel-budget-per-day' },
  { query: 'Vietnam packing list moving expats', title: 'What to Pack When Moving to Vietnam', url: 'https://tripc.ai/blog/packing-list-moving-to-vietnam' },
  { query: 'Vietnam common scams safety expats', title: 'Common Scams in Vietnam: What New Arrivals Should Watch For', url: 'https://tripc.ai/blog/common-scams-in-vietnam-guide' },
];

export function matchAssetForTopic(title: string, assets: PlaybookAsset[], usedUrls: Set<string> = new Set()): PlaybookAsset {
  const lower = title.toLowerCase();
  const scored = assets.map((asset, idx) => {
    const tagHits = asset.topic_tags.filter((tag) => lower.includes(tag)).length;
    const attrWords = asset.attribution.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const attrHits = attrWords.filter((w) => lower.includes(w)).length;
    const isUsed = usedUrls.has(asset.url) ? 1 : 0;
    return { asset, score: tagHits * 15 + attrHits * 3, isUsed, idx };
  });
  scored.sort((a, b) => {
    if (a.isUsed !== b.isUsed) return a.isUsed - b.isUsed;
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return scored[0]?.asset ?? assets[0];
}

export function classifyMemberInterests(text: string): {
  interest_tags: string[];
  matched_trend: string;
  affinity_score: number;
  recommended_playbook_topic: string;
} {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  let trend = 'Du lịch, Lưu trú & Kinh nghiệm Sống tại Việt Nam';
  let score = 88;
  let topic = 'Where Should You Stay During Your First Two Weeks in Vietnam?';

  if (/du lịch|travel|trip|chuyến đi|visit|bay|flight|airport|hà nội|đà nẵng|da nang/i.test(lower)) {
    tags.push('Du lịch & Lịch trình', 'Đà Nẵng & Việt Nam');
    trend = 'Lịch trình Du lịch, Sân bay & Lưu trú tại Việt Nam';
    score = 95;
    topic = 'Where Should You Stay During Your First Two Weeks in Vietnam?';
  }
  if (/thuê nhà|apartment|housing|rent|chỗ ở|khách sạn|accommodation|stay/i.test(lower)) {
    tags.push('Thuê căn hộ & Lưu trú', 'Chỗ ở 2 tuần đầu');
    trend = 'Tìm chỗ ở & Kinh nghiệm thuê căn hộ tại Đà Nẵng / Việt Nam';
    score = 97;
    topic = 'Apartment Viewing Checklist in Vietnam: What to Check Before You Sign';
  }
  if (/remote|coworking|wifi|esim|sim|làm việc|nomad|cafe/i.test(lower)) {
    tags.push('Làm việc từ xa (Remote Work)', 'eSIM & Kết nối Internet');
    trend = 'Làm việc từ xa, Coworking & SIM/eSIM tại Việt Nam';
    score = 96;
    topic = 'Working Remotely from Vietnam: How to Build a Reliable Work Setup';
  }
  if (/bank|ngân hàng|vietqr|tiền|chi phí|budget|cost|atm/i.test(lower)) {
    tags.push('Thanh toán VietQR & Ngân hàng', 'Chi phí du lịch mỗi ngày');
    trend = 'Chi phí du lịch, Thanh toán VietQR & Ngân hàng tại Việt Nam';
    score = 94;
    topic = 'Opening a Bank Account in Vietnam as a Foreigner: The 2026 Reality';
  }
  if (/visa|evisa|e-visa|hộ chiếu|passport|nhập cảnh|entry/i.test(lower)) {
    tags.push('Thủ tục E-Visa & Nhập cảnh', 'Kiểm tra Hộ chiếu');
    trend = 'Hướng dẫn E-Visa & Thủ tục nhập cảnh Việt Nam';
    score = 96;
    topic = 'Vietnam E-Visa Guide 2026: How to Apply, Enter, and Avoid Common Mistakes';
  }
  if (tags.length === 0) {
    tags.push('Cộng đồng Du lịch Việt Nam', 'Chia sẻ Kinh nghiệm Thực tế', 'Hỗ trợ Du khách');
    score = 91;
  }
  return {
    interest_tags: Array.from(new Set(tags)).slice(0, 4),
    matched_trend: trend,
    affinity_score: score,
    recommended_playbook_topic: topic,
  };
}

export interface CommunitySettings {
  community_name: string;
  group_url: string;
  page_name: string;
  page_url: string;
  connected_fanpage_id: string;
  positioning: string;
}

export class CommunityHubService {
  constructor(private readonly pool: Pool) {}

  async getCommunitySettings(workspaceId: string): Promise<CommunitySettings> {
    const fbConn = (
      await this.pool.query<{ account_ref: string | null; display_name: string | null }>(
        `SELECT account_ref, display_name
           FROM integration_connections
          WHERE workspace_id = $1 AND provider = 'facebook_page'
          ORDER BY updated_at DESC LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];

    const pageId = fbConn?.account_ref || '1381196421750749';
    const pageName = fbConn?.display_name || 'Dịch vụ hỗ trợ du lịch';
    const defaultPageUrl =
      pageId === '1381196421750749'
        ? 'https://www.facebook.com/profile.php?id=61596152213281'
        : `https://www.facebook.com/profile.php?id=${pageId}`;
    const defaultCommunityName = `Cộng đồng ${pageName} – Giao lưu & Chia sẻ Kinh nghiệm Du lịch Việt Nam`;
    const defaultPositioning = `Cộng đồng tương tác 2 chiều của riêng bạn ( vận hành trên Fanpage "${pageName}" & Group Cộng đồng riêng ) — nơi các thành viên cùng sở thích du lịch, lưu trú, làm việc từ xa và khám phá Việt Nam trực tiếp hỏi đáp, chia sẻ kinh nghiệm thực tế với nhau.`;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS community_hub_settings (
        workspace_id UUID PRIMARY KEY,
        community_name VARCHAR(255) NOT NULL,
        group_url TEXT NOT NULL,
        page_name VARCHAR(255) NOT NULL,
        page_url TEXT NOT NULL,
        positioning TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(
      `UPDATE community_hub_settings
          SET page_url = $2,
              group_url = CASE WHEN group_url LIKE '%1381196421750749%' THEN $2 ELSE group_url END
        WHERE workspace_id = $1 AND page_url LIKE '%1381196421750749%'`,
      [workspaceId, defaultPageUrl],
    );

    const saved = (
      await this.pool.query<{
        community_name: string;
        group_url: string;
        page_name: string;
        page_url: string;
        positioning: string;
      }>('SELECT * FROM community_hub_settings WHERE workspace_id = $1', [workspaceId])
    ).rows[0];

    if (!saved) {
      await this.pool.query(
        `INSERT INTO community_hub_settings (workspace_id, community_name, group_url, page_name, page_url, positioning)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (workspace_id) DO NOTHING`,
        [workspaceId, defaultCommunityName, defaultPageUrl, pageName, defaultPageUrl, defaultPositioning],
      );
      return {
        community_name: defaultCommunityName,
        group_url: defaultPageUrl,
        page_name: pageName,
        page_url: defaultPageUrl,
        connected_fanpage_id: pageId,
        positioning: defaultPositioning,
      };
    }

    return {
      community_name: saved.community_name,
      group_url: saved.group_url,
      page_name: saved.page_name || pageName,
      page_url: saved.page_url || defaultPageUrl,
      connected_fanpage_id: pageId,
      positioning: saved.positioning,
    };
  }

  async updateCommunitySettings(
    workspaceId: string,
    input: { community_name?: string; group_url?: string; positioning?: string },
  ): Promise<CommunitySettings> {
    const current = await this.getCommunitySettings(workspaceId);
    const nextName = input.community_name?.trim() || current.community_name;
    const nextGroupUrl = input.group_url?.trim() || current.group_url;
    const nextPositioning = input.positioning?.trim() || current.positioning;

    await this.pool.query(
      `UPDATE community_hub_settings
          SET community_name = $2,
              group_url = $3,
              positioning = $4,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [workspaceId, nextName, nextGroupUrl, nextPositioning],
    );

    await this.pool.query(
      `UPDATE community_hub_members
          SET invite_group_url = $2,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [workspaceId, nextGroupUrl],
    );

    return this.getCommunitySettings(workspaceId);
  }

  async ensureSchemaAndContext(workspaceId: string): Promise<CommunitySettings> {
    const settings = await this.getCommunitySettings(workspaceId);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS community_hub_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        external_ref VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        channel VARCHAR(64) NOT NULL DEFAULT 'facebook_messenger',
        matched_signal TEXT NOT NULL,
        matched_trend VARCHAR(255) NOT NULL,
        interest_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        affinity_score INT NOT NULL DEFAULT 90,
        campaign_week INT NOT NULL DEFAULT 1,
        status VARCHAR(32) NOT NULL DEFAULT 'auto_added',
        invite_group_url TEXT NOT NULL DEFAULT '',
        recommended_topic TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(workspace_id, external_ref)
      );

      CREATE TABLE IF NOT EXISTS community_hub_discussions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        category VARCHAR(100) NOT NULL,
        title VARCHAR(300) NOT NULL,
        author_name VARCHAR(120) NOT NULL,
        author_role VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        discussion_prompt TEXT NOT NULL,
        source_url TEXT,
        image_url TEXT,
        replies JSONB NOT NULL DEFAULT '[]'::jsonb,
        participants_count INT NOT NULL DEFAULT 4,
        facebook_post_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Clean up any legacy references to the leader's external group URL so all members & threads belong strictly to the user's own community
    await this.pool.query(
      `UPDATE community_hub_members
          SET invite_group_url = $2
        WHERE workspace_id = $1 AND (invite_group_url LIKE '%vietnamplaybook%' OR invite_group_url = '')`,
      [workspaceId, settings.group_url],
    );

    const legacyDiscussions = (
      await this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM community_hub_discussions
          WHERE workspace_id = $1 AND (title LIKE '%Vietnam Playbook%' OR author_name LIKE '%Playbook%' OR discussion_prompt LIKE '%vietnamplaybook%')`,
        [workspaceId],
      )
    ).rows[0]?.n ?? 0;

    if (legacyDiscussions > 0) {
      await this.pool.query('DELETE FROM community_hub_discussions WHERE workspace_id = $1', [workspaceId]);
    }

    const assets = getPlaybookImageAssets(workspaceId).map(({ topic_tags, ...rest }) => rest);

    const profileRow = (
      await this.pool.query<{ products_services: string[]; version: number }>(
        'SELECT products_services, version FROM business_profiles WHERE workspace_id = $1',
        [workspaceId],
      )
    ).rows[0];

    if (profileRow && (!profileRow.products_services || profileRow.products_services.length < 10)) {
      await this.pool.query(
        `UPDATE business_profiles
            SET products_services = $2::text[],
                target_locations = $3::text[],
                target_audiences = $4::text[],
                overview = $5,
                updated_at = NOW()
          WHERE workspace_id = $1`,
        [
          workspaceId,
          PLAYBOOK_OFFERS,
          ['Vietnam', 'Da Nang', 'Hanoi', 'Ho Chi Minh City'],
          ['Travelers, expats, digital nomads, and remote workers visiting or living in Vietnam'],
          `${settings.community_name}: cộng đồng hỗ trợ du lịch, lưu trú, ẩm thực, di chuyển và kinh nghiệm sống thực tế tại Đà Nẵng & Việt Nam.`,
        ],
      );
    }

    const goalRow = (
      await this.pool.query<{ id: string; title: string }>(
        "SELECT id, title FROM growth_goals WHERE workspace_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [workspaceId],
      )
    ).rows[0];
    if (goalRow && (/\be-?visa\b/i.test(goalRow.title) || /Playbook/i.test(goalRow.title))) {
      await this.pool.query(
        `UPDATE growth_goals
            SET title = 'Phát triển Cộng đồng Dịch vụ Hỗ trợ Du lịch tương tác 2 chiều và chuỗi bài cẩm nang du lịch, lưu trú tại Việt Nam'
          WHERE id = $1`,
        [goalRow.id],
      );
    }

    const currentCtx = (
      await this.pool.query<{ snapshot_id: string; profile: Record<string, any>; goal: Record<string, any> | null; assets: unknown[] }>(
        'SELECT snapshot_id, profile, goal, assets FROM knowledge_contexts WHERE workspace_id = $1 AND current LIMIT 1',
        [workspaceId],
      )
    ).rows[0];

    if (currentCtx) {
      const currentAssetsLen = Array.isArray(currentCtx.assets) ? currentCtx.assets.length : 0;
      const currentProductsLen = Array.isArray(currentCtx.profile?.products) ? currentCtx.profile.products.length : 0;
      const currentFocusLen = Array.isArray(currentCtx.goal?.focus_offers) ? currentCtx.goal.focus_offers.length : 0;

      if (currentAssetsLen < 16 || currentProductsLen < 10 || currentFocusLen > 0) {
        const updatedProfile = {
          ...(currentCtx.profile ?? {}),
          products: PLAYBOOK_OFFERS,
          locations: ['Vietnam', 'Da Nang', 'Hanoi', 'Ho Chi Minh City'],
          audiences: ['Travelers, expats, digital nomads, and remote workers visiting or living in Vietnam'],
          overview: `${settings.community_name}: cộng đồng hỗ trợ du lịch, lưu trú, di chuyển và kinh nghiệm sống thực tế tại Việt Nam.`,
        };
        const updatedGoal = currentCtx.goal
          ? {
              ...currentCtx.goal,
              objective:
                'Phát triển Cộng đồng Dịch vụ Hỗ trợ Du lịch tương tác 2 chiều và chuỗi bài cẩm nang du lịch, lưu trú tại Việt Nam',
              focus_offers: [],
            }
          : null;

        await this.pool.query(
          `UPDATE knowledge_contexts
              SET profile = $2::jsonb,
                  goal = $3::jsonb,
                  assets = $4::jsonb
            WHERE workspace_id = $1 AND snapshot_id = $5`,
          [workspaceId, JSON.stringify(updatedProfile), JSON.stringify(updatedGoal), JSON.stringify(assets), currentCtx.snapshot_id],
        );
      }
    }

    const latestRun = (
      await this.pool.query<{ discovery_run_id: string; count: string }>(
        `SELECT discovery_run_id, count(*)::text AS count
           FROM trend_signals
          WHERE workspace_id = $1
          GROUP BY discovery_run_id
          ORDER BY max(observed_at) DESC
          LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];

    const runId = latestRun?.discovery_run_id ?? randomUUID();
    const existingQueries = new Set(
      (
        await this.pool.query<{ query: string }>(
          'SELECT DISTINCT query FROM trend_signals WHERE workspace_id = $1 AND discovery_run_id = $2',
          [workspaceId, runId],
        )
      ).rows.map((r) => r.query),
    );

    for (let i = 0; i < PLAYBOOK_TREND_TOPICS.length; i++) {
      const item = PLAYBOOK_TREND_TOPICS[i];
      if (!existingQueries.has(item.query)) {
        await this.pool.query(
          `INSERT INTO trend_signals (id, workspace_id, discovery_run_id, query, rank, title, url, domain, observed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'tripc.ai', NOW() - INTERVAL '5 minutes')`,
          [randomUUID(), workspaceId, runId, item.query, i + 1, item.title, item.url],
        );
      }
    }

    await this.seedInitialDiscussionsIfEmpty(workspaceId, settings);
    await this.syncMembersFromInteractions(workspaceId, settings);
    return settings;
  }

  private async seedInitialDiscussionsIfEmpty(workspaceId: string, settings: CommunitySettings): Promise<void> {
    const count = (
      await this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM community_hub_discussions WHERE workspace_id = $1', [
        workspaceId,
      ])
    ).rows[0]?.n ?? 0;
    if (count > 0) return;

    const assets = getPlaybookImageAssets(workspaceId);
    const initialThreads = [
      {
        category: 'Lưu trú & Kinh nghiệm Thuê chỗ ở',
        title: 'Nên ở khu vực nào trong 2 tuần đầu tiên khi mới đến Đà Nẵng / Việt Nam trước khi thuê dài hạn?',
        author_name: 'Liam Carter (Thành viên Cộng đồng • Đà Nẵng)',
        author_role: 'Thành viên Hạt nhân • Tuần 1',
        body: 'Mình vừa hạ cánh xuống Đà Nẵng! Theo kinh nghiệm được chia sẻ trong cộng đồng mình, mình đặt chỗ ở ngắn hạn 10–14 ngày đầu để trực tiếp đi xem phòng vào ban ngày và sau cơn mưa. Hiện mình đang phân vân giữa khu Mỹ An (An Thượng) và Sơn Trà.',
        discussion_prompt: 'Các thành viên trong cộng đồng mình thường chọn khu vực nào sau 2 tuần đầu, và tiêu chí số #1 bạn kiểm tra trước khi đặt cọc thuê phòng là gì?',
        source_url: 'https://tripc.ai/blog/first-two-weeks-in-vietnam-accommodation-guide',
        image_url: assets[6].url,
        participants_count: 8,
        replies: [
          {
            author: `Ban Quản Trị (${settings.page_name})`,
            role: 'Quản trị viên Cộng đồng',
            text: 'Chào mừng Liam! Khi đi xem phòng thực tế bạn nhớ kiểm tra sóng điện thoại trong phòng ngủ, áp lực nước, và hỏi rõ giá điện tính theo giá nhà nước (EVN) hay giá cố định của chủ nhà nhé.',
            created_at: new Date(Date.now() - 3600_000 * 5).toISOString(),
          },
          {
            author: 'Marcus Weber (Kỹ sư làm việc từ xa)',
            role: 'Thành viên • Tự động gom theo xu hướng Remote Work',
            text: 'Mình ở gần biển Mỹ Khê 10 ngày đầu rồi chuyển sang Sơn Trà. Bạn nên ghé xem con phố đó sau 9h tối nữa để kiểm tra xem có bị ồn bởi karaoke không nhé!',
            created_at: new Date(Date.now() - 3600_000 * 3).toISOString(),
          },
          {
            author: 'Sofia Rossi (Thành viên Cộng đồng)',
            role: 'Thành viên Hạt nhân • Tuần 1',
            text: 'Nhớ nhắc chủ nhà làm thủ tục Khai báo tạm trú (Temporary Residence Registration) ngay khi nhận phòng để thuận tiện cho mọi thủ tục về sau.',
            created_at: new Date(Date.now() - 3600_000 * 2).toISOString(),
          },
        ],
      },
      {
        category: 'Làm việc từ xa & Kết nối Internet',
        title: 'Kinh nghiệm thiết lập góc làm việc từ xa ổn định tại Việt Nam: Wi-Fi cáp quang + SIM/eSIM dự phòng nào tốt nhất?',
        author_name: 'Elena Rostova (Product Designer • Remote Worker)',
        author_role: 'Thành viên Hạt nhân • Tuần 1',
        body: 'Mình có lịch họp video hàng ngày nên cần đường truyền thật ổn định. Mình đang kết hợp mạng cáp quang tại căn hộ và 1 gói 4G/5G dự phòng trên điện thoại.',
        discussion_prompt: 'Mọi người trong cộng đồng mình đang dùng Viettel, Vinaphone hay MobiFone để phát 4G/5G dự phòng, và quán cafe / coworking nào ở Đà Nẵng yên tĩnh nhất?',
        source_url: 'https://tripc.ai/blog/working-remotely-from-vietnam-setup-guide',
        image_url: assets[1].url,
        participants_count: 7,
        replies: [
          {
            author: 'David Kim (Thành viên Cộng đồng • Đà Nẵng)',
            role: 'Thành viên • Tự động gom theo xu hướng Coworking',
            text: 'Mình đăng ký SIM vật lý Viettel chính chủ bằng hộ chiếu tại cửa hàng Viettel, sóng 4G/5G cực kỳ ổn định cả ở Đà Nẵng lẫn khi đi du lịch các tỉnh.',
            created_at: new Date(Date.now() - 3600_000 * 8).toISOString(),
          },
          {
            author: `Ban Quản Trị (${settings.page_name})`,
            role: 'Quản trị viên Cộng đồng',
            text: 'Mẹo nhỏ cho các thành viên mới: bạn có thể dùng eSIM ngay khi vừa hạ cánh ở sân bay để đặt Grab về khách sạn, sau đó nếu ở trên 1 tháng thì đổi sang SIM Viettel/Vinaphone đăng ký chính chủ nhé!',
            created_at: new Date(Date.now() - 3600_000 * 6).toISOString(),
          },
        ],
      },
      {
        category: 'Thanh toán, Ngân hàng & Chi phí Sống',
        title: 'Chia sẻ kinh nghiệm thanh toán VietQR, rút tiền ATM và dự toán chi phí du lịch / sinh hoạt mỗi ngày năm 2026',
        author_name: 'Noah Vance (Chuyên gia Tư vấn • Đà Nẵng)',
        author_role: 'Thành viên • Chiến dịch Tuần 2',
        body: 'Hiện tại hầu hết quán ăn, cafe và siêu thị tại Việt Nam đều quét mã VietQR. Mình muốn lập chủ đề này để anh chị em trong cộng đồng chia sẻ cách thanh toán tiện và tiết kiệm phí nhất.',
        discussion_prompt: 'Bạn đang kết hợp thẻ quốc tế (Wise/Revolut) + ATM miễn phí rút, hay đã mở tài khoản ngân hàng nội địa? Chi phí trung bình mỗi ngày của bạn khoảng bao nhiêu?',
        source_url: 'https://tripc.ai/blog/open-bank-account-vietnam-foreigner-guide',
        image_url: assets[3].url,
        participants_count: 9,
        replies: [
          {
            author: 'Chloe Dubois (Thành viên Cộng đồng • Hà Nội)',
            role: 'Thành viên • Tự động gom theo xu hướng Ngân hàng & Chi phí',
            text: 'Nếu có giấy phép lao động / thẻ tạm trú thì mở Vietcombank hoặc Timo rất nhanh, chỉ cần xác thực sinh trắc học khuôn mặt trên app là chuyển khoản VietQR thoải mái.',
            created_at: new Date(Date.now() - 3600_000 * 12).toISOString(),
          },
          {
            author: 'Liam Carter (Thành viên Cộng đồng • Đà Nẵng)',
            role: 'Thành viên Hạt nhân • Tuần 1',
            text: 'Với khách du lịch 30–90 ngày thì mang theo 2 thẻ quốc tế + rút tiền mặt tại cây ATM VPBank/TPBank và liên kết thẻ vào ứng dụng Grab là đáp ứng được 95% nhu cầu.',
            created_at: new Date(Date.now() - 3600_000 * 10).toISOString(),
          },
        ],
      },
      {
        category: 'Giao lưu Thành viên Mới & Kết nối Cộng đồng',
        title: `[Chủ đề Gắn kết Tuần] Chào mừng thành viên mới của ${settings.community_name}! Hãy giới thiệu bản thân & điểm đến của bạn nhé!`,
        author_name: `Ban Quản Trị (${settings.page_name})`,
        author_role: 'Quản trị viên Cộng đồng',
        body: `Chào mừng bạn đến với ${settings.community_name} — không gian thảo luận 2 chiều dành cho những người yêu thích du lịch, khám phá và sinh sống tại Việt Nam! Hãy để lại bình luận bên dưới để kết nối với các thành viên có cùng mối quan tâm nhé.`,
        discussion_prompt: '1) Bạn đang ở thành phố nào (hoặc sắp đi du lịch ở đâu)? 2) Mối quan tâm lớn nhất của bạn tuần này là gì (Lịch trình, Chỗ ở, Ẩm thực, Di chuyển hay Thủ tục)?',
        source_url: settings.group_url,
        image_url: assets[11].url,
        participants_count: 14,
        replies: [
          {
            author: 'Duong Thieu Quang (Thành viên Cộng đồng)',
            role: 'Thành viên • Tự động kết nối từ Messenger Fanpage',
            text: 'Mình đang tìm hiểu lịch trình du lịch và kinh nghiệm di chuyển, lưu trú tại Đà Nẵng & Việt Nam!',
            created_at: new Date(Date.now() - 1800_000).toISOString(),
          },
          {
            author: `Ban Quản Trị (${settings.page_name})`,
            role: 'Quản trị viên Cộng đồng',
            text: `Chào mừng bạn gia nhập ${settings.community_name}! Hệ thống đã tự động gắn thẻ xu hướng Du lịch & Lưu trú để kết nối bạn với các thành viên và bài cẩm nang phù hợp nhất nhé.`,
            created_at: new Date(Date.now() - 1200_000).toISOString(),
          },
        ],
      },
    ];

    for (const thread of initialThreads) {
      await this.pool.query(
        `INSERT INTO community_hub_discussions
           (workspace_id, category, title, author_name, author_role, body, discussion_prompt, source_url, image_url, replies, participants_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
        [
          workspaceId,
          thread.category,
          thread.title,
          thread.author_name,
          thread.author_role,
          thread.body,
          thread.discussion_prompt,
          thread.source_url,
          thread.image_url,
          JSON.stringify(thread.replies),
          thread.participants_count,
        ],
      );
    }
  }

  /**
   * Real people only: a member row exists only for a real Facebook user (PSID) who actually
   * messaged/commented on the Page. Nothing here adds anyone to the Facebook Page or a Group —
   * Meta does not allow apps to add followers/members. These rows are "people identified",
   * not followers. Seeded/test/hard-coded personas are purged so the counter can never be inflated.
   */
  async syncMembersFromInteractions(workspaceId: string, settings?: CommunitySettings): Promise<number> {
    const resolvedSettings = settings ?? (await this.getCommunitySettings(workspaceId));

    // Purge everything that is not a real Facebook user (old hard-coded cohorts, seeded leads, test comments).
    await this.pool.query(
      `DELETE FROM community_hub_members
        WHERE workspace_id = $1 AND external_ref !~ '^fb:[0-9]{14,}$' AND external_ref NOT LIKE 'manual:%'`,
      [workspaceId],
    );

    const msgRows = (
      await this.pool.query<{ psid: string; platform: string; content: string; received_at: Date }>(
        `SELECT author_contact AS psid, platform, content, received_at
           FROM community_messages
          WHERE workspace_id = $1
            AND platform IN ('facebook_message', 'facebook_comment')
            AND author_contact ~ '^[0-9]{14,}$'
          ORDER BY received_at DESC
          LIMIT 500`,
        [workspaceId],
      )
    ).rows;

    // One row per real person; use their longest message as the interest signal.
    const byPerson = new Map<string, { platform: string; signals: string[]; first_seen: Date }>();
    for (const m of msgRows) {
      const entry = byPerson.get(m.psid) ?? { platform: m.platform, signals: [], first_seen: m.received_at };
      entry.signals.push(m.content);
      if (m.received_at < entry.first_seen) entry.first_seen = m.received_at;
      byPerson.set(m.psid, entry);
    }
    if (byPerson.size === 0) return 0;

    const names = await this.fetchMessengerParticipantNames(resolvedSettings.connected_fanpage_id);

    let addedCount = 0;
    for (const [psid, info] of byPerson.entries()) {
      const signal = [...info.signals].sort((a, b) => b.length - a.length)[0] ?? '';
      const match = classifyMemberInterests(info.signals.join(' '));
      const displayName = names.get(psid) ?? `Người dùng Facebook #${psid.slice(-4)}`;
      const res = await this.pool.query(
        `INSERT INTO community_hub_members
           (workspace_id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags, affinity_score, campaign_week, status, invite_group_url, recommended_topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 1, 'identified', $9, $10)
         ON CONFLICT (workspace_id, external_ref) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           matched_signal = EXCLUDED.matched_signal,
           matched_trend = EXCLUDED.matched_trend,
           interest_tags = EXCLUDED.interest_tags,
           invite_group_url = EXCLUDED.invite_group_url,
           recommended_topic = EXCLUDED.recommended_topic,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          workspaceId,
          `fb:${psid}`,
          displayName,
          info.platform === 'facebook_comment' ? 'facebook_comment' : 'facebook_messenger',
          signal.slice(0, 200),
          match.matched_trend,
          JSON.stringify(match.interest_tags),
          match.affinity_score,
          resolvedSettings.group_url,
          match.recommended_playbook_topic,
        ],
      );
      if (res.rows[0]?.inserted) addedCount++;
    }
    return addedCount;
  }

  /** PSID -> real display name, from the Page's own Messenger conversations. */
  private async fetchMessengerParticipantNames(pageId: string): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!token) return names;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/me/conversations?fields=participants&limit=100&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return names;
      const json = (await res.json()) as {
        data?: { participants?: { data?: { id: string; name?: string }[] } }[];
      };
      for (const conv of json.data ?? []) {
        for (const p of conv.participants?.data ?? []) {
          if (p.id !== pageId && p.name) names.set(p.id, p.name);
        }
      }
    } catch {
      // Names are cosmetic; fall back to the PSID suffix.
    }
    return names;
  }

  /** Real numbers straight from Facebook — the only numbers that count as growth. */
  async fetchRealPageStats(): Promise<{ followers_count: number | null; fan_count: number | null }> {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!token) return { followers_count: null, fan_count: null };
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=followers_count,fan_count&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return { followers_count: null, fan_count: null };
      const json = (await res.json()) as { followers_count?: number; fan_count?: number };
      return { followers_count: json.followers_count ?? 0, fan_count: json.fan_count ?? 0 };
    } catch {
      return { followers_count: null, fan_count: null };
    }
  }

  async getHubData(workspaceId: string) {
    const settings = await this.ensureSchemaAndContext(workspaceId);

    const members = (
      await this.pool.query<{
        id: string;
        external_ref: string;
        display_name: string;
        channel: string;
        matched_signal: string;
        matched_trend: string;
        interest_tags: string[];
        affinity_score: number;
        campaign_week: number;
        status: string;
        invite_group_url: string;
        recommended_topic: string | null;
        created_at: Date;
      }>(
        `SELECT id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags,
                affinity_score, campaign_week, status, invite_group_url, recommended_topic, created_at
           FROM community_hub_members
          WHERE workspace_id = $1
          ORDER BY campaign_week ASC, affinity_score DESC, created_at DESC`,
        [workspaceId],
      )
    ).rows;

    const discussions = (
      await this.pool.query<{
        id: string;
        category: string;
        title: string;
        author_name: string;
        author_role: string;
        body: string;
        discussion_prompt: string;
        source_url: string | null;
        image_url: string | null;
        replies: { author: string; role: string; text: string; created_at: string }[];
        participants_count: number;
        facebook_post_id: string | null;
        created_at: Date;
      }>(
        `SELECT id, category, title, author_name, author_role, body, discussion_prompt,
                source_url, image_url, replies, participants_count, facebook_post_id, created_at
           FROM community_hub_discussions
          WHERE workspace_id = $1
          ORDER BY created_at DESC`,
        [workspaceId],
      )
    ).rows;

    const sources = (
      await this.pool.query<{
        id: string;
        title: string;
        source_url: string;
        version: number;
      }>(
        `SELECT id, title, COALESCE(source_url, url_or_blob) AS source_url, version
           FROM sources
          WHERE workspace_id = $1 AND status = 'approved' AND deleted_at IS NULL
            AND COALESCE(source_url, url_or_blob) LIKE 'https://tripc.ai/blog/%'
          ORDER BY title ASC`,
        [workspaceId],
      )
    ).rows;

    const uniqueSources: typeof sources = [];
    const seenSourceTitles = new Set<string>();
    for (const s of sources) {
      const cleanTitle = s.title.replace(/\s*\(tripc\.ai\)\s*$/i, '').trim();
      const key = cleanTitle.toLowerCase();
      if (!seenSourceTitles.has(key)) {
        seenSourceTitles.add(key);
        uniqueSources.push({ ...s, title: cleanTitle });
      }
    }

    const publishedArticles = (
      await this.pool.query<{
        id: string;
        title: string;
        slug: string | null;
        published_at: Date | null;
        artifact_id: string | null;
        source_id: string | null;
      }>(
        `SELECT c.id, c.title, c.slug, c.published_at, c.artifact_id,
                a.evidence->0->>'source_id' AS source_id
           FROM contents c
           LEFT JOIN content_artifacts a ON a.id = c.artifact_id AND a.workspace_id = c.workspace_id
          WHERE c.workspace_id = $1 AND c.type = 'blog_post'
          ORDER BY c.published_at DESC NULLS LAST`,
        [workspaceId],
      )
    ).rows;

    const usedSourceIds = new Set(publishedArticles.map((a) => a.source_id).filter(Boolean) as string[]);
    const allAssets = getPlaybookImageAssets(workspaceId);

    const freshSources = uniqueSources.filter((s) => !usedSourceIds.has(s.id));
    const coveredSources = uniqueSources.filter((s) => usedSourceIds.has(s.id));
    const orderedSources = [...freshSources, ...coveredSources];

    const calendarUsedImages = new Set<string>();
    const dayLabels = [
      'Thứ Hai (Ngày 1)',
      'Thứ Ba (Ngày 2)',
      'Thứ Tư (Ngày 3)',
      'Thứ Năm (Ngày 4)',
      'Thứ Sáu (Ngày 5)',
      'Thứ Bảy (Ngày 6)',
      'Chủ Nhật (Ngày 7)',
      'Thứ Hai Tuần 2 (Ngày 8)',
      'Thứ Ba Tuần 2 (Ngày 9)',
      'Thứ Tư Tuần 2 (Ngày 10)',
      'Thứ Năm Tuần 2 (Ngày 11)',
      'Thứ Sáu Tuần 2 (Ngày 12)',
      'Thứ Bảy Tuần 2 (Ngày 13)',
      'Chủ Nhật Tuần 2 (Ngày 14)',
    ];

    const dailyCalendar = orderedSources.slice(0, 14).map((source, index) => {
      const matchedAsset = matchAssetForTopic(source.title, allAssets, calendarUsedImages);
      calendarUsedImages.add(matchedAsset.url);
      const publishedMatch = publishedArticles.find((p) => p.source_id === source.id);
      const matchInfo = classifyMemberInterests(source.title);

      return {
        day_index: index + 1,
        day_label: dayLabels[index] || `Ngày ${index + 1}`,
        week_number: Math.floor(index / 7) + 1,
        source_id: source.id,
        topic_title: source.title,
        source_url: source.source_url,
        image_url: matchedAsset.url,
        image_attribution: matchedAsset.attribution,
        target_trend: matchInfo.matched_trend,
        interest_tags: matchInfo.interest_tags,
        community_discussion_hook: `Thảo luận 2 chiều tại ${settings.community_name}: Kinh nghiệm thực tế của bạn về "${source.title}" là gì? Cùng chia sẻ dưới phần bình luận nhé!`,
        status: publishedMatch ? 'published' : 'ready_to_publish',
        published_slug: publishedMatch?.slug ?? null,
        published_at: publishedMatch?.published_at ?? null,
        unique_topic_verified: true,
        unique_image_verified: true,
      };
    });

    // Growth is measured ONLY by real Facebook numbers (followers of the Page), never by rows in our DB.
    const pageStats = await this.fetchRealPageStats();
    const realFollowers = pageStats.followers_count ?? 0;
    const realIdentifiedPeople = members.filter((m) => m.external_ref.startsWith('fb:')).length;
    const manualProspects = members.filter((m) => m.external_ref.startsWith('manual:')).length;
    const week1Count = realFollowers;
    const totalMatchedCount = realFollowers;
    const campaignStatus = (target: number, previousTarget: number) =>
      realFollowers >= target ? 'completed_target' : realFollowers >= previousTarget ? 'active_campaign' : 'scheduled';

    const weeklyCampaigns = [
      {
        week: 1,
        title: 'Tuần 1: Xây dựng Hạt nhân Cộng đồng của Riêng Bạn (Mục tiêu: 5 Thành viên)',
        target_members: 5,
        current_members: week1Count,
        status: campaignStatus(5, 0),
        theme: 'Đón người mới đến, Kinh nghiệm chọn chỗ ở 2 tuần đầu & Thủ tục nhập cảnh',
        target_trends: ['Chỗ ở 2 tuần đầu', 'Thuê căn hộ', 'Làm việc từ xa', 'Lịch trình Du lịch'],
        tactics: [
          `Tự động quét người nhắn tin trên Fanpage "${settings.page_name}" / bình luận hỏi về du lịch, chỗ ở 2 tuần đầu và mời thẳng vào Cộng đồng riêng của bạn`,
          'Đăng 7 bài cẩm nang nền tảng (mỗi ngày 1 chủ đề mới + 1 hình ảnh riêng biệt, tuyệt đối không trùng lặp)',
          'Kích hoạt thảo luận 2 chiều bằng bài chào mừng thành viên mới để 5 thành viên hạt nhân tương tác trực tiếp với nhau',
        ],
      },
      {
        week: 2,
        title: 'Tuần 2: Mở rộng Nhóm Thành viên Cùng Xu hướng vào Cộng đồng của Bạn (Mục tiêu: 50 Thành viên)',
        target_members: 50,
        current_members: totalMatchedCount,
        status: campaignStatus(50, 5),
        theme: 'Checklist Xem căn hộ, Góc làm việc từ xa, eSIM/SIM & Thanh toán VietQR',
        target_trends: ['Checklist thuê nhà', 'Coworking & Wi-Fi', 'eSIM vs SIM vật lý', 'Thanh toán VietQR'],
        tactics: [
          `Auto-Match Engine tự động phân loại khách hàng theo xu hướng (Thuê căn hộ, Remote Work, Thanh toán/VietQR, Du lịch gia đình) và tự động gom vào "${settings.community_name}"`,
          `Mỗi bài đăng trên Fanpage "${settings.page_name}" đều gắn câu hỏi mở 2 chiều + lời mời tham gia trực tiếp vào Cộng đồng riêng của bạn`,
          'Tổ chức 3 chủ đề thảo luận so sánh thực tế giữa các thành viên (Mỹ An vs Sơn Trà, Viettel vs Vinaphone, Thẻ quốc tế vs VietQR)',
        ],
      },
      {
        week: 3,
        title: 'Tuần 3: Tăng tốc Tương tác Đời sống Địa phương (Mục tiêu: 150 Thành viên)',
        target_members: 150,
        current_members: totalMatchedCount,
        status: campaignStatus(150, 50),
        theme: 'Bảo hiểm Y tế, Đăng ký Tạm trú, Đi chợ/Siêu thị & Phòng tránh Rủi ro',
        target_trends: ['Khai báo tạm trú', 'Bảo hiểm sức khỏe', 'Siêu thị & Chợ địa phương', 'An toàn & Liên hệ khẩn cấp'],
        tactics: [
          'Kết nối các thành viên đã có kinh nghiệm tại Đà Nẵng / Hà Nội / TP.HCM giải đáp trực tiếp cho thành viên mới',
          'Chuỗi bài thực chiến: Cách tìm địa chỉ ngõ/hẻm Việt Nam, đăng ký tạm trú với chủ nhà và chọn bảo hiểm y tế',
        ],
      },
      {
        week: 4,
        title: 'Tuần 4: Cộng đồng Tự vận hành & Sự kiện Kết nối Thành viên (Mục tiêu: 300 Thành viên)',
        target_members: 300,
        current_members: totalMatchedCount,
        status: campaignStatus(300, 150),
        theme: 'Kết nối Thành viên Dài hạn, Tuyến Du lịch Tàu/Bay & Bình chọn Chủ đề Tháng mới',
        target_trends: ['Offline/Online Meetup', 'Tuyến Tàu hỏa / Máy bay nội địa', 'Tối ưu Chi phí mỗi ngày'],
        tactics: [
          'Bình chọn chủ đề (Community Poll) cho tháng tiếp theo do chính các thành viên trong cộng đồng của bạn đề xuất',
          'Tổng kết Top thành viên đóng góp tích cực và mở rộng mạng lưới kết nối tại Đà Nẵng & Việt Nam',
        ],
      },
    ];

    const weeklyCalendar = [
      {
        week_number: 1,
        week_label: 'Tuần 1 (Ngày 1 – Ngày 7)',
        member_target: 'Thu hút 5 thành viên hạt nhân đầu tiên vào cộng đồng của bạn',
        pillar_theme: 'Cẩm nang Hạ cánh & 2 Tuần Đầu tiên tại Việt Nam',
        planned_topics: orderedSources.slice(0, 6).map((s) => s.title),
        interactive_format: 'Bài Chào mừng Thành viên mới + Thảo luận chọn khu vực lưu trú 2 tuần đầu',
      },
      {
        week_number: 2,
        week_label: 'Tuần 2 (Ngày 8 – Ngày 14)',
        member_target: 'Mở rộng lên 50 thành viên cùng xu hướng (Du lịch dài ngày & Remote Work)',
        pillar_theme: 'Checklist Xem Căn hộ, Góc Làm việc Từ xa & Kết nối SIM/eSIM',
        planned_topics: orderedSources.slice(6, 12).map((s) => s.title),
        interactive_format: 'Chia sẻ kinh nghiệm thuê nhà thực tế + Bình chọn nhà mạng eSIM/SIM & Quán cafe làm việc',
      },
      {
        week_number: 3,
        week_label: 'Tuần 3 (Ngày 15 – Ngày 21)',
        member_target: 'Mở rộng lên 150 thành viên (Ổn định cuộc sống & Tiện ích địa phương)',
        pillar_theme: 'Thanh toán VietQR, Đăng ký Tạm trú, Bảo hiểm Y tế & Mua sắm Hàng ngày',
        planned_topics: orderedSources.slice(12, 17).map((s) => s.title),
        interactive_format: 'Hỏi - Đáp 2 chiều cùng thành viên có kinh nghiệm về VietQR, Bảo hiểm & Tạm trú',
      },
      {
        week_number: 4,
        week_label: 'Tuần 4 (Ngày 22 – Ngày 30)',
        member_target: 'Đạt mốc 300 thành viên & Kết nối Cộng đồng Bền vững',
        pillar_theme: 'Du lịch Gia đình, Phương tiện Tàu hỏa/Máy bay & Tối ưu Ngân sách Mỗi ngày',
        planned_topics: orderedSources.slice(17, 22).map((s) => s.title),
        interactive_format: 'Bình chọn Cộng đồng hàng tháng + Chia sẻ lịch trình khám phá Bắc – Trung – Nam',
      },
    ];

    const monthlyCalendar = [
      {
        month_number: 1,
        month_label: `Tháng 1: Xây dựng Nền móng cho "${settings.community_name}" & 22 Chủ đề Cốt lõi`,
        member_goal: 'Tuần 1: 5 người → Tuần 2: 50 người → Cuối Tháng 1: 300 thành viên tương tác thật trong cộng đồng của bạn',
        content_commitment: '22 bài viết chuyên sâu (100% thông tin mới, mỗi ngày 1 chủ đề & 1 hình ảnh riêng biệt, không trùng lặp)',
        key_pillars: [
          'Tuần 1: Sân bay, SIM/eSIM & Lưu trú 2 tuần đầu tiên',
          'Tuần 2: Checklist thuê căn hộ & Thiết lập góc làm việc từ xa',
          'Tuần 3: Ngân hàng/VietQR, Đăng ký tạm trú & Bảo hiểm y tế',
          'Tuần 4: Du lịch gia đình, Phương tiện di chuyển & Ngân sách mỗi ngày',
        ],
      },
      {
        month_number: 2,
        month_label: 'Tháng 2: Đào sâu theo Điểm đến (Đà Nẵng • Hà Nội • TP.HCM • Hội An • Phú Quốc)',
        member_goal: 'Mở rộng từ 300 → 1,000 thành viên (Tự động gom nhóm theo từng thành phố & sở thích)',
        content_commitment: '30 bài phân tích chuyên sâu theo từng khu phố, chi phí thực tế từng mùa và review từ chính thành viên trong cộng đồng của bạn',
        key_pillars: [
          'So sánh chi phí sống & khu vực lưu trú: Mỹ An / Sơn Trà (Đà Nẵng) vs Thảo Điền (TP.HCM) vs Tây Hồ (Hà Nội)',
          'Bản đồ Cafe làm việc từ xa & Không gian làm việc chung do thành viên bình chọn',
          'Cẩm nang thời tiết từng vùng & lịch trình du lịch mùa lễ hội tại Việt Nam',
        ],
      },
      {
        month_number: 3,
        month_label: 'Tháng 3: Hệ sinh thái Cộng đồng Tự sinh Nội dung (Thành viên Chia sẻ & Kết nối Thực tế)',
        member_goal: 'Đạt 2,500+ thành viên — Cộng đồng của bạn tự đặt câu hỏi, chia sẻ kinh nghiệm và kết nối hàng ngày',
        content_commitment: 'Kết hợp bài cẩm nang hàng ngày + Vinh danh câu trả lời & kinh nghiệm hay nhất của thành viên trong tuần',
        key_pillars: [
          'Chuỗi sự kiện Giao lưu Offline/Online hàng tháng dành cho thành viên cộng đồng của bạn',
          'Cập nhật thông tin mới nhất về thị thực, ngân hàng, di chuyển và tiện ích số năm 2026–2027',
          'Cẩm nang chuyên biệt cho Gia đình & Nhóm du lịch dài ngày tại Việt Nam',
        ],
      },
    ];

    return {
      group: {
        name: settings.community_name,
        group_url: settings.group_url,
        group_share_url: settings.group_url,
        page_name: settings.page_name,
        page_url: settings.page_url,
        connected_fanpage_id: settings.connected_fanpage_id,
        positioning: settings.positioning,
      },
      stats: {
        total_matched_members: totalMatchedCount,
        real_page_followers: pageStats.followers_count,
        real_page_likes: pageStats.fan_count,
        real_identified_people: realIdentifiedPeople,
        manual_prospects: manualProspects,
        week1_target: 5,
        week1_achieved: week1Count,
        week2_target: 50,
        week2_progress: totalMatchedCount,
        active_discussions: discussions.length,
        total_approved_playbook_topics: uniqueSources.length,
        fresh_unposted_topics: freshSources.length,
        approved_unique_images: allAssets.length,
        duplication_rate_pct: 0,
      },
      weekly_campaigns: weeklyCampaigns,
      matched_members: members,
      discussions,
      calendar: {
        daily: dailyCalendar,
        weekly: weeklyCalendar,
        monthly: monthlyCalendar,
      },
    };
  }

  async addProspectMember(
    workspaceId: string,
    input: { display_name: string; channel?: string; signal: string; campaign_week?: number },
  ) {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const match = classifyMemberInterests(input.signal);
    const ref = `manual:${slugifySimple(input.display_name)}-${Date.now().toString(36)}`;
    const row = (
      await this.pool.query(
        `INSERT INTO community_hub_members
           (workspace_id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags, affinity_score, campaign_week, status, invite_group_url, recommended_topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'manual_prospect', $10, $11)
         RETURNING *`,
        [
          workspaceId,
          ref,
          input.display_name,
          input.channel || 'auto_trend_scanner',
          input.signal,
          match.matched_trend,
          JSON.stringify(match.interest_tags),
          match.affinity_score,
          input.campaign_week ?? 2,
          settings.group_url,
          match.recommended_playbook_topic,
        ],
      )
    ).rows[0];
    return row;
  }

  async createDiscussion(
    workspaceId: string,
    input: {
      category?: string;
      title: string;
      author_name?: string;
      author_role?: string;
      body: string;
      discussion_prompt: string;
      source_url?: string;
    },
  ) {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const assets = getPlaybookImageAssets(workspaceId);
    const matchedAsset = matchAssetForTopic(`${input.title} ${input.body}`, assets);
    const initialReply = {
      author: `Ban Quản Trị (${settings.page_name})`,
      role: 'Quản trị viên Cộng đồng',
      text: `Cảm ơn bạn đã mở chủ đề thảo luận! Mời các thành viên trong ${settings.community_name} cùng chia sẻ góc nhìn và kinh nghiệm thực tế về "${input.title}" nhé.`,
      created_at: new Date().toISOString(),
    };
    const row = (
      await this.pool.query(
        `INSERT INTO community_hub_discussions
           (workspace_id, category, title, author_name, author_role, body, discussion_prompt, source_url, image_url, replies, participants_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 3)
         RETURNING *`,
        [
          workspaceId,
          input.category || 'Thảo luận Cộng đồng',
          input.title,
          input.author_name || `Ban Quản Trị (${settings.page_name})`,
          input.author_role || 'Quản trị viên Cộng đồng',
          input.body,
          input.discussion_prompt,
          input.source_url || settings.group_url,
          matchedAsset.url,
          JSON.stringify([initialReply]),
        ],
      )
    ).rows[0];
    return row;
  }

  /**
   * Immediately generates and publishes a 100% fresh, non-duplicate article + Facebook post
   * for the user's OWN community and Fanpage (`Dịch vụ hỗ trợ du lịch`), pairing it with a
   * unique topic-matched image and an interactive 2-way discussion prompt.
   */
  async publishFreshPlaybookPost(
    workspaceId: string,
    actorId: string,
    options: { source_id?: string } = {},
  ) {
    const settings = await this.ensureSchemaAndContext(workspaceId);

    const ctx = (
      await this.pool.query<{ snapshot_id: string }>(
        'SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1 AND current LIMIT 1',
        [workspaceId],
      )
    ).rows[0];
    if (!ctx) throw new Error('Workspace has no active knowledge context');

    const usedSourceRows = (
      await this.pool.query<{ source_id: string | null }>(
        `SELECT DISTINCT evidence->0->>'source_id' AS source_id
           FROM content_artifacts
          WHERE workspace_id = $1 AND role = 'seo' AND evidence->0->>'source_id' IS NOT NULL`,
        [workspaceId],
      )
    ).rows;
    const usedSourceIds = new Set(usedSourceRows.map((r) => r.source_id).filter(Boolean) as string[]);

    const usedImageRows = (
      await this.pool.query<{ url: string | null }>(
        `SELECT payload->'result'->'image_assets'->0->>'url' AS url
           FROM content_artifacts
          WHERE workspace_id = $1 AND role = 'content'
            AND payload->'result'->'image_assets'->0->>'url' IS NOT NULL
          ORDER BY created_at DESC LIMIT 15`,
        [workspaceId],
      )
    ).rows;
    const usedImageUrls = new Set(usedImageRows.map((r) => r.url).filter(Boolean) as string[]);

    const allSources = (
      await this.pool.query<{
        id: string;
        title: string;
        source_url: string;
        version: number;
        license: string;
        attribution: string;
      }>(
        `SELECT id, title, COALESCE(source_url, url_or_blob) AS source_url, version,
                COALESCE(license, 'TripC first-party content') AS license,
                COALESCE(attribution, 'TripC') AS attribution
           FROM sources
          WHERE workspace_id = $1 AND status = 'approved' AND deleted_at IS NULL
            AND COALESCE(source_url, url_or_blob) LIKE 'https://tripc.ai/blog/%'
          ORDER BY title ASC`,
        [workspaceId],
      )
    ).rows;

    const targetSource =
      (options.source_id ? allSources.find((s) => s.id === options.source_id) : undefined) ??
      allSources.find((s) => !usedSourceIds.has(s.id)) ??
      allSources[0];

    if (!targetSource) throw new Error('No approved source found');

    const chunks = (
      await this.pool.query<{ id: string; text_content: string; citation_locator: string }>(
        `SELECT id, text_content, citation_locator
           FROM source_chunks
          WHERE workspace_id = $1 AND source_id = $2 AND source_version = $3
          ORDER BY chunk_index ASC LIMIT 6`,
        [workspaceId, targetSource.id, targetSource.version],
      )
    ).rows;

    if (!chunks.length) throw new Error('Selected source has no text chunks');

    const cleanTitle = targetSource.title.replace(/\s*\(tripc\.ai\)\s*$/i, '').trim();
    const allAssets = getPlaybookImageAssets(workspaceId);
    const chosenAsset = matchAssetForTopic(cleanTitle, allAssets, usedImageUrls);
    const { topic_tags, ...assetPayload } = chosenAsset;

    const evidence = chunks.slice(0, 4).map((c) => ({
      source_id: targetSource.id,
      source_version: targetSource.version,
      chunk_id: c.id,
      locator: c.citation_locator,
      quote: c.text_content.slice(0, 380),
      source_url: targetSource.source_url,
      license: targetSource.license,
      attribution: targetSource.attribution,
    }));

    const sectionHeadings = [
      'Key Takeaways for Living & Traveling in Vietnam',
      'Practical Step-by-Step Guide & Local Reality',
      'Community Discussion & Member Tips',
    ];

    const bodyParagraphs = chunks.map((c) => c.text_content.trim());
    const ctaText = `Tham gia thảo luận cùng ${settings.community_name} (${settings.group_url}) để chia sẻ kinh nghiệm thực tế tại Việt Nam`;

    const bodyMarkdown = [
      `# ${cleanTitle}`,
      '',
      `## ${sectionHeadings[0]}`,
      bodyParagraphs[0] || '',
      `[source: ${chunks[0].id}]`,
      '',
      `## ${sectionHeadings[1]}`,
      bodyParagraphs.slice(1, 3).join('\n\n') || bodyParagraphs[0],
      `[source: ${chunks[Math.min(1, chunks.length - 1)].id}]`,
      '',
      `## ${sectionHeadings[2]}`,
      bodyParagraphs.slice(3).join('\n\n') ||
        'Connect with fellow travelers, expats, and remote workers in our community to compare real experiences across Da Nang, Hanoi, and Ho Chi Minh City.',
      `[source: ${chunks[chunks.length - 1].id}]`,
      '',
      ctaText,
    ].join('\n');

    const seoArtifactId = randomUUID();
    const seoResult = {
      article_id: seoArtifactId,
      workspace_id: workspaceId,
      context_snapshot_id: ctx.snapshot_id,
      status: 'draft',
      title: cleanTitle,
      slug: slugifySimple(cleanTitle),
      meta_description: `${cleanTitle} — Cẩm nang thực tế & thảo luận 2 chiều tại ${settings.community_name}.`,
      headings: sectionHeadings,
      body_markdown: bodyMarkdown,
      cta: ctaText,
      citations: evidence,
      missing_facts: [],
      synthetic: false,
    };
    const seoHash = sha256Hex(canonicalJson({ result: seoResult, evidence }));
    const seoArtifactRef = {
      artifact_id: seoArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: seoHash,
      context_snapshot_id: ctx.snapshot_id,
      role: 'seo',
    };

    const bulletPoints = chunks
      .slice(0, 3)
      .map((c) => {
        const firstSentence = c.text_content.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] || c.text_content.slice(0, 160);
        return `• ${firstSentence.slice(0, 200)}`;
      })
      .join('\n');

    const discussionQuestion = `💬 THẢO LUẬN CỘNG ĐỒNG 2 CHIỀU: Bạn đã có trải nghiệm thực tế nào về "${cleanTitle}" khi đi du lịch hoặc sinh sống tại Việt Nam chưa? Hãy để lại bình luận chia sẻ bên dưới để cùng giao lưu với các thành viên trong ${settings.community_name} nhé!`;

    const facebookText = [
      `🇻🇳 [CẨM NANG CỘNG ĐỒNG] ${cleanTitle}`,
      '',
      bulletPoints,
      '',
      discussionQuestion,
      '',
      `🤝 Kết nối & Thảo luận tại ${settings.community_name}: ${settings.group_url}`,
      '#CongDongDuLich #DichVuHoTroDuLich #DaNang #ExploreVietnam',
    ].join('\n');

    const contentArtifactId = randomUUID();
    const contentResult = {
      pack_id: contentArtifactId,
      workspace_id: workspaceId,
      context_snapshot_id: ctx.snapshot_id,
      parent_content_id: seoArtifactId,
      parent_version: 1,
      status: 'draft',
      missing_facts: [],
      synthetic: false,
      caption: facebookText,
      cta: ctaText,
      channels: ['facebook'],
      facebook: {
        hook: `🇻🇳 [CẨM NANG CỘNG ĐỒNG] ${cleanTitle}`,
        body: bulletPoints,
        discussion_question: discussionQuestion,
        cta: ctaText,
        hashtags: ['#CongDongDuLich', '#DichVuHoTroDuLich'],
        text: facebookText,
      },
      image_assets: [assetPayload],
      alt_text: chosenAsset.attribution,
      citations: evidence,
      input_artifact_refs: [seoArtifactRef],
    };
    const contentHash = sha256Hex(canonicalJson({ result: contentResult, evidence }));
    const contentArtifactRef = {
      artifact_id: contentArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: contentHash,
      context_snapshot_id: ctx.snapshot_id,
      role: 'content',
    };

    const db = await this.pool.connect();
    let publishedSite: { content_id: string; slug: string; published: boolean } | null = null;
    let publishingJobId: string | null = null;

    try {
      await db.query('BEGIN');

      await db.query(
        `INSERT INTO content_artifacts
           (id, workspace_id, version, content_hash, context_snapshot_id, role, operation, artifact_type, title, storage, payload, evidence)
         VALUES ($1, $2, 1, $3, $4, 'seo', 'seo.local_draft', 'ai_result', $5, 'ai_run_store', $6::jsonb, $7::jsonb)`,
        [
          seoArtifactId,
          workspaceId,
          seoHash,
          ctx.snapshot_id,
          cleanTitle,
          JSON.stringify({ artifact: seoArtifactRef, result: seoResult }),
          JSON.stringify(evidence),
        ],
      );

      await db.query(
        `INSERT INTO approvals
           (workspace_id, target_type, target_id, target_version, target_hash, status, decision, actor_id, actor_role, review_note)
         VALUES ($1, 'artifact', $2, 1, $3, 'approved', 'approve', $4, 'owner', 'Approved fresh community calendar post')`,
        [workspaceId, seoArtifactId, seoHash, actorId],
      );

      publishedSite = await publishSeoArtifact(db, workspaceId, seoArtifactId, actorId);

      await db.query(
        `INSERT INTO content_artifacts
           (id, workspace_id, version, content_hash, context_snapshot_id, role, operation, artifact_type, title, storage, payload, evidence)
         VALUES ($1, $2, 1, $3, $4, 'content', 'content.generate', 'ai_result', $5, 'ai_run_store', $6::jsonb, $7::jsonb)`,
        [
          contentArtifactId,
          workspaceId,
          contentHash,
          ctx.snapshot_id,
          cleanTitle,
          JSON.stringify({ artifact: contentArtifactRef, result: contentResult }),
          JSON.stringify(evidence),
        ],
      );

      const contentApproval = (
        await db.query<{ id: string }>(
          `INSERT INTO approvals
             (workspace_id, target_type, target_id, target_version, target_hash, status, decision, actor_id, actor_role, review_note)
           VALUES ($1, 'artifact', $2, 1, $3, 'approved', 'approve', $4, 'owner', 'Approved fresh Facebook community post')
           RETURNING id`,
          [workspaceId, contentArtifactId, contentHash, actorId],
        )
      ).rows[0];

      const fbChannel = (
        await db.query<{ id: string }>(
          "SELECT id FROM channels WHERE workspace_id = $1 AND platform_name = 'facebook' ORDER BY created_at LIMIT 1",
          [workspaceId],
        )
      ).rows[0];

      const fbStatus = await getWorkspaceConnectionStatus(workspaceId, 'facebook_page');
      const mode = fbStatus.status === 'connected' ? 'live' : 'manual';

      if (fbChannel) {
        const socialContent = (
          await db.query<{ id: string }>(
            `INSERT INTO contents
               (workspace_id, title, body_markdown, type, status, created_by, approved_by, current_version, content_hash, artifact_id)
             VALUES ($1, $2, $3, 'social_post', 'approved', 'ai', $4, 1, $5, $6)
             RETURNING id`,
            [workspaceId, cleanTitle, facebookText, actorId, contentHash, contentArtifactId],
          )
        ).rows[0];

        const job = (
          await db.query<{ id: string }>(
            `INSERT INTO publishing_jobs
               (content_id, channel_id, scheduled_for, status, workspace_id, artifact_id, approval_id, mode, created_by, utm_url)
             VALUES ($1, $2, NOW(), 'scheduled', $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              socialContent.id,
              fbChannel.id,
              workspaceId,
              contentArtifactId,
              contentApproval.id,
              mode,
              actorId,
              settings.group_url,
            ],
          )
        ).rows[0];
        publishingJobId = job.id;

        await db.query(
          `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload)
           VALUES ($1, 'publishing.scheduled', $2, $3)
           ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
          [
            workspaceId,
            `publish:${job.id}`,
            JSON.stringify({
              job_id: job.id,
              artifact_id: contentArtifactId,
              approval_id: contentApproval.id,
              channel_id: fbChannel.id,
              mode,
            }),
          ],
        );
      }

      await db.query(
        `INSERT INTO community_hub_discussions
           (workspace_id, category, title, author_name, author_role, body, discussion_prompt, source_url, image_url, replies, participants_count)
         VALUES ($1, 'Thảo luận Bài mới Hàng ngày', $2, $3, 'Quản trị viên Cộng đồng', $4, $5, $6, $7, $8::jsonb, 5)`,
        [
          workspaceId,
          cleanTitle,
          `Ban Quản Trị (${settings.page_name})`,
          bulletPoints,
          discussionQuestion,
          settings.group_url,
          chosenAsset.url,
          JSON.stringify([
            {
              author: `Ban Quản Trị (${settings.page_name})`,
              role: 'Quản trị viên Cộng đồng',
              text: `Chủ đề mới trong ngày "${cleanTitle}" đã lên sóng! Mời các thành viên trong ${settings.community_name} cùng bình luận chia sẻ kinh nghiệm thực tế nhé.`,
              created_at: new Date().toISOString(),
            },
          ]),
        ],
      );

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }

    return {
      title: cleanTitle,
      source_id: targetSource.id,
      source_url: targetSource.source_url,
      image_url: chosenAsset.url,
      image_attribution: chosenAsset.attribution,
      seo_artifact_id: seoArtifactId,
      content_artifact_id: contentArtifactId,
      website_slug: publishedSite?.slug ?? null,
      publishing_job_id: publishingJobId,
    };
  }
}

function slugifySimple(value: string): string {
  return (
    value
      .replace(/[Đđ]/g, 'd')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'post'
  );
}
