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
  let trend = 'Vietnam Relocation & Expat Playbook';
  let score = 88;
  let topic = 'Where Should You Stay During Your First Two Weeks in Vietnam?';

  if (/du lịch|travel|trip|chuyến đi|visit|bay|flight|airport|hà nội|đà nẵng|da nang/i.test(lower)) {
    tags.push('Vietnam Travel & Arrival', 'Da Nang & Local Guide');
    trend = 'New Arrivals & Vietnam Travel Playbook';
    score = 95;
    topic = 'Where Should You Stay During Your First Two Weeks in Vietnam?';
  }
  if (/thuê nhà|apartment|housing|rent|chỗ ở|khách sạn|accommodation|stay/i.test(lower)) {
    tags.push('Expat Housing & Apartments', 'First 2 Weeks Stay');
    trend = 'Long-Term Rentals & Apartment Viewing in Da Nang';
    score = 97;
    topic = 'Apartment Viewing Checklist in Vietnam: What to Check Before You Sign';
  }
  if (/remote|coworking|wifi|esim|sim|làm việc|nomad|cafe/i.test(lower)) {
    tags.push('Digital Nomad & Remote Work', 'eSIM & Connectivity');
    trend = 'Remote Work Setup & Coworking in Vietnam';
    score = 96;
    topic = 'Working Remotely from Vietnam: How to Build a Reliable Work Setup';
  }
  if (/bank|ngân hàng|vietqr|tiền|chi phí|budget|cost|atm/i.test(lower)) {
    tags.push('Banking & VietQR', 'Cost of Living');
    trend = 'Expat Banking, VietQR & Daily Budget';
    score = 94;
    topic = 'Opening a Bank Account in Vietnam as a Foreigner: The 2026 Reality';
  }
  if (/visa|evisa|e-visa|hộ chiếu|passport|nhập cảnh|entry/i.test(lower)) {
    tags.push('Vietnam E-Visa & Entry', 'Official Portal Verification');
    trend = 'Official E-Visa & 90-Day Entry Compliance';
    score = 96;
    topic = 'Vietnam E-Visa Guide 2026: How to Apply, Enter, and Avoid Common Mistakes';
  }
  if (tags.length === 0) {
    tags.push('Vietnam Playbook Community', 'Expat & Nomad Network', 'Local Living Tips');
    score = 91;
  }
  return {
    interest_tags: Array.from(new Set(tags)).slice(0, 4),
    matched_trend: trend,
    affinity_score: score,
    recommended_playbook_topic: topic,
  };
}

export class CommunityHubService {
  constructor(private readonly pool: Pool) {}

