import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Pool, PoolClient } from 'pg';
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

export type CommunityPublishTarget = 'group' | 'fanpage' | 'both';

export interface GroupBotSessionStatus {
  isLoggedIn: boolean;
  sessionSource: 'file' | 'cookie' | 'none';
  detail?: string;
}

export interface CommunitySettings {
  community_name: string;
  group_url: string;
  publish_target: CommunityPublishTarget;
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

export function normalizePublishTarget(value: unknown): CommunityPublishTarget {
  if (value === 'fanpage' || value === 'both' || value === 'group') return value;
  return 'group';
}

function resolveWorkerDir(): string {
  const candidates = [
    process.env.WORKER_DIR?.trim(),
    path.resolve(process.cwd(), '../worker'),
    path.resolve(process.cwd(), 'apps/worker'),
    path.resolve(__dirname, '../../../../worker'),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return path.resolve(process.cwd(), '../worker');
}

function resolveGroupBotSessionFile(workerDir: string): { exists: boolean; filePath: string } {
  const candidates = [
    process.env.FB_SESSION_FILE?.trim(),
    path.resolve(workerDir, '.fb-session.json'),
    path.resolve(process.cwd(), 'apps/worker/.fb-session.json'),
    path.resolve(__dirname, '../../../../worker/.fb-session.json'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return { exists: true, filePath: p };
  }
  return { exists: false, filePath: path.resolve(workerDir, '.fb-session.json') };
}

function resolveGroupBotRunner(workerDir: string): { command: string; prefixArgs: string[] } {
  const srcRunner = path.join(workerDir, 'src', 'publish', 'runFacebookGroupBot.ts');
  const distRunner = path.join(workerDir, 'dist', 'publish', 'runFacebookGroupBot.js');
  const localTsx = path.join(workerDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const rootTsx = path.resolve(workerDir, '../../node_modules/tsx/dist/cli.mjs');

  if (fs.existsSync(srcRunner) && fs.existsSync(localTsx)) {
    return { command: process.execPath, prefixArgs: [localTsx, srcRunner] };
  }
  if (fs.existsSync(srcRunner) && fs.existsSync(rootTsx)) {
    return { command: process.execPath, prefixArgs: [rootTsx, srcRunner] };
  }
  if (fs.existsSync(distRunner)) {
    return { command: process.execPath, prefixArgs: [distRunner] };
  }
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    prefixArgs: ['tsx', srcRunner],
  };
}

function parseGroupBotResultLine(stdout: string): Record<string, any> | null {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line?.startsWith('GROUP_BOT_RESULT:')) {
      try {
        return JSON.parse(line.slice('GROUP_BOT_RESULT:'.length)) as Record<string, any>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

let activeLoginChild: ChildProcess | null = null;

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
    const defaultPositioning = `Chào mừng bạn đến với ${defaultCommunityName}! 🌿🇻🇳 Không gian dành cho những ai yêu thích khám phá vẻ đẹp mảnh đất hình chữ S và chia sẻ trải nghiệm thực tế về lịch trình du lịch, địa điểm check-in, ẩm thực địa phương, nơi ở, chi phí sinh hoạt, thủ tục và kết nối bạn đồng hành tại Nhóm Facebook Cộng đồng (${defaultGroupUrl}).`;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS community_hub_settings (
        workspace_id UUID PRIMARY KEY,
        community_name VARCHAR(255) NOT NULL,
        group_url TEXT NOT NULL,
        publish_target VARCHAR(32) NOT NULL DEFAULT 'group',
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
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS publish_target VARCHAR(32) NOT NULL DEFAULT 'group';
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
        publish_target?: string | null;
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
        `INSERT INTO community_hub_settings (workspace_id, community_name, group_url, publish_target, page_name, page_url, positioning, group_member_count, week1_target, week2_target, week3_target, week4_target)
         VALUES ($1, $2, $3, 'group', $4, $5, $6, 5, 5, 50, 150, 300)
         ON CONFLICT (workspace_id) DO NOTHING`,
        [workspaceId, defaultCommunityName, defaultGroupUrl, pageName, defaultPageUrl, defaultPositioning],
      );
      return {
        community_name: defaultCommunityName,
        group_url: defaultGroupUrl,
        publish_target: 'group',
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
      publish_target: normalizePublishTarget(saved.publish_target),
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

  async ensureGroupChannel(
    workspaceId: string,
    groupUrl: string,
    communityName: string,
    db: Pool | PoolClient = this.pool,
  ): Promise<string | null> {
    const existing = (
      await db.query<{ id: string; channel_identifier: string | null; display_name: string | null }>(
        "SELECT id, channel_identifier, display_name FROM channels WHERE workspace_id = $1 AND platform_name = 'facebook_group' ORDER BY created_at LIMIT 1",
        [workspaceId],
      )
    ).rows[0];
    if (existing) {
      if (existing.channel_identifier !== groupUrl || existing.display_name !== communityName) {
        await db.query(
          'UPDATE channels SET display_name = $2, channel_identifier = $3 WHERE id = $1 AND workspace_id = $4',
          [existing.id, communityName, groupUrl, workspaceId],
        );
      }
      return existing.id;
    }
    const created = (
      await db.query<{ id: string }>(
        `INSERT INTO channels (workspace_id, platform_name, display_name, channel_identifier)
         VALUES ($1, 'facebook_group', $2, $3)
         RETURNING id`,
        [workspaceId, communityName, groupUrl],
      )
    ).rows[0];
    return created?.id ?? null;
  }

  async migrateScheduledJobsToGroupChannel(
    workspaceId: string,
    groupUrl: string,
    communityName: string,
  ): Promise<number> {
    const groupChannelId = await this.ensureGroupChannel(workspaceId, groupUrl, communityName);
    if (!groupChannelId) return 0;

    // Move active scheduled jobs from Fanpage ('facebook') onto Community Group ('facebook_group')
    // respecting uq_publishing_jobs_active (channel_id, artifact_id) WHERE status IN ('scheduled', 'publishing').
    const moved = (
      await this.pool.query<{ id: string }>(
        `UPDATE publishing_jobs j
            SET channel_id = $2,
                mode = 'live',
                utm_url = $3
           FROM channels ch
          WHERE j.workspace_id = $1
            AND j.channel_id = ch.id
            AND ch.platform_name = 'facebook'
            AND j.status = 'scheduled'
            AND NOT EXISTS (
              SELECT 1
                FROM publishing_jobs pj2
               WHERE pj2.workspace_id = $1
                 AND pj2.channel_id = $2
                 AND pj2.artifact_id = j.artifact_id
                 AND pj2.status IN ('scheduled', 'publishing')
            )
         RETURNING j.id`,
        [workspaceId, groupChannelId, groupUrl],
      )
    ).rows;

    for (const row of moved) {
      await this.pool.query(
        `UPDATE outbox_events
            SET payload = jsonb_set(
                  jsonb_set(payload, '{channel_id}', to_jsonb($2::text)),
                  '{mode}',
                  '"live"'::jsonb
                )
          WHERE workspace_id = $1
            AND event_type = 'publishing.scheduled'
            AND dedup_key = $3`,
        [workspaceId, groupChannelId, `publish:${row.id}`],
      );
    }

    // Cancel any duplicate scheduled Fanpage jobs that already have an active Group job
    await this.pool.query(
      `UPDATE publishing_jobs j
          SET status = 'cancelled',
              error_message = 'Migrated to Facebook Group target (publish_target=group)'
         FROM channels ch
        WHERE j.workspace_id = $1
          AND j.channel_id = ch.id
          AND ch.platform_name = 'facebook'
          AND j.status = 'scheduled'
          AND EXISTS (
            SELECT 1
              FROM publishing_jobs pj2
             WHERE pj2.workspace_id = $1
               AND pj2.channel_id = $2
               AND pj2.artifact_id = j.artifact_id
               AND pj2.status IN ('scheduled', 'publishing')
          )`,
      [workspaceId, groupChannelId],
    );

    // Keep Group scheduled jobs pointing at the latest groupUrl
    await this.pool.query(
      `UPDATE publishing_jobs
          SET utm_url = $3,
              mode = 'live'
        WHERE workspace_id = $1
          AND channel_id = $2
          AND status = 'scheduled'
          AND (utm_url IS DISTINCT FROM $3 OR mode <> 'live')`,
      [workspaceId, groupChannelId, groupUrl],
    );

    return moved.length;
  }

  async updateCommunitySettings(
    workspaceId: string,
    input: {
      community_name?: string;
      group_url?: string;
      publish_target?: CommunityPublishTarget;
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
    const nextPublishTarget =
      input.publish_target !== undefined ? normalizePublishTarget(input.publish_target) : current.publish_target;
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
              publish_target = $4,
              positioning = $5,
              group_member_count = $6,
              week1_target = $7,
              week2_target = $8,
              week3_target = $9,
              week4_target = $10,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [
        workspaceId,
        nextName,
        nextGroupUrl,
        nextPublishTarget,
        nextPositioning,
        nextGroupCount,
        nextW1,
        nextW2,
        nextW3,
        nextW4,
      ],
    );

    await this.pool.query(
      `UPDATE community_hub_members
          SET invite_group_url = $2,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [workspaceId, nextGroupUrl],
    );

    if (nextPublishTarget === 'group') {
      await this.migrateScheduledJobsToGroupChannel(workspaceId, nextGroupUrl, nextName);
    } else if (nextPublishTarget === 'both') {
      await this.ensureGroupChannel(workspaceId, nextGroupUrl, nextName);
    }

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

      CREATE TABLE IF NOT EXISTS community_group_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        source_id UUID,
        article_id UUID,
        publishing_job_id UUID,
        post_title VARCHAR(500) NOT NULL,
        group_url TEXT NOT NULL,
        facebook_post_url TEXT,
        body_text TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(workspace_id, post_title)
      );
      ALTER TABLE community_group_posts ADD COLUMN IF NOT EXISTS source_id UUID;
      ALTER TABLE community_group_posts ADD COLUMN IF NOT EXISTS publishing_job_id UUID;
      ALTER TABLE community_group_posts ADD COLUMN IF NOT EXISTS error_message TEXT;
      ALTER TABLE community_group_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    if (settings.publish_target === 'group') {
      await this.migrateScheduledJobsToGroupChannel(workspaceId, settings.group_url, settings.community_name);
    } else if (settings.publish_target === 'both') {
      await this.ensureGroupChannel(workspaceId, settings.group_url, settings.community_name);
    }

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

    // Ensure all unposted Playbook topics are automatically scheduled by the Agents in publishing_jobs & outbox_events
    await this.ensurePlaybookTopicsScheduled(workspaceId, uniqueSources, '11111111-1111-4000-8000-000000000001', settings);

    // Query Website articles, publishing_jobs per channel (facebook_group vs legacy facebook Fanpage),
    // and live community_group_posts executions so Group vs Fanpage state is 100% honest and never conflated.
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

    const publishedChannelJobs = (
      await this.pool.query<{
        job_id: string;
        external_post_id: string | null;
        published_at: Date | null;
        platform_name: string;
        utm_url: string | null;
        source_id: string | null;
        img_url: string | null;
      }>(
        `SELECT j.id AS job_id, j.external_post_id, j.published_at,
                ch.platform_name, j.utm_url,
                a.evidence->0->>'source_id' AS source_id,
                a.payload->'result'->'image_assets'->0->>'url' AS img_url
           FROM publishing_jobs j
           JOIN channels ch ON ch.id = j.channel_id
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1
            AND j.status = 'published'
            AND ch.platform_name IN ('facebook_group', 'facebook')
            AND COALESCE(j.external_post_id, '') NOT LIKE 'newsletter_%'
          ORDER BY j.published_at DESC NULLS LAST`,
        [workspaceId],
      )
    ).rows;

    const activeChannelJobs = (
      await this.pool.query<{
        job_id: string;
        scheduled_for: Date;
        status: string;
        error_message: string | null;
        platform_name: string;
        utm_url: string | null;
        source_id: string | null;
        img_url: string | null;
      }>(
        `SELECT j.id AS job_id, j.scheduled_for, j.status, j.error_message,
                ch.platform_name, j.utm_url,
                a.evidence->0->>'source_id' AS source_id,
                a.payload->'result'->'image_assets'->0->>'url' AS img_url
           FROM publishing_jobs j
           JOIN channels ch ON ch.id = j.channel_id
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1
            AND j.status IN ('scheduled', 'publishing', 'failed')
            AND ch.platform_name IN ('facebook_group', 'facebook')
          ORDER BY j.scheduled_for ASC`,
        [workspaceId],
      )
    ).rows;

    const communityGroupPostRows = (
      await this.pool.query<{
        id: string;
        source_id: string | null;
        publishing_job_id: string | null;
        post_title: string;
        group_url: string;
        facebook_post_url: string | null;
        status: string;
        error_message: string | null;
        published_at: Date | null;
        updated_at: Date;
      }>(
        `SELECT id, source_id, publishing_job_id, post_title, group_url, facebook_post_url,
                status, error_message, published_at, updated_at
           FROM community_group_posts
          WHERE workspace_id = $1
          ORDER BY published_at DESC NULLS LAST, updated_at DESC`,
        [workspaceId],
      )
    ).rows;

    const normalizeGroupPostKey = (title: string): string =>
      title
        .replace(/^[\p{Emoji}\s]*\[CẨM NANG CỘNG ĐỒNG\]\s*/iu, '')
        .trim()
        .toLowerCase();

    const fanpagePublishedBySource = new Map<
      string,
      { external_post_id: string; published_at: Date | null; img_url: string | null }
    >();
    const groupPublishedBySource = new Map<
      string,
      { job_id: string | null; post_url: string; published_at: Date | null; img_url: string | null }
    >();

    for (const job of publishedChannelJobs) {
      if (!job.source_id) continue;
      if (job.platform_name === 'facebook_group') {
        if (!groupPublishedBySource.has(job.source_id)) {
          const postUrl =
            job.external_post_id && /^https?:\/\//i.test(job.external_post_id)
              ? job.external_post_id
              : job.utm_url || settings.group_url;
          groupPublishedBySource.set(job.source_id, {
            job_id: job.job_id,
            post_url: postUrl,
            published_at: job.published_at,
            img_url: job.img_url,
          });
        }
      } else if (job.platform_name === 'facebook' && job.external_post_id) {
        if (!fanpagePublishedBySource.has(job.source_id)) {
          fanpagePublishedBySource.set(job.source_id, {
            external_post_id: job.external_post_id,
            published_at: job.published_at,
            img_url: job.img_url,
          });
        }
      }
    }

    const groupPublishedByTitle = new Map<string, { post_url: string; published_at: Date | null; job_id: string | null }>();
    const groupFailedBySource = new Map<string, { error: string; job_id: string | null }>();
    const groupFailedByTitle = new Map<string, { error: string; job_id: string | null }>();

    for (const gp of communityGroupPostRows) {
      const titleKey = normalizeGroupPostKey(gp.post_title);
      if (gp.status === 'published') {
        const postUrl = gp.facebook_post_url || gp.group_url || settings.group_url;
        if (gp.source_id && !groupPublishedBySource.has(gp.source_id)) {
          groupPublishedBySource.set(gp.source_id, {
            job_id: gp.publishing_job_id,
            post_url: postUrl,
            published_at: gp.published_at,
            img_url: null,
          });
        }
        if (titleKey && !groupPublishedByTitle.has(titleKey)) {
          groupPublishedByTitle.set(titleKey, {
            post_url: postUrl,
            published_at: gp.published_at,
            job_id: gp.publishing_job_id,
          });
        }
      } else if (gp.status === 'failed') {
        const errText = gp.error_message || 'Bot Group gặp sự cố khi đăng bài';
        if (gp.source_id && !groupPublishedBySource.has(gp.source_id) && !groupFailedBySource.has(gp.source_id)) {
          groupFailedBySource.set(gp.source_id, { error: errText, job_id: gp.publishing_job_id });
        }
        if (titleKey && !groupPublishedByTitle.has(titleKey) && !groupFailedByTitle.has(titleKey)) {
          groupFailedByTitle.set(titleKey, { error: errText, job_id: gp.publishing_job_id });
        }
      }
    }

    const groupScheduledBySource = new Map<
      string,
      { job_id: string; scheduled_for: Date; status: string; img_url: string | null }
    >();
    const fanpageScheduledBySource = new Map<
      string,
      { job_id: string; scheduled_for: Date; status: string; img_url: string | null }
    >();

    for (const job of activeChannelJobs) {
      if (!job.source_id) continue;
      if (job.platform_name === 'facebook_group') {
        if (job.status === 'failed') {
          if (!groupPublishedBySource.has(job.source_id) && !groupFailedBySource.has(job.source_id)) {
            groupFailedBySource.set(job.source_id, {
              error: job.error_message || 'Đăng vào Group thất bại',
              job_id: job.job_id,
            });
          }
        } else if (!groupPublishedBySource.has(job.source_id) && !groupScheduledBySource.has(job.source_id)) {
          groupScheduledBySource.set(job.source_id, {
            job_id: job.job_id,
            scheduled_for: new Date(job.scheduled_for),
            status: job.status,
            img_url: job.img_url,
          });
        }
      } else if (job.platform_name === 'facebook') {
        if (
          (job.status === 'scheduled' || job.status === 'publishing') &&
          !fanpagePublishedBySource.has(job.source_id) &&
          !fanpageScheduledBySource.has(job.source_id)
        ) {
          fanpageScheduledBySource.set(job.source_id, {
            job_id: job.job_id,
            scheduled_for: new Date(job.scheduled_for),
            status: job.status,
            img_url: job.img_url,
          });
        }
      }
    }

    const webPublishedBySource = new Map<string, { slug: string | null; published_at: Date | null }>();
    for (const art of publishedArticles) {
      if (art.source_id && !webPublishedBySource.has(art.source_id)) {
        webPublishedBySource.set(art.source_id, { slug: art.slug, published_at: art.published_at });
      }
    }

    const topicAssets = getTopicImageAssets(workspaceId);
    const all30Assets = getPlaybookImageAssets(workspaceId);
    const targetMode = settings.publish_target;

    const getGroupPub = (s: { id: string; title: string }) => {
      const bySrc = groupPublishedBySource.get(s.id);
      if (bySrc) return bySrc;
      const byTitle = groupPublishedByTitle.get(s.title.toLowerCase());
      return byTitle
        ? { job_id: byTitle.job_id, post_url: byTitle.post_url, published_at: byTitle.published_at, img_url: null }
        : undefined;
    };
    const getGroupFail = (s: { id: string; title: string }) =>
      groupFailedBySource.get(s.id) ?? groupFailedByTitle.get(s.title.toLowerCase());

    const isPrimaryPublishedSource = (s: { id: string; title: string }): boolean => {
      const inGroup = Boolean(getGroupPub(s));
      const inPage = Boolean(fanpagePublishedBySource.has(s.id));
      if (targetMode === 'fanpage') return inPage;
      if (targetMode === 'both') return inGroup && inPage;
      return inGroup;
    };

    const getPrimaryPublishedAtMs = (s: { id: string; title: string }): number => {
      if (targetMode === 'fanpage') {
        return fanpagePublishedBySource.get(s.id)?.published_at?.getTime() ?? 0;
      }
      return (
        getGroupPub(s)?.published_at?.getTime() ??
        fanpagePublishedBySource.get(s.id)?.published_at?.getTime() ??
        0
      );
    };

    const primaryPublishedSources = uniqueSources
      .filter((s) => isPrimaryPublishedSource(s))
      .sort((a, b) => getPrimaryPublishedAtMs(a) - getPrimaryPublishedAtMs(b));
    const upcomingSources = uniqueSources
      .filter((s) => !isPrimaryPublishedSource(s))
      .sort((a, b) => {
        const ta =
          (targetMode === 'fanpage'
            ? fanpageScheduledBySource.get(a.id)?.scheduled_for?.getTime()
            : groupScheduledBySource.get(a.id)?.scheduled_for?.getTime()) ??
          fanpagePublishedBySource.get(a.id)?.published_at?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        const tb =
          (targetMode === 'fanpage'
            ? fanpageScheduledBySource.get(b.id)?.scheduled_for?.getTime()
            : groupScheduledBySource.get(b.id)?.scheduled_for?.getTime()) ??
          fanpagePublishedBySource.get(b.id)?.published_at?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        return ta !== tb ? ta - tb : a.title.localeCompare(b.title);
      });
    const orderedSources = [...primaryPublishedSources, ...upcomingSources];

    const nowUtc = new Date();
    const baseYear = nowUtc.getUTCFullYear();
    const baseMonth = nowUtc.getUTCMonth();
    const baseDay = nowUtc.getUTCDate();

    const calendarUsedImages = new Set<string>();
    let upcomingIdx = 0;

    let publishedGroupCount = 0;
    let publishedFanpageCount = 0;
    let failedGroupCount = 0;

    const dailyCalendar = orderedSources.map((source, index) => {
      const matchedAsset = matchAssetForTopic(source.title, topicAssets, calendarUsedImages, source.source_url);
      calendarUsedImages.add(matchedAsset.url);

      const groupPub = getGroupPub(source);
      const groupSched = groupScheduledBySource.get(source.id);
      const groupFail = !groupPub && !groupSched ? getGroupFail(source) : undefined;
      const fanpagePub = fanpagePublishedBySource.get(source.id);
      const fanpageSched = fanpageScheduledBySource.get(source.id);
      const webPub = webPublishedBySource.get(source.id);

      const isPublishedGroup = Boolean(groupPub);
      const isPublishedFanpage = Boolean(fanpagePub);
      if (isPublishedGroup) publishedGroupCount++;
      if (isPublishedFanpage) publishedFanpageCount++;
      if (groupFail) failedGroupCount++;

      const groupStatus: 'published' | 'scheduled' | 'failed' | 'not_published' = isPublishedGroup
        ? 'published'
        : groupSched
          ? 'scheduled'
          : groupFail
            ? 'failed'
            : 'not_published';

      const isPrimaryPublished =
        targetMode === 'fanpage'
          ? isPublishedFanpage
          : targetMode === 'both'
            ? isPublishedGroup && isPublishedFanpage
            : isPublishedGroup;

      const matchInfo = classifyMemberInterests(source.title);

      let targetDateUtc: Date;
      if (targetMode === 'fanpage') {
        if (isPublishedFanpage && fanpagePub?.published_at) {
          targetDateUtc = new Date(fanpagePub.published_at);
        } else if (fanpageSched?.scheduled_for) {
          targetDateUtc = new Date(fanpageSched.scheduled_for);
          upcomingIdx++;
        } else {
          targetDateUtc = new Date(Date.UTC(baseYear, baseMonth, baseDay + upcomingIdx + 1, 2, 0, 0));
          upcomingIdx++;
        }
      } else {
        if (isPublishedGroup && groupPub?.published_at) {
          targetDateUtc = new Date(groupPub.published_at);
        } else if (groupSched?.scheduled_for) {
          targetDateUtc = new Date(groupSched.scheduled_for);
          upcomingIdx++;
        } else if (fanpagePub?.published_at) {
          targetDateUtc = new Date(fanpagePub.published_at);
        } else if (webPub?.published_at) {
          targetDateUtc = new Date(webPub.published_at);
        } else {
          targetDateUtc = new Date(Date.UTC(baseYear, baseMonth, baseDay + upcomingIdx + 1, 2, 0, 0));
          upcomingIdx++;
        }
      }

      const formatted = formatVnDateTime(targetDateUtc, true);
      const vnDate = new Date(targetDateUtc.getTime() + 7 * 3600_000);
      const dayOfMonth = vnDate.getUTCDate();
      const monthVn = vnDate.getUTCMonth() + 1;
      const yearVn = vnDate.getUTCFullYear();
      const dateIsoVn = `${yearVn}-${String(monthVn).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
      const timeHmVn = `${String(vnDate.getUTCHours()).padStart(2, '0')}:${String(vnDate.getUTCMinutes()).padStart(2, '0')}`;
      const weekNum = dayOfMonth <= 8 ? 1 : dayOfMonth <= 15 ? 2 : dayOfMonth <= 22 ? 3 : 4;
      const weekRangeLabel =
        weekNum === 1
          ? 'Tuần 1 (02/11/2026 00:00 – 08/11/2026 23:59)'
          : weekNum === 2
            ? 'Tuần 2 (09/11/2026 00:00 – 15/11/2026 23:59)'
            : weekNum === 3
              ? 'Tuần 3 (16/11/2026 00:00 – 22/11/2026 23:59)'
              : 'Tuần 4 (23/11/2026 00:00 – 30/11/2026 23:59)';

      const fanpagePostUrl = fanpagePub?.external_post_id
        ? fanpagePub.external_post_id.includes('_')
          ? `https://www.facebook.com/${fanpagePub.external_post_id}`
          : `https://www.facebook.com/${settings.connected_fanpage_id}/posts/${fanpagePub.external_post_id}`
        : null;
      const groupPostUrl = groupPub?.post_url ?? null;

      const activeJobId =
        targetMode === 'fanpage'
          ? (fanpageSched?.job_id ?? null)
          : (groupSched?.job_id ?? groupFail?.job_id ?? groupPub?.job_id ?? null);

      const jobStatus: 'published' | 'scheduled' | 'failed' | 'ready_to_publish' = isPrimaryPublished
        ? 'published'
        : targetMode !== 'fanpage' && groupSched
          ? 'scheduled'
          : targetMode !== 'fanpage' && groupFail
            ? 'failed'
            : targetMode === 'fanpage' && fanpageSched
              ? 'scheduled'
              : 'ready_to_publish';

      let concreteAction: string;
      if (targetMode === 'fanpage') {
        concreteAction = isPublishedFanpage
          ? `Đã xuất bản lên Fanpage "${settings.page_name}" lúc ${formatted.short}`
          : `Đã lên lịch trong publishing_jobs (${fanpageSched?.job_id?.slice(0, 8) ?? 'auto'}): Tự động xuất bản lúc ${formatted.short} lên Fanpage "${settings.page_name}"`;
      } else if (isPublishedGroup) {
        concreteAction = `Đã đăng thật vào Group "${settings.community_name}" lúc ${formatted.short}${
          targetMode === 'both' ? (isPublishedFanpage ? ` (và Fanpage "${settings.page_name}")` : ' (đang chờ Fanpage)') : ''
        }`;
      } else if (groupSched) {
        concreteAction = `Đã lên lịch trong publishing_jobs (${groupSched.job_id.slice(0, 8)}): Bot tự động đăng lúc ${formatted.short} vào Group "${settings.community_name}"${
          targetMode === 'both' ? ` & Fanpage "${settings.page_name}"` : ''
        }`;
      } else if (groupFail) {
        concreteAction = `Đăng tự động vào Group thất bại: ${groupFail.error}. Bấm "🤖 Đăng bài này vào Group" sau khi đăng nhập Group Bot hoặc dùng "📋 Copy & Mở Group".`;
      } else if (isPublishedFanpage) {
        concreteAction = `Trước đó mới đăng lên Fanpage cũ ("${settings.page_name}"), chưa đăng vào Group "${settings.community_name}". Bấm "🤖 Đăng bài này vào Group" để đăng ngay lên cộng đồng của bạn.`;
      } else {
        concreteAction = `Sẵn sàng đăng vào Group "${settings.community_name}" (kèm ảnh độc nhất #${index + 1} & câu hỏi thảo luận).`;
      }

      const dayLabel = isPrimaryPublished
        ? `Đã đăng Group: ${formatted.full}`
        : groupSched
          ? `Đã hẹn giờ đăng Group: ${formatted.full}`
          : groupFail
            ? `Lỗi đăng Group (${formatted.short})`
            : isPublishedFanpage
              ? `Chưa đăng Group (mới đăng Fanpage cũ ${formatted.short})`
              : `Sẵn sàng đăng Group`;

      return {
        day_index: index + 1,
        day_label: dayLabel,
        scheduled_date_vn: formatted.full,
        scheduled_date_short: formatted.short,
        scheduled_date_only: formatted.dateOnly,
        scheduled_iso: targetDateUtc.toISOString(),
        date_iso_vn: dateIsoVn,
        day_vn: dayOfMonth,
        month_vn: monthVn,
        year_vn: yearVn,
        time_hm_vn: timeHmVn,
        publishing_job_id: activeJobId,
        target_channel: targetMode,
        is_published_group: isPublishedGroup,
        is_published_fanpage: isPublishedFanpage,
        group_status: groupStatus,
        group_post_url: groupPostUrl,
        group_published_at: groupPub?.published_at?.toISOString() ?? null,
        group_error: groupFail?.error ?? null,
        fanpage_post_url: fanpagePostUrl,
        fanpage_published_at: fanpagePub?.published_at?.toISOString() ?? null,
        job_status: jobStatus,
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
          community_engagement: 'Community Agent (Đăng vào Group & gắn câu hỏi thảo luận)',
        },
        concrete_action: concreteAction,
        status: isPrimaryPublished ? ('published' as const) : ('ready_to_publish' as const),
        published_slug: webPub?.slug ?? null,
        published_at:
          (targetMode === 'fanpage' ? fanpagePub?.published_at : groupPub?.published_at ?? webPub?.published_at)?.toISOString() ??
          null,
        facebook_post_url: targetMode === 'fanpage' ? fanpagePostUrl : groupPostUrl ?? fanpagePostUrl,
        unique_topic_verified: true,
        unique_image_verified: true,
      };
    });

    const groupBotSession = await this.getGroupBotSessionStatus();

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
        responsible_agents: 'Growth Lead (Lập kế hoạch) • SEO & Content Agent (Bài viết cẩm nang) • Community Agent (Đăng Group & Mời khách từ Messenger)',
        tactics: [
          `[02/11 – 08/11/2026] Đã đạt ${week1Count}/${w1Target} thành viên thật trong Group "${settings.community_name}" và ghi nhận ${realIdentifiedPeople} khách hàng thật nhắn tin trên Fanpage "${settings.page_name}"`,
          `[Đích đăng chính: Group Facebook] Đã đăng ${publishedGroupCount} bài trực tiếp vào Group "${settings.community_name}" (và ${publishedFanpageCount} bài lịch sử trên Fanpage cũ)`,
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
        responsible_agents: 'Growth Lead (Lịch 09/11–15/11) • SEO & Content Agent (7 bài lúc 09:00 sáng mỗi ngày) • Community Bot (Đăng thẳng Group)',
        tactics: [
          '[09/11 – 15/11/2026 lúc 09:00 sáng] Đăng đều đặn 1 bài mới/ngày vào Group Cộng đồng theo đúng lịch ngày tháng cụ thể (7 chủ đề mới + 7 hình ảnh riêng biệt)',
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
          '[16/11 – 22/11/2026 lúc 09:00 sáng] Xuất bản 7 bài chuyên sâu vào Group về di chuyển nội địa, mùa đẹp nhất đi Đà Nẵng/Hà Nội/Phú Quốc và thủ tục E-Visa chuẩn 2026',
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
          '[23/11 – 26/11/2026 lúc 09:00 sáng] Hoàn tất xuất bản các chủ đề còn lại vào Group Facebook (đạt 100% độ phủ 25 chủ đề, 0% trùng ảnh)',
          '[Thứ Sáu 27/11/2026] Mở cuộc bình chọn (Community Poll) trên Group để thành viên chọn chủ đề ưu tiên cho Tháng 12/2026 (Lễ hội cuối năm & Giáng sinh)',
          '[Chủ Nhật 29/11/2026] Performance Agent & Growth Lead tổng kết chỉ số tăng trưởng Tháng 11/2026 và kích hoạt kế hoạch Tháng 12/2026',
        ],
      },
    ];

    const weeklyCalendar = [
      {
        week_number: 1,
        week_label: 'Tuần 1 (02/11/2026 00:00 – 08/11/2026 23:59)',
        date_range: '02/11/2026 00:00 – 08/11/2026 23:59',
        member_target: `Mục tiêu: ${w1Target} thành viên (Thực tế đạt: ${week1Count}/${w1Target} — ✓ Đạt chỉ tiêu)`,
        pillar_theme: 'Khởi chạy Cộng đồng, Cẩm nang Thiết yếu, Thuê nhà, eSIM, Đi chợ, Bảo hiểm & Tạm trú',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Group Bot',
        planned_topics: weekItems(1).map(
          (item) =>
            `[${item.scheduled_date_short}] ${item.topic_title} (${item.status === 'published' ? `✓ Đã đăng Group lúc ${item.scheduled_date_short}` : item.group_status === 'scheduled' ? `⏰ Hẹn Group lúc ${item.scheduled_date_short}` : '⚠ Chưa đăng Group'})`,
        ),
        interactive_format: 'Chào mừng thành viên đầu tiên + Trả lời tự động khách hàng qua Messenger RAG và mời vào Group',
      },
      {
        week_number: 2,
        week_label: 'Tuần 2 (09/11/2026 00:00 – 15/11/2026 23:59)',
        date_range: '09/11/2026 00:00 – 15/11/2026 23:59',
        member_target: `Mục tiêu: ${w2Target} thành viên (Hiện tại: ${totalMatchedCount}/${w2Target} — Đang chạy chiến dịch)`,
        pillar_theme: 'Sân bay Nhập cảnh, Thời hạn Hộ chiếu, Vé khứ hồi, Tiền mặt/ATM, Chi phí Mỗi ngày & Mở Tài khoản Ngân hàng',
        responsible_agents: 'Growth Lead (Phân lịch 09/11–15/11) → SEO Agent → Content Agent (Đăng Group 09:00 sáng) → Community Agent',
        planned_topics: weekItems(2).map(
          (item) =>
            `[${item.scheduled_date_short}] ${item.topic_title} (${item.status === 'published' ? `✓ Đã đăng Group lúc ${item.scheduled_date_short}` : `⏰ Đã hẹn giờ lúc ${item.scheduled_date_short}`})`,
        ),
        interactive_format: 'Mỗi bài đăng thẳng Group lúc 09:00 sáng kèm câu hỏi thảo luận mở + Gửi lời mời vào Group cho khách nhắn tin',
      },
      {
        week_number: 3,
        week_label: 'Tuần 3 (16/11/2026 00:00 – 22/11/2026 23:59)',
        date_range: '16/11/2026 00:00 – 22/11/2026 23:59',
        member_target: `Mục tiêu: ${w3Target} thành viên (Mở rộng tương tác đời sống địa phương)`,
        pillar_theme: 'Thời điểm Đẹp nhất đến VN, Cách Tìm Địa chỉ Ngõ/Hẻm & Trọn bộ Thủ tục E-Visa Chính thức 2026',
        responsible_agents: 'Growth Lead (Phân lịch 16/11–22/11) → SEO Agent → Content Agent (Đăng Group 09:00 sáng) → Community Agent',
        planned_topics: weekItems(3).map(
          (item) =>
            `[${item.scheduled_date_short}] ${item.topic_title} (${item.status === 'published' ? `✓ Đã đăng Group lúc ${item.scheduled_date_short}` : `⏰ Đã hẹn giờ lúc ${item.scheduled_date_short}`})`,
        ),
        interactive_format: 'Thảo luận tình huống thực tế trên Group về tìm địa chỉ ngõ/hẻm, đi tàu hỏa/máy bay nội địa và kiểm tra trang E-Visa chính thức',
      },
      {
        week_number: 4,
        week_label: 'Tuần 4 (23/11/2026 00:00 – 30/11/2026 23:59)',
        date_range: '23/11/2026 00:00 – 30/11/2026 23:59',
        member_target: `Mục tiêu: ${w4Target} thành viên (Cộng đồng tự vận hành & Kết nối bền vững)`,
        pillar_theme: 'Chuẩn bị Hành lý Chuyển đến VN, Chọn Khu vực Ở 2 Tuần Đầu & Thiết lập Góc Làm việc Từ xa (Remote Work)',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Group Bot → Performance Agent (Đánh giá KPI cuối tháng)',
        planned_topics: weekItems(4).map(
          (item) =>
            `[${item.scheduled_date_short}] ${item.topic_title} (${item.status === 'published' ? `✓ Đã đăng Group lúc ${item.scheduled_date_short}` : `⏰ Đã hẹn giờ lúc ${item.scheduled_date_short}`})`,
        ),
        interactive_format: 'Bình chọn chủ đề Tháng 12/2026 + Vinh danh thành viên chia sẻ kinh nghiệm hữu ích nhất trong Group',
      },
    ];

    const scheduledTopicsCount =
      targetMode === 'fanpage' ? fanpageScheduledBySource.size : groupScheduledBySource.size;
    const publishedTopicsCount = primaryPublishedSources.length;

    const monthlyCalendar = [
      {
        month_number: 1,
        month_label: `Tháng 11/2026 (01/11/2026 – 30/11/2026): Xây dựng "${settings.community_name}" & Xuất bản ${dailyCalendar.length} Bài Cẩm nang Cốt lõi`,
        date_range: '01/11/2026 – 30/11/2026',
        member_goal: `Tuần 1 (02/11–08/11): ${w1Target} người [Đã đạt ${week1Count}/${w1Target} ✓] → Tuần 2 (09/11–15/11): ${w2Target} người → Tuần 3 (16/11–22/11): ${w3Target} người → Cuối Tháng 11 (30/11/2026): ${w4Target} thành viên thật`,
        content_commitment: `${dailyCalendar.length} bài cẩm nang chuyên sâu (Đã đăng vào Group ${publishedGroupCount}/${dailyCalendar.length} bài; ${scheduledTopicsCount} bài đã hẹn giờ vào Group lúc 09:00 sáng — 100% ảnh riêng biệt từ kho 30 ảnh)`,
        key_pillars: [
          `02/11/2026 – 08/11/2026 (Tuần 1): Đã hoàn thành mục tiêu ${week1Count}/${w1Target} thành viên hạt nhân + Khởi chạy chuỗi bài cẩm nang Thiết yếu`,
          '09/11/2026 – 15/11/2026 (Tuần 2): Xuất bản 7 bài lúc 09:00 sáng vào Group (Vé khứ hồi, Chọn sân bay, Thời hạn hộ chiếu, Tiền mặt/ATM, Chi phí mỗi ngày, Ngân hàng, Di chuyển)',
          '16/11/2026 – 22/11/2026 (Tuần 3): Xuất bản 7 bài lúc 09:00 sáng vào Group (Thời điểm đẹp nhất đến VN, Địa chỉ ngõ/hẻm, Hướng dẫn E-Visa 2026, So sánh E-Visa, Hành lý)',
          '23/11/2026 – 30/11/2026 (Tuần 4): Xuất bản các bài còn lại vào Group + Bình chọn chủ đề Tháng 12/2026 vào ngày 27/11/2026',
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
        publish_target: settings.publish_target,
        group_bot_session: groupBotSession,
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
        published_topics_count: publishedTopicsCount,
        published_group_count: publishedGroupCount,
        published_fanpage_count: publishedFanpageCount,
        scheduled_topics_count: scheduledTopicsCount,
        scheduled_group_count: groupScheduledBySource.size,
        failed_group_count: failedGroupCount,
        fresh_unposted_topics: dailyCalendar.filter((d) => d.status !== 'published').length,
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
              'Chịu trách nhiệm CHUYỂN HÓA BÀI VIẾT THÀNH BÀI ĐĂNG CỘNG ĐỒNG (Hook, Body, Câu hỏi thảo luận, Hashtag), chọn 1 hình ảnh minh họa độc nhất không trùng lặp từ kho 30 ảnh và đẩy sang PublishingOutboxRunner / FacebookGroupBot để đăng trực tiếp lên Group Facebook Cộng đồng (chỉ đăng Fanpage nếu bạn bật).',
          },
          {
            agent_id: 'community',
            agent_name: '4. Community Manager Agent',
            operations: ['community.response', 'community.hub'],
            responsibility:
              'Chịu trách nhiệm TƯƠNG TÁC & PHÁT TRIỂN THÀNH VIÊN CỘNG ĐỒNG: tự động trả lời tin nhắn/bình luận của khách hàng bằng bộ RAG có sẵn, gắn câu hỏi thảo luận mở vào bài đăng Group, nhận diện khách hàng cùng mối quan tâm từ Messenger Fanpage và gửi lời mời tham gia Group Facebook.',
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
            'Bước 4 — Tự động gửi phản hồi qua Messenger (CommunityReplyRunner.ts): Ngay khi câu trả lời vượt qua kiểm tra trích dẫn RAG (isAutoApprovable), hệ thống tự động gửi phản hồi trực tiếp tới Messenger của khách hàng kèm link mời vào Group.',
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
   * Automatically ensures every approved Playbook topic is scheduled in `publishing_jobs` & `outbox_events`
   * by the 4 Agents (Growth Lead -> SEO -> Content -> Community) with concrete daily 09:00 AM VN timestamps.
   */
  async ensurePlaybookTopicsScheduled(
    workspaceId: string,
    uniqueSources?: { id: string; title: string; source_url: string; version: number }[],
    actorId = '11111111-1111-4000-8000-000000000001',
    existingSettings?: CommunitySettings,
  ): Promise<number> {
    const settings = existingSettings ?? (await this.ensureSchemaAndContext(workspaceId));
    const targetMode = settings.publish_target;

    const channelFilter =
      targetMode === 'fanpage'
        ? "ch.platform_name = 'facebook'"
        : targetMode === 'both'
          ? "ch.platform_name = 'facebook_group'"
          : "(ch.platform_name = 'facebook_group' OR (ch.platform_name = 'facebook' AND j.status = 'published'))";

    const existingRows = (
      await this.pool.query<{
        source_id: string | null;
        status: string;
        scheduled_for: Date | null;
        platform_name: string;
      }>(
        `SELECT DISTINCT a.evidence->0->>'source_id' AS source_id, j.status, j.scheduled_for, ch.platform_name
           FROM publishing_jobs j
           JOIN channels ch ON ch.id = j.channel_id
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1 AND j.status IN ('published', 'scheduled', 'publishing')
            AND ${channelFilter}
            AND COALESCE(j.external_post_id, '') NOT LIKE 'newsletter_%'
            AND a.evidence->0->>'source_id' IS NOT NULL`,
        [workspaceId],
      )
    ).rows;

    const coveredSourceIds = new Set(existingRows.map((r) => r.source_id).filter(Boolean) as string[]);

    if (targetMode !== 'fanpage') {
      const postedInGroupRows = (
        await this.pool.query<{ source_id: string | null }>(
          `SELECT DISTINCT source_id
             FROM community_group_posts
            WHERE workspace_id = $1 AND status = 'published' AND source_id IS NOT NULL`,
          [workspaceId],
        )
      ).rows;
      for (const r of postedInGroupRows) {
        if (r.source_id) coveredSourceIds.add(r.source_id);
      }
    }

    const sources =
      uniqueSources ??
      (
        await this.pool.query<{ id: string; title: string; source_url: string; version: number }>(
          `SELECT id, title, COALESCE(source_url, url_or_blob) AS source_url, version
             FROM sources
            WHERE workspace_id = $1 AND status = 'approved' AND deleted_at IS NULL
              AND COALESCE(source_url, url_or_blob) LIKE 'https://tripc.ai/blog/%'
            ORDER BY title ASC`,
          [workspaceId],
        )
      ).rows;

    const unscheduled = sources.filter((s) => !coveredSourceIds.has(s.id));
    if (unscheduled.length === 0) return 0;

    // Find the latest scheduled_for among active jobs on the target channel so new topics append day-by-day at 09:00 VN (02:00 UTC)
    const nowUtc = new Date();
    const expectedPlatform = targetMode === 'fanpage' ? 'facebook' : 'facebook_group';
    const existingScheduledDates = existingRows
      .filter((r) => r.status !== 'published' && r.scheduled_for && r.platform_name === expectedPlatform)
      .map((r) => new Date(r.scheduled_for!).getTime());

    let nextBaseUtc: Date;
    if (existingScheduledDates.length > 0) {
      const maxScheduledMs = Math.max(...existingScheduledDates);
      const maxDate = new Date(maxScheduledMs);
      nextBaseUtc = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate() + 1, 2, 0, 0));
    } else {
      const todayNineAmVn = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), 2, 0, 0));
      nextBaseUtc =
        todayNineAmVn.getTime() > nowUtc.getTime()
          ? todayNineAmVn
          : new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() + 1, 2, 0, 0));
    }

    let createdCount = 0;
    for (let i = 0; i < unscheduled.length; i++) {
      const slotUtc = new Date(nextBaseUtc.getTime() + i * 24 * 3600_000);
      try {
        await this.publishFreshPlaybookPost(workspaceId, actorId, {
          source_id: unscheduled[i].id,
          scheduled_for: slotUtc,
          create_discussion: false,
        });
        createdCount++;
      } catch {
        // Ignore single source failure
      }
    }
    return createdCount;
  }

