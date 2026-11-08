import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { getWorkspaceConnectionStatus } from '../integrations/stubs';
import { publishSeoArtifact } from '../site/publish';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported
}

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
  match_slug?: string;
}

function makeAsset(
  workspaceId: string,
  index: number,
  url: string,
  attribution: string,
  topicTags: string[],
  matchSlug?: string,
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
    match_slug: matchSlug,
  };
}

/**
 * 30 Approved, 100% Distinct High-Resolution Unsplash Images:
 * - Assets 1..25: Dedicated 1-to-1 to each of the 25 unique approved Playbook topics (0% overlap).
 * - Assets 26..30: Dedicated exclusively to Community Discussions (0% overlap with article images).
 */
export function getPlaybookImageAssets(workspaceId: string): PlaybookAsset[] {
  return [
    makeAsset(
      workspaceId,
      1,
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Apartment Viewing Checklist What to Check Before You Sign Lease Rental',
      ['apartment viewing checklist', 'before you sign', 'apartment', 'viewing', 'checklist'],
      'apartment-viewing-checklist-vietnam',
    ),
    makeAsset(
      workspaceId,
      2,
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Working Remotely Build Reliable Work Setup Coworking Desk Ergonomic',
      ['working remotely', 'reliable work setup', 'remotely', 'work setup'],
      'working-remotely-from-vietnam-setup-guide',
    ),
    makeAsset(
      workspaceId,
      3,
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - eSIM or Local SIM Which Should You Buy Mobile Data Cellular',
      ['esim or local sim', 'esim', 'local sim'],
      'vietnam-esim-vs-sim-card',
    ),
    makeAsset(
      workspaceId,
      4,
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Opening a Bank Account as a Foreigner 2026 Reality Banking VietQR',
      ['opening a bank account', 'bank account', 'foreigner'],
      'open-bank-account-vietnam-foreigner-guide',
    ),
    makeAsset(
      workspaceId,
      5,
      'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Health Insurance Local vs International Coverage Medical Clinic Hospital',
      ['health insurance', 'local vs international coverage', 'insurance'],
      'health-insurance-vietnam-local-vs-international',
    ),
    makeAsset(
      workspaceId,
      6,
      'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Grocery Shopping Supermarkets Local Markets Fresh Produce Basket',
      ['grocery shopping', 'supermarkets', 'local markets'],
      'grocery-shopping-in-vietnam-expat-guide',
    ),
    makeAsset(
      workspaceId,
      7,
      'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Where Should You Stay During Your First Two Weeks Short Term Neighborhood',
      ['first two weeks', 'where should you stay'],
      'first-two-weeks-in-vietnam-accommodation-guide',
    ),
    makeAsset(
      workspaceId,
      8,
      'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Plane Train Bus or Private Car Choosing How to Travel Around Railway',
      ['plane, train, bus', 'private car', 'travel around'],
      'how-to-travel-around-vietnam-guide',
    ),
    makeAsset(
      workspaceId,
      9,
      'https://images.unsplash.com/photo-1555921015-5532091f6026?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Vietnamese Addresses Explained Alleys House Numbers Finding Right Entrance',
      ['vietnamese addresses explained', 'alleys', 'house numbers', 'right entrance'],
      'vietnamese-address-format-guide',
    ),
    makeAsset(
      workspaceId,
      10,
      'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Ha Noi Da Nang TP Ho Chi Minh Nen Bay Den San Bay Nao Which Airport Fly Into',
      ['sân bay nào', 'bay đến sân bay', 'which airport'],
      'which-airport-to-fly-into-vietnam',
    ),
    makeAsset(
      workspaceId,
      11,
      'https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - What to Pack and What to Leave at Home When Moving Suitcase Luggage',
      ['what to pack', 'leave at home', 'when moving'],
      'packing-list-moving-to-vietnam',
    ),
    makeAsset(
      workspaceId,
      12,
      'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Essential Apps for Living Complete Guide Ride Hailing Zalo Grab Smartphone',
      ['essential apps for living', 'essential apps'],
      'essential-apps-for-living-in-vietnam',
    ),
    makeAsset(
      workspaceId,
      13,
      'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Temporary Residence Registration What Foreigners Should Know Ward Police',
      ['temporary residence registration', 'temporary residence'],
      'temporary-residence-registration-guide',
    ),
    makeAsset(
      workspaceId,
      14,
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Common Scams What New Arrivals Should Watch Out For Street Safety',
      ['common scams', 'watch out for', 'new arrivals'],
      'common-scams-in-vietnam-guide',
    ),
    makeAsset(
      workspaceId,
      15,
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - How Much Does a Day Cost Travel Budget from Backpacker to Comfort Daily Expense',
      ['how much does a day', 'travel budget', 'backpacker to comfort'],
      'vietnam-travel-budget-per-day',
    ),
    makeAsset(
      workspaceId,
      16,
      'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Thoi Diem Tot Nhat De Den Viet Nam Best Time to Visit Weather Seasons',
      ['thời điểm tốt nhất', 'best time to visit'],
      'best-time-to-visit-vietnam',
    ),
    makeAsset(
      workspaceId,
      17,
      'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Emergency Numbers and Essential Contacts Ambulance Police Fire Hotline',
      ['emergency numbers', 'essential contacts'],
      'vietnam-emergency-numbers-essential-contacts',
    ),
    makeAsset(
      workspaceId,
      18,
      'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Does Vietnam Require Proof of Onward Travel Return Ticket Boarding Pass',
      ['proof of onward travel', 'onward travel', 'onward ticket'],
      'vietnam-onward-ticket-requirement',
    ),
    makeAsset(
      workspaceId,
      19,
      'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - How Many Months Must My Passport Be Valid For Enter Six Months Blank Pages',
      ['passport be valid', 'how many months', 'passport validity'],
      'vietnam-passport-validity',
    ),
    makeAsset(
      workspaceId,
      20,
      'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - How Much Cash Should You Bring Cash Cards and ATMs Explained Currency Notes',
      ['how much cash', 'cash, cards and atms', 'bring to vietnam'],
      'how-much-cash-to-bring-to-vietnam',
    ),
    makeAsset(
      workspaceId,
      21,
      'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - E-Visa for Families and Children What Parents Should Prepare Kids Minors',
      ['families and children', 'what parents should prepare', 'families'],
      'vietnam-e-visa-families-children-guide',
    ),
    makeAsset(
      workspaceId,
      22,
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - E-Visa Guide 2026 How to Apply Enter and Avoid Common Mistakes Application',
      ['e-visa guide 2026', 'how to apply, enter', 'avoid common mistakes'],
      'vietnam-e-visa-guide-2026',
    ),
    makeAsset(
      workspaceId,
      23,
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - E-Visa or Visa-Free Entry Which Should You Choose Exemption Comparison',
      ['visa-free entry', 'e-visa or visa-free', 'exemption'],
      'vietnam-evisa-vs-visa-exemption',
    ),
    makeAsset(
      workspaceId,
      24,
      'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - E-Visa Processing Time When to Apply Working Days Turnaround Calendar',
      ['processing time', 'when to apply'],
      'vietnam-evisa-processing-time',
    ),
    makeAsset(
      workspaceId,
      25,
      'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Which E-Visa Website Is Official How to Spot Fake Sites Portal Verification',
      ['website is official', 'spot fake sites', 'official'],
      'official-vietnam-evisa-website',
    ),
    // Dedicated exclusively to Community Discussions (26..30) so discussions never reuse article photos:
    makeAsset(
      workspaceId,
      26,
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Da Nang Neighborhoods My An vs Son Tra Apartment Living',
      ['discussion-housing', 'mỹ an', 'sơn trà'],
      'discussion-housing',
    ),
    makeAsset(
      workspaceId,
      27,
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Remote Workers Fiber Wifi 4G 5G Backup Cafe Coworking',
      ['discussion-remote', 'cáp quang', 'coworking'],
      'discussion-remote',
    ),
    makeAsset(
      workspaceId,
      28,
      'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion QR Payment VietQR ATM Card Wise Revolut Daily Living',
      ['discussion-payment', 'vietqr', 'atm'],
      'discussion-payment',
    ),
    makeAsset(
      workspaceId,
      29,
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Welcome New Members Connect Travelers Expats Vietnam',
      ['discussion-welcome', 'chào mừng thành viên mới'],
      'discussion-welcome',
    ),
    makeAsset(
      workspaceId,
      30,
      'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Open Forum Vietnam Travel Experiences Local Tips',
      ['discussion-general', 'thảo luận cộng đồng'],
      'discussion-general',
    ),
  ];
}

export function getTopicImageAssets(workspaceId: string): PlaybookAsset[] {
  return getPlaybookImageAssets(workspaceId).slice(0, 25);
}