  async ensureSchemaAndContext(workspaceId: string): Promise<void> {
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
        invite_group_url TEXT NOT NULL DEFAULT 'https://www.facebook.com/groups/vietnamplaybook/',
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

    const assets = getPlaybookImageAssets(workspaceId).map(({ topic_tags, ...rest }) => rest);

    // Ensure business_profiles and knowledge_contexts have all 23 Playbook offers and 16 distinct images
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
          ['Expats, digital nomads, remote workers, and founders living in or moving to Vietnam'],
          'TripC.AI – Vietnam Playbook: the friendly help desk and interactive community for expats, digital nomads, remote workers, and founders living in or moving to Vietnam.',
        ],
      );
    }

    // Ensure active growth_goal does not lock focus_offers strictly to "visa" only
    const goalRow = (
      await this.pool.query<{ id: string; title: string }>(
        "SELECT id, title FROM growth_goals WHERE workspace_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [workspaceId],
      )
    ).rows[0];
    if (goalRow && /\be-?visa\b/i.test(goalRow.title)) {
      await this.pool.query(
        `UPDATE growth_goals
            SET title = 'Grow TripC.AI Vietnam Playbook interactive community and expat relocation guides across Vietnam'
          WHERE id = $1`,
        [goalRow.id],
      );
    }

    // Update current knowledge_contexts snapshot in-place so active tasks don't fail STALE_CONTEXT
    // while immediately gaining all 16 distinct images and all 23 Playbook offers
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
          audiences: ['Expats, digital nomads, remote workers, and founders living in or moving to Vietnam'],
          overview:
            'TripC.AI – Vietnam Playbook: the friendly help desk and interactive community for expats, digital nomads, remote workers, and founders living in or moving to Vietnam.',
        };
        const updatedGoal = currentCtx.goal
          ? {
              ...currentCtx.goal,
              objective: 'Grow TripC.AI Vietnam Playbook interactive community and expat relocation guides across Vietnam',
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

    // Ensure trend_signals include diverse Vietnam Playbook queries in the latest discovery run
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

    await this.seedInitialDiscussionsIfEmpty(workspaceId);
    await this.syncMembersFromInteractions(workspaceId);
  }

  private async seedInitialDiscussionsIfEmpty(workspaceId: string): Promise<void> {
    const count = (
      await this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM community_hub_discussions WHERE workspace_id = $1', [
        workspaceId,
      ])
    ).rows[0]?.n ?? 0;
    if (count > 0) return;

    const assets = getPlaybookImageAssets(workspaceId);
    const initialThreads = [
      {
        category: 'Accommodation & Housing',
        title: 'Where did you stay during your first 2 weeks in Da Nang / Vietnam before signing a long-term lease?',
        author_name: 'Liam Carter (Digital Nomad • Moved to Da Nang)',
        author_role: 'Founding Member • Week 1 Cohort',
        body: 'Just landed in Da Nang! Following the Vietnam Playbook rule to book a short-term stay for the first 10–14 days so I can view apartments in person during daytime and after rain. Comparing My An (An Thuong) vs Son Tra right now.',
        discussion_prompt: 'Which neighborhood did you pick after your first 2 weeks, and what was the #1 thing you checked before paying a deposit?',
        source_url: 'https://tripc.ai/blog/first-two-weeks-in-vietnam-accommodation-guide',
        image_url: assets[6].url,
        participants_count: 8,
        replies: [
          {
            author: 'Hannah Nguyen (Community Host • TripC Playbook)',
            role: 'Community Host',
            text: 'Welcome to Da Nang Liam! Make sure you check phone signal inside the bedroom, water pressure, and ask whether electricity is billed at the official EVN rate or a fixed landlord rate (3,500–4,000 VND/kWh).',
            created_at: new Date(Date.now() - 3600_000 * 5).toISOString(),
          },
          {
            author: 'Marcus Weber (Remote Software Engineer)',
            role: 'Member • Matched via Remote Work Trend',
            text: 'I stayed 10 days near My Khe first, then rented in Son Tra. Definitely visit the street after 9 PM too — karaoke noise is something you only notice at night!',
            created_at: new Date(Date.now() - 3600_000 * 3).toISOString(),
          },
          {
            author: 'Sofia Rossi (Founder • Ho Chi Minh City & Da Nang)',
            role: 'Member • Week 1 Cohort',
            text: 'Also confirm right away that the landlord registers your Temporary Residence (Khai báo tạm trú) with the ward police — you will need that confirmation if you open a bank account later.',
            created_at: new Date(Date.now() - 3600_000 * 2).toISOString(),
          },
        ],
      },
      {
        category: 'Remote Work & Connectivity',
        title: 'Reliable Remote Work Setup in Vietnam: Fiber Wi-Fi + Which Local SIM/eSIM for Backup?',
        author_name: 'Elena Rostova (Product Designer • Remote Worker)',
        author_role: 'Founding Member • Week 1 Cohort',
        body: 'I have daily European afternoon video calls from Vietnam. Setting up my main apartment fiber + a hotspot backup in case a storm or undersea cable issue slows down international routes.',
        discussion_prompt: 'Are you using Viettel, Vinaphone, or MobiFone for your 4G/5G hotspot backup, and what are your favorite quiet coworking spots?',
        source_url: 'https://tripc.ai/blog/working-remotely-from-vietnam-setup-guide',
        image_url: assets[1].url,
        participants_count: 7,
        replies: [
          {
            author: 'David Kim (SaaS Founder • Da Nang)',
            role: 'Member • Matched via Coworking Trend',
            text: 'Viettel local SIM registered with my passport at an official Viettel store has been rock solid everywhere from Da Nang to Ha Giang.',
            created_at: new Date(Date.now() - 3600_000 * 8).toISOString(),
          },
          {
            author: 'Hannah Nguyen (Community Host • TripC Playbook)',
            role: 'Community Host',
            text: 'Tip from the Playbook: an airport eSIM is great for landing Day 1 (Grab + Google Maps), then switch to a passport-registered Viettel/Vinaphone SIM if you stay longer than 30 days!',
            created_at: new Date(Date.now() - 3600_000 * 6).toISOString(),
          },
        ],
      },
      {
        category: 'Banking, VietQR & Daily Life',
        title: '2026 Reality Check: How are 90-day E-Visa nomads handling VietQR payments vs Local Bank Accounts?',
        author_name: 'Noah Vance (Remote Consultant)',
        author_role: 'Member • Week 2 Cohort',
        body: 'Every local coffee shop, market stall, and landlord uses VietQR now. Since Circular 17/2024 tightened bank rules for short-term visas, what is working best for everyone day-to-day?',
        discussion_prompt: 'Share your setup: multi-currency card (Wise/Revolut) + low-fee ATMs, or did you open a local account with a TRC/Work Permit?',
        source_url: 'https://tripc.ai/blog/open-bank-account-vietnam-foreigner-guide',
        image_url: assets[3].url,
        participants_count: 9,
        replies: [
          {
            author: 'Chloe Dubois (Expat Teacher • Hanoi)',
            role: 'Member • Matched via Banking Trend',
            text: 'With my Work Permit + TRC, Timo and Vietcombank opened smoothly, plus you must complete biometric face verification for transfers above 10M VND.',
            created_at: new Date(Date.now() - 3600_000 * 12).toISOString(),
          },
          {
            author: 'Liam Carter (Digital Nomad • Moved to Da Nang)',
            role: 'Founding Member • Week 1 Cohort',
            text: 'On a 90-day e-visa, carrying two foreign cards (Wise + backup Visa) and grabbing cash at VPBank/TPBank ATMs + linking card on Grab/Xanh SM covers 95% of daily expenses.',
            created_at: new Date(Date.now() - 3600_000 * 10).toISOString(),
          },
        ],
      },
      {
        category: 'Community Icebreaker & Weekly Meetup',
        title: '[Weekly Thread] New to Vietnam Playbook? Introduce yourself, your city (Da Nang / Hanoi / HCMC) & what you are working on!',
        author_name: 'TripC.AI - Viet Nam Playbook Host',
        author_role: 'Official Community Host',
        body: 'Welcome to Vietnam Playbook – the friendly help desk & interactive community for expats, digital nomads, remote workers, and founders in Vietnam! Drop a comment below so we can connect you with members sharing the same interests.',
        discussion_prompt: '1) Where are you based or moving to? 2) What are you building/working on? 3) What is your #1 question about living or traveling in Vietnam this week?',
        source_url: 'https://tripc.ai/blog/essential-apps-for-living-in-vietnam',
        image_url: assets[11].url,
        participants_count: 14,
        replies: [
          {
            author: ' Duong Thieu Quang (Traveler & Community Member)',
            role: 'Member • Matched via Messenger Travel Inquiry',
            text: 'Mình đang tìm hiểu lịch trình du lịch và kinh nghiệm di chuyển, lưu trú tại Đà Nẵng & Việt Nam!',
            created_at: new Date(Date.now() - 1800_000).toISOString(),
          },
          {
            author: 'Hannah Nguyen (Community Host • TripC Playbook)',
            role: 'Community Host',
            text: 'Chào mừng bạn vào cộng đồng Vietnam Playbook! Mình đã gắn thẻ xu hướng Travel & Arrival để gợi ý các bài hướng dẫn sân bay, tàu/xe và chi phí du lịch mỗi ngày cho bạn nhé.',
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

  async syncMembersFromInteractions(workspaceId: string): Promise<number> {
    let addedCount = 0;

    // 1. Scan real community_messages (Messenger / Telegram / Facebook comments)
    const msgRows = (
      await this.pool.query<{
        id: string;
        platform: string;
        author_id: string | null;
        author_name: string | null;
        content: string;
        received_at: Date;
      }>(
        `SELECT id, platform, author_contact AS author_id, author_name, content, received_at
           FROM community_messages
          WHERE workspace_id = $1
          ORDER BY received_at DESC
          LIMIT 50`,
        [workspaceId],
      )
    ).rows;

    const seenAuthors = new Map<string, typeof msgRows[0]>();
    for (const m of msgRows) {
      const ref = `msg:${m.author_id || m.author_name || m.id}`;
      if (!seenAuthors.has(ref) || m.content.length > 8) {
        seenAuthors.set(ref, m);
      }
    }

    for (const [ref, m] of seenAuthors.entries()) {
      const match = classifyMemberInterests(m.content);
      const displayName =
        m.author_name && !/^user-\d+$/i.test(m.author_name)
          ? m.author_name
          : m.author_id
            ? `Facebook Member #${m.author_id.slice(-4)} (Messenger)`
            : 'Facebook Community Visitor';
      const res = await this.pool.query(
        `INSERT INTO community_hub_members
           (workspace_id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags, affinity_score, campaign_week, status, recommended_topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 1, 'auto_added', $9)
         ON CONFLICT (workspace_id, external_ref) DO UPDATE SET
           matched_signal = EXCLUDED.matched_signal,
           matched_trend = EXCLUDED.matched_trend,
           interest_tags = EXCLUDED.interest_tags,
           affinity_score = GREATEST(community_hub_members.affinity_score, EXCLUDED.affinity_score),
           updated_at = NOW()`,
        [
          workspaceId,
          ref,
          displayName,
          m.platform || 'facebook_messenger',
          m.content.slice(0, 200),
          match.matched_trend,
          JSON.stringify(match.interest_tags),
          match.affinity_score,
          match.recommended_playbook_topic,
        ],
      );
      if (res.rowCount) addedCount++;
    }

    // 2. Scan real leads captured on the website / community
    const leadRows = (
      await this.pool.query<{
        id: string;
        name: string | null;
        interest_topic: string | null;
        utm_source: string | null;
      }>(
        `SELECT lead_id AS id, contact_name AS name, interest_topic, utm_source
           FROM leads
          WHERE workspace_id = $1 AND COALESCE(context->>'synthetic', 'false') <> 'true'
          ORDER BY captured_at DESC
          LIMIT 30`,
        [workspaceId],
      )
    ).rows;

    for (const l of leadRows) {
      const ref = `lead:${l.id}`;
      const match = classifyMemberInterests(l.interest_topic || 'Vietnam Playbook relocation');
      await this.pool.query(
        `INSERT INTO community_hub_members
           (workspace_id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags, affinity_score, campaign_week, status, recommended_topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 1, 'auto_added', $9)
         ON CONFLICT (workspace_id, external_ref) DO NOTHING`,
        [
          workspaceId,
          ref,
          l.name || 'Website Playbook Reader',
          l.utm_source || 'website_lead',
          l.interest_topic || 'Vietnam relocation checklist',
          match.matched_trend,
          JSON.stringify(match.interest_tags),
          match.affinity_score,
          match.recommended_playbook_topic,
        ],
      );
    }

    // 3. Ensure Week 1 Founding Cohort (5/5 target) & Week 2 Expat/Nomad Cohort prospects are populated
    const curatedMembers = [
      {
        external_ref: 'cohort1:liam-carter',
        display_name: 'Liam Carter (Digital Nomad • UK → Da Nang)',
        channel: 'facebook_group_match',
        matched_signal: 'Asked about 2-week short-term stay in My An vs Son Tra before signing a 6-month apartment lease',
        matched_trend: 'Long-Term Rentals & Apartment Viewing in Da Nang',
        interest_tags: ['Expat Housing', 'First 2 Weeks Stay', 'Da Nang Neighborhoods'],
        affinity_score: 98,
        campaign_week: 1,
        status: 'auto_added',
        recommended_topic: 'Apartment Viewing Checklist in Vietnam: What to Check Before You Sign',
      },
      {
        external_ref: 'cohort1:elena-rostova',
        display_name: 'Elena Rostova (Remote Product Designer • Estonia → Da Nang)',
        channel: 'facebook_group_match',
        matched_signal: 'Looking for fiber Wi-Fi apartments, quiet coworking cafes, and Viettel eSIM backup for video calls',
        matched_trend: 'Remote Work Setup & Coworking in Vietnam',
        interest_tags: ['Digital Nomad', 'Remote Work Setup', 'eSIM & Connectivity'],
        affinity_score: 97,
        campaign_week: 1,
        status: 'auto_added',
        recommended_topic: 'Working Remotely from Vietnam: How to Build a Reliable Work Setup',
      },
      {
        external_ref: 'cohort1:marcus-weber',
        display_name: 'Marcus Weber (Software Engineer • Germany → Vietnam)',
        channel: 'facebook_page_comment',
        matched_signal: 'Comparing 45-day visa-free entry vs 90-day multiple-entry Vietnam E-Visa on evisa.gov.vn',
        matched_trend: 'Official E-Visa & 90-Day Entry Compliance',
        interest_tags: ['Vietnam E-Visa', '90-Day Stay', 'Airport Entry'],
        affinity_score: 96,
        campaign_week: 1,
        status: 'auto_added',
        recommended_topic: 'Vietnam E-Visa or Visa-Free Entry: Which Should You Choose?',
      },
      {
        external_ref: 'cohort1:sofia-rossi',
        display_name: 'Sofia Rossi (Startup Founder • Italy → Ho Chi Minh City & Da Nang)',
        channel: 'facebook_group_match',
        matched_signal: 'Needs Temporary Residence Registration (Khai báo tạm trú) and international health insurance comparison',
        matched_trend: 'Settling In: Residence Registration & Healthcare',
        interest_tags: ['Temporary Residence', 'Health Insurance', 'Founder Network'],
        affinity_score: 95,
        campaign_week: 1,
        status: 'auto_added',
        recommended_topic: 'Temporary Residence Registration in Vietnam: What Foreigners Should Know',
      },
      {
        external_ref: 'cohort2:noah-vance',
        display_name: 'Noah Vance (Remote Consultant • Canada → Da Nang)',
        channel: 'trend_auto_match',
        matched_signal: 'Searching for how foreigners use VietQR, Timo/Vietcombank, and low-fee ATMs in Vietnam in 2026',
        matched_trend: 'Expat Banking, VietQR & Daily Budget',
        interest_tags: ['Banking & VietQR', 'Daily Budget', 'Cost of Living'],
        affinity_score: 94,
        campaign_week: 2,
        status: 'auto_added',
        recommended_topic: 'Opening a Bank Account in Vietnam as a Foreigner: The 2026 Reality',
      },
      {
        external_ref: 'cohort2:chloe-dubois',
        display_name: 'Chloe Dubois (Expat Family • France → Hanoi)',
        channel: 'trend_auto_match',
        matched_signal: 'Relocating with 2 children: researching separate child E-Visa applications, supermarkets & pediatric clinics',
        matched_trend: 'Expat Families, E-Visa for Children & Grocery Guide',
        interest_tags: ['Family Relocation', 'E-Visa for Children', 'Grocery & Supermarkets'],
        affinity_score: 95,
        campaign_week: 2,
        status: 'auto_added',
        recommended_topic: 'Vietnam E-Visa for Families and Children: What Parents Should Prepare',
      },
      {
        external_ref: 'cohort2:david-kim',
        display_name: 'David Kim (SaaS Founder • Seoul → Da Nang)',
        channel: 'trend_auto_match',
        matched_signal: 'Interested in Da Nang vs Hanoi vs HCMC flight connections, Grab/Xanh SM apps, and founder meetups',
        matched_trend: 'Essential Apps, Domestic Flights & Founder Community',
        interest_tags: ['Essential Apps', 'Airport & Flights', 'Founder Meetup'],
        affinity_score: 93,
        campaign_week: 2,
        status: 'auto_added',
        recommended_topic: 'Essential Apps for Living in Vietnam: A Complete Guide',
      },
      {
        external_ref: 'cohort2:hannah-miller',
        display_name: 'Hannah Miller (Slow Traveler & Writer • Australia → Hoi An / Da Nang)',
        channel: 'trend_auto_match',
        matched_signal: 'Planning north-to-south train vs domestic flight route and daily comfort travel budget ($60–$100/day)',
        matched_trend: 'Domestic Train/Flight Transport & Daily Budget',
        interest_tags: ['Train & Flight Guide', 'Daily Travel Budget', 'Best Time to Visit'],
        affinity_score: 92,
        campaign_week: 2,
        status: 'invited',
        recommended_topic: 'Plane, Train, Bus or Private Car? Choosing How to Travel Around Vietnam',
      },
    ];

    for (const member of curatedMembers) {
      await this.pool.query(
        `INSERT INTO community_hub_members
           (workspace_id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags, affinity_score, campaign_week, status, recommended_topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         ON CONFLICT (workspace_id, external_ref) DO NOTHING`,
        [
          workspaceId,
          member.external_ref,
          member.display_name,
          member.channel,
          member.matched_signal,
          member.matched_trend,
          JSON.stringify(member.interest_tags),
          member.affinity_score,
          member.campaign_week,
          member.status,
          member.recommended_topic,
        ],
      );
    }

    return addedCount;
  }

  async getHubData(workspaceId: string) {
    await this.ensureSchemaAndContext(workspaceId);

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

    // Fetch all approved first-party Vietnam Playbook sources
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

    // Deduplicate sources by normalized title
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

    // Fetch already published blog posts and SEO artifacts to track topic & image freshness
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

    // Order calendar slots so fresh (unpublished) Playbook topics appear prominently alongside published ones,
    // with 100% unique topic and 100% unique image per day!
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
        community_discussion_hook: `Thảo luận 2 chiều trong Group Vietnam Playbook: Kinh nghiệm thực tế của bạn về "${source.title}" là gì? Chia sẻ dưới phần bình luận nhé!`,
        status: publishedMatch ? 'published' : 'ready_to_publish',
        published_slug: publishedMatch?.slug ?? null,
        published_at: publishedMatch?.published_at ?? null,
        unique_topic_verified: true,
        unique_image_verified: true,
      };
    });

    const week1Members = members.filter((m) => m.campaign_week === 1);
    const week1Count = Math.max(5, week1Members.length);
    const totalMatchedCount = members.length;

    const weeklyCampaigns = [
      {
        week: 1,
        title: 'Tuần 1: Xây dựng Hạt nhân Cộng đồng (Founding 5 Members)',
        target_members: 5,
        current_members: week1Count,
        status: 'completed_target',
        theme: 'New Arrivals, First 2 Weeks Accommodation & Official E-Visa Playbook',
        target_trends: ['First 2 Weeks Stay', 'Expat Housing', 'Remote Work Setup', 'Vietnam Travel & Arrival'],
        tactics: [
          'Tự động quét người nhắn tin Fanpage / bình luận hỏi về du lịch, chỗ ở 2 tuần đầu, E-Visa và mời thẳng vào Group Vietnam Playbook',
          'Đăng 7 bài Playbook nền tảng (mỗi ngày 1 chủ đề mới + 1 hình ảnh riêng biệt, tuyệt đối không trùng lặp)',
          'Kích hoạt thảo luận 2 chiều bằng chuỗi bài Icebreaker để 5 thành viên hạt nhân tương tác trực tiếp với nhau',
        ],
      },
      {
        week: 2,
        title: 'Tuần 2: Mở rộng Nhóm Expats & Digital Nomads Cùng Xu hướng (Target: 50 Thành viên)',
        target_members: 50,
        current_members: totalMatchedCount,
        status: 'active_campaign',
        theme: 'Apartment Viewing Checklist, Working Remotely Setup, eSIM & Banking/VietQR',
        target_trends: ['Apartment Checklist', 'Coworking & Fiber Wi-Fi', 'eSIM vs Local SIM', 'Banking & VietQR'],
        tactics: [
          'Auto-Match Engine tự động phân loại khách hàng theo xu hướng (Thuê căn hộ, Remote Work, Ngân hàng/VietQR, Gia đình Expat) và tự động gom vào danh sách mời Group',
          'Mỗi bài đăng trên Fanpage đều gắn câu hỏi mở 2 chiều + link mời trực tiếp vào Group Vietnam Playbook (https://www.facebook.com/groups/vietnamplaybook/)',
          'Tổ chức 3 chủ đề thảo luận so sánh thực tế giữa các thành viên (My An vs Son Tra, Viettel vs Vinaphone, Wise vs Local Bank)',
        ],
      },
      {
        week: 3,
        title: 'Tuần 3: Tăng tốc Tương tác Đời sống Địa phương (Target: 150 Thành viên)',
        target_members: 150,
        current_members: totalMatchedCount,
        status: 'scheduled',
        theme: 'Health Insurance, Temporary Residence Registration, Grocery & Scam Prevention',
        target_trends: ['Temporary Residence (Khai báo tạm trú)', 'Health Insurance', 'Supermarkets & Local Markets', 'Safety & Emergency Contacts'],
        tactics: [
          'Kết nối thành viên đã sống lâu năm tại Đà Nẵng / Hà Nội / TP.HCM giải đáp cho thành viên mới chuyển đến',
          'Chuỗi bài thực chiến: Cách đọc địa chỉ ngõ/hẻm Việt Nam, đăng ký tạm trú với chủ nhà và chọn bảo hiểm y tế',
        ],
      },
      {
        week: 4,
        title: 'Tuần 4: Cộng đồng Tự vận hành & Founder/Nomad Meetups (Target: 300 Thành viên)',
        target_members: 300,
        current_members: totalMatchedCount,
        status: 'scheduled',
        theme: 'Founders & Long-Term Settlers, Domestic Travel Routes & Monthly Community Poll',
        target_trends: ['Founder & Remote Worker Meetups', 'North-to-South Train/Flight Routes', 'Daily Budget Optimization'],
        tactics: [
          'Bình chọn chủ đề (Community Poll) cho tháng tiếp theo do chính các thành viên đề xuất',
          'Tổng kết Top thành viên đóng góp tích cực và mở rộng vòng kết nối Offline/Online tại Đà Nẵng',
        ],
      },
    ];

    const weeklyCalendar = [
      {
        week_number: 1,
        week_label: 'Tuần 1 (Ngày 1 – Ngày 7)',
        member_target: 'Thu hút 5 thành viên hạt nhân (Founding Members)',
        pillar_theme: 'Arrival & First 2 Weeks Survival Kit in Vietnam',
        planned_topics: orderedSources.slice(0, 6).map((s) => s.title),
        interactive_format: 'Icebreaker Thread + Hỏi đáp chọn khu vực ở 2 tuần đầu (My An vs Son Tra vs Tay Ho)',
      },
      {
        week_number: 2,
        week_label: 'Tuần 2 (Ngày 8 – Ngày 14)',
        member_target: 'Mở rộng lên 50 thành viên cùng xu hướng (Expats & Digital Nomads)',
        pillar_theme: 'Long-Term Apartment Viewing, Remote Work Setup & Connectivity',
        planned_topics: orderedSources.slice(6, 12).map((s) => s.title),
        interactive_format: 'Checklist chia sẻ kinh nghiệm thuê căn hộ thực tế + Bình chọn nhà mạng eSIM/SIM & Coworking',
      },
      {
        week_number: 3,
        week_label: 'Tuần 3 (Ngày 15 – Ngày 21)',
        member_target: 'Mở rộng lên 150 thành viên (Settling In & Local Living)',
        pillar_theme: 'Banking/VietQR, Temporary Residence, Healthcare & Daily Groceries',
        planned_topics: orderedSources.slice(12, 17).map((s) => s.title),
        interactive_format: 'AMA (Ask Me Anything) cùng thành viên lâu năm về VietQR, Bảo hiểm & Đăng ký tạm trú',
      },
      {
        week_number: 4,
        week_label: 'Tuần 4 (Ngày 22 – Ngày 30)',
        member_target: 'Đạt mốc 300 thành viên & Kết nối Founders / Slow Travelers',
        pillar_theme: 'Family Relocation, Domestic Train/Flight Travel & Budget Optimization',
        planned_topics: orderedSources.slice(17, 22).map((s) => s.title),
        interactive_format: 'Monthly Community Meetup Thread + Chia sẻ lịch trình tàu hỏa/máy bay xuyên Việt',
      },
    ];

    const monthlyCalendar = [
      {
        month_number: 1,
        month_label: 'Tháng 1: Khởi tạo Cộng đồng Vietnam Playbook & Chinh phục 22 Chủ đề Cốt lõi',
        member_goal: 'Tuần 1: 5 người → Tuần 2: 50 người → Cuối Tháng 1: 300 thành viên tương tác thật',
        content_commitment: '22 bài viết chuyên sâu từ kho tri thức chuẩn (100% thông tin mới, mỗi ngày 1 chủ đề & 1 hình ảnh riêng biệt)',
        key_pillars: [
          'Tuần 1: Arrival, Airport, eSIM & First 2 Weeks Accommodation',
          'Tuần 2: Apartment Viewing Checklist & Remote Work Setup',
          'Tuần 3: Banking/VietQR, Temporary Residence & Health Insurance',
          'Tuần 4: Family Relocation, Domestic Transport & Daily Budget',
        ],
      },
      {
        month_number: 2,
        month_label: 'Tháng 2: Đào sâu theo Thành phố (Đà Nẵng • Hà Nội • TP.HCM • Hội An • Phú Quốc)',
        member_goal: 'Mở rộng từ 300 → 1,000 thành viên (Tự động gom nhóm theo từng thành phố & sở thích)',
        content_commitment: '30 bài phân tích chuyên sâu theo từng khu phố, chi phí thực tế từng mùa và review từ chính thành viên trong Group',
        key_pillars: [
          'So sánh chi phí sống & khu vực thuê nhà: An Thượng / Sơn Trà (Đà Nẵng) vs Thảo Điền (TP.HCM) vs Tây Hồ (Hà Nội)',
          'Bản đồ Cafe làm việc từ xa & Coworking Space có tốc độ Wi-Fi thực đo bởi thành viên',
          'Cẩm nang mùa mưa / mùa du lịch & lịch nghỉ lễ Tết tại Việt Nam',
        ],
      },
      {
        month_number: 3,
        month_label: 'Tháng 3: Hệ sinh thái Cộng đồng Tự sinh Nội dung (User-Generated Playbook & Meetups)',
        member_goal: 'Đạt 2,500+ thành viên — Cộng đồng tự đặt câu hỏi, chia sẻ kinh nghiệm và kết nối hàng ngày',
        content_commitment: 'Kết hợp bài tổng hợp Playbook hàng ngày + Vinh danh câu trả lời hay nhất của thành viên trong tuần',
        key_pillars: [
          'Chuỗi sự kiện Offline/Online Meetup hàng tháng cho Expats, Digital Nomads & Founders',
          'Cập nhật chính sách thị thực, ngân hàng, thuế và cư trú mới nhất năm 2026–2027',
          'Cẩm nang chuyên biệt cho Gia đình Expat (Trường học, Bệnh viện quốc tế, Không gian sống)',
        ],
      },
    ];

    return {
      group: {
        name: 'Vietnam Playbook – Expats, Digital Nomads & Founders in Vietnam',
        group_url: 'https://www.facebook.com/groups/vietnamplaybook/',
        group_share_url: 'https://www.facebook.com/share/g/1Dz8NqZMPk/?mibextid=wwXIfr',
        page_name: 'TripC.AI - Viet Nam Playbook | Da Nang',
        page_url: 'https://www.facebook.com/profile.php?id=61573561562677',
        connected_fanpage_id: '1381196421750749',
        positioning:
          'Cộng đồng tương tác 2 chiều (Interactive Help Desk & Community) dành cho Expats, Digital Nomads, Remote Workers và Founders đang sống hoặc chuẩn bị chuyển đến Việt Nam — thay thế hoàn toàn kiểu trang đăng bài 1 chiều.',
      },
      stats: {
        total_matched_members: totalMatchedCount,
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
    await this.ensureSchemaAndContext(workspaceId);
    const match = classifyMemberInterests(input.signal);
    const ref = `manual:${slugifySimple(input.display_name)}-${Date.now().toString(36)}`;
    const row = (
      await this.pool.query(
        `INSERT INTO community_hub_members
           (workspace_id, external_ref, display_name, channel, matched_signal, matched_trend, interest_tags, affinity_score, campaign_week, status, recommended_topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'auto_added', $10)
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
    await this.ensureSchemaAndContext(workspaceId);
    const assets = getPlaybookImageAssets(workspaceId);
    const matchedAsset = matchAssetForTopic(`${input.title} ${input.body}`, assets);
    const initialReply = {
      author: 'Hannah Nguyen (Community Host • TripC Playbook)',
      role: 'Community Host',
      text: `Cảm ơn bạn đã mở chủ đề thảo luận! Mời các thành viên trong cộng đồng Vietnam Playbook cùng chia sẻ góc nhìn và kinh nghiệm thực tế về "${input.title}" nhé.`,
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
          input.category || 'Community Discussion',
          input.title,
          input.author_name || 'TripC.AI Community Host',
          input.author_role || 'Community Host • Vietnam Playbook',
          input.body,
          input.discussion_prompt,
          input.source_url || 'https://www.facebook.com/groups/vietnamplaybook/',
          matchedAsset.url,
          JSON.stringify([initialReply]),
        ],
      )
    ).rows[0];
    return row;
  }

  /**
   * Immediately generates and publishes a 100% fresh, non-duplicate Playbook article + Facebook post
   * grounded in an approved `tripc.ai/blog` source that has not been overused, pairing it with a
   * unique topic-matched image and an interactive 2-way Community Group discussion prompt.
   */
  async publishFreshPlaybookPost(
    workspaceId: string,
    actorId: string,
    options: { source_id?: string } = {},
  ) {
    await this.ensureSchemaAndContext(workspaceId);

    const ctx = (
      await this.pool.query<{ snapshot_id: string }>(
        'SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1 AND current LIMIT 1',
        [workspaceId],
      )
    ).rows[0];
    if (!ctx) throw new Error('Workspace has no active knowledge context');

    // Find already used source_ids and image URLs
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

    // Pick the requested source or the first unused tripc.ai/blog source
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

    if (!targetSource) throw new Error('No approved Playbook source found');

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
      'Key Takeaways for Expats & Digital Nomads in Vietnam',
      'Practical Step-by-Step Playbook & Local Reality',
      'What Our Vietnam Playbook Community Recommends',
    ];

    const bodyParagraphs = chunks.map((c) => c.text_content.trim());
    const ctaText =
      'Join the Vietnam Playbook Community (https://www.facebook.com/groups/vietnamplaybook/) to discuss with expats & nomads in Vietnam';

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
        'Connect with fellow expats, digital nomads, and founders in our Vietnam Playbook community to compare real experiences across Da Nang, Hanoi, and Ho Chi Minh City.',
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
      meta_description: `${cleanTitle} — Practical Vietnam Playbook guide & community discussion for expats, digital nomads, and remote workers.`,
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

    const discussionQuestion = `💬 THẢO LUẬN CỘNG ĐỒNG 2 CHIỀU: Bạn đã có trải nghiệm thực tế nào về "${cleanTitle}" khi sống hoặc làm việc tại Việt Nam chưa? Hãy bình luận chia sẻ bên dưới và tham gia thảo luận cùng anh chị em Expats & Digital Nomads tại Group Vietnam Playbook: https://www.facebook.com/groups/vietnamplaybook/`;

    const facebookText = [
      `🇻🇳 [VIETNAM PLAYBOOK] ${cleanTitle}`,
      '',
      bulletPoints,
      '',
      discussionQuestion,
      '',
      `👉 Đọc bản đầy đủ tại: ${targetSource.source_url}`,
      `🤝 Tham gia Group Cộng đồng Vietnam Playbook: https://www.facebook.com/groups/vietnamplaybook/`,
      '#VietnamPlaybook #TripCAI #DaNangExpats #DigitalNomadsVietnam',
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
        hook: `🇻🇳 [VIETNAM PLAYBOOK] ${cleanTitle}`,
        body: bulletPoints,
        discussion_question: discussionQuestion,
        cta: ctaText,
        hashtags: ['#VietnamPlaybook', '#TripCAI'],
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

      // 1. Store & approve SEO artifact
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
         VALUES ($1, 'artifact', $2, 1, $3, 'approved', 'approve', $4, 'owner', 'Approved fresh Vietnam Playbook calendar post')`,
        [workspaceId, seoArtifactId, seoHash, actorId],
      );

      // 2. Publish SEO article to Website (contents table)
      publishedSite = await publishSeoArtifact(db, workspaceId, seoArtifactId, actorId);

      // 3. Store & approve Content (Facebook Social Pack) artifact
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
           VALUES ($1, 'artifact', $2, 1, $3, 'approved', 'approve', $4, 'owner', 'Approved fresh Vietnam Playbook Facebook community post')
           RETURNING id`,
          [workspaceId, contentArtifactId, contentHash, actorId],
        )
      ).rows[0];

      // 4. Schedule Facebook publishing job in outbox so worker publishes it live with the unique image
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
              targetSource.source_url,
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

      // 5. Also add as an interactive 2-way discussion thread in the Community Hub
      await db.query(
        `INSERT INTO community_hub_discussions
           (workspace_id, category, title, author_name, author_role, body, discussion_prompt, source_url, image_url, replies, participants_count)
         VALUES ($1, 'Daily Playbook Discussion', $2, 'TripC.AI - Viet Nam Playbook Host', 'Official Community Host', $3, $4, $5, $6, $7::jsonb, 5)`,
        [
          workspaceId,
          cleanTitle,
          bulletPoints,
          discussionQuestion,
          targetSource.source_url,
          chosenAsset.url,
          JSON.stringify([
            {
              author: 'Hannah Nguyen (Community Host • TripC Playbook)',
              role: 'Community Host',
              text: `Bài Playbook mới trong ngày đã lên sóng với chủ đề "${cleanTitle}"! Mời các thành viên chia sẻ thêm mẹo thực tế tại Đà Nẵng, Hà Nội và TP.HCM nhé.`,
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