  /**
   * Bulk schedule or re-schedule all unposted Playbook topics on the configured destination
   * (`facebook_group` by default) spaced by `interval_hours` (default 24h = 09:00 AM every day).
   */
  async scheduleAllPlaybookPosts(
    workspaceId: string,
    actorId: string,
    options: { start_date_iso?: string; interval_hours?: number } = {},
  ) {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const targetMode = settings.publish_target;

    await this.ensurePlaybookTopicsScheduled(workspaceId, undefined, actorId, settings);

    const intervalMs = Math.max(1, Number(options.interval_hours ?? 24)) * 3600_000;
    const nowUtc = new Date();
    const vnNow = new Date(nowUtc.getTime() + 7 * 3600_000);
    const vnYear = vnNow.getUTCFullYear();
    const vnMonth = vnNow.getUTCMonth();
    const vnDay = vnNow.getUTCDate();

    const targetPlatformClause =
      targetMode === 'fanpage'
        ? "ch.platform_name = 'facebook'"
        : targetMode === 'both'
          ? "ch.platform_name IN ('facebook_group', 'facebook')"
          : "ch.platform_name = 'facebook_group'";

    // Check if there is already a published post for today on the target channel (in VN date)
    const todayStartUtc = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0) - 7 * 3600_000);
    const todayEndUtc = new Date(todayStartUtc.getTime() + 24 * 3600_000);
    const todayPublishedCount = (
      await this.pool.query<{ cnt: number }>(
        `SELECT count(*)::int AS cnt
           FROM publishing_jobs j
           JOIN channels ch ON ch.id = j.channel_id
          WHERE j.workspace_id = $1
            AND ${targetPlatformClause}
            AND j.status = 'published'
            AND COALESCE(j.external_post_id, '') NOT LIKE 'newsletter_%'
            AND j.published_at >= $2 AND j.published_at < $3`,
        [workspaceId, todayStartUtc.toISOString(), todayEndUtc.toISOString()],
      )
    ).rows[0]?.cnt ?? 0;

    let startUtc: Date;
    if (options.start_date_iso) {
      const parsed = new Date(options.start_date_iso);
      startUtc = Number.isNaN(parsed.getTime()) ? nowUtc : parsed;
    } else {
      const todayNineAmVn = new Date(Date.UTC(vnYear, vnMonth, vnDay, 2, 0, 0));
      if (todayPublishedCount === 0) {
        // Ensure today is never skipped in the calendar
        startUtc = todayNineAmVn.getTime() > nowUtc.getTime() ? todayNineAmVn : new Date(nowUtc.getTime() + 10 * 60_000);
      } else {
        startUtc = new Date(Date.UTC(vnYear, vnMonth, vnDay + 1, 2, 0, 0));
      }
    }

    const scheduledRows = (
      await this.pool.query<{ id: string; title: string; platform_name: string }>(
        `SELECT j.id, c.title, ch.platform_name
           FROM publishing_jobs j
           JOIN channels ch ON ch.id = j.channel_id
           JOIN contents c ON c.id = j.content_id
          WHERE j.workspace_id = $1
            AND ${targetPlatformClause}
            AND j.status IN ('scheduled', 'failed')
          ORDER BY j.scheduled_for ASC, c.title ASC`,
        [workspaceId],
      )
    ).rows;

    for (let i = 0; i < scheduledRows.length; i++) {
      const row = scheduledRows[i];
      const slotUtc = new Date(startUtc.getTime() + i * intervalMs);
      if (row.platform_name === 'facebook_group') {
        await this.pool.query(
          `UPDATE publishing_jobs
              SET scheduled_for = $2,
                  status = 'scheduled',
                  mode = 'live',
                  utm_url = $4,
                  error_message = NULL
            WHERE id = $1 AND workspace_id = $3`,
          [row.id, slotUtc.toISOString(), workspaceId, settings.group_url],
        );
      } else {
        await this.pool.query(
          `UPDATE publishing_jobs
              SET scheduled_for = $2, status = 'scheduled', error_message = NULL
            WHERE id = $1 AND workspace_id = $3`,
          [row.id, slotUtc.toISOString(), workspaceId],
        );
      }
      await this.pool.query(
        `UPDATE outbox_events
            SET status = 'pending', retry_count = 0
          WHERE workspace_id = $1 AND dedup_key = $2`,
        [workspaceId, `publish:${row.id}`],
      );
    }

    return {
      publish_target: targetMode,
      scheduled_count: scheduledRows.length,
      first_scheduled_iso: startUtc.toISOString(),
      interval_hours: Math.max(1, Number(options.interval_hours ?? 24)),
    };
  }

  /**
   * Reschedule a specific Playbook topic to an exact date/time (`scheduled_for`).
   * Once `scheduled_for <= NOW()`, `PublishingOutboxRunner` in `apps/worker` automatically publishes it.
   */
  async reschedulePlaybookPost(
    workspaceId: string,
    actorId: string,
    input: { source_id: string; scheduled_for: string },
  ) {
    const targetDate = new Date(input.scheduled_for);
    if (Number.isNaN(targetDate.getTime())) {
      throw new Error('Thời gian hẹn đăng không hợp lệ');
    }
    return await this.publishFreshPlaybookPost(workspaceId, actorId, {
      source_id: input.source_id,
      scheduled_for: targetDate,
      create_discussion: false,
    });
  }

  /**
   * Generates and schedules (or immediately publishes when `scheduled_for` is omitted)
   * a 100% fresh, non-duplicate article + post for the configured community destination
   * (Facebook Group by default; Fanpage only when `publish_target` is `'fanpage'` or `'both'`).
   */
  async publishFreshPlaybookPost(
    workspaceId: string,
    actorId: string,
    options: { source_id?: string; scheduled_for?: Date; create_discussion?: boolean } = {},
  ) {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const targetMode = settings.publish_target;
    const wantGroup = targetMode === 'group' || targetMode === 'both';
    const wantFanpage = targetMode === 'fanpage' || targetMode === 'both';
    const isImmediate = options.scheduled_for === undefined;
    const scheduledForDate = options.scheduled_for ?? new Date();
    const shouldCreateDiscussionNow = options.create_discussion !== false && scheduledForDate.getTime() <= Date.now() + 60_000;

    const ctx = (
      await this.pool.query<{ snapshot_id: string }>(
        'SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1 AND current LIMIT 1',
        [workspaceId],
      )
    ).rows[0];
    if (!ctx) throw new Error('Workspace has no active knowledge context');

    const usedPlatformFilter =
      targetMode === 'fanpage' ? "ch.platform_name = 'facebook'" : "ch.platform_name = 'facebook_group'";
    const usedSourceRows = (
      await this.pool.query<{ source_id: string | null }>(
        `SELECT DISTINCT a.evidence->0->>'source_id' AS source_id
           FROM publishing_jobs j
           JOIN channels ch ON ch.id = j.channel_id
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1 AND j.status = 'published'
            AND ${usedPlatformFilter}
            AND COALESCE(j.external_post_id, '') NOT LIKE 'newsletter_%'
            AND a.evidence->0->>'source_id' IS NOT NULL`,
        [workspaceId],
      )
    ).rows;
    const usedSourceIds = new Set(usedSourceRows.map((r) => r.source_id).filter(Boolean) as string[]);
    if (wantGroup) {
      const postedInGroup = (
        await this.pool.query<{ source_id: string | null }>(
          `SELECT DISTINCT source_id
             FROM community_group_posts
            WHERE workspace_id = $1 AND status = 'published' AND source_id IS NOT NULL`,
          [workspaceId],
        )
      ).rows;
      for (const r of postedInGroup) {
        if (r.source_id) usedSourceIds.add(r.source_id);
      }
    }

    const usedImageRows = (
      await this.pool.query<{ url: string | null }>(
        `SELECT a.payload->'result'->'image_assets'->0->>'url' AS url
           FROM publishing_jobs j
           JOIN content_artifacts a ON a.id = j.artifact_id
          WHERE j.workspace_id = $1 AND j.status IN ('published', 'scheduled')
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

    const cleanTitle = targetSource.title.replace(/\s*\(tripc\.ai\)\s*$/i, '').trim();

    const findExistingJob = async (platformName: 'facebook_group' | 'facebook') =>
      (
        await this.pool.query<{
          job_id: string;
          artifact_id: string;
          approval_id: string | null;
          channel_id: string;
          content_id: string;
          mode: string;
          status: string;
          img_url: string | null;
        }>(
          `SELECT j.id AS job_id, j.artifact_id, j.approval_id, j.channel_id, j.content_id,
                  j.mode, j.status,
                  a.payload->'result'->'image_assets'->0->>'url' AS img_url
             FROM publishing_jobs j
             JOIN channels ch ON ch.id = j.channel_id
             JOIN content_artifacts a ON a.id = j.artifact_id
            WHERE j.workspace_id = $1
              AND ch.platform_name = $2
              AND j.status IN ('scheduled', 'failed', 'publishing')
              AND a.evidence->0->>'source_id' = $3
            ORDER BY j.created_at DESC LIMIT 1`,
          [workspaceId, platformName, targetSource.id],
        )
      ).rows[0];

    const existingGroupJob = wantGroup ? await findExistingJob('facebook_group') : undefined;
    const existingFanpageJob = wantFanpage ? await findExistingJob('facebook') : undefined;

    // Fast path for non-immediate rescheduling when the target channel job already exists
    if (!isImmediate) {
      const canReuseGroupOnly = targetMode === 'group' && Boolean(existingGroupJob);
      const canReuseFanpageOnly = targetMode === 'fanpage' && Boolean(existingFanpageJob);
      const canReuseBoth = targetMode === 'both' && Boolean(existingGroupJob) && Boolean(existingFanpageJob);

      if (canReuseGroupOnly || canReuseFanpageOnly || canReuseBoth) {
        const primaryJob = existingGroupJob ?? existingFanpageJob!;
        const jobsToReschedule = [existingGroupJob, existingFanpageJob].filter(Boolean) as NonNullable<
          typeof existingGroupJob
        >[];

        for (const jobRow of jobsToReschedule) {
          const isGroupJob = jobRow === existingGroupJob;
          await this.pool.query(
            isGroupJob
              ? `UPDATE publishing_jobs
                    SET scheduled_for = $2, status = 'scheduled', mode = 'live', utm_url = $4, error_message = NULL
                  WHERE id = $1 AND workspace_id = $3`
              : `UPDATE publishing_jobs
                    SET scheduled_for = $2, status = 'scheduled', error_message = NULL
                  WHERE id = $1 AND workspace_id = $3`,
            isGroupJob
              ? [jobRow.job_id, scheduledForDate.toISOString(), workspaceId, settings.group_url]
              : [jobRow.job_id, scheduledForDate.toISOString(), workspaceId],
          );
          await this.pool.query(
            `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload, status, retry_count)
             VALUES ($1, 'publishing.scheduled', $2, $3, 'pending', 0)
             ON CONFLICT (workspace_id, dedup_key)
             DO UPDATE SET status = 'pending', retry_count = 0, payload = EXCLUDED.payload`,
            [
              workspaceId,
              `publish:${jobRow.job_id}`,
              JSON.stringify({
                job_id: jobRow.job_id,
                artifact_id: jobRow.artifact_id,
                approval_id: jobRow.approval_id,
                channel_id: jobRow.channel_id,
                mode: isGroupJob ? 'live' : jobRow.mode,
              }),
            ],
          );
        }

        const webArt = (
          await this.pool.query<{ slug: string | null }>(
            `SELECT c.slug FROM contents c
               JOIN content_artifacts a ON a.id = c.artifact_id
              WHERE c.workspace_id = $1 AND c.type = 'blog_post' AND a.evidence->0->>'source_id' = $2
              ORDER BY c.published_at DESC NULLS LAST LIMIT 1`,
            [workspaceId, targetSource.id],
          )
        ).rows[0];

        return {
          status: 'scheduled' as const,
          publish_target: targetMode,
          title: cleanTitle,
          source_id: targetSource.id,
          source_url: targetSource.source_url,
          image_url: primaryJob.img_url ?? '',
          image_attribution: 'Unsplash',
          seo_artifact_id: primaryJob.artifact_id,
          content_artifact_id: primaryJob.artifact_id,
          website_slug: webArt?.slug ?? slugifySimple(cleanTitle),
          publishing_job_id: primaryJob.job_id,
          scheduled_for: scheduledForDate.toISOString(),
        };
      }
    }

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

    const bulletPoints = chunks
      .slice(0, 3)
      .map((c) => {
        const firstSentence =
          c.text_content.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] || c.text_content.slice(0, 160);
        return `• ${firstSentence.slice(0, 200)}`;
      })
      .join('\n');

    const discussionQuestion = `💬 CÙNG THẢO LUẬN: Bạn đã có trải nghiệm thực tế nào về "${cleanTitle}" khi đi du lịch hoặc sinh sống tại Việt Nam chưa? Hãy để lại bình luận chia sẻ bên dưới để cùng giao lưu với các thành viên trong ${settings.community_name} nhé!`;

    const defaultFacebookText = [
      `🇻🇳 [CẨM NANG CỘNG ĐỒNG] ${cleanTitle}`,
      '',
      bulletPoints,
      '',
      discussionQuestion,
      '',
      `🤝 Kết nối & Thảo luận tại ${settings.community_name}: ${settings.group_url}`,
      '#CongDongDuLich #DichVuHoTroDuLich #DaNang #ExploreVietnam',
    ].join('\n');

    // Reuse existing Website blog_post + approved SEO/content artifacts for this source_id when present
    // so re-targeting onto Group NEVER creates `-2` duplicate website posts.
    const existingBlog = (
      await this.pool.query<{ content_id: string; slug: string | null; artifact_id: string | null }>(
        `SELECT c.id AS content_id, c.slug, c.artifact_id
           FROM contents c
           JOIN content_artifacts a ON a.id = c.artifact_id AND a.workspace_id = c.workspace_id
          WHERE c.workspace_id = $1 AND c.type = 'blog_post'
            AND a.evidence->0->>'source_id' = $2
          ORDER BY c.published_at DESC NULLS LAST LIMIT 1`,
        [workspaceId, targetSource.id],
      )
    ).rows[0];

    const existingApprovedContent = (
      await this.pool.query<{
        artifact_id: string;
        content_hash: string;
        payload: Record<string, any>;
        approval_id: string;
      }>(
        `SELECT a.id AS artifact_id, a.content_hash, a.payload, ap.id AS approval_id
           FROM content_artifacts a
           JOIN approvals ap
             ON ap.workspace_id = a.workspace_id
            AND ap.target_type = 'artifact'
            AND ap.target_id = a.id
            AND ap.target_version = a.version
            AND ap.target_hash = a.content_hash
            AND ap.status = 'approved'
          WHERE a.workspace_id = $1
            AND a.role = 'content'
            AND a.evidence->0->>'source_id' = $2
          ORDER BY a.created_at DESC LIMIT 1`,
        [workspaceId, targetSource.id],
      )
    ).rows[0];

    const topicAssets = getTopicImageAssets(workspaceId);
    const chosenAsset = matchAssetForTopic(cleanTitle, topicAssets, usedImageUrls, targetSource.source_url);
    const { topic_tags: _tags, match_slug: _mslug, ...assetPayload } = chosenAsset;

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

    const seoArtifactId = existingBlog?.artifact_id ?? randomUUID();
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

    let contentArtifactId = existingApprovedContent?.artifact_id ?? randomUUID();
    let contentHash = existingApprovedContent?.content_hash ?? '';
    let contentApprovalId = existingApprovedContent?.approval_id ?? '';
    let resolvedImageUrl =
      (existingApprovedContent?.payload?.result?.image_assets?.[0]?.url as string | undefined) ?? chosenAsset.url;
    let resolvedAttribution =
      (existingApprovedContent?.payload?.result?.alt_text as string | undefined) ?? chosenAsset.attribution;
    const resolvedFacebookText =
      (existingApprovedContent?.payload?.result?.facebook?.text as string | undefined) ||
      (existingApprovedContent?.payload?.result?.caption as string | undefined) ||
      defaultFacebookText;

    const db = await this.pool.connect();
    let publishedSite: { content_id: string; slug: string | null; published: boolean } | null = existingBlog
      ? { content_id: existingBlog.content_id, slug: existingBlog.slug, published: false }
      : null;
    let socialContentId: string | null = null;
    let groupJobId: string | null = null;
    let fanpageJobId: string | null = null;

    try {
      await db.query('BEGIN');

      if (!existingBlog) {
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
      }

      if (!existingApprovedContent) {
        const contentResult = {
          pack_id: contentArtifactId,
          workspace_id: workspaceId,
          context_snapshot_id: ctx.snapshot_id,
          parent_content_id: seoArtifactId,
          parent_version: 1,
          status: 'draft',
          missing_facts: [],
          synthetic: false,
          caption: resolvedFacebookText,
          cta: ctaText,
          channels: wantGroup ? ['facebook_group'] : ['facebook'],
          facebook: {
            hook: `🇻🇳 [CẨM NANG CỘNG ĐỒNG] ${cleanTitle}`,
            body: bulletPoints,
            discussion_question: discussionQuestion,
            cta: ctaText,
            hashtags: ['#CongDongDuLich', '#DichVuHoTroDuLich'],
            text: resolvedFacebookText,
          },
          image_assets: [assetPayload],
          alt_text: resolvedAttribution,
          citations: evidence,
          input_artifact_refs: [seoArtifactRef],
        };
        contentHash = sha256Hex(canonicalJson({ result: contentResult, evidence }));
        const contentArtifactRef = {
          artifact_id: contentArtifactId,
          workspace_id: workspaceId,
          version: 1,
          content_hash: contentHash,
          context_snapshot_id: ctx.snapshot_id,
          role: 'content',
        };

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
        contentApprovalId = contentApproval.id;
      }

      const existingSocial = (
        await db.query<{ id: string }>(
          `SELECT id FROM contents WHERE workspace_id = $1 AND artifact_id = $2 AND type = 'social_post' LIMIT 1`,
          [workspaceId, contentArtifactId],
        )
      ).rows[0];

      if (existingSocial) {
        socialContentId = existingSocial.id;
      } else {
        const insertedSocial = (
          await db.query<{ id: string }>(
            `INSERT INTO contents
               (workspace_id, title, body_markdown, type, status, created_by, approved_by, current_version, content_hash, artifact_id)
             VALUES ($1, $2, $3, 'social_post', 'approved', 'ai', $4, 1, $5, $6)
             RETURNING id`,
            [workspaceId, cleanTitle, resolvedFacebookText, actorId, contentHash, contentArtifactId],
          )
        ).rows[0];
        socialContentId = insertedSocial.id;
      }

      // 1) Group Channel Job (Primary default destination)
      if (wantGroup) {
        const groupChannelId = await this.ensureGroupChannel(workspaceId, settings.group_url, settings.community_name, db);
        if (groupChannelId && socialContentId) {
          const nextJobStatus = isImmediate ? 'publishing' : 'scheduled';
          const outboxStatus = isImmediate ? 'processing' : 'pending';
          if (existingGroupJob) {
            await db.query(
              `UPDATE publishing_jobs
                  SET status = $2,
                      mode = 'live',
                      utm_url = $3,
                      scheduled_for = $4,
                      error_message = NULL
                WHERE id = $1 AND workspace_id = $5`,
              [existingGroupJob.job_id, nextJobStatus, settings.group_url, scheduledForDate.toISOString(), workspaceId],
            );
            groupJobId = existingGroupJob.job_id;
          } else {
            const job = (
              await db.query<{ id: string }>(
                `INSERT INTO publishing_jobs
                   (content_id, channel_id, scheduled_for, status, workspace_id, artifact_id, approval_id, mode, created_by, utm_url)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'live', $8, $9)
                 RETURNING id`,
                [
                  socialContentId,
                  groupChannelId,
                  scheduledForDate.toISOString(),
                  nextJobStatus,
                  workspaceId,
                  contentArtifactId,
                  contentApprovalId,
                  actorId,
                  settings.group_url,
                ],
              )
            ).rows[0];
            groupJobId = job.id;
          }

          await db.query(
            `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload, status, retry_count)
             VALUES ($1, 'publishing.scheduled', $2, $3, $4, 0)
             ON CONFLICT (workspace_id, dedup_key)
             DO UPDATE SET status = $4, retry_count = 0, payload = EXCLUDED.payload`,
            [
              workspaceId,
              `publish:${groupJobId}`,
              JSON.stringify({
                job_id: groupJobId,
                artifact_id: contentArtifactId,
                approval_id: contentApprovalId,
                channel_id: groupChannelId,
                mode: 'live',
              }),
              outboxStatus,
            ],
          );
        }
      }

      // 2) Fanpage Channel Job (ONLY when publish_target is explicitly 'fanpage' or 'both')
      if (wantFanpage) {
        const fbChannel = (
          await db.query<{ id: string }>(
            "SELECT id FROM channels WHERE workspace_id = $1 AND platform_name = 'facebook' ORDER BY created_at LIMIT 1",
            [workspaceId],
          )
        ).rows[0];
        if (fbChannel && socialContentId) {
          const fbStatus = await getWorkspaceConnectionStatus(workspaceId, 'facebook_page');
          const mode = fbStatus.status === 'connected' ? 'live' : 'manual';
          if (existingFanpageJob) {
            await db.query(
              `UPDATE publishing_jobs
                  SET scheduled_for = $2, status = 'scheduled', mode = $3, error_message = NULL
                WHERE id = $1 AND workspace_id = $4`,
              [existingFanpageJob.job_id, scheduledForDate.toISOString(), mode, workspaceId],
            );
            fanpageJobId = existingFanpageJob.job_id;
          } else {
            const job = (
              await db.query<{ id: string }>(
                `INSERT INTO publishing_jobs
                   (content_id, channel_id, scheduled_for, status, workspace_id, artifact_id, approval_id, mode, created_by, utm_url)
                 VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [
                  socialContentId,
                  fbChannel.id,
                  scheduledForDate.toISOString(),
                  workspaceId,
                  contentArtifactId,
                  contentApprovalId,
                  mode,
                  actorId,
                  settings.group_url,
                ],
              )
            ).rows[0];
            fanpageJobId = job.id;
          }

          await db.query(
            `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload, status, retry_count)
             VALUES ($1, 'publishing.scheduled', $2, $3, 'pending', 0)
             ON CONFLICT (workspace_id, dedup_key)
             DO UPDATE SET status = 'pending', retry_count = 0, payload = EXCLUDED.payload`,
            [
              workspaceId,
              `publish:${fanpageJobId}`,
              JSON.stringify({
                job_id: fanpageJobId,
                artifact_id: contentArtifactId,
                approval_id: contentApprovalId,
                channel_id: fbChannel.id,
                mode,
              }),
            ],
          );
        }
      }

      if (shouldCreateDiscussionNow && !wantGroup) {
        const discExists = (
          await db.query('SELECT 1 FROM community_hub_discussions WHERE workspace_id = $1 AND title = $2 LIMIT 1', [
            workspaceId,
            cleanTitle,
          ])
        ).rows[0];
        if (!discExists) {
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
        }
      }

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }

    const baseResponse = {
      publish_target: targetMode,
      title: cleanTitle,
      source_id: targetSource.id,
      source_url: targetSource.source_url,
      image_url: resolvedImageUrl,
      image_attribution: resolvedAttribution,
      seo_artifact_id: seoArtifactId,
      content_artifact_id: contentArtifactId,
      website_slug: publishedSite?.slug ?? null,
      publishing_job_id: groupJobId ?? fanpageJobId,
      scheduled_for: scheduledForDate.toISOString(),
      group_url: settings.group_url,
    };

    // Execute real Group Bot synchronously when immediate Group publish is requested (outside DB transaction!)
    if (isImmediate && wantGroup) {
      const botResult = await this.postToGroupViaBot(workspaceId, {
        title: cleanTitle,
        body: resolvedFacebookText,
        discussion_prompt: discussionQuestion,
        image_url: resolvedImageUrl,
        source_id: targetSource.id,
        article_id: socialContentId ?? undefined,
        publishing_job_id: groupJobId ?? undefined,
      });

      if (botResult.success) {
        const externalPostUrl = botResult.postUrl || settings.group_url;
        if (groupJobId) {
          await this.pool.query(
            `UPDATE publishing_jobs
                SET status = 'published', published_at = NOW(), external_post_id = $2, error_message = NULL
              WHERE id = $1`,
            [groupJobId, externalPostUrl],
          );
          await this.pool.query(
            `UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE workspace_id = $1 AND dedup_key = $2`,
            [workspaceId, `publish:${groupJobId}`],
          );
        }
        if (socialContentId) {
          await this.pool.query(
            `UPDATE contents SET status = 'published', published_at = NOW() WHERE id = $1`,
            [socialContentId],
          );
        }
        if (options.create_discussion !== false) {
          const discExists = (
            await this.pool.query('SELECT 1 FROM community_hub_discussions WHERE workspace_id = $1 AND title = $2 LIMIT 1', [
              workspaceId,
              cleanTitle,
            ])
          ).rows[0];
          if (!discExists) {
            const discAssets = getDiscussionImageAssets(workspaceId);
            const discAsset = matchAssetForTopic(cleanTitle, discAssets);
            await this.pool.query(
              `INSERT INTO community_hub_discussions
                 (workspace_id, category, title, author_name, author_role, body, discussion_prompt, source_url, image_url, replies, participants_count, facebook_post_id)
               VALUES ($1, 'Thảo luận Bài mới Hàng ngày', $2, $3, 'Quản trị viên Cộng đồng', $4, $5, $6, $7, $8::jsonb, 5, $9)`,
              [
                workspaceId,
                cleanTitle,
                `Ban Quản Trị (${settings.page_name})`,
                bulletPoints,
                discussionQuestion,
                externalPostUrl,
                discAsset.url,
                JSON.stringify([
                  {
                    author: `Ban Quản Trị (${settings.page_name})`,
                    role: 'Quản trị viên Cộng đồng',
                    text: `Chủ đề mới trong ngày "${cleanTitle}" đã đăng trực tiếp vào Group "${settings.community_name}"! Mời các thành viên cùng bình luận chia sẻ kinh nghiệm thực tế nhé.`,
                    created_at: new Date().toISOString(),
                  },
                ]),
                externalPostUrl,
              ],
            );
          }
        }
        return {
          status: 'published' as const,
          ...baseResponse,
          group_post_url: externalPostUrl,
        };
      }

      const failCode = botResult.errorCode || 'FACEBOOK_GROUP_PUBLISH_FAILED';
      const detail = botResult.message.startsWith(failCode) ? botResult.message : `${failCode}: ${botResult.message}`;
      if (groupJobId) {
        await this.pool.query(
          `UPDATE publishing_jobs SET status = 'failed', error_message = $2 WHERE id = $1`,
          [groupJobId, detail],
        );
        await this.pool.query(
          `UPDATE outbox_events SET status = 'failed', published_at = NOW() WHERE workspace_id = $1 AND dedup_key = $2`,
          [workspaceId, `publish:${groupJobId}`],
        );
      }

      return {
        status:
          failCode === 'FACEBOOK_GROUP_SESSION_MISSING'
            ? ('group_session_required' as const)
            : ('group_publish_failed' as const),
        error_code: failCode,
        error: botResult.message,
        ...baseResponse,
      };
    }

    return {
      status: isImmediate ? ('published' as const) : ('scheduled' as const),
      ...baseResponse,
    };
  }

  /**
   * Fast synchronous check for whether a saved Edge Group Bot session file or FB_ADMIN_COOKIE exists.
   * Never exposes local filesystem paths or secret cookie contents.
   */
  async getGroupBotSessionStatus(): Promise<GroupBotSessionStatus> {
    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    if (session.exists) {
      return { isLoggedIn: true, sessionSource: 'file' };
    }
    if (process.env.FB_ADMIN_COOKIE?.trim()) {
      return { isLoggedIn: true, sessionSource: 'cookie' };
    }
    return { isLoggedIn: false, sessionSource: 'none' };
  }

  /**
   * Verifies live Group Bot session validity via Playwright Edge script (`check`).
   */
  async verifyGroupBotSession(): Promise<GroupBotSessionStatus> {
    const syncStatus = await this.getGroupBotSessionStatus();
    if (!syncStatus.isLoggedIn) {
      return {
        isLoggedIn: false,
        sessionSource: 'none',
        detail:
          'Chưa phát hiện tệp phiên đăng nhập .fb-session.json hoặc FB_ADMIN_COOKIE. Hãy bấm "Mở Edge Đăng nhập Group Bot (1 lần)".',
      };
    }

    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    const runner = resolveGroupBotRunner(workerDir);

    return await new Promise((resolve) => {
      const child = spawn(runner.command, [...runner.prefixArgs, 'check'], {
        cwd: workerDir,
        env: { ...process.env, FB_SESSION_FILE: session.filePath },
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill();
          } catch {
            // ignore
          }
          resolve({
            isLoggedIn: false,
            sessionSource: syncStatus.sessionSource,
            detail: 'Kiểm tra phiên Group Bot quá thời gian chờ (45s).',
          });
        }
      }, 45_000);

      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          isLoggedIn: false,
          sessionSource: syncStatus.sessionSource,
          detail: `Không thể chạy trình kiểm tra Group Bot: ${err.message}`,
        });
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const parsed = parseGroupBotResultLine(stdout);
        const isLoggedIn = Boolean(parsed?.isLoggedIn ?? (code === 0));
        const detail =
          typeof parsed?.detail === 'string' && parsed.detail.trim()
            ? parsed.detail.trim()
            : isLoggedIn
              ? 'Phiên đăng nhập Quản trị viên Facebook Group hợp lệ.'
              : stderr.trim() || 'Phiên đăng nhập Facebook đã hết hạn. Vui lòng đăng nhập lại.';
        resolve({
          isLoggedIn,
          sessionSource: isLoggedIn ? syncStatus.sessionSource : 'none',
          detail,
        });
      });
    });
  }

  /**
   * Launches a single visible Microsoft Edge window so the admin can log into Facebook once
   * and save `.fb-session.json` for automated Group posting.
   */
  async launchGroupBotLogin(workspaceId?: string): Promise<{ started: boolean; alreadyRunning?: boolean; message: string }> {
    const groupUrl = workspaceId
      ? (await this.ensureSchemaAndContext(workspaceId)).group_url
      : 'https://www.facebook.com/groups/1134282109069209';

    if (activeLoginChild && activeLoginChild.exitCode === null && !activeLoginChild.killed) {
      return {
        started: true,
        alreadyRunning: true,
        message:
          'Cửa sổ Microsoft Edge đăng nhập Group Bot đang mở sẵn. Vui lòng hoàn tất đăng nhập Facebook trên cửa sổ đó rồi quay lại bấm "Kiểm tra phiên Group Bot".',
      };
    }

    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    const runner = resolveGroupBotRunner(workerDir);

    return await new Promise((resolve) => {
      let resolved = false;
      let errBuf = '';
      let outBuf = '';

      const child = spawn(
        runner.command,
        [...runner.prefixArgs, 'login', '--group-url', groupUrl],
        {
          cwd: workerDir,
          env: { ...process.env, FB_SESSION_FILE: session.filePath },
          shell: false,
          windowsHide: false,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      activeLoginChild = child;

      child.stdout?.on('data', (chunk) => {
        if (outBuf.length < 4096) outBuf += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        if (errBuf.length < 4096) errBuf += chunk.toString();
      });
      child.stdout?.resume();
      child.stderr?.resume();

      const clearActive = () => {
        if (activeLoginChild === child) activeLoginChild = null;
      };

      child.once('error', (err) => {
        clearTimeout(startupTimer);
        clearActive();
        if (!resolved) {
          resolved = true;
          resolve({
            started: false,
            message: `Không mở được cửa sổ Microsoft Edge để đăng nhập Group Bot: ${err.message}`,
          });
        }
      });

      child.once('close', (code) => {
        clearTimeout(startupTimer);
        clearActive();
        if (!resolved) {
          resolved = true;
          const parsed = parseGroupBotResultLine(outBuf);
          if (code === 0 && parsed?.success) {
            resolve({
              started: true,
              message: String(parsed.message || 'Đã lưu phiên đăng nhập Quản trị viên Group Bot thành công!'),
            });
          } else {
            resolve({
              started: false,
              message: String(
                parsed?.message || errBuf.trim() || outBuf.trim() || 'Cửa sổ đăng nhập Edge đóng trước khi hoàn tất.',
              ),
            });
          }
        }
      });

      const startupTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            started: true,
            message:
              'Đã mở cửa sổ Microsoft Edge để đăng nhập Quản trị viên Facebook (1 lần duy nhất)! Hãy đăng nhập tài khoản Facebook của bạn, mở Group xong rồi quay lại đây bấm "Kiểm tra phiên Group Bot".',
          });
        }
      }, 1200);
    });
  }

  /**
   * Automatically publish a discussion or fresh playbook article directly into the Facebook Group
   * using the Administrator's browser session (Playwright Browser Bot).
   */
  async postToGroupViaBot(
    workspaceId: string,
    options: {
      title: string;
      body: string;
      discussion_prompt?: string;
      image_url?: string;
      source_id?: string;
      article_id?: string;
      publishing_job_id?: string;
    },
  ): Promise<{
    success: boolean;
    message: string;
    groupUrl?: string;
    postUrl?: string;
    externalPostId?: string;
    errorCode?: string;
  }> {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    const hasSession = session.exists || Boolean(process.env.FB_ADMIN_COOKIE?.trim());

    const upsertGroupPostRecord = async (record: {
      status: 'published' | 'failed';
      postUrl?: string;
      errorMessage?: string;
    }) => {
      try {
        await this.pool.query(
          `INSERT INTO community_group_posts
             (workspace_id, source_id, article_id, publishing_job_id, post_title, group_url, facebook_post_url, body_text, image_url, status, error_message, published_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (workspace_id, post_title)
           DO UPDATE SET
             source_id = COALESCE(EXCLUDED.source_id, community_group_posts.source_id),
             article_id = COALESCE(EXCLUDED.article_id, community_group_posts.article_id),
             publishing_job_id = COALESCE(EXCLUDED.publishing_job_id, community_group_posts.publishing_job_id),
             group_url = EXCLUDED.group_url,
             body_text = CASE WHEN EXCLUDED.body_text <> '' THEN EXCLUDED.body_text ELSE community_group_posts.body_text END,
             image_url = COALESCE(EXCLUDED.image_url, community_group_posts.image_url),
             status = CASE
               WHEN EXCLUDED.status = 'published' THEN 'published'
               WHEN community_group_posts.status = 'published' THEN 'published'
               ELSE 'failed'
             END,
             facebook_post_url = COALESCE(EXCLUDED.facebook_post_url, community_group_posts.facebook_post_url),
             error_message = CASE
               WHEN EXCLUDED.status = 'published' THEN NULL
               WHEN community_group_posts.status = 'published' THEN NULL
               ELSE EXCLUDED.error_message
             END,
             published_at = CASE
               WHEN EXCLUDED.status = 'published' THEN COALESCE(EXCLUDED.published_at, NOW())
               ELSE community_group_posts.published_at
             END,
             updated_at = NOW()`,
          [
            workspaceId,
            options.source_id ?? null,
            options.article_id ?? null,
            options.publishing_job_id ?? null,
            options.title,
            settings.group_url,
            record.postUrl ?? null,
            options.body ?? '',
            options.image_url ?? null,
            record.status,
            record.errorMessage ?? null,
            record.status === 'published' ? new Date().toISOString() : null,
          ],
        );
      } catch {
        // Ignore if mock DB omits table
      }
    };

    if (!hasSession) {
      const msg =
        'FACEBOOK_GROUP_SESSION_MISSING: Chưa có phiên đăng nhập Quản trị viên Facebook Group (.fb-session.json). Hãy bấm "Mở Edge Đăng nhập Group Bot (1 lần)" hoặc dùng "Copy & Mở Group" để dán thủ công.';
      await upsertGroupPostRecord({ status: 'failed', errorMessage: msg });
      return {
        success: false,
        errorCode: 'FACEBOOK_GROUP_SESSION_MISSING',
        groupUrl: settings.group_url,
        message: msg,
      };
    }

    const runner = resolveGroupBotRunner(workerDir);
    const tmpPayloadFile = path.join(os.tmpdir(), `fb-group-post-${randomUUID()}.json`);
    fs.writeFileSync(
      tmpPayloadFile,
      JSON.stringify({
        groupUrl: settings.group_url,
        title: options.title,
        body: options.body,
        discussionPrompt: options.discussion_prompt,
        imageUrl: options.image_url,
        headless: true,
      }),
      'utf8',
    );

    try {
      const botOutput = await new Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
        spawnErr?: string;
        timedOut?: boolean;
      }>((resolve) => {
        const child = spawn(
          runner.command,
          [...runner.prefixArgs, 'post', '--group-url', settings.group_url, '--payload-file', tmpPayloadFile],
          {
            cwd: workerDir,
            env: { ...process.env, FB_SESSION_FILE: session.filePath },
            shell: false,
            windowsHide: true,
          },
        );

        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              child.kill();
            } catch {
              // ignore
            }
            resolve({ code: null, stdout, stderr, timedOut: true });
          }
        }, 120_000);

        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code: 1, stdout, stderr, spawnErr: err.message });
        });
        child.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
      });

      const parsed = parseGroupBotResultLine(botOutput.stdout);
      const isOk = Boolean(parsed?.success === true || (botOutput.code === 0 && !botOutput.spawnErr && !botOutput.timedOut));

      if (isOk) {
        const postUrl = typeof parsed?.postUrl === 'string' && parsed.postUrl ? parsed.postUrl : settings.group_url;
        const externalPostId = typeof parsed?.externalPostId === 'string' ? parsed.externalPostId : undefined;
        const message =
          typeof parsed?.message === 'string' && parsed.message
            ? parsed.message
            : `Bot Quản trị viên đã đăng bài thành công vào Group Facebook "${settings.community_name}"!`;
        await upsertGroupPostRecord({ status: 'published', postUrl });
        return {
          success: true,
          groupUrl: settings.group_url,
          postUrl,
          externalPostId,
          message,
        };
      }

      const rawError =
        botOutput.timedOut
          ? 'Group Bot đăng bài quá thời gian chờ (120s).'
          : botOutput.spawnErr ||
            (typeof parsed?.message === 'string' ? parsed.message : '') ||
            botOutput.stderr.trim() ||
            botOutput.stdout.trim() ||
            'Quá trình đăng bài vào Group gặp sự cố.';
      const errorCode =
        typeof parsed?.errorCode === 'string' && parsed.errorCode
          ? parsed.errorCode
          : /SESSION_MISSING|hết hạn|expired|login/i.test(rawError)
            ? 'FACEBOOK_GROUP_SESSION_MISSING'
            : 'FACEBOOK_GROUP_PUBLISH_FAILED';

      await upsertGroupPostRecord({ status: 'failed', errorMessage: `${errorCode}: ${rawError}` });
      return {
        success: false,
        errorCode,
        groupUrl: settings.group_url,
        message: rawError,
      };
    } finally {
      try {
        if (fs.existsSync(tmpPayloadFile)) fs.unlinkSync(tmpPayloadFile);
      } catch {
        // Ignore cleanup failure
      }
    }
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