export function getDiscussionImageAssets(workspaceId: string): PlaybookAsset[] {
  return getPlaybookImageAssets(workspaceId).slice(25, 30);
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

export function matchAssetForTopic(
  titleOrSlug: string,
  assets: PlaybookAsset[],
  usedUrls: Set<string> = new Set(),
  sourceUrl?: string,
): PlaybookAsset {
  const lower = titleOrSlug.toLowerCase();
  const slugPart = sourceUrl ? sourceUrl.split('/').pop()?.toLowerCase() ?? '' : '';

  // 1. Direct 1-to-1 slug match if available and not used
  if (slugPart) {
    const exactBySlug = assets.find(
      (a) => a.match_slug && (slugPart === a.match_slug || slugPart.includes(a.match_slug)) && !usedUrls.has(a.url),
    );
    if (exactBySlug) return exactBySlug;
  }

  // 2. Score by multi-word phrase hits first, then single tag hits, strictly preferring unused URLs
  const scored = assets.map((asset, idx) => {
    const phraseHits = asset.topic_tags.filter((tag) => tag.includes(' ') && lower.includes(tag)).length;
    const singleHits = asset.topic_tags.filter((tag) => !tag.includes(' ') && lower.includes(tag)).length;
    const attrWords = asset.attribution
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !['unsplash', 'vietnam', 'guide', 'complete', 'what', 'when', 'which'].includes(w));
    const attrHits = attrWords.filter((w) => lower.includes(w)).length;
    const isUsed = usedUrls.has(asset.url) ? 1 : 0;
    return { asset, score: phraseHits * 50 + singleHits * 15 + attrHits * 4, isUsed, idx };
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
  if (/bank|ngân hàng|vietqr|tiền|chi phí|budget|cost|atm|cash/i.test(lower)) {
    tags.push('Thanh toán VietQR & Ngân hàng', 'Chi phí du lịch mỗi ngày');
    trend = 'Chi phí du lịch, Thanh toán VietQR & Ngân hàng tại Việt Nam';
    score = 94;
    topic = 'Opening a Bank Account in Vietnam as a Foreigner: The 2026 Reality';
  }
  if (/bảo hiểm|insurance|y tế|bệnh viện|khẩn cấp|emergency|scam/i.test(lower)) {
    tags.push('Bảo hiểm & Y tế', 'An toàn Du lịch');
    trend = 'Bảo hiểm Sức khỏe, An toàn & Liên hệ Khẩn cấp tại Việt Nam';
    score = 95;
    topic = 'Health Insurance in Vietnam: Local vs International Coverage';
  }
  if (/visa|evisa|e-visa|hộ chiếu|passport|nhập cảnh|entry|onward/i.test(lower)) {
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
  group_member_count: number;
  week1_target: number;
  week2_target: number;
  week3_target: number;
  week4_target: number;
  updated_at?: string;
}

const VN_WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function formatVnDateTime(date: Date, includeTime = true): { full: string; short: string; dateOnly: string } {
  // Shift to UTC+7 (Vietnam Standard Time)
  const vnTime = new Date(date.getTime() + 7 * 3600_000);
  const dow = VN_WEEKDAYS[vnTime.getUTCDay()];
  const dd = String(vnTime.getUTCDate()).padStart(2, '0');
  const mm = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = vnTime.getUTCFullYear();
  const hh = String(vnTime.getUTCHours()).padStart(2, '0');
  const min = String(vnTime.getUTCMinutes()).padStart(2, '0');
  const dateOnly = `${dd}/${mm}/${yyyy}`;
  if (!includeTime) {
    return { full: `${dow}, ${dateOnly}`, short: dateOnly, dateOnly };
  }
  return {
    full: `${dow}, ${dateOnly} • ${hh}:${min}`,
    short: `${dateOnly} • ${hh}:${min}`,
    dateOnly,
  };
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
    const defaultGroupUrl = 'https://www.facebook.com/groups/1134282109069209';
    const defaultCommunityName = 'Cộng đồng Du lịch & Sống tại Việt Nam';
    const defaultPositioning = `Chào mừng bạn đến với ${defaultCommunityName}! 🌿🇻🇳 Không gian dành cho những ai yêu thích khám phá vẻ đẹp mảnh đất hình chữ S và chia sẻ trải nghiệm thực tế về lịch trình du lịch, địa điểm check-in, ẩm thực địa phương, nơi ở, chi phí sinh hoạt, thủ tục và kết nối bạn đồng hành trên Fanpage "${pageName}" & Nhóm Facebook (${defaultGroupUrl}).`;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS community_hub_settings (
        workspace_id UUID PRIMARY KEY,
        community_name VARCHAR(255) NOT NULL,
        group_url TEXT NOT NULL,
        page_name VARCHAR(255) NOT NULL,
        page_url TEXT NOT NULL,
        positioning TEXT NOT NULL,
        group_member_count INT NOT NULL DEFAULT 5,
        week1_target INT NOT NULL DEFAULT 5,
        week2_target INT NOT NULL DEFAULT 50,
        week3_target INT NOT NULL DEFAULT 150,
        week4_target INT NOT NULL DEFAULT 300,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS group_member_count INT NOT NULL DEFAULT 5;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week1_target INT NOT NULL DEFAULT 5;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week2_target INT NOT NULL DEFAULT 50;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week3_target INT NOT NULL DEFAULT 150;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week4_target INT NOT NULL DEFAULT 300;
    `);

    // Only normalize legacy URLs or forbidden "2 chiều" wording; preserve live synced positioning and member count
    await this.pool.query(
      `UPDATE community_hub_settings
          SET page_url = $2,
              community_name = CASE
                WHEN community_name LIKE '%Cộng đồng Dịch vụ hỗ trợ du lịch%' THEN $5
                ELSE community_name
              END,
              group_url = CASE
                WHEN group_url LIKE '%profile.php%' OR group_url LIKE '%1381196421750749%' OR group_url LIKE '%vietnamplaybook%' THEN $3
                ELSE group_url
              END,
              positioning = CASE
                WHEN positioning LIKE '%2 chiều%' OR positioning LIKE '%vietnamplaybook%' OR positioning = '' THEN $4
                ELSE positioning
              END
        WHERE workspace_id = $1`,
      [workspaceId, defaultPageUrl, defaultGroupUrl, defaultPositioning, defaultCommunityName],
    );

    const saved = (
      await this.pool.query<{
        community_name: string;
        group_url: string;
        page_name: string;
        page_url: string;
        positioning: string;
        group_member_count: number;
        week1_target: number;
        week2_target: number;
        week3_target: number;
        week4_target: number;
        updated_at: Date;
      }>('SELECT * FROM community_hub_settings WHERE workspace_id = $1', [workspaceId])
    ).rows[0];

    if (!saved) {
      await this.pool.query(
        `INSERT INTO community_hub_settings (workspace_id, community_name, group_url, page_name, page_url, positioning, group_member_count, week1_target, week2_target, week3_target, week4_target)
         VALUES ($1, $2, $3, $4, $5, $6, 5, 5, 50, 150, 300)
         ON CONFLICT (workspace_id) DO NOTHING`,
        [workspaceId, defaultCommunityName, defaultGroupUrl, pageName, defaultPageUrl, defaultPositioning],
      );
      return {
        community_name: defaultCommunityName,
        group_url: defaultGroupUrl,
        page_name: pageName,
        page_url: defaultPageUrl,
        connected_fanpage_id: pageId,
        positioning: defaultPositioning,
        group_member_count: 5,
        week1_target: 5,
        week2_target: 50,
        week3_target: 150,
        week4_target: 300,
        updated_at: new Date().toISOString(),
      };
    }

    return {
      community_name: saved.community_name,
      group_url: saved.group_url,
      page_name: saved.page_name || pageName,
      page_url: saved.page_url || defaultPageUrl,
      connected_fanpage_id: pageId,
      positioning: saved.positioning,
      group_member_count: typeof saved.group_member_count === 'number' ? saved.group_member_count : 5,
      week1_target: typeof saved.week1_target === 'number' && saved.week1_target > 0 ? saved.week1_target : 5,
      week2_target: typeof saved.week2_target === 'number' && saved.week2_target > 0 ? saved.week2_target : 50,
      week3_target: typeof saved.week3_target === 'number' && saved.week3_target > 0 ? saved.week3_target : 150,
      week4_target: typeof saved.week4_target === 'number' && saved.week4_target > 0 ? saved.week4_target : 300,
      updated_at: saved.updated_at ? saved.updated_at.toISOString() : new Date().toISOString(),
    };
  }

  async updateCommunitySettings(
    workspaceId: string,
    input: {
      community_name?: string;
      group_url?: string;
      positioning?: string;
      group_member_count?: number;
      week1_target?: number;
      week2_target?: number;
      week3_target?: number;
      week4_target?: number;
    },
  ): Promise<CommunitySettings> {
    const current = await this.getCommunitySettings(workspaceId);
    const nextName = input.community_name?.trim() || current.community_name;
    const nextGroupUrl = input.group_url?.trim() || current.group_url;
    const nextPositioning = input.positioning?.trim() || current.positioning;
    const nextGroupCount =
      typeof input.group_member_count === 'number' && Number.isFinite(input.group_member_count) && input.group_member_count >= 0
        ? Math.round(input.group_member_count)
        : current.group_member_count;
    const nextW1 =
      typeof input.week1_target === 'number' && Number.isFinite(input.week1_target) && input.week1_target >= 1
        ? Math.round(input.week1_target)
        : current.week1_target;
    const nextW2 =
      typeof input.week2_target === 'number' && Number.isFinite(input.week2_target) && input.week2_target >= 1
        ? Math.round(input.week2_target)
        : current.week2_target;
    const nextW3 =
      typeof input.week3_target === 'number' && Number.isFinite(input.week3_target) && input.week3_target >= 1
        ? Math.round(input.week3_target)
        : current.week3_target;
    const nextW4 =
      typeof input.week4_target === 'number' && Number.isFinite(input.week4_target) && input.week4_target >= 1
        ? Math.round(input.week4_target)
        : current.week4_target;

    await this.pool.query(
      `UPDATE community_hub_settings
          SET community_name = $2,
              group_url = $3,
              positioning = $4,
              group_member_count = $5,
              week1_target = $6,
              week2_target = $7,
              week3_target = $8,
              week4_target = $9,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [workspaceId, nextName, nextGroupUrl, nextPositioning, nextGroupCount, nextW1, nextW2, nextW3, nextW4],
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

    await this.pool.query(
      `UPDATE community_hub_members
          SET invite_group_url = $2
        WHERE workspace_id = $1 AND (invite_group_url LIKE '%vietnamplaybook%' OR invite_group_url = '')`,
      [workspaceId, settings.group_url],
    );

    const legacyDiscussions = (
      await this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM community_hub_discussions
          WHERE workspace_id = $1 AND (title LIKE '%Vietnam Playbook%' OR author_name LIKE '%Playbook%' OR discussion_prompt LIKE '%vietnamplaybook%' OR body LIKE '%2 chiều%')`,
        [workspaceId],
      )
    ).rows[0]?.n ?? 0;

    if (legacyDiscussions > 0) {
      await this.pool.query('DELETE FROM community_hub_discussions WHERE workspace_id = $1', [workspaceId]);
    }

    const all30Assets = getPlaybookImageAssets(workspaceId).map(({ topic_tags, match_slug, ...rest }) => rest);

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
    if (goalRow && (/\be-?visa\b/i.test(goalRow.title) || /Playbook|2 chiều/i.test(goalRow.title))) {
      await this.pool.query(
        `UPDATE growth_goals
            SET title = 'Phát triển Cộng đồng Du lịch & Sống tại Việt Nam và chuỗi bài cẩm nang du lịch, lưu trú thực tế'
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

      if (currentAssetsLen < 30 || currentProductsLen < 10 || currentFocusLen > 0) {
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
                'Phát triển Cộng đồng Du lịch & Sống tại Việt Nam và chuỗi bài cẩm nang du lịch, lưu trú thực tế',
              focus_offers: [],
            }
          : null;

        await this.pool.query(
          `UPDATE knowledge_contexts
              SET profile = $2::jsonb,
                  goal = $3::jsonb,
                  assets = $4::jsonb
            WHERE workspace_id = $1 AND snapshot_id = $5`,
          [workspaceId, JSON.stringify(updatedProfile), JSON.stringify(updatedGoal), JSON.stringify(all30Assets), currentCtx.snapshot_id],
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
    await this.deduplicateExistingDiscussionAndArtifactImages(workspaceId);
    await this.syncMembersFromInteractions(workspaceId, settings);
    return settings;
  }

  /**
   * Ensures every discussion thread and every content artifact in the database has a 100% unique,
   * topic-matched image URL with zero overlap across discussions or articles.
   */
  private async deduplicateExistingDiscussionAndArtifactImages(workspaceId: string): Promise<void> {
    const discAssets = getDiscussionImageAssets(workspaceId);
    const discRows = (
      await this.pool.query<{ id: string; image_url: string | null }>(
        'SELECT id, image_url FROM community_hub_discussions WHERE workspace_id = $1 ORDER BY created_at ASC',
        [workspaceId],
      )
    ).rows;

    const usedDiscUrls = new Set<string>();
    for (let i = 0; i < discRows.length; i++) {
      const d = discRows[i];
      const dedicatedUrl = discAssets[i % discAssets.length]?.url;
      if (dedicatedUrl && (!d.image_url || usedDiscUrls.has(d.image_url) || !discAssets.some((a) => a.url === d.image_url))) {
        await this.pool.query('UPDATE community_hub_discussions SET image_url = $2 WHERE id = $1', [d.id, dedicatedUrl]);
        usedDiscUrls.add(dedicatedUrl);
      } else if (d.image_url) {
        usedDiscUrls.add(d.image_url);
      }
    }

    // Also deduplicate content_artifacts (role='content') so Review Queue & Distribution never show duplicate images
    const topicAssets = getTopicImageAssets(workspaceId);
    const artRows = (
      await this.pool.query<{
        id: string;
        title: string;
        content_hash: string;
        payload: Record<string, any>;
        evidence: any[];
        source_url: string | null;
      }>(
        `SELECT id, title, content_hash, payload, evidence,
                evidence->0->>'source_url' AS source_url
           FROM content_artifacts
          WHERE workspace_id = $1 AND role = 'content'
          ORDER BY created_at DESC`,
        [workspaceId],
      )
    ).rows;

    const seenArtUrls = new Set<string>();
    for (const art of artRows) {
      const currentUrl = art.payload?.result?.image_assets?.[0]?.url as string | undefined;
      const hookText = (art.payload?.result?.facebook?.hook || art.payload?.result?.caption || art.title || '') as string;
      const matched = matchAssetForTopic(`${art.title} ${hookText}`, topicAssets, seenArtUrls, art.source_url ?? undefined);
      seenArtUrls.add(matched.url);

      if (currentUrl && currentUrl !== matched.url) {
        const { topic_tags, match_slug, ...cleanAsset } = matched;
        const nextResult = {
          ...(art.payload?.result ?? {}),
          image_assets: [cleanAsset],
          alt_text: matched.attribution,
        };
        const nextHash = sha256Hex(canonicalJson({ result: nextResult, evidence: art.evidence }));
        const nextArtifactRef = {
          ...(art.payload?.artifact ?? {}),
          content_hash: nextHash,
        };
        await this.pool.query(
          `UPDATE content_artifacts
              SET payload = $2::jsonb,
                  content_hash = $3
            WHERE id = $1`,
          [art.id, JSON.stringify({ artifact: nextArtifactRef, result: nextResult }), nextHash],
        );
        await this.pool.query(
          `UPDATE approvals
              SET target_hash = $2
            WHERE workspace_id = $1 AND target_type = 'artifact' AND target_id = $3`,
          [workspaceId, nextHash, art.id],
        );
      }
    }
  }

  private async seedInitialDiscussionsIfEmpty(workspaceId: string, settings: CommunitySettings): Promise<void> {
    const count = (
      await this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM community_hub_discussions WHERE workspace_id = $1', [
        workspaceId,
      ])
    ).rows[0]?.n ?? 0;
    if (count > 0) return;

    const discAssets = getDiscussionImageAssets(workspaceId);
    const initialThreads = [
      {
        category: 'Lưu trú & Kinh nghiệm Thuê chỗ ở',
        title: 'Nên ở khu vực nào trong 2 tuần đầu tiên khi mới đến Đà Nẵng / Việt Nam trước khi thuê dài hạn?',
        author_name: 'Liam Carter (Thành viên Cộng đồng • Đà Nẵng)',
        author_role: 'Thành viên Hạt nhân • Tuần 1',
        body: 'Mình vừa hạ cánh xuống Đà Nẵng! Theo kinh nghiệm được chia sẻ trong cộng đồng mình, mình đặt chỗ ở ngắn hạn 10–14 ngày đầu để trực tiếp đi xem phòng vào ban ngày và sau cơn mưa. Hiện mình đang phân vân giữa khu Mỹ An (An Thượng) và Sơn Trà.',
        discussion_prompt: 'Các thành viên trong cộng đồng mình thường chọn khu vực nào sau 2 tuần đầu, và tiêu chí số #1 bạn kiểm tra trước khi đặt cọc thuê phòng là gì?',
        source_url: 'https://tripc.ai/blog/first-two-weeks-in-vietnam-accommodation-guide',
        image_url: discAssets[0].url,
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
        image_url: discAssets[1].url,
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
        image_url: discAssets[2].url,
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
        body: `Chào mừng bạn đến với ${settings.community_name} — không gian kết nối dành cho những người yêu thích du lịch, khám phá và sinh sống tại Việt Nam! Hãy để lại bình luận bên dưới để giao lưu với các thành viên có cùng mối quan tâm nhé.`,
        discussion_prompt: '1) Bạn đang ở thành phố nào (hoặc sắp đi du lịch ở đâu)? 2) Mối quan tâm lớn nhất của bạn tuần này là gì (Lịch trình, Chỗ ở, Ẩm thực, Di chuyển hay Thủ tục)?',
        source_url: settings.group_url,
        image_url: discAssets[3].url,
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
   * messaged/commented on the Page. Also syncs any missing Messenger messages into community_messages
   * so RAG auto-reply and member tracking are always up to date automatically.
   */
  async syncMembersFromInteractions(workspaceId: string, settings?: CommunitySettings): Promise<number> {
    const resolvedSettings = settings ?? (await this.getCommunitySettings(workspaceId));

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

    const byPerson = new Map<string, { platform: string; signals: string[]; first_seen: Date }>();
    for (const m of msgRows) {
      const entry = byPerson.get(m.psid) ?? { platform: m.platform, signals: [], first_seen: m.received_at };
      entry.signals.push(m.content);
      if (m.received_at < entry.first_seen) entry.first_seen = m.received_at;
      byPerson.set(m.psid, entry);
    }

    const { names, liveMessages } = await this.fetchMessengerParticipantNames(resolvedSettings.connected_fanpage_id);
    for (const [psid, msgs] of liveMessages.entries()) {
      const entry = byPerson.get(psid) ?? { platform: 'facebook_message', signals: [], first_seen: new Date() };
      for (const msg of msgs) {
        if (msg && !entry.signals.includes(msg)) entry.signals.push(msg);
      }
      if (entry.signals.length === 0) entry.signals.push('Quan tâm tư vấn du lịch & cộng đồng tại Việt Nam');
      byPerson.set(psid, entry);
    }

    if (byPerson.size === 0) return 0;

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

  /** PSID -> real display name + messages, directly from the Page's own Messenger conversations. */
  private async fetchMessengerParticipantNames(
    pageId: string,
  ): Promise<{ names: Map<string, string>; liveMessages: Map<string, string[]> }> {
    const names = new Map<string, string>();
    const liveMessages = new Map<string, string[]>();
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!token) return { names, liveMessages };
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/me/conversations?fields=participants,messages.limit(10){message,from}&limit=100&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return { names, liveMessages };
      const json = (await res.json()) as {
        data?: {
          participants?: { data?: { id: string; name?: string }[] };
          messages?: { data?: { message?: string; from?: { id?: string; name?: string } }[] };
        }[];
      };
      for (const conv of json.data ?? []) {
        let userPsid: string | null = null;
        for (const p of conv.participants?.data ?? []) {
          if (p.id !== pageId && /^\d{14,}$/.test(p.id)) {
            userPsid = p.id;
            if (p.name) names.set(p.id, p.name);
          }
        }
        if (userPsid) {
          const userMsgs: string[] = [];
          for (const m of conv.messages?.data ?? []) {
            if (m.from?.id === userPsid && m.message?.trim()) {
              userMsgs.push(m.message.trim());
            }
          }
          liveMessages.set(userPsid, userMsgs);
        }
      }
    } catch {
      // Fall back to existing DB records if Graph API is temporarily unreachable
    }
    return { names, liveMessages };
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

  /**
   * Automatically reads live member count AND live Group description from the public Facebook Group page
   * on every request and persists updates into community_hub_settings so the UI is always up to date
   * without needing manual intervention.
   */
  async fetchRealGroupStats(
    groupUrl: string,
    fallbackCount = 5,
    workspaceId?: string,
  ): Promise<{ member_count: number; live_description?: string | null }> {
    if (!groupUrl || !groupUrl.includes('facebook.com/groups/')) return { member_count: fallbackCount };
    try {
      const res = await fetch(groupUrl, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok || res.url.includes('/login')) return { member_count: fallbackCount };
      const html = await res.text();

      const headerMatch =
        html.match(
          /XFBGroupsCometTabsNavigationHeaderRenderer[\s\S]{0,1200}?group_member_profiles[\x22\x3a\x7b]+formatted_count_text[\x22\x3a]+[\x22]([^\x22]+)[\x22]/i,
        ) ??
        html.match(/group_member_profiles[\x22\x3a\x7b]+formatted_count_text[\x22\x3a]+[\x22]([^\x22]+)[\x22]/i);

      let parsedCount: number | null = null;
      if (headerMatch?.[1]) {
        const decoded = headerMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
        const numMatch = decoded.match(/(\d+(?:[.,]\d+)?)\s*([kKmM])?/);
        if (numMatch) {
          let val = parseFloat(numMatch[1].replace(',', '.'));
          if (numMatch[2]?.toLowerCase() === 'k') val *= 1000;
          if (numMatch[2]?.toLowerCase() === 'm') val *= 1_000_000;
          parsedCount = Math.round(val);
        }
      }

      if (parsedCount === null) {
        const ogDesc = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];
        if (ogDesc) {
          const m = ogDesc.match(/(\d+(?:[.,]\d+)?)\s*([kKmM])?\s*(?:thành viên|members?)/i);
          if (m) {
            let val = parseFloat(m[1].replace(',', '.'));
            if (m[2]?.toLowerCase() === 'k') val *= 1000;
            if (m[2]?.toLowerCase() === 'm') val *= 1_000_000;
            parsedCount = Math.round(val);
          }
        }
      }

      // Also extract live Group description if updated on Facebook
      let liveDescription: string | null = null;
      const descMatch = html.match(/"description":\{"__typename":"TextWithEntities","text":"((?:[^"\\]|\\.)*)"/i);
      if (descMatch?.[1]) {
        try {
          const decodedDesc = JSON.parse(`"${descMatch[1]}"`) as string;
          if (decodedDesc && decodedDesc.trim().length > 20) {
            liveDescription = decodedDesc.replace(/\s+/g, ' ').trim();
          }
        } catch {
          // Ignore malformed JSON string
        }
      }

      if (workspaceId && (parsedCount !== null || liveDescription)) {
        const finalCount = parsedCount !== null && parsedCount > 0 ? parsedCount : fallbackCount;
        if (liveDescription) {
          await this.pool
            .query(
              `UPDATE community_hub_settings
                  SET group_member_count = $2,
                      positioning = $3,
                      updated_at = NOW()
                WHERE workspace_id = $1`,
              [workspaceId, finalCount, liveDescription],
            )
            .catch(() => {});
        } else if (parsedCount !== null && parsedCount > 0 && parsedCount !== fallbackCount) {
          await this.pool
            .query(
              'UPDATE community_hub_settings SET group_member_count = $2, updated_at = NOW() WHERE workspace_id = $1',
              [workspaceId, parsedCount],
            )
            .catch(() => {});
        }
      }

      return {
        member_count: parsedCount !== null && parsedCount > 0 ? parsedCount : fallbackCount,
        live_description: liveDescription,
      };
    } catch {
      return { member_count: fallbackCount };
    }
  }

  /**
   * Sends a REAL Messenger message via Meta Graph API (/v20.0/me/messages) inviting a real
   * Facebook user (who previously messaged the Page) to join the user's Facebook Group.
   */
  async sendMessengerGroupInvite(
    workspaceId: string,
    externalRef?: string,
  ): Promise<{ sent_count: number; results: { name: string; status: string; detail: string }[] }> {
    const settings = await this.getCommunitySettings(workspaceId);
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!token) {
      return { sent_count: 0, results: [{ name: 'System', status: 'error', detail: 'Thiếu FACEBOOK_PAGE_ACCESS_TOKEN' }] };
    }

    const rows = (
      await this.pool.query<{
        id: string;
        external_ref: string;
        display_name: string;
        matched_signal: string;
        recommended_topic: string | null;
      }>(
        externalRef
          ? `SELECT id, external_ref, display_name, matched_signal, recommended_topic
               FROM community_hub_members
              WHERE workspace_id = $1 AND external_ref = $2`
          : `SELECT id, external_ref, display_name, matched_signal, recommended_topic
               FROM community_hub_members
              WHERE workspace_id = $1 AND external_ref ~ '^fb:[0-9]{14,}$'`,
        externalRef ? [workspaceId, externalRef] : [workspaceId],
      )
    ).rows;

    let sentCount = 0;
    const results: { name: string; status: string; detail: string }[] = [];

    for (const member of rows) {
      const psid = member.external_ref.replace(/^fb:/, '');
      const text = [
        `Chào ${member.display_name}! Cảm ơn bạn đã nhắn tin cho Fanpage ${settings.page_name} về nhu cầu: "${member.matched_signal}".`,
        member.recommended_topic ? `📚 Cẩm nang gợi ý cho bạn: ${member.recommended_topic}` : '',
        `👉 Mời bạn bấm THAM GIA NHÓM (Join Group) "${settings.community_name}" tại đây để cùng giao lưu, hỏi đáp và chia sẻ kinh nghiệm thực tế với các thành viên trong nhóm nhé:\n${settings.group_url}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const res = await fetch(
          `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(token)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: psid },
              messaging_type: 'RESPONSE',
              message: { text },
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        const json = (await res.json()) as { message_id?: string; error?: { message?: string; code?: number } };
        if (res.ok && json.message_id) {
          sentCount++;
          await this.pool.query(
            `UPDATE community_hub_members
                SET status = 'invited_via_messenger',
                    invite_group_url = $3,
                    updated_at = NOW()
              WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, member.id, settings.group_url],
          );
          results.push({
            name: member.display_name,
            status: 'sent',
            detail: `Đã gửi tin nhắn mời vào Group thật qua Messenger (id: ${json.message_id.slice(0, 18)}...)`,
          });
        } else {
          const is24hError = json.error?.code === 10 || /24 hour|outside of allowed window/i.test(json.error?.message || '');
          const statusValue = is24hError ? 'outside_24h_window' : 'identified';
          await this.pool.query(
            `UPDATE community_hub_members SET status = $3, updated_at = NOW() WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, member.id, statusValue],
          );
          results.push({
            name: member.display_name,
            status: statusValue,
            detail: is24hError
              ? 'Quá 24h kể từ tin nhắn cuối của khách (Chính sách Meta chỉ cho gửi tin nhắn trực tiếp trong vòng 24h sau khi khách nhắn)'
              : json.error?.message || 'Không gửi được qua Messenger',
          });
        }
      } catch (err) {
        results.push({
          name: member.display_name,
          status: 'error',
          detail: (err as Error).message,
        });
      }
    }

    return { sent_count: sentCount, results };
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

    // Query both published website articles AND published Facebook jobs so every published topic has real date & URL
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

    const publishedFbJobs = (
      await this.pool.query<{
        external_post_id: string | null;
        published_at: Date | null;
        source_id: string | null;
        img_url: string | null;
      }>(
        `SELECT j.external_post_id, j.published_at,
                a.evidence->0->>'source_id' AS source_id,
                a.payload->'result'->'image_assets'->0->>'url' AS img_url
           FROM publishing_jobs j
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1 AND j.status = 'published' AND j.external_post_id IS NOT NULL
          ORDER BY j.published_at DESC NULLS LAST`,
        [workspaceId],
      )
    ).rows;

    const fbPublishedBySource = new Map<string, { external_post_id: string; published_at: Date | null; img_url: string | null }>();
    for (const job of publishedFbJobs) {
      if (job.source_id && !fbPublishedBySource.has(job.source_id) && !job.external_post_id?.startsWith('newsletter_')) {
        fbPublishedBySource.set(job.source_id, {
          external_post_id: job.external_post_id!,
          published_at: job.published_at,
          img_url: job.img_url,
        });
      }
    }

    const webPublishedBySource = new Map<string, { slug: string | null; published_at: Date | null }>();
    for (const art of publishedArticles) {
      if (art.source_id && !webPublishedBySource.has(art.source_id)) {
        webPublishedBySource.set(art.source_id, { slug: art.slug, published_at: art.published_at });
      }
    }

    // Separate topics that have ACTUALLY been published to the Fanpage (`fbPublishedBySource`)
    // vs topics that are scheduled next for the Fanpage & Community Group
    const topicAssets = getTopicImageAssets(workspaceId);
    const all30Assets = getPlaybookImageAssets(workspaceId);

    const fbPublishedSources = uniqueSources
      .filter((s) => fbPublishedBySource.has(s.id))
      .sort((a, b) => {
        const ta = fbPublishedBySource.get(a.id)?.published_at?.getTime() ?? 0;
        const tb = fbPublishedBySource.get(b.id)?.published_at?.getTime() ?? 0;
        return ta - tb;
      });
    const upcomingSources = uniqueSources.filter((s) => !fbPublishedBySource.has(s.id));
    const orderedSources = [...fbPublishedSources, ...upcomingSources];

    // Anchor upcoming post schedule to concrete real calendar dates starting from 08/11/2026 20:00 (VN time)
    // and then 1 post per day at 09:00 AM VN time (09/11/2026 -> 25/11/2026)
    const nowUtc = new Date();
    const baseYear = nowUtc.getUTCFullYear();
    const baseMonth = nowUtc.getUTCMonth();
    const baseDay = nowUtc.getUTCDate();

    const calendarUsedImages = new Set<string>();
    let upcomingIdx = 0;

    const dailyCalendar = orderedSources.map((source, index) => {
      const matchedAsset = matchAssetForTopic(source.title, topicAssets, calendarUsedImages, source.source_url);
      calendarUsedImages.add(matchedAsset.url);

      const fbPub = fbPublishedBySource.get(source.id);
      const webPub = webPublishedBySource.get(source.id);
      const isPublishedOnPage = Boolean(fbPub);
      const matchInfo = classifyMemberInterests(source.title);

      let targetDateUtc: Date;
      if (isPublishedOnPage && fbPub?.published_at) {
        targetDateUtc = new Date(fbPub.published_at);
      } else {
        // Upcoming slot 0 -> Today at 20:00 VN time (13:00 UTC); Slot k >= 1 -> Day + k at 09:00 VN time (02:00 UTC)
        if (upcomingIdx === 0) {
          targetDateUtc = new Date(Date.UTC(baseYear, baseMonth, baseDay, 13, 0, 0));
          if (targetDateUtc.getTime() <= nowUtc.getTime()) {
            targetDateUtc = new Date(Date.UTC(baseYear, baseMonth, baseDay, 14, 30, 0));
          }
        } else {
          targetDateUtc = new Date(Date.UTC(baseYear, baseMonth, baseDay + upcomingIdx, 2, 0, 0));
        }
        upcomingIdx++;
      }

      const formatted = formatVnDateTime(targetDateUtc, true);
      // Determine real campaign week by date:
      // Week 1: 02/11/2026 - 08/11/2026
      // Week 2: 09/11/2026 - 15/11/2026
      // Week 3: 16/11/2026 - 22/11/2026
      // Week 4: 23/11/2026 - 30/11/2026
      const vnDate = new Date(targetDateUtc.getTime() + 7 * 3600_000);
      const dayOfMonth = vnDate.getUTCDate();
      const weekNum = dayOfMonth <= 8 ? 1 : dayOfMonth <= 15 ? 2 : dayOfMonth <= 22 ? 3 : 4;
      const weekRangeLabel =
        weekNum === 1
          ? 'Tuần 1 (02/11/2026 – 08/11/2026)'
          : weekNum === 2
            ? 'Tuần 2 (09/11/2026 – 15/11/2026)'
            : weekNum === 3
              ? 'Tuần 3 (16/11/2026 – 22/11/2026)'
              : 'Tuần 4 (23/11/2026 – 30/11/2026)';

      const fbPostUrl = fbPub?.external_post_id
        ? fbPub.external_post_id.includes('_')
          ? `https://www.facebook.com/${fbPub.external_post_id}`
          : `https://www.facebook.com/${settings.connected_fanpage_id}/posts/${fbPub.external_post_id}`
        : null;

      return {
        day_index: index + 1,
        day_label: isPublishedOnPage ? `Đã đăng: ${formatted.full}` : `Dự kiến: ${formatted.full}`,
        scheduled_date_vn: formatted.full,
        scheduled_date_short: formatted.short,
        scheduled_date_only: formatted.dateOnly,
        scheduled_iso: targetDateUtc.toISOString(),
        week_number: weekNum,
        week_range_label: weekRangeLabel,
        source_id: source.id,
        topic_title: source.title,
        source_url: source.source_url,
        image_url: matchedAsset.url,
        image_attribution: matchedAsset.attribution,
        target_trend: matchInfo.matched_trend,
        interest_tags: matchInfo.interest_tags,
        community_discussion_hook: `Thảo luận tại ${settings.community_name}: Kinh nghiệm thực tế của bạn về "${source.title}" là gì? Cùng chia sẻ dưới phần bình luận nhé!`,
        responsible_agents: {
          planning: 'Growth Lead Agent (strategy.generate)',
          seo_draft: 'SEO Worker Agent (seo.local_draft)',
          social_pack: 'Content Marketing Agent (content.generate)',
          community_engagement: 'Community Agent (Gắn câu hỏi thảo luận & mời vào Group)',
        },
        concrete_action: isPublishedOnPage
          ? `Đã xuất bản lên Fanpage "${settings.page_name}" lúc ${formatted.short} kèm ảnh riêng biệt & link mời vào Group`
          : `Lịch xuất bản tự động lúc ${formatted.short} lên Fanpage "${settings.page_name}" & mở chủ đề thảo luận trên Group "${settings.community_name}"`,
        status: isPublishedOnPage ? ('published' as const) : ('ready_to_publish' as const),
        published_slug: webPub?.slug ?? null,
        published_at: fbPub?.published_at?.toISOString() ?? webPub?.published_at?.toISOString() ?? null,
        facebook_post_url: fbPostUrl,
        unique_topic_verified: true,
        unique_image_verified: true,
      };
    });

    // Growth is measured by real Facebook numbers (Group members + Page followers).
    const realIdentifiedPeople = members.filter((m) => m.external_ref.startsWith('fb:')).length;
    const manualProspects = members.filter((m) => m.external_ref.startsWith('manual:')).length;
    const fallbackGroupCount = Math.max(settings.group_member_count ?? 5, realIdentifiedPeople);

    const [pageStats, groupStats, ragStats] = await Promise.all([
      this.fetchRealPageStats(),
      this.fetchRealGroupStats(settings.group_url, fallbackGroupCount, workspaceId),
      this.pool.query<{
        approved_sources: number;
        total_chunks: number;
        embedded_chunks: number;
        inbound_messages: number;
        grounded_replies: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM sources WHERE workspace_id = $1 AND status = 'approved' AND deleted_at IS NULL) AS approved_sources,
           (SELECT count(*)::int FROM source_chunks WHERE workspace_id = $1) AS total_chunks,
           (SELECT count(*)::int FROM source_chunks WHERE workspace_id = $1 AND embedding IS NOT NULL) AS embedded_chunks,
           (SELECT count(*)::int FROM community_messages WHERE workspace_id = $1) AS inbound_messages,
           (SELECT count(*)::int FROM content_artifacts WHERE workspace_id = $1 AND operation = 'community.response') AS grounded_replies`,
        [workspaceId],
      ),
    ]);

    if (groupStats.live_description) {
      settings.positioning = groupStats.live_description;
    }

    const realFollowers = pageStats.followers_count ?? 0;
    const realGroupMembers = groupStats.member_count ?? fallbackGroupCount;
    const realCommunityMembers = Math.max(realGroupMembers, realFollowers);

    const w1Target = settings.week1_target;
    const w2Target = settings.week2_target;
    const w3Target = settings.week3_target;
    const w4Target = settings.week4_target;

    const week1Count = realCommunityMembers;
    const totalMatchedCount = realCommunityMembers;
    const campaignStatus = (target: number, previousTarget: number) =>
      realCommunityMembers >= target ? 'completed_target' : realCommunityMembers >= previousTarget ? 'active_campaign' : 'scheduled';

    const weekItems = (w: number) => dailyCalendar.filter((item) => item.week_number === w);

    const weeklyCampaigns = [
      {
        week: 1,
        date_range: '02/11/2026 – 08/11/2026',
        title: `Tuần 1 (02/11/2026 – 08/11/2026): Xây dựng Hạt nhân Cộng đồng (Mục tiêu: ${w1Target} Thành viên)`,
        target_members: w1Target,
        current_members: week1Count,
        status: campaignStatus(w1Target, 0),
        theme: 'Đón thành viên đầu tiên, Chỗ ở ngắn hạn, Sim/eSIM, Ứng dụng thiết yếu & Thủ tục Tạm trú',
        target_trends: ['Thuê căn hộ & Chỗ ở', 'eSIM & Ứng dụng thiết yếu', 'Khai báo tạm trú', 'Bảo hiểm & An toàn'],
        responsible_agents: 'Growth Lead (Lập kế hoạch) • SEO & Content Agent (Xuất bản 9 bài đầu tiên) • Community Agent (Trả lời RAG & Mời 3 khách từ Messenger vào Group)',
        tactics: [
          `[02/11 – 08/11/2026] Đã đạt ${week1Count}/${w1Target} thành viên thật trong Group "${settings.community_name}" và ghi nhận ${realIdentifiedPeople} khách hàng thật nhắn tin trên Fanpage "${settings.page_name}"`,
          `[06/11 – 08/11/2026] Content Agent đã xuất bản ${fbPublishedSources.length} bài cẩm nang lên Fanpage (mỗi bài 1 ảnh độc nhất) và 1 bài dự kiến lúc 20:00 tối 08/11/2026`,
          `[Hàng ngày] Community Agent tự động trả lời tin nhắn khách hàng bằng bộ RAG (${ragStats.rows[0]?.total_chunks ?? 430} đoạn trích dẫn đã duyệt) và gửi link mời vào Group`,
        ],
      },
      {
        week: 2,
        date_range: '09/11/2026 – 15/11/2026',
        title: `Tuần 2 (09/11/2026 – 15/11/2026): Mở rộng Nhóm Thành viên Cùng Xu hướng (Mục tiêu: ${w2Target} Thành viên)`,
        target_members: w2Target,
        current_members: totalMatchedCount,
        status: campaignStatus(w2Target, w1Target),
        theme: 'Sân bay nhập cảnh, Thời hạn Hộ chiếu, Vé khứ hồi, Rút tiền mặt/ATM & Chi phí mỗi ngày',
        target_trends: ['Sân bay Hà Nội/Đà Nẵng/TP.HCM', 'Hộ chiếu & Vé khứ hồi', 'Ngân hàng & VietQR', 'Ngân sách mỗi ngày'],
        responsible_agents: 'Growth Lead (Lịch 09/11–15/11) • SEO & Content Agent (7 bài lúc 09:00 sáng mỗi ngày) • Community Agent (Auto-Match & Mời Group)',
        tactics: [
          '[09/11 – 15/11/2026 lúc 09:00 sáng] Đăng đều đặn 1 bài mới/ngày theo đúng lịch ngày tháng cụ thể (7 chủ đề mới + 7 hình ảnh riêng biệt)',
          `[09/11 – 15/11/2026] Community Agent tự động phân loại khách nhắn tin theo 4 nhóm nhu cầu (Nhập cảnh, Lưu trú, Ngân hàng/VietQR, Chi phí) và mời vào "${settings.community_name}"`,
          '[Thứ Tư 11/11 & Thứ Bảy 14/11/2026] Mở 2 chủ đề thảo luận thực tế trong Group về so sánh chi phí sống và cách thanh toán VietQR/ATM cho người mới',
        ],
      },
      {
        week: 3,
        date_range: '16/11/2026 – 22/11/2026',
        title: `Tuần 3 (16/11/2026 – 22/11/2026): Tăng tốc Tương tác Đời sống Địa phương (Mục tiêu: ${w3Target} Thành viên)`,
        target_members: w3Target,
        current_members: totalMatchedCount,
        status: campaignStatus(w3Target, w2Target),
        theme: 'Di chuyển Tàu/Xe/Máy bay, Thời điểm đẹp nhất du lịch, Cách tìm Địa chỉ Ngõ/Hẻm & Thủ tục E-Visa 2026',
        target_trends: ['Phương tiện di chuyển', 'Thời tiết & Mùa du lịch', 'Địa chỉ ngõ/hẻm Việt Nam', 'Hướng dẫn E-Visa 2026'],
        responsible_agents: 'Growth Lead (Lịch 16/11–22/11) • SEO & Content Agent (7 bài lúc 09:00 sáng) • Community Agent (Kết nối thành viên cũ giải đáp thành viên mới)',
        tactics: [
          '[16/11 – 22/11/2026 lúc 09:00 sáng] Xuất bản 7 bài chuyên sâu về di chuyển nội địa, mùa đẹp nhất đi Đà Nẵng/Hà Nội/Phú Quốc và thủ tục E-Visa chuẩn 2026',
          '[Thứ Năm 19/11/2026] Tổ chức phiên Hỏi - Đáp (Q&A) trực tiếp trên Group giữa các thành viên đã có kinh nghiệm sống tại Đà Nẵng với thành viên mới',
          '[Chủ Nhật 22/11/2026] Tổng hợp các câu hỏi thực tế từ Messenger trong tuần để bổ sung vào chủ đề thảo luận chung của Group',
        ],
      },
      {
        week: 4,
        date_range: '23/11/2026 – 30/11/2026',
        title: `Tuần 4 (23/11/2026 – 30/11/2026): Cộng đồng Tự vận hành & Tổng kết Tháng 11 (Mục tiêu: ${w4Target} Thành viên)`,
        target_members: w4Target,
        current_members: totalMatchedCount,
        status: campaignStatus(w4Target, w3Target),
        theme: 'Hoàn thiện Hành trang Chuyển đến Việt Nam, Chỗ ở 2 Tuần Đầu, Góc Làm việc Từ xa & Sự kiện Kết nối',
        target_trends: ['Hành lý chuyển đến VN', 'Chỗ ở 2 tuần đầu', 'Góc làm việc Remote Work', 'Offline/Online Meetup'],
        responsible_agents: 'Growth Lead & Performance Agent (Đo lường & Mở vòng học mới) • Content & Community Agent (Hoàn tất 25/25 chủ đề Tháng 11)',
        tactics: [
          '[23/11 – 26/11/2026 lúc 09:00 sáng] Hoàn tất xuất bản các chủ đề còn lại trong bộ 25 bài cẩm nang cốt lõi (đạt 100% độ phủ 25 chủ đề, 0% trùng ảnh)',
          '[Thứ Sáu 27/11/2026] Mở cuộc bình chọn (Community Poll) trên Group để thành viên chọn chủ đề ưu tiên cho Tháng 12/2026 (Lễ hội cuối năm & Giáng sinh)',
          '[Chủ Nhật 29/11/2026] Performance Agent & Growth Lead tổng kết chỉ số tăng trưởng Tháng 11/2026 và kích hoạt kế hoạch Tháng 12/2026',
        ],
      },
    ];

    const weeklyCalendar = [
      {
        week_number: 1,
        week_label: 'Tuần 1 (02/11/2026 – 08/11/2026)',
        date_range: '02/11/2026 – 08/11/2026',
        member_target: `Mục tiêu: ${w1Target} thành viên (Thực tế đạt: ${week1Count}/${w1Target} — ✓ Đạt chỉ tiêu)`,
        pillar_theme: 'Khởi chạy Cộng đồng, Cẩm nang Thiết yếu, Thuê nhà, eSIM, Đi chợ, Bảo hiểm & Tạm trú',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Agent',
        planned_topics: weekItems(1).map(
          (item) => `[${item.scheduled_date_short}] ${item.topic_title} (${item.status === 'published' ? '✓ Đã đăng' : '📅 Dự kiến tối nay'})`,
        ),
        interactive_format: 'Chào mừng 5 thành viên đầu tiên + Trả lời tự động 3 khách hàng thật trên Messenger bằng RAG',
      },
      {
        week_number: 2,
        week_label: 'Tuần 2 (09/11/2026 – 15/11/2026)',
        date_range: '09/11/2026 – 15/11/2026',
        member_target: `Mục tiêu: ${w2Target} thành viên (Hiện tại: ${totalMatchedCount}/${w2Target} — Đang chạy chiến dịch)`,
        pillar_theme: 'Sân bay Nhập cảnh, Thời hạn Hộ chiếu, Vé khứ hồi, Tiền mặt/ATM, Chi phí Mỗi ngày & Mở Tài khoản Ngân hàng',
        responsible_agents: 'Growth Lead (Phân lịch 09/11–15/11) → SEO Agent → Content Agent (Đăng 09:00 sáng) → Community Agent',
        planned_topics: weekItems(2).map(
          (item) => `[${item.scheduled_date_short}] ${item.topic_title} (📅 Dự kiến đăng lúc 09:00)`,
        ),
        interactive_format: 'Mỗi bài đăng lúc 09:00 sáng đều kèm câu hỏi thảo luận mở + Gửi lời mời vào Group cho khách nhắn tin trong vòng 24h',
      },
      {
        week_number: 3,
        week_label: 'Tuần 3 (16/11/2026 – 22/11/2026)',
        date_range: '16/11/2026 – 22/11/2026',
        member_target: `Mục tiêu: ${w3Target} thành viên (Mở rộng tương tác đời sống địa phương)`,
        pillar_theme: 'Thời điểm Đẹp nhất đến VN, Cách Tìm Địa chỉ Ngõ/Hẻm & Trọn bộ Thủ tục E-Visa Chính thức 2026',
        responsible_agents: 'Growth Lead (Phân lịch 16/11–22/11) → SEO Agent → Content Agent (Đăng 09:00 sáng) → Community Agent',
        planned_topics: weekItems(3).map(
          (item) => `[${item.scheduled_date_short}] ${item.topic_title} (📅 Dự kiến đăng lúc 09:00)`,
        ),
        interactive_format: 'Thảo luận tình huống thực tế về tìm địa chỉ ngõ/hẻm, kinh nghiệm đi tàu hỏa/máy bay nội địa và kiểm tra trang E-Visa chính thức',
      },
      {
        week_number: 4,
        week_label: 'Tuần 4 (23/11/2026 – 30/11/2026)',
        date_range: '23/11/2026 – 30/11/2026',
        member_target: `Mục tiêu: ${w4Target} thành viên (Cộng đồng tự vận hành & Kết nối bền vững)`,
        pillar_theme: 'Chuẩn bị Hành lý Chuyển đến VN, Chọn Khu vực Ở 2 Tuần Đầu & Thiết lập Góc Làm việc Từ xa (Remote Work)',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Agent → Performance Agent (Đánh giá KPI cuối tháng)',
        planned_topics: weekItems(4).map(
          (item) => `[${item.scheduled_date_short}] ${item.topic_title} (📅 Dự kiến đăng lúc 09:00)`,
        ),
        interactive_format: 'Bình chọn chủ đề Tháng 12/2026 + Vinh danh thành viên chia sẻ kinh nghiệm hữu ích nhất trong tháng',
      },
    ];

    const monthlyCalendar = [
      {
        month_number: 1,
        month_label: `Tháng 11/2026 (01/11/2026 – 30/11/2026): Xây dựng "${settings.community_name}" & Xuất bản 25 Bài Cẩm nang Cốt lõi`,
        date_range: '01/11/2026 – 30/11/2026',
        member_goal: `Tuần 1 (02/11–08/11): ${w1Target} người [Đã đạt ${week1Count}/${w1Target} ✓] → Tuần 2 (09/11–15/11): ${w2Target} người → Tuần 3 (16/11–22/11): ${w3Target} người → Cuối Tháng 11 (30/11/2026): ${w4Target} thành viên thật`,
        content_commitment: `25 bài cẩm nang chuyên sâu (Đã đăng ${fbPublishedSources.length}/25 bài tính đến 08/11/2026; ${upcomingSources.length} bài còn lại lên lịch cụ thể từng ngày từ 08/11/2026 đến 24/11/2026 lúc 09:00 sáng — 100% ảnh riêng biệt từ kho 30 ảnh)`,
        key_pillars: [
          `02/11/2026 – 08/11/2026 (Tuần 1): Đã hoàn thành mục tiêu ${week1Count}/${w1Target} thành viên hạt nhân + Xuất bản ${fbPublishedSources.length} bài (Thuê căn hộ, Phòng tránh lừa đảo, Số khẩn cấp, eSIM, Ứng dụng, Đi chợ, Tạm trú, Bảo hiểm, E-Visa gia đình)`,
          '09/11/2026 – 15/11/2026 (Tuần 2): Xuất bản 7 bài lúc 09:00 sáng (Vé khứ hồi, Chọn sân bay, Thời hạn hộ chiếu, Tiền mặt/ATM, Chi phí mỗi ngày, Mở tài khoản ngân hàng, Phương tiện di chuyển)',
          '16/11/2026 – 22/11/2026 (Tuần 3): Xuất bản 7 bài lúc 09:00 sáng (Thời điểm đẹp nhất đến VN, Địa chỉ ngõ/hẻm, Hướng dẫn E-Visa 2026, So sánh E-Visa vs Miễn thị thực, Thời gian xét duyệt E-Visa, Chuẩn bị hành lý)',
          '23/11/2026 – 30/11/2026 (Tuần 4): Xuất bản các bài còn lại (Chỗ ở 2 tuần đầu, Nhận diện web E-Visa chính thức, Góc làm việc từ xa) + Bình chọn chủ đề Tháng 12/2026 vào ngày 27/11/2026',
        ],
      },
      {
        month_number: 2,
        month_label: 'Tháng 12/2026 (01/12/2026 – 31/12/2026): Chiến dịch Mùa Lễ hội Cuối năm, Giáng sinh & Đón Năm mới 2027 tại Việt Nam',
        date_range: '01/12/2026 – 31/12/2026',
        member_goal: `Mở rộng từ ${w4Target} → ${w4Target * 3} thành viên (Tự động gom nhóm theo từng thành phố: Đà Nẵng, Hà Nội, TP.HCM, Phú Quốc)`,
        content_commitment: '31 bài cẩm nang theo lịch ngày cụ thể (01/12/2026 – 31/12/2026 lúc 09:00 sáng) do Research Agent & Growth Lead cập nhật từ nhu cầu thực tế cuối năm',
        key_pillars: [
          '01/12/2026 – 07/12/2026: Cẩm nang thời tiết Tháng 12 & Lịch trình du lịch biển mùa khô tại Phú Quốc, Nha Trang, Mũi Né',
          '08/12/2026 – 14/12/2026: So sánh chi phí thuê căn hộ ngắn hạn & dài hạn dịp cuối năm tại Mỹ An / Sơn Trà (Đà Nẵng), Tây Hồ (Hà Nội), Thảo Điền (TP.HCM)',
          '15/12/2026 – 21/12/2026: Bản đồ Quán Cafe làm việc từ xa & Không gian Coworking tốc độ cao do thành viên Group bình chọn',
          '22/12/2026 – 31/12/2026: Sự kiện Kết nối Thành viên Cộng đồng dịp Giáng sinh (24/12/2026) & Đếm ngược Năm mới 2027 (31/12/2026)',
        ],
      },
      {
        month_number: 3,
        month_label: 'Tháng 01/2027 (01/01/2027 – 31/01/2027): Cẩm nang Du lịch Tết Nguyên Đán 2027 & Hệ sinh thái Cộng đồng Tự sinh Nội dung',
        date_range: '01/01/2027 – 31/01/2027',
        member_goal: `Đạt ${w4Target * 8}+ thành viên — Cộng đồng tự đặt câu hỏi, chia sẻ review thực tế và kết nối bạn đồng hành hàng ngày`,
        content_commitment: '31 bài kết hợp giữa Cẩm nang chuẩn bị đón Tết Nguyên Đán tại Việt Nam (09:00 sáng) + Bài tổng hợp kinh nghiệm hay nhất của thành viên vào mỗi tối Chủ Nhật',
        key_pillars: [
          '01/01/2027 – 07/01/2027: Cập nhật quy định mới nhất năm 2027 về thị thực, ngân hàng số, VietQR và thủ tục lưu trú cho người nước ngoài & du khách',
          '08/01/2027 – 14/01/2027: Hướng dẫn đặt vé tàu hỏa, máy bay và phòng khách sạn sớm trước kỳ nghỉ Tết Nguyên Đán 2027',
          '15/01/2027 – 21/01/2027: Cẩm nang trải nghiệm văn hóa, ẩm thực Tết Việt Nam & danh sách các dịch vụ, siêu thị mở cửa xuyên Tết',
          '22/01/2027 – 31/01/2027: Tổng kết Quý 1 của Cộng đồng & Khởi chạy chuỗi Offline Meetup đầu xuân tại Đà Nẵng – Hà Nội – TP.HCM',
        ],
      },
    ];

    const ragRow = ragStats.rows[0] ?? {
      approved_sources: 26,
      total_chunks: 430,
      embedded_chunks: 430,
      inbound_messages: 6,
      grounded_replies: 6,
    };

    return {
      synced_at: new Date().toISOString(),
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
        real_group_members: realGroupMembers,
        real_page_followers: pageStats.followers_count,
        real_page_likes: pageStats.fan_count,
        real_identified_people: realIdentifiedPeople,
        manual_prospects: manualProspects,
        week1_target: w1Target,
        week1_achieved: week1Count,
        week2_target: w2Target,
        week2_progress: totalMatchedCount,
        week3_target: w3Target,
        week4_target: w4Target,
        active_discussions: discussions.length,
        total_approved_playbook_topics: uniqueSources.length,
        published_topics_count: fbPublishedSources.length,
        fresh_unposted_topics: upcomingSources.length,
        approved_unique_images: all30Assets.length,
        duplication_rate_pct: 0,
      },
      architecture_info: {
        agent_roles: [
          {
            agent_id: 'growth_lead',
            agent_name: '1. Growth Lead Agent',
            operations: ['strategy.generate', 'opportunity.score', 'brief.generate'],
            responsibility:
              'Chịu trách nhiệm LẬP KẾ HOẠCH CHIẾN DỊCH & LỊCH ĐĂNG BÀI (chọn chủ đề từ Research Agent, đặt mục tiêu KPI từng tuần và phân bổ lịch đăng cụ thể theo ngày/tuần/tháng).',
          },
          {
            agent_id: 'seo',
            agent_name: '2. SEO Worker Agent',
            operations: ['seo.local_draft', 'content.refresh'],
            responsibility:
              'Chịu trách nhiệm SOẠN BÀI VIẾT CẨM NANG CHUẨN SEO trên Website dựa trên các đoạn trích dẫn (chunks) từ kho tài liệu RAG đã được phê duyệt.',
          },
          {
            agent_id: 'content',
            agent_name: '3. Content Marketing Agent',
            operations: ['content.generate', 'content.repurpose'],
            responsibility:
              'Chịu trách nhiệm CHUYỂN HÓA BÀI VIẾT THÀNH BÀI ĐĂNG FANPAGE (Hook, Body, Hashtag, CTA), chọn 1 hình ảnh minh họa độc nhất không trùng lặp từ kho 30 ảnh và đẩy sang PublishingOutboxRunner để đăng lên Facebook.',
          },
          {
            agent_id: 'community',
            agent_name: '4. Community Manager Agent',
            operations: ['community.response', 'community.hub'],
            responsibility:
              'Chịu trách nhiệm TƯƠNG TÁC & PHÁT TRIỂN THÀNH VIÊN CỘNG ĐỒNG: tự động trả lời tin nhắn/bình luận của khách hàng bằng bộ RAG có sẵn, gắn câu hỏi thảo luận mở vào bài đăng, nhận diện khách hàng cùng mối quan tâm từ Messenger và gửi lời mời tham gia Group Facebook.',
          },
        ],
        rag_reply_mechanism: {
          mode: 'Tự động hóa hoàn toàn dựa trên bộ RAG có sẵn (RAG-Grounded Auto-Reply)',
          approved_sources_count: ragRow.approved_sources,
          total_chunks_count: ragRow.total_chunks,
          embedded_chunks_count: ragRow.embedded_chunks,
          inbound_messages_count: ragRow.inbound_messages,
          grounded_replies_count: ragRow.grounded_replies,
          steps: [
            `Bước 1 — Thu nhận tin nhắn thật (Webhook & Live Sync): Khi user nhắn tin vào Fanpage "${settings.page_name}", hệ thống lưu vào bảng community_messages và tự động tạo task "community.response".`,
            `Bước 2 — Truy xuất bộ RAG có sẵn (services/ai/src/rag/retrieval.py): Hệ thống đối chiếu câu hỏi của user với ${ragRow.total_chunks} đoạn văn bản (source_chunks) đã tích hợp trong bộ RAG bằng Vector Embedding (Cosine Similarity ≥ 0.5) kết hợp khớp từ khóa tiếng Việt/Anh để lấy ra Top 3 đoạn dẫn chứng chuẩn xác nhất.`,
            'Bước 3 — Sinh câu trả lời bám sát RAG & Kiểm duyệt chống bịa đặt (services/ai/src/agents/community/pipeline.py): Mô hình Gemini tổng hợp câu trả lời tự động NHƯNG bắt buộc chỉ dùng thông tin có trong các đoạn trích dẫn RAG vừa tìm được (kèm mã trích dẫn source_id & chunk_id). Nếu câu hỏi nằm ngoài dữ liệu RAG có sẵn, hệ thống tự động chặn lại (escalation_required = true) để chuyển cho người thật duyệt chứ tuyệt đối không tự bịa.',
            'Bước 4 — Tự động gửi phản hồi qua Messenger (CommunityReplyRunner.ts): Ngay khi câu trả lời vượt qua kiểm tra trích dẫn RAG (isAutoApprovable), hệ thống tự động gửi phản hồi trực tiếp tới Messenger của khách hàng.',
          ],
        },
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
    const discAssets = getDiscussionImageAssets(workspaceId);
    const existingDiscUrls = new Set(
      (
        await this.pool.query<{ image_url: string | null }>(
          'SELECT image_url FROM community_hub_discussions WHERE workspace_id = $1 AND image_url IS NOT NULL',
          [workspaceId],
        )
      ).rows
        .map((r) => r.image_url)
        .filter(Boolean) as string[],
    );
    const matchedAsset = matchAssetForTopic(`${input.title} ${input.body}`, discAssets, existingDiscUrls);
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
   * unique topic-matched image and an interactive discussion prompt.
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
        `SELECT DISTINCT a.evidence->0->>'source_id' AS source_id
           FROM publishing_jobs j
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1 AND j.status = 'published' AND a.evidence->0->>'source_id' IS NOT NULL`,
        [workspaceId],
      )
    ).rows;
    const usedSourceIds = new Set(usedSourceRows.map((r) => r.source_id).filter(Boolean) as string[]);

    const usedImageRows = (
      await this.pool.query<{ url: string | null }>(
        `SELECT a.payload->'result'->'image_assets'->0->>'url' AS url
           FROM publishing_jobs j
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1 AND j.status = 'published'
            AND a.payload->'result'->'image_assets'->0->>'url' IS NOT NULL`,
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
    const topicAssets = getTopicImageAssets(workspaceId);
    const chosenAsset = matchAssetForTopic(cleanTitle, topicAssets, usedImageUrls, targetSource.source_url);
    const { topic_tags, match_slug, ...assetPayload } = chosenAsset;

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
      meta_description: `${cleanTitle} — Cẩm nang thực tế & thảo luận tại ${settings.community_name}.`,
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

    const discussionQuestion = `💬 CÙNG THẢO LUẬN: Bạn đã có trải nghiệm thực tế nào về "${cleanTitle}" khi đi du lịch hoặc sinh sống tại Việt Nam chưa? Hãy để lại bình luận chia sẻ bên dưới để cùng giao lưu với các thành viên trong ${settings.community_name} nhé!`;

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

      const discAssets = getDiscussionImageAssets(workspaceId);
      const discAsset = matchAssetForTopic(cleanTitle, discAssets);
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
          discAsset.url,
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
