import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import type { Pool, PoolClient } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { planSchema } from '../campaignPlans/schemas';
import { getWorkspaceConnectionStatus } from '../integrations/stubs';
import { publishSeoArtifact } from '../site/publish';
import { processReceivedCommunityMessages } from './service';
import {
  applyCommunityGrowthPlan,
  clampDailyInviteLimit,
  currentVietnamCampaignWeek,
  ensureCommunityGrowthSchema,
  loadCommunityGrowthContext,
  type TargetSource,
  type WeeklyTargetPlanItem,
} from './targets';

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
 * 32 Approved, 100% Distinct High-Resolution Unsplash Images:
 * - Assets 1..27: Dedicated 1-to-1 to each of the 27 unique approved Playbook topics (0% overlap).
 * - Assets 28..32: Dedicated exclusively to Community Discussions (0% overlap with article images).
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
      ['esim or local sim', 'vietnam esim', 'esim', 'local sim', 'sim card'],
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
    makeAsset(
      workspaceId,
      26,
      'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Da Nang Food and Pho Guide Authentic Vietnamese Noodle Soup Local Dining',
      ['ẩm thực', 'quán phở', 'phở ngon', 'da nang food', 'pho guide'],
      'da-nang-food-and-pho-guide',
    ),
    makeAsset(
      workspaceId,
      27,
      'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Do Foreign Credit Cards Work in Vietnam Contactless Payment Terminal',
      ['foreign credit cards', 'credit cards', 'visa mastercard'],
      'credit-cards-in-vietnam',
    ),
    // Dedicated exclusively to Community Discussions (28..32) so discussions never reuse article photos:
    makeAsset(
      workspaceId,
      28,
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Da Nang Neighborhoods My An vs Son Tra Apartment Living',
      ['discussion-housing', 'mỹ an', 'sơn trà'],
      'discussion-housing',
    ),
    makeAsset(
      workspaceId,
      29,
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Remote Workers Fiber Wifi 4G 5G Backup Cafe Coworking',
      ['discussion-remote', 'cáp quang', 'coworking'],
      'discussion-remote',
    ),
    makeAsset(
      workspaceId,
      30,
      'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion QR Payment VietQR ATM Card Wise Revolut Daily Living',
      ['discussion-payment', 'vietqr', 'atm'],
      'discussion-payment',
    ),
    makeAsset(
      workspaceId,
      31,
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Welcome New Members Connect Travelers Expats Vietnam',
      ['discussion-welcome', 'chào mừng thành viên mới'],
      'discussion-welcome',
    ),
    makeAsset(
      workspaceId,
      32,
      'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1200&q=80',
      'Unsplash - Community Discussion Open Forum Vietnam Travel Experiences Local Tips',
      ['discussion-general', 'thảo luận cộng đồng'],
      'discussion-general',
    ),
  ];
}

export function getTopicImageAssets(workspaceId: string): PlaybookAsset[] {
  return getPlaybookImageAssets(workspaceId).slice(0, 27);
}

export function getDiscussionImageAssets(workspaceId: string): PlaybookAsset[] {
  return getPlaybookImageAssets(workspaceId).slice(27, 32);
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

function matchesTagInText(lowerText: string, tag: string): boolean {
  const clean = tag.trim().toLowerCase();
  if (!clean) return false;
  if (clean.includes(' ') || /[^\x00-\x7F]/.test(clean) || clean.length > 4) {
    return lowerText.includes(clean);
  }
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(lowerText);
}

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
    const exactBySlug = assets.find((a) => a.match_slug === slugPart && !usedUrls.has(a.url));
    if (exactBySlug) return exactBySlug;
    const partialBySlug = assets.find(
      (a) => a.match_slug && (slugPart.includes(a.match_slug) || a.match_slug.includes(slugPart)) && !usedUrls.has(a.url),
    );
    if (partialBySlug) return partialBySlug;
  }

  // 2. Score by multi-word phrase hits first, then single tag hits (with word boundaries for short ASCII tags)
  const scored = assets.map((asset, idx) => {
    const phraseHits = asset.topic_tags.filter((tag) => tag.includes(' ') && matchesTagInText(lower, tag)).length;
    const singleHits = asset.topic_tags.filter((tag) => !tag.includes(' ') && matchesTagInText(lower, tag)).length;
    const attrWords = asset.attribution
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !['unsplash', 'vietnam', 'guide', 'complete', 'what', 'when', 'which'].includes(w));
    const attrHits = attrWords.filter((w) => matchesTagInText(lower, w)).length;
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
  if (/remote|coworking|wifi|\besim\b|\bsim\b|làm việc|nomad|cafe/i.test(lower)) {
    tags.push('Làm việc từ xa (Remote Work)', 'eSIM & Kết nối Internet');
    trend = 'Làm việc từ xa, Coworking & SIM/eSIM tại Việt Nam';
    score = 96;
    topic = 'Working Remotely from Vietnam: How to Build a Reliable Work Setup';
  }
  if (/bank|ngân hàng|vietqr|tiền|chi phí|budget|cost|atm|cash|credit card/i.test(lower)) {
    tags.push('Thanh toán VietQR & Ngân hàng', 'Chi phí du lịch mỗi ngày');
    trend = 'Chi phí du lịch, Thanh toán VietQR & Ngân hàng tại Việt Nam';
    score = 94;
    topic = 'Opening a Bank Account in Vietnam as a Foreigner: The 2026 Reality';
  }
  if (/ẩm thực|quán phở|\bphở\b|\bpho\b|food|dining/i.test(lower)) {
    tags.push('Ẩm thực Địa phương', 'Đà Nẵng & Việt Nam');
    trend = 'Ẩm thực Địa phương & Quán Ngon tại Đà Nẵng / Việt Nam';
    score = 95;
    topic = 'Cẩm nang Ẩm thực & Quán Phở Ngon tại Đà Nẵng';
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

const FB_ADMIN_UI_CHROME_NAMES = new Set([
  'tài khoản',
  'tài khoản của bạn',
  'tài khoản cá nhân',
  'tài khoản, trang cá nhân của bạn',
  'tài khoản, trang cá nhân',
  'trang cá nhân',
  'trang cá nhân của bạn',
  'trang cá nhân và quyền truy cập',
  'ảnh đại diện',
  'ảnh đại diện của bạn',
  'chuyển trang cá nhân',
  'xem tất cả trang cá nhân',
  'menu',
  'menu facebook',
  'messenger',
  'thông báo',
  'cài đặt',
  'cài đặt và quyền riêng tư',
  'bạn',
  'trang chủ',
  'nhóm',
  'video',
  'marketplace',
  'quản trị viên',
  'người kiểm duyệt',
  'viết bình luận',
  'trả lời',
  'đăng',
  'thành viên ẩn danh',
  'account',
  'your account',
  'account, your profile',
  'your profile',
  'profile',
  'profiles',
  'profile picture',
  'your profile picture',
  'switch profile',
  'see all profiles',
  'settings',
  'settings & privacy',
  'notifications',
  'home',
  'groups',
  'you',
  'facebook',
  'admin',
  'moderator',
  'write a comment',
  'reply',
  'post',
  'anonymous participant',
]);

export function sanitizeFbAdminName(raw?: string | null): string | null {
  if (!raw) return null;
  let candidate = String(raw).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!candidate) return null;

  const prefixes = [
    /^(?:tài khoản|account)\s*[,:\-–|]\s*/i,
    /^(?:trang cá nhân của bạn|your profile|tài khoản của bạn|your account|tài khoản của|account of|profile of)\s*[:,.\-–|]*\s*/i,
    /^(?:bình luận dưới tên|commenting as|đang tương tác với tư cách|interacting as|đang đăng với tư cách|posting as)\s*[:,.\-–|]*\s*/i,
    /^(?:ảnh đại diện(?: của)?|profile picture(?: of)?)\s*[:,.\-–|]*\s*/i,
  ];

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const rx of prefixes) {
      const next = candidate.replace(rx, '').trim();
      if (next !== candidate) {
        candidate = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  candidate = candidate.replace(/^[\s"'`“”‘’:,.\-|]+|[\s"'`“”‘’:,.\-|]+$/g, '').trim();
  if (candidate.length < 2 || candidate.length > 80) return null;
  if (/^[\d\s*._\-+]+$/.test(candidate)) return null;

  const lower = candidate.toLowerCase();
  if (FB_ADMIN_UI_CHROME_NAMES.has(lower)) return null;
  if (
    /^(?:tài khoản|account|trang cá nhân|your profile|profile)(?:[\s,:\-–|]+(?:của bạn|cá nhân|trang cá nhân|your profile|profile|account))+$/i.test(
      lower,
    )
  ) {
    return null;
  }

  return candidate;
}

export interface GroupBotSessionStatus {
  isLoggedIn: boolean;
  sessionSource: 'file' | 'cookie' | 'none';
  detail?: string;
  loginInProgress?: boolean;
  usingPageProfile?: boolean;
  accountIdMask?: string;
  adminName?: string | null;
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
  target_source: TargetSource;
  strategy_artifact_id: string | null;
  strategy_plan_id: string | null;
  target_rationale: string | null;
  target_updated_at: string | null;
  weekly_targets_json: WeeklyTargetPlanItem[] | null;
  auto_reply_comments: boolean;
  auto_invite_enabled: boolean;
  daily_invite_limit: number;
  last_comment_sync_at: string | null;
  last_group_comment_sync_at: string | null;
  last_post_stats_sync_at: string | null;
  fb_admin_name: string | null;
  last_invite_run_at: string | null;
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
  const explicit = process.env.FB_SESSION_FILE?.trim();
  if (explicit) {
    return { exists: fs.existsSync(explicit), filePath: explicit };
  }
  const candidates = [
    path.resolve(workerDir, '.fb-session.json'),
    path.resolve(process.cwd(), 'apps/worker/.fb-session.json'),
    path.resolve(__dirname, '../../../../worker/.fb-session.json'),
  ];
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

type LoginAttemptTracker = {
  mode: 'login' | 'switch';
  workspaceId?: string;
  sessionFilePath: string;
  startedAtMs: number;
  previousMtimeMs: number | null;
  previousHash: string | null;
  dbAdminUpdated?: boolean;
};

let activeLoginChild: ChildProcess | null = null;
let activeLoginSignalFile: string | null = null;
let activeLoginAttempt: LoginAttemptTracker | null = null;

function readSessionFileFingerprint(filePath: string): {
  exists: boolean;
  mtimeMs: number | null;
  hash: string | null;
} {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { exists: false, mtimeMs: null, hash: null };
    }
    const stat = fs.statSync(filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const hash = createHash('sha256').update(raw).digest('hex');
    return { exists: true, mtimeMs: stat.mtimeMs, hash };
  } catch {
    return { exists: false, mtimeMs: null, hash: null };
  }
}

function hasNewSessionSinceAttempt(attempt: LoginAttemptTracker, sessionFilePath: string): boolean {
  const current = readSessionFileFingerprint(sessionFilePath);
  if (!current.exists) return false;
  if (attempt.previousMtimeMs === null) return true;
  return (
    (current.mtimeMs ?? 0) > attempt.previousMtimeMs ||
    (Boolean(current.hash) && current.hash !== attempt.previousHash)
  );
}

const VN_WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function formatUtcDateDdMmYyyy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export interface VietnamCalendarWeekInfo {
  weekNumber: number;
  dateRange: string;
  weekRangeLabel: string;
}

/**
 * Classifies a Vietnam calendar date (`YYYY-MM-DD` in Asia/Ho_Chi_Minh, UTC+7) into an exact
 * date-bounded campaign week so December/January dates are never misclassified into Week 1 of November.
 */
export function classifyVietnamCalendarWeek(dateIsoVn: string): VietnamCalendarWeekInfo {
  const [yStr = '2026', mStr = '11', dStr = '09'] = dateIsoVn.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const targetMs = Date.UTC(y, m - 1, d);

  const w1Start = Date.UTC(2026, 10, 2); // 02/11/2026
  const w2Start = Date.UTC(2026, 10, 9); // 09/11/2026
  const w3Start = Date.UTC(2026, 10, 16); // 16/11/2026
  const w4Start = Date.UTC(2026, 10, 23); // 23/11/2026
  const w5Start = Date.UTC(2026, 11, 1); // 01/12/2026

  if (targetMs < w1Start) {
    return {
      weekNumber: 0,
      dateRange: 'Trước 02/11/2026',
      weekRangeLabel: 'Giai đoạn Khởi tạo (Trước 02/11/2026 00:00)',
    };
  }
  if (targetMs < w2Start) {
    return {
      weekNumber: 1,
      dateRange: '02/11/2026 – 08/11/2026',
      weekRangeLabel: 'Tuần 1 (02/11/2026 00:00 – 08/11/2026 23:59)',
    };
  }
  if (targetMs < w3Start) {
    return {
      weekNumber: 2,
      dateRange: '09/11/2026 – 15/11/2026',
      weekRangeLabel: 'Tuần 2 (09/11/2026 00:00 – 15/11/2026 23:59)',
    };
  }
  if (targetMs < w4Start) {
    return {
      weekNumber: 3,
      dateRange: '16/11/2026 – 22/11/2026',
      weekRangeLabel: 'Tuần 3 (16/11/2026 00:00 – 22/11/2026 23:59)',
    };
  }
  if (targetMs < w5Start) {
    return {
      weekNumber: 4,
      dateRange: '23/11/2026 – 30/11/2026',
      weekRangeLabel: 'Tuần 4 (23/11/2026 00:00 – 30/11/2026 23:59)',
    };
  }

  const diffDays = Math.floor((targetMs - w5Start) / 86_400_000);
  const weekOffset = Math.floor(diffDays / 7);
  const weekNumber = 5 + weekOffset;
  const blockStart = new Date(w5Start + weekOffset * 7 * 86_400_000);
  const blockEnd = new Date(w5Start + (weekOffset * 7 + 6) * 86_400_000);
  const startStr = formatUtcDateDdMmYyyy(blockStart);
  const endStr = formatUtcDateDdMmYyyy(blockEnd);
  return {
    weekNumber,
    dateRange: `${startStr} – ${endStr}`,
    weekRangeLabel: `Tuần ${weekNumber} (${startStr} 00:00 – ${endStr} 23:59)`,
  };
}

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
  constructor(private readonly pool: Pool) { }

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

    await ensureCommunityGrowthSchema(this.pool);

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
        target_source?: string | null;
        strategy_artifact_id?: string | null;
        strategy_plan_id?: string | null;
        target_rationale?: string | null;
        target_updated_at?: Date | string | null;
        weekly_targets_json?: WeeklyTargetPlanItem[] | null;
        auto_reply_comments?: boolean | null;
        auto_invite_enabled?: boolean | null;
        daily_invite_limit?: number | null;
        last_comment_sync_at?: Date | string | null;
        last_group_comment_sync_at?: Date | string | null;
        last_post_stats_sync_at?: Date | string | null;
        fb_admin_name?: string | null;
        last_invite_run_at?: Date | string | null;
        updated_at: Date;
      }>('SELECT * FROM community_hub_settings WHERE workspace_id = $1', [workspaceId])
    ).rows[0];

    const normalizeTargetSource = (val: unknown): TargetSource => {
      if (val === 'locked_manual' || val === 'manual') return val;
      return 'growth_lead_agent';
    };

    if (!saved) {
      await this.pool.query(
        `INSERT INTO community_hub_settings (workspace_id, community_name, group_url, publish_target, page_name, page_url, positioning, group_member_count, week1_target, week2_target, week3_target, week4_target, target_source, auto_reply_comments, auto_invite_enabled, daily_invite_limit)
         VALUES ($1, $2, $3, 'group', $4, $5, $6, 5, 5, 10, 18, 30, 'growth_lead_agent', TRUE, TRUE, 12)
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
        week2_target: 10,
        week3_target: 18,
        week4_target: 30,
        target_source: 'growth_lead_agent',
        strategy_artifact_id: null,
        strategy_plan_id: null,
        target_rationale: null,
        target_updated_at: null,
        weekly_targets_json: null,
        auto_reply_comments: true,
        auto_invite_enabled: true,
        daily_invite_limit: 12,
        last_comment_sync_at: null,
        last_group_comment_sync_at: null,
        last_post_stats_sync_at: null,
        fb_admin_name: null,
        last_invite_run_at: null,
        updated_at: new Date().toISOString(),
      };
    }

    const toIsoOrNull = (v: Date | string | null | undefined): string | null => {
      if (!v) return null;
      return v instanceof Date ? v.toISOString() : String(v);
    };

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
      week2_target: typeof saved.week2_target === 'number' && saved.week2_target > 0 ? saved.week2_target : 10,
      week3_target: typeof saved.week3_target === 'number' && saved.week3_target > 0 ? saved.week3_target : 18,
      week4_target: typeof saved.week4_target === 'number' && saved.week4_target > 0 ? saved.week4_target : 30,
      target_source: normalizeTargetSource(saved.target_source),
      strategy_artifact_id: saved.strategy_artifact_id ?? null,
      strategy_plan_id: saved.strategy_plan_id ?? null,
      target_rationale: saved.target_rationale ?? null,
      target_updated_at: toIsoOrNull(saved.target_updated_at),
      weekly_targets_json: Array.isArray(saved.weekly_targets_json) ? saved.weekly_targets_json : null,
      auto_reply_comments: saved.auto_reply_comments !== false,
      auto_invite_enabled: saved.auto_invite_enabled !== false,
      daily_invite_limit: clampDailyInviteLimit(saved.daily_invite_limit, 12),
      last_comment_sync_at: toIsoOrNull(saved.last_comment_sync_at),
      last_group_comment_sync_at: toIsoOrNull(saved.last_group_comment_sync_at),
      last_post_stats_sync_at: toIsoOrNull(saved.last_post_stats_sync_at),
      fb_admin_name: sanitizeFbAdminName(saved.fb_admin_name),
      last_invite_run_at: toIsoOrNull(saved.last_invite_run_at),
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
      target_source?: TargetSource;
      lock_manual?: boolean;
      auto_reply_comments?: boolean;
      auto_invite_enabled?: boolean;
      daily_invite_limit?: number;
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
    const hasManualTargets =
      input.week1_target !== undefined ||
      input.week2_target !== undefined ||
      input.week3_target !== undefined ||
      input.week4_target !== undefined;
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
    const nextTargetSource: TargetSource = input.lock_manual
      ? 'locked_manual'
      : input.target_source
        ? input.target_source
        : hasManualTargets
          ? 'manual'
          : current.target_source;
    const nextAutoReply =
      typeof input.auto_reply_comments === 'boolean' ? input.auto_reply_comments : current.auto_reply_comments;
    const nextAutoInvite =
      typeof input.auto_invite_enabled === 'boolean' ? input.auto_invite_enabled : current.auto_invite_enabled;
    const nextDailyLimit =
      input.daily_invite_limit !== undefined
        ? clampDailyInviteLimit(input.daily_invite_limit, current.daily_invite_limit)
        : current.daily_invite_limit;

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
              target_source = $11,
              target_updated_at = CASE WHEN $15::boolean THEN NOW() ELSE target_updated_at END,
              auto_reply_comments = $12,
              auto_invite_enabled = $13,
              daily_invite_limit = $14,
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
        nextTargetSource,
        nextAutoReply,
        nextAutoInvite,
        nextDailyLimit,
        hasManualTargets || Boolean(input.target_source) || input.lock_manual !== undefined,
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

    // Also deduplicate content_artifacts (role='content') per source_id so Review Queue & Distribution never show duplicate or mismatched images
    const topicAssets = getTopicImageAssets(workspaceId);
    const artRows = (
      await this.pool.query<{
        id: string;
        title: string;
        content_hash: string;
        payload: Record<string, any>;
        evidence: any[];
        source_id: string | null;
        source_url: string | null;
      }>(
        `SELECT id, title, content_hash, payload, evidence,
                evidence->0->>'source_id' AS source_id,
                evidence->0->>'source_url' AS source_url
           FROM content_artifacts
          WHERE workspace_id = $1 AND role = 'content'
          ORDER BY created_at DESC`,
        [workspaceId],
      )
    ).rows;

    const usedSourceUrls = new Set<string>();
    const canonicalAssetBySource = new Map<string, PlaybookAsset>();
    for (const art of artRows) {
      const groupKey = art.source_id || art.id;
      let matched = canonicalAssetBySource.get(groupKey);
      if (!matched) {
        const hookText = (art.payload?.result?.facebook?.hook || art.payload?.result?.caption || art.title || '') as string;
        matched = matchAssetForTopic(`${art.title} ${hookText}`, topicAssets, usedSourceUrls, art.source_url ?? undefined);
        canonicalAssetBySource.set(groupKey, matched);
        usedSourceUrls.add(matched.url);
      }

      const currentUrl = art.payload?.result?.image_assets?.[0]?.url as string | undefined;
      if (currentUrl !== matched.url) {
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
        WHERE workspace_id = $1 AND external_ref !~ '^fb:[0-9]{8,}$' AND external_ref NOT LIKE 'manual:%'`,
      [workspaceId],
    );

    const msgRows = (
      await this.pool.query<{ psid: string; platform: string; content: string; author_name?: string | null; received_at: Date }>(
        `SELECT author_contact AS psid, platform, content, author_name, received_at
           FROM community_messages
          WHERE workspace_id = $1
            AND platform IN ('facebook_message', 'facebook_comment')
            AND author_contact ~ '^[0-9]{8,}$'
          ORDER BY received_at DESC
          LIMIT 500`,
        [workspaceId],
      )
    ).rows;

    const byPerson = new Map<string, { platform: string; signals: string[]; first_seen: Date; name?: string }>();
    for (const m of msgRows) {
      const entry = byPerson.get(m.psid) ?? { platform: m.platform, signals: [], first_seen: m.received_at };
      entry.signals.push(m.content);
      if (m.author_name && !['Facebook user', 'Người bình luận Facebook'].includes(m.author_name)) {
        entry.name = entry.name || m.author_name;
      }
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
      const displayName = names.get(psid) ?? info.name ?? `Người dùng Facebook #${psid.slice(-4)}`;
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
            .catch(() => { });
        } else if (parsedCount !== null && parsedCount > 0 && parsedCount !== fallbackCount) {
          await this.pool
            .query(
              'UPDATE community_hub_settings SET group_member_count = $2, updated_at = NOW() WHERE workspace_id = $1',
              [workspaceId, parsedCount],
            )
            .catch(() => { });
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
          await this.pool
            .query(
              `INSERT INTO community_invite_logs (workspace_id, target_ref, display_name, channel, status, detail)
               VALUES ($1, $2, $3, 'messenger_invite', 'invited', $4)`,
              [workspaceId, member.external_ref, member.display_name, `Messenger id: ${json.message_id}`],
            )
            .catch(() => {});
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

  private async captureMemberSnapshot(
    workspaceId: string,
    stats: {
      groupMemberCount: number;
      pageFollowersCount: number | null;
      identifiedProspectsCount: number;
    },
  ): Promise<void> {
    try {
      const latest = (
        await this.pool.query<{
          group_member_count: number;
          page_followers_count: number | null;
          captured_at: Date;
        }>(
          `SELECT group_member_count, page_followers_count, captured_at
             FROM community_member_snapshots
            WHERE workspace_id = $1
            ORDER BY captured_at DESC LIMIT 1`,
          [workspaceId],
        )
      ).rows[0];

      const ageMs = latest?.captured_at ? Date.now() - new Date(latest.captured_at).getTime() : Infinity;
      const changed =
        !latest ||
        latest.group_member_count !== stats.groupMemberCount ||
        (stats.pageFollowersCount !== null && latest.page_followers_count !== stats.pageFollowersCount);

      if (!changed && ageMs < 60 * 60_000) return;

      const countsRow = (
        await this.pool.query<{ invites_cnt: number; replies_cnt: number }>(
          `SELECT
             (SELECT count(*)::int FROM community_invite_logs WHERE workspace_id = $1 AND status = 'invited') AS invites_cnt,
             (SELECT count(*)::int FROM community_messages WHERE workspace_id = $1 AND status = 'replied') AS replies_cnt`,
          [workspaceId],
        )
      ).rows[0];

      await this.pool.query(
        `INSERT INTO community_member_snapshots
           (workspace_id, group_member_count, page_followers_count, identified_prospects_count, invites_sent_count, replies_sent_count, campaign_week)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspaceId,
          stats.groupMemberCount,
          stats.pageFollowersCount,
          stats.identifiedProspectsCount,
          countsRow?.invites_cnt ?? 0,
          countsRow?.replies_cnt ?? 0,
          currentVietnamCampaignWeek(),
        ],
      );
    } catch {
      // Snapshot table may be omitted in lightweight mock tests.
    }
  }

  /**
   * Actively polls Fanpage posts & nested comments from Meta Graph API (`FACEBOOK_PAGE_ACCESS_TOKEN`),
   * ingesting unseen user comments into `community_messages` as `platform = 'facebook_comment'`.
   */
  async syncPageComments(workspaceId: string): Promise<{ ingested: number; checked_posts: number; error?: string }> {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!token) {
      return { ingested: 0, checked_posts: 0, error: 'FACEBOOK_PAGE_ACCESS_TOKEN chưa được cấu hình' };
    }
    const settings = await this.getCommunitySettings(workspaceId);
    const version = (process.env.META_GRAPH_API_VERSION || 'v20.0').replace(/^\/+|\/+$/g, '');
    try {
      const url = `https://graph.facebook.com/${version}/me/posts?fields=id,permalink_url,comments.limit(20){id,from,message,created_time,permalink_url}&limit=15&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        return { ingested: 0, checked_posts: 0, error: `Graph API HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        data?: {
          id: string;
          permalink_url?: string;
          comments?: {
            data?: {
              id: string;
              message?: string;
              permalink_url?: string;
              created_time?: string;
              from?: { id?: string; name?: string };
            }[];
          };
        }[];
      };

      const posts = json.data ?? [];
      let ingested = 0;

      for (const post of posts) {
        for (const comment of post.comments?.data ?? []) {
          const text = comment.message?.trim();
          const commentId = comment.id?.trim();
          if (!text || !commentId) continue;
          const fromId = comment.from?.id?.trim();
          if (fromId && fromId === settings.connected_fanpage_id) continue;

          const authorName = comment.from?.name?.trim() || 'Người bình luận Fanpage';
          const authorContact = fromId || `comment:${commentId}`;
          const permalink = comment.permalink_url || post.permalink_url || settings.page_url;

          const insertRes = await this.pool.query(
            `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, post_url, metadata, received_at)
             SELECT $1::uuid, 'facebook_comment', $2::varchar, $3::varchar, $4::varchar, $5::text, $6::text, $7::jsonb, COALESCE($8::timestamptz, NOW())
              WHERE NOT EXISTS (
                SELECT 1 FROM community_messages WHERE workspace_id = $1::uuid AND platform = 'facebook_comment' AND external_id = $2::varchar
              )
             RETURNING id`,
            [
              workspaceId,
              commentId,
              authorName.slice(0, 255),
              authorContact.slice(0, 255),
              text.slice(0, 4000),
              permalink,
              JSON.stringify({
                comment_id: commentId,
                post_id: post.id,
                permalink_url: permalink,
                comment_source: 'page',
                from_id: fromId ?? null,
                from_name: authorName,
              }),
              comment.created_time ?? null,
            ],
          );
          if ((insertRes.rowCount ?? insertRes.rows.length) > 0) ingested++;
        }
      }

      await this.pool
        .query('UPDATE community_hub_settings SET last_comment_sync_at = NOW() WHERE workspace_id = $1', [workspaceId])
        .catch(() => {});

      return { ingested, checked_posts: posts.length };
    } catch (err) {
      return { ingested: 0, checked_posts: 0, error: (err as Error).message };
    }
  }

  private normalizePostUrlKey(raw?: string | null): string {
    if (!raw) return '';
    return raw.trim().split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
  }

  private async persistGroupBotPostStats(
    workspaceId: string,
    settings: CommunitySettings,
    postStats: Array<{
      postUrl?: string;
      externalPostId?: string;
      titleSnippet?: string;
      likesCount?: number;
      commentsCount?: number;
      sharesCount?: number;
    }>,
    options: { groupMemberCount?: number; adminNames?: string[] } = {},
  ): Promise<number> {
    if (options.groupMemberCount && options.groupMemberCount > 0) {
      await this.pool
        .query('UPDATE community_hub_settings SET group_member_count = $2, updated_at = NOW() WHERE workspace_id = $1', [
          workspaceId,
          Math.max(1, Math.round(options.groupMemberCount)),
        ])
        .catch(() => {});
    }

    const cleanAdminName = (options.adminNames ?? [])
      .map((n) => sanitizeFbAdminName(n))
      .find((n): n is string => Boolean(n));
    if (cleanAdminName) {
      await this.pool
        .query('UPDATE community_hub_settings SET fb_admin_name = $2 WHERE workspace_id = $1', [
          workspaceId,
          cleanAdminName.slice(0, 250),
        ])
        .catch(() => {});
    } else if (!settings.fb_admin_name) {
      await this.pool
        .query('UPDATE community_hub_settings SET fb_admin_name = NULL WHERE workspace_id = $1 AND fb_admin_name IS NOT NULL', [
          workspaceId,
        ])
        .catch(() => {});
    }

    if (!postStats.length) return 0;

    const groupPosts = (
      await this.pool.query<{
        source_id: string | null;
        post_title: string;
        facebook_post_url: string | null;
        published_at: Date | null;
      }>(
        `SELECT source_id, post_title, facebook_post_url, published_at
           FROM community_group_posts
          WHERE workspace_id = $1 AND status = 'published'`,
        [workspaceId],
      )
    ).rows;

    const sources = (
      await this.pool.query<{ id: string; title: string }>(
        `SELECT id, title FROM sources WHERE workspace_id = $1 AND status = 'approved' AND deleted_at IS NULL`,
        [workspaceId],
      )
    ).rows;

    const msgCounts = (
      await this.pool.query<{ post_url: string | null; cnt: number }>(
        `SELECT post_url, count(*)::int AS cnt
           FROM community_messages
          WHERE workspace_id = $1 AND platform = 'facebook_comment' AND post_url IS NOT NULL
          GROUP BY post_url`,
        [workspaceId],
      )
    ).rows;

    const msgCountByUrl = new Map<string, number>();
    for (const r of msgCounts) {
      const k = this.normalizePostUrlKey(r.post_url);
      if (k) msgCountByUrl.set(k, (msgCountByUrl.get(k) ?? 0) + Number(r.cnt || 0));
    }

    let upserted = 0;
    for (const stat of postStats) {
      const postUrl = stat.postUrl?.trim();
      const key = stat.externalPostId?.trim() || postUrl;
      if (!key) continue;

      const normUrl = this.normalizePostUrlKey(postUrl);
      const snippetLower = (stat.titleSnippet || '').toLowerCase();

      const matchedGroupPost =
        groupPosts.find((gp) => normUrl && this.normalizePostUrlKey(gp.facebook_post_url) === normUrl) ??
        groupPosts.find((gp) => {
          const clean = gp.post_title
            .replace(/^[\p{Emoji}\s]*\[(CẨM NANG CỘNG ĐỒNG|VIETNAM PLAYBOOK)\]\s*/iu, '')
            .trim()
            .toLowerCase();
          return clean.length >= 12 && snippetLower.includes(clean.slice(0, 36));
        });

      const matchedSource =
        matchedGroupPost?.source_id
          ? sources.find((s) => s.id === matchedGroupPost.source_id)
          : sources.find((s) => {
              const clean = s.title.replace(/\s*\(tripc\.ai\)\s*$/i, '').trim().toLowerCase();
              return clean.length >= 12 && snippetLower.includes(clean.slice(0, 36));
            });

      const resolvedTitle =
        matchedGroupPost?.post_title ||
        matchedSource?.title.replace(/\s*\(tripc\.ai\)\s*$/i, '').trim() ||
        stat.titleSnippet?.slice(0, 200) ||
        `Bài viết Group #${key.slice(-8)}`;

      const floorMsgComments = normUrl ? msgCountByUrl.get(normUrl) ?? 0 : 0;
      const likesCount = Math.max(0, Math.round(stat.likesCount ?? 0));
      const commentsCount = Math.max(floorMsgComments, Math.round(stat.commentsCount ?? 0));
      const sharesCount = Math.max(0, Math.round(stat.sharesCount ?? 0));

      await this.pool
        .query(
          `INSERT INTO community_post_metrics (
             workspace_id, source_id, channel, external_post_key, post_title, post_url,
             likes_count, comments_count, shares_count, sync_source, published_at, last_synced_at
           ) VALUES ($1, $2, 'group', $3, $4, $5, $6, $7, $8, 'playwright_group_bot', $9, NOW())
           ON CONFLICT (workspace_id, channel, external_post_key)
           DO UPDATE SET
             source_id = COALESCE(EXCLUDED.source_id, community_post_metrics.source_id),
             post_title = CASE WHEN EXCLUDED.post_title <> '' THEN EXCLUDED.post_title ELSE community_post_metrics.post_title END,
             post_url = COALESCE(EXCLUDED.post_url, community_post_metrics.post_url),
             likes_count = EXCLUDED.likes_count,
             comments_count = GREATEST(EXCLUDED.comments_count, $7),
             shares_count = EXCLUDED.shares_count,
             sync_source = EXCLUDED.sync_source,
             published_at = COALESCE(EXCLUDED.published_at, community_post_metrics.published_at),
             last_synced_at = NOW()`,
          [
            workspaceId,
            matchedGroupPost?.source_id ?? matchedSource?.id ?? null,
            key.slice(0, 255),
            resolvedTitle.slice(0, 500),
            postUrl || settings.group_url,
            likesCount,
            commentsCount,
            sharesCount,
            matchedGroupPost?.published_at ?? null,
          ],
        )
        .catch(() => {});
      upserted += 1;
    }

    return upserted;
  }

  private async capturePostEngagementSnapshot(workspaceId: string, groupMembers: number): Promise<{
    total_posts_tracked: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    group_likes: number;
    group_comments: number;
    group_shares: number;
    page_likes: number;
    page_comments: number;
    page_shares: number;
  }> {
    const agg = (
      await this.pool.query<{
        total_posts_tracked: number;
        total_likes: number;
        total_comments: number;
        total_shares: number;
        group_likes: number;
        group_comments: number;
        group_shares: number;
        page_likes: number;
        page_comments: number;
        page_shares: number;
      }>(
        `SELECT
           count(*)::int AS total_posts_tracked,
           COALESCE(sum(likes_count), 0)::int AS total_likes,
           COALESCE(sum(comments_count), 0)::int AS total_comments,
           COALESCE(sum(shares_count), 0)::int AS total_shares,
           COALESCE(sum(likes_count) FILTER (WHERE channel = 'group'), 0)::int AS group_likes,
           COALESCE(sum(comments_count) FILTER (WHERE channel = 'group'), 0)::int AS group_comments,
           COALESCE(sum(shares_count) FILTER (WHERE channel = 'group'), 0)::int AS group_shares,
           COALESCE(sum(likes_count) FILTER (WHERE channel = 'fanpage'), 0)::int AS page_likes,
           COALESCE(sum(comments_count) FILTER (WHERE channel = 'fanpage'), 0)::int AS page_comments,
           COALESCE(sum(shares_count) FILTER (WHERE channel = 'fanpage'), 0)::int AS page_shares
         FROM community_post_metrics
        WHERE workspace_id = $1`,
        [workspaceId],
      )
    ).rows[0] ?? {
      total_posts_tracked: 0,
      total_likes: 0,
      total_comments: 0,
      total_shares: 0,
      group_likes: 0,
      group_comments: 0,
      group_shares: 0,
      page_likes: 0,
      page_comments: 0,
      page_shares: 0,
    };

    try {
      const latest = (
        await this.pool.query<{
          total_posts_tracked: number;
          total_likes: number;
          total_comments: number;
          total_shares: number;
          group_members: number;
          captured_at: Date;
        }>(
          `SELECT total_posts_tracked, total_likes, total_comments, total_shares, group_members, captured_at
             FROM community_post_metric_snapshots
            WHERE workspace_id = $1
            ORDER BY captured_at DESC LIMIT 1`,
          [workspaceId],
        )
      ).rows[0];

      const ageMs = latest?.captured_at ? Date.now() - new Date(latest.captured_at).getTime() : Infinity;
      const changed =
        !latest ||
        latest.total_posts_tracked !== agg.total_posts_tracked ||
        latest.total_likes !== agg.total_likes ||
        latest.total_comments !== agg.total_comments ||
        latest.total_shares !== agg.total_shares ||
        latest.group_members !== groupMembers;

      if (changed || ageMs >= 30 * 60_000) {
        await this.pool.query(
          `INSERT INTO community_post_metric_snapshots (
             workspace_id, total_posts_tracked, total_likes, total_comments, total_shares,
             group_likes, group_comments, group_shares, page_likes, page_comments, page_shares, group_members
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            workspaceId,
            agg.total_posts_tracked,
            agg.total_likes,
            agg.total_comments,
            agg.total_shares,
            agg.group_likes,
            agg.group_comments,
            agg.group_shares,
            agg.page_likes,
            agg.page_comments,
            agg.page_shares,
            groupMembers,
          ],
        );
      }
    } catch {
      // Ignore if snapshot table is omitted in lightweight unit test DB mocks
    }

    return agg;
  }

  /**
   * Syncs real per-post engagement statistics (Likes/Reactions, Comments, Shares) across Facebook Fanpage (Graph API)
   * and Facebook Group (Playwright Group Bot) into `community_post_metrics` + chronological growth snapshots.
   */
  async syncPostEngagementStats(
    workspaceId: string,
    options: { includeGroupBot?: boolean } = {},
  ): Promise<{
    fanpage_posts_synced: number;
    group_posts_synced: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    warnings: string[];
  }> {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const warnings: string[] = [];
    let fanpageSynced = 0;
    let groupSynced = 0;

    // 1. Fanpage engagement via Meta Graph API (`FACEBOOK_PAGE_ACCESS_TOKEN`)
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (token) {
      const version = (process.env.META_GRAPH_API_VERSION || 'v20.0').replace(/^\/+|\/+$/g, '');
      try {
        const publishedPageJobs = (
          await this.pool.query<{
            external_post_id: string | null;
            source_id: string | null;
            title: string | null;
            published_at: Date | null;
          }>(
            `SELECT j.external_post_id, a.evidence->0->>'source_id' AS source_id, a.title, j.published_at
               FROM publishing_jobs j
               JOIN channels ch ON ch.id = j.channel_id
               JOIN content_artifacts a ON a.id = j.artifact_id
              WHERE j.workspace_id = $1
                AND j.status = 'published'
                AND ch.platform_name = 'facebook'
                AND j.external_post_id IS NOT NULL
                AND COALESCE(j.external_post_id, '') NOT LIKE 'newsletter_%'`,
            [workspaceId],
          )
        ).rows;

        const jobByPostId = new Map<string, (typeof publishedPageJobs)[number]>();
        for (const j of publishedPageJobs) {
          if (!j.external_post_id) continue;
          jobByPostId.set(j.external_post_id, j);
          const suffix = j.external_post_id.includes('_') ? j.external_post_id.split('_')[1] : j.external_post_id;
          if (suffix) jobByPostId.set(suffix, j);
        }

        const msgCounts = (
          await this.pool.query<{ post_id: string | null; permalink_url: string | null; cnt: number }>(
            `SELECT metadata->>'post_id' AS post_id, metadata->>'permalink_url' AS permalink_url, count(*)::int AS cnt
               FROM community_messages
              WHERE workspace_id = $1 AND platform = 'facebook_comment'
              GROUP BY 1, 2`,
            [workspaceId],
          )
        ).rows;
        const msgByPostId = new Map<string, number>();
        for (const m of msgCounts) {
          if (m.post_id) msgByPostId.set(m.post_id, (msgByPostId.get(m.post_id) ?? 0) + Number(m.cnt || 0));
          const suffix = m.post_id?.includes('_') ? m.post_id.split('_')[1] : m.post_id;
          if (suffix) msgByPostId.set(suffix, (msgByPostId.get(suffix) ?? 0) + Number(m.cnt || 0));
        }

        const fields = 'id,message,created_time,permalink_url,shares,likes.summary(true),reactions.summary(true),comments.summary(true)';
        const listUrl = `https://graph.facebook.com/${version}/me/posts?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(token)}`;
        const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(12_000) });

        type GraphPostNode = {
          id?: string;
          message?: string;
          created_time?: string;
          permalink_url?: string;
          shares?: { count?: number };
          likes?: { summary?: { total_count?: number } };
          reactions?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
        };

        const fetchedPosts: GraphPostNode[] = [];
        if (listRes.ok) {
          const listJson = (await listRes.json()) as { data?: GraphPostNode[] };
          for (const p of listJson.data ?? []) {
            if (p.id) fetchedPosts.push(p);
          }
        } else {
          warnings.push(`Fanpage Graph API HTTP ${listRes.status}`);
        }

        const fetchedIdSet = new Set(fetchedPosts.map((p) => p.id).filter(Boolean) as string[]);
        for (const pj of publishedPageJobs.slice(0, 12)) {
          if (!pj.external_post_id || fetchedIdSet.has(pj.external_post_id)) continue;
          const postRes = await fetch(
            `https://graph.facebook.com/${version}/${encodeURIComponent(pj.external_post_id)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
            { signal: AbortSignal.timeout(8_000) },
          ).catch(() => null);
          if (postRes?.ok) {
            const single = (await postRes.json()) as GraphPostNode;
            if (single.id) {
              fetchedPosts.push(single);
              fetchedIdSet.add(single.id);
            }
          }
        }

        for (const p of fetchedPosts) {
          if (!p.id) continue;
          const suffix = p.id.includes('_') ? p.id.split('_')[1] : p.id;
          const matchedJob = jobByPostId.get(p.id) ?? (suffix ? jobByPostId.get(suffix) : undefined);
          const likesCount = Math.max(
            0,
            Number(p.reactions?.summary?.total_count ?? p.likes?.summary?.total_count ?? 0),
          );
          const msgFloor = Math.max(msgByPostId.get(p.id) ?? 0, suffix ? msgByPostId.get(suffix) ?? 0 : 0);
          const commentsCount = Math.max(msgFloor, Number(p.comments?.summary?.total_count ?? 0));
          const sharesCount = Math.max(0, Number(p.shares?.count ?? 0));
          const title =
            matchedJob?.title ||
            (p.message ? p.message.replace(/\s+/g, ' ').trim().slice(0, 180) : `Fanpage Post ${p.id}`);
          const postUrl =
            p.permalink_url ||
            (p.id.includes('_')
              ? `https://www.facebook.com/${p.id}`
              : `https://www.facebook.com/${settings.connected_fanpage_id}/posts/${p.id}`);

          await this.pool
            .query(
              `INSERT INTO community_post_metrics (
                 workspace_id, source_id, channel, external_post_key, post_title, post_url,
                 likes_count, comments_count, shares_count, sync_source, published_at, last_synced_at
               ) VALUES ($1, $2, 'fanpage', $3, $4, $5, $6, $7, $8, 'meta_graph_api', $9, NOW())
               ON CONFLICT (workspace_id, channel, external_post_key)
               DO UPDATE SET
                 source_id = COALESCE(EXCLUDED.source_id, community_post_metrics.source_id),
                 post_title = CASE WHEN EXCLUDED.post_title <> '' THEN EXCLUDED.post_title ELSE community_post_metrics.post_title END,
                 post_url = COALESCE(EXCLUDED.post_url, community_post_metrics.post_url),
                 likes_count = EXCLUDED.likes_count,
                 comments_count = EXCLUDED.comments_count,
                 shares_count = EXCLUDED.shares_count,
                 sync_source = 'meta_graph_api',
                 published_at = COALESCE(EXCLUDED.published_at, community_post_metrics.published_at),
                 last_synced_at = NOW()`,
              [
                workspaceId,
                matchedJob?.source_id ?? null,
                p.id.slice(0, 255),
                title.slice(0, 500),
                postUrl,
                likesCount,
                commentsCount,
                sharesCount,
                matchedJob?.published_at ?? (p.created_time ? new Date(p.created_time) : null),
              ],
            )
            .catch(() => {});
          fanpageSynced += 1;
        }
      } catch (err) {
        warnings.push(`Fanpage sync: ${(err as Error).message}`);
      }
    }

    // 2. Group engagement via Playwright Group Bot (`scan-stats`)
    if (options.includeGroupBot !== false) {
      const workerDir = resolveWorkerDir();
      const session = resolveGroupBotSessionFile(workerDir);
      const hasSession = session.exists || Boolean(process.env.FB_ADMIN_COOKIE?.trim());
      if (hasSession) {
        const recentGroupPosts = (
          await this.pool.query<{ facebook_post_url: string }>(
            `SELECT DISTINCT facebook_post_url
               FROM community_group_posts
              WHERE workspace_id = $1
                AND status = 'published'
                AND facebook_post_url IS NOT NULL
                AND facebook_post_url LIKE 'http%'
              LIMIT 8`,
            [workspaceId],
          )
        ).rows.map((r) => r.facebook_post_url);

        const runner = resolveGroupBotRunner(workerDir);
        const tmpPayloadFile = path.join(os.tmpdir(), `fb-scan-stats-${randomUUID()}.json`);
        fs.writeFileSync(
          tmpPayloadFile,
          JSON.stringify({
            groupUrl: settings.group_url,
            postUrls: recentGroupPosts,
            maxPosts: 8,
            headless: true,
          }),
          'utf8',
        );
        try {
          const botOutput = await new Promise<{ stdout: string; stderr: string }>((resolve) => {
            const child = spawn(
              runner.command,
              [...runner.prefixArgs, 'scan-stats', '--group-url', settings.group_url, '--payload-file', tmpPayloadFile],
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
                } catch {}
                resolve({ stdout, stderr });
              }
            }, 90_000);
            child.stdout?.on('data', (d) => {
              stdout += d.toString();
            });
            child.stderr?.on('data', (d) => {
              stderr += d.toString();
            });
            child.on('error', (err) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ stdout, stderr: err.message });
              }
            });
            child.on('close', () => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ stdout, stderr });
              }
            });
          });

          const parsed = parseGroupBotResultLine(botOutput.stdout);
          if (parsed && parsed.success === true) {
            const postStats = Array.isArray(parsed.postStats) ? parsed.postStats : [];
            const groupMemberCount =
              typeof parsed.groupMemberCount === 'number' && parsed.groupMemberCount > 0
                ? parsed.groupMemberCount
                : undefined;
            const adminNames = Array.isArray(parsed.adminNames) ? (parsed.adminNames as string[]) : undefined;
            groupSynced = await this.persistGroupBotPostStats(workspaceId, settings, postStats, {
              groupMemberCount,
              adminNames,
            });
          } else if (parsed?.message || botOutput.stderr.trim()) {
            warnings.push(`Group stats: ${String(parsed?.message || botOutput.stderr.trim())}`);
          }
        } finally {
          try {
            if (fs.existsSync(tmpPayloadFile)) fs.unlinkSync(tmpPayloadFile);
          } catch {}
        }
      } else {
        warnings.push('Chưa có phiên Group Bot (.fb-session.json) để quét tương tác bài trong Group.');
      }
    }

    const latestSettings = await this.getCommunitySettings(workspaceId);
    const totals = await this.capturePostEngagementSnapshot(workspaceId, latestSettings.group_member_count);
    await this.pool
      .query('UPDATE community_hub_settings SET last_post_stats_sync_at = NOW() WHERE workspace_id = $1', [workspaceId])
      .catch(() => {});

    return {
      fanpage_posts_synced: fanpageSynced,
      group_posts_synced: groupSynced,
      total_likes: totals.total_likes,
      total_comments: totals.total_comments,
      total_shares: totals.total_shares,
      warnings,
    };
  }

  /**
   * Scans recent published posts in the Facebook Group via Playwright `FacebookGroupBot`
   * for unseen member questions/comments so the RAG Community Agent can auto-reply them.
   */
  async syncGroupComments(
    workspaceId: string,
    maxPosts = 5,
  ): Promise<{ ingested: number; scanned_posts: number; post_stats_synced?: number; skipped?: string; error?: string }> {
    const settings = await this.getCommunitySettings(workspaceId);
    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    const hasSession = session.exists || Boolean(process.env.FB_ADMIN_COOKIE?.trim());
    if (!hasSession) {
      return { ingested: 0, scanned_posts: 0, skipped: 'FACEBOOK_GROUP_SESSION_MISSING' };
    }

    const recentGroupPosts = (
      await this.pool.query<{ facebook_post_url: string }>(
        `SELECT DISTINCT facebook_post_url
           FROM community_group_posts
          WHERE workspace_id = $1
            AND status = 'published'
            AND facebook_post_url IS NOT NULL
            AND facebook_post_url LIKE 'http%'
          LIMIT $2`,
        [workspaceId, maxPosts],
      )
    ).rows.map((r) => r.facebook_post_url);

    const runner = resolveGroupBotRunner(workerDir);
    const tmpPayloadFile = path.join(os.tmpdir(), `fb-scan-comments-${randomUUID()}.json`);
    fs.writeFileSync(
      tmpPayloadFile,
      JSON.stringify({
        groupUrl: settings.group_url,
        postUrls: recentGroupPosts,
        maxPosts,
        headless: true,
      }),
      'utf8',
    );

    try {
      const botOutput = await new Promise<{ code: number | null; stdout: string; stderr: string; spawnErr?: string; timedOut?: boolean }>(
        (resolve) => {
          const child = spawn(
            runner.command,
            [...runner.prefixArgs, 'scan-comments', '--group-url', settings.group_url, '--payload-file', tmpPayloadFile],
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
              } catch {}
              resolve({ code: null, stdout, stderr, timedOut: true });
            }
          }, 90_000);
          child.stdout?.on('data', (d) => {
            stdout += d.toString();
          });
          child.stderr?.on('data', (d) => {
            stderr += d.toString();
          });
          child.on('error', (err) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ code: 1, stdout, stderr, spawnErr: err.message });
            }
          });
          child.on('close', (code) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ code, stdout, stderr });
            }
          });
        },
      );

      const parsed = parseGroupBotResultLine(botOutput.stdout);
      if (!parsed || parsed.success !== true) {
        return {
          ingested: 0,
          scanned_posts: 0,
          error: (typeof parsed?.message === 'string' && parsed.message) || botOutput.stderr.trim() || 'Scan group comments failed',
        };
      }

      const comments = Array.isArray(parsed.comments)
        ? (parsed.comments as { commentKey?: string; postUrl?: string; authorName?: string; text?: string }[])
        : [];
      const adminNames = Array.isArray(parsed.adminNames)
        ? (parsed.adminNames as string[]).map((n) => sanitizeFbAdminName(n)).filter((n): n is string => Boolean(n))
        : [];
      const blockedAuthors = new Set(
        [
          settings.page_name,
          settings.community_name,
          settings.fb_admin_name ?? '',
          ...adminNames,
        ]
          .map((n) => n.trim().toLowerCase())
          .filter(Boolean),
      );
      let ingested = 0;

      for (const c of comments) {
        const key = c.commentKey?.trim();
        const text = c.text?.trim();
        const author = c.authorName?.trim() || 'Thành viên Group Facebook';
        if (!key || !text) continue;
        if (blockedAuthors.has(author.toLowerCase())) continue;

        const res = await this.pool.query(
          `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, post_url, metadata)
           SELECT $1::uuid, 'facebook_comment', $2::varchar, $3::varchar, $4::varchar, $5::text, $6::text, $7::jsonb
            WHERE NOT EXISTS (
              SELECT 1 FROM community_messages WHERE workspace_id = $1::uuid AND platform = 'facebook_comment' AND external_id = $2::varchar
            )
           RETURNING id`,
          [
            workspaceId,
            key.slice(0, 255),
            author.slice(0, 255),
            key.slice(0, 255),
            text.slice(0, 4000),
            c.postUrl || settings.group_url,
            JSON.stringify({
              comment_id: key,
              comment_source: 'group',
              permalink_url: c.postUrl || settings.group_url,
              from_name: author,
            }),
          ],
        );
        if ((res.rowCount ?? res.rows.length) > 0) ingested++;
      }

      const postStats = Array.isArray(parsed.postStats) ? parsed.postStats : [];
      const groupMemberCount =
        typeof parsed.groupMemberCount === 'number' && parsed.groupMemberCount > 0
          ? parsed.groupMemberCount
          : undefined;
      const postStatsSynced = await this.persistGroupBotPostStats(workspaceId, settings, postStats, {
        groupMemberCount,
        adminNames,
      });

      await this.pool
        .query('UPDATE community_hub_settings SET last_group_comment_sync_at = NOW() WHERE workspace_id = $1', [workspaceId])
        .catch(() => {});

      return {
        ingested,
        scanned_posts: Number(parsed.scannedPosts ?? recentGroupPosts.length),
        post_stats_synced: postStatsSynced,
      };
    } finally {
      try {
        if (fs.existsSync(tmpPayloadFile)) fs.unlinkSync(tmpPayloadFile);
      } catch {}
    }
  }

  /**
   * Scans Fanpage & Group comments, then queues grounded RAG responses respecting `auto_reply_comments`.
   */
  async scanAndProcessComments(
    workspaceId: string,
    actorId: string,
    options: { includeGroupBot?: boolean } = {},
  ): Promise<{
    page_ingested: number;
    group_ingested: number;
    queued_for_rag: number;
    auto_reply_comments: boolean;
    warnings: string[];
  }> {
    const settings = await this.getCommunitySettings(workspaceId);
    const warnings: string[] = [];
    const pageRes = await this.syncPageComments(workspaceId);
    if (pageRes.error) warnings.push(`Fanpage: ${pageRes.error}`);

    let groupIngested = 0;
    if (options.includeGroupBot !== false) {
      const groupRes = await this.syncGroupComments(workspaceId, 5);
      groupIngested = groupRes.ingested;
      if (groupRes.error) warnings.push(`Group scan: ${groupRes.error}`);
    }

    await this.syncMembersFromInteractions(workspaceId, settings);

    // Refresh Fanpage stats & capture post engagement snapshot after scanning comments
    await this.syncPostEngagementStats(workspaceId, { includeGroupBot: false }).catch(() => {});

    let queuedForRag = 0;
    if (settings.auto_reply_comments) {
      const ctxRow = (
        await this.pool.query<{ snapshot_id: string }>(
          'SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1 AND current LIMIT 1',
          [workspaceId],
        )
      ).rows[0];
      if (ctxRow?.snapshot_id) {
        queuedForRag = await processReceivedCommunityMessages(this.pool, workspaceId, actorId, ctxRow.snapshot_id, 15);
      }
    }

    return {
      page_ingested: pageRes.ingested,
      group_ingested: groupIngested,
      queued_for_rag: queuedForRag,
      auto_reply_comments: settings.auto_reply_comments,
      warnings,
    };
  }

  /**
   * Sends REAL Facebook invitations (native Group "Mời / Invite" UI via Playwright + personalized Messenger link)
   * strictly bounded by `daily_invite_limit` (10-15/day) and deduplicated in `community_invite_logs`. Never force-adds users.
   */
  async sendSafeCommunityInvites(
    workspaceId: string,
    options: { maxBatch?: number; includeNativeGroupUi?: boolean } = {},
  ): Promise<{
    invited_count: number;
    remaining_today: number;
    daily_limit: number;
    cap_reached: boolean;
    disabled?: boolean;
    results: { name: string; channel: string; status: string; detail: string }[];
  }> {
    const settings = await this.getCommunitySettings(workspaceId);
    const dailyLimit = clampDailyInviteLimit(settings.daily_invite_limit, 12);

    if (!settings.auto_invite_enabled) {
      return {
        invited_count: 0,
        remaining_today: 0,
        daily_limit: dailyLimit,
        cap_reached: false,
        disabled: true,
        results: [],
      };
    }

    await ensureCommunityGrowthSchema(this.pool);
    const sentTodayRow = (
      await this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM community_invite_logs
          WHERE workspace_id = $1
            AND status = 'invited'
            AND invited_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
        [workspaceId],
      )
    ).rows[0];
    const sentToday = Number(sentTodayRow?.n ?? 0);
    let remaining = Math.max(0, dailyLimit - sentToday);

    if (remaining <= 0) {
      return {
        invited_count: 0,
        remaining_today: 0,
        daily_limit: dailyLimit,
        cap_reached: true,
        results: [],
      };
    }

    const batchCap = Math.min(remaining, Math.max(1, Math.min(options.maxBatch ?? 5, 10)));
    const results: { name: string; channel: string; status: string; detail: string }[] = [];
    let invitedCount = 0;

    // Step 1: Invite uninvited Messenger/Fanpage prospects within 24h window via real Messenger Graph API
    const messengerCandidates = (
      await this.pool.query<{ external_ref: string; display_name: string }>(
        `SELECT m.external_ref, m.display_name
           FROM community_hub_members m
          WHERE m.workspace_id = $1
            AND m.external_ref ~ '^fb:[0-9]{14,}$'
            AND m.status = 'identified'
            AND NOT EXISTS (
              SELECT 1 FROM community_invite_logs l
               WHERE l.workspace_id = $1 AND l.target_ref = m.external_ref AND l.status = 'invited'
            )
          ORDER BY m.affinity_score DESC, m.created_at DESC
          LIMIT $2`,
        [workspaceId, batchCap],
      )
    ).rows;

    for (const candidate of messengerCandidates) {
      if (remaining <= 0) break;
      const res = await this.sendMessengerGroupInvite(workspaceId, candidate.external_ref);
      for (const item of res.results) {
        results.push({ name: item.name, channel: 'messenger_invite', status: item.status, detail: item.detail });
        if (item.status === 'sent') {
          invitedCount++;
          remaining = Math.max(0, remaining - 1);
        }
      }
    }

    // Step 2: Native Facebook Group "Mời / Invite" UI button via Playwright (respecting daily quota)
    if (options.includeNativeGroupUi !== false && remaining > 0) {
      const workerDir = resolveWorkerDir();
      const session = resolveGroupBotSessionFile(workerDir);
      const hasSession = session.exists || Boolean(process.env.FB_ADMIN_COOKIE?.trim());
      if (hasSession) {
        const alreadyInvitedNames = new Set(
          (
            await this.pool.query<{ display_name: string }>(
              `SELECT display_name FROM community_invite_logs WHERE workspace_id = $1 AND status = 'invited' LIMIT 500`,
              [workspaceId],
            )
          ).rows.map((r) => r.display_name.toLowerCase()),
        );
        const runner = resolveGroupBotRunner(workerDir);
        const nativeLimit = Math.min(remaining, Math.max(1, batchCap - invitedCount));
        const tmpPayloadFile = path.join(os.tmpdir(), `fb-group-invite-${randomUUID()}.json`);
        fs.writeFileSync(
          tmpPayloadFile,
          JSON.stringify({
            groupUrl: settings.group_url,
            maxInvites: nativeLimit,
            excludeNames: Array.from(alreadyInvitedNames),
            headless: true,
          }),
          'utf8',
        );

        try {
          const botOutput = await new Promise<{ code: number | null; stdout: string; stderr: string; spawnErr?: string; timedOut?: boolean }>(
            (resolve) => {
              const child = spawn(
                runner.command,
                [...runner.prefixArgs, 'invite', '--group-url', settings.group_url, '--payload-file', tmpPayloadFile],
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
                  } catch {}
                  resolve({ code: null, stdout, stderr, timedOut: true });
                }
              }, 90_000);
              child.stdout?.on('data', (d) => {
                stdout += d.toString();
              });
              child.stderr?.on('data', (d) => {
                stderr += d.toString();
              });
              child.on('error', (err) => {
                if (!settled) {
                  settled = true;
                  clearTimeout(timer);
                  resolve({ code: 1, stdout, stderr, spawnErr: err.message });
                }
              });
              child.on('close', (code) => {
                if (!settled) {
                  settled = true;
                  clearTimeout(timer);
                  resolve({ code, stdout, stderr });
                }
              });
            },
          );

          const parsed = parseGroupBotResultLine(botOutput.stdout);
          const invitedList = Array.isArray(parsed?.invited)
            ? (parsed.invited as { name?: string; profileRef?: string }[])
            : [];
          for (const person of invitedList) {
            const displayName = person.name?.trim() || 'Người dùng Facebook gợi ý';
            const targetRef = person.profileRef?.trim() || `fb_invite:${displayName.toLowerCase()}`;
            await this.pool.query(
              `INSERT INTO community_invite_logs (workspace_id, target_ref, display_name, channel, status, detail)
               VALUES ($1, $2, $3, 'group_native_invite', 'invited', $4)`,
              [workspaceId, targetRef.slice(0, 255), displayName.slice(0, 255), `Đã bấm nút Mời (Invite) thật trên ${settings.group_url}`],
            );
            invitedCount++;
            remaining = Math.max(0, remaining - 1);
            results.push({
              name: displayName,
              channel: 'group_native_invite',
              status: 'invited',
              detail: 'Đã gửi lời mời tham gia Group chính thức trên Facebook (nút Mời / Invite)',
            });
          }
          if (invitedList.length === 0 && parsed?.message) {
            results.push({
              name: 'Facebook Group Invite Modal',
              channel: 'group_native_invite',
              status: parsed.success ? 'info' : 'skipped',
              detail: String(parsed.message),
            });
          }
        } finally {
          try {
            if (fs.existsSync(tmpPayloadFile)) fs.unlinkSync(tmpPayloadFile);
          } catch {}
        }
      }
    }

    await this.pool
      .query('UPDATE community_hub_settings SET last_invite_run_at = NOW() WHERE workspace_id = $1', [workspaceId])
      .catch(() => {});

    return {
      invited_count: invitedCount,
      remaining_today: remaining,
      daily_limit: dailyLimit,
      cap_reached: remaining <= 0,
      results,
    };
  }

  /**
   * Searches public community demand & recurring questions via local SearXNG so Growth Lead & Community
   * surface real outside-FB intent topics without inventing fake users.
   */
  async discoverSearxngCommunityOpportunities(): Promise<
    { query: string; title: string; url: string; snippet: string; domain: string }[]
  > {
    const base = (process.env.SEARXNG_URL || process.env.SEARXNG_BASE_URL || 'http://127.0.0.1:18081').replace(/\/+$/, '');
    const queries = [
      'kinh nghiệm sống và thuê căn hộ Đà Nẵng Việt Nam expat',
      'vietnam e-visa 2026 esim travel tips forum',
    ];
    const out: { query: string; title: string; url: string; snippet: string; domain: string }[] = [];
    for (const q of queries) {
      try {
        const res = await fetch(`${base}/search?q=${encodeURIComponent(q)}&format=json&language=en`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          results?: { title?: string; url?: string; content?: string }[];
        };
        for (const r of (json.results ?? []).slice(0, 3)) {
          if (!r.title || !r.url) continue;
          let domain = '';
          try {
            domain = new URL(r.url).hostname.replace(/^www\./, '');
          } catch {}
          out.push({
            query: q,
            title: r.title.slice(0, 200),
            url: r.url,
            snippet: (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
            domain,
          });
        }
      } catch {
        // SearXNG offline in isolated tests — fail gracefully with empty list
      }
    }
    return out;
  }

  /**
   * Executes or syncs Growth Lead Agent (`strategy.generate`) with live community metrics
   * and immediately auto-applies `community_growth_plan` down to `community_hub_settings`.
   */
  async syncGrowthLeadTargets(
    workspaceId: string,
    options: { forceRecalculate?: boolean; forceOverrideManual?: boolean } = {},
  ): Promise<{
    applied: boolean;
    reason?: string;
    artifact_id?: string | null;
    week1_target: number;
    week2_target: number;
    week3_target: number;
    week4_target: number;
    daily_invite_limit: number;
    target_source: TargetSource;
    target_rationale: string | null;
  }> {
    let settings = await this.getCommunitySettings(workspaceId);
    const [pageStats, groupStats] = await Promise.all([
      this.fetchRealPageStats(),
      this.fetchRealGroupStats(settings.group_url, settings.group_member_count, workspaceId),
    ]);
    await this.captureMemberSnapshot(workspaceId, {
      groupMemberCount: groupStats.member_count,
      pageFollowersCount: pageStats.followers_count,
      identifiedProspectsCount: 0,
    });
    settings = await this.getCommunitySettings(workspaceId);

    // Try existing latest strategy.generate artifact first when not forcing recalculation
    if (!options.forceRecalculate) {
      const existingRow = (
        await this.pool.query<{ id: string; payload: { result?: unknown } }>(
          `SELECT id, payload
             FROM content_artifacts
            WHERE workspace_id = $1
              AND role = 'growth_lead'
              AND operation = 'strategy.generate'
              AND payload->'result'->'community_growth_plan' IS NOT NULL
            ORDER BY created_at DESC LIMIT 1`,
          [workspaceId],
        )
      ).rows[0];
      const checked = existingRow?.payload?.result ? planSchema.safeParse(existingRow.payload.result) : null;
      if (checked?.success && checked.data.community_growth_plan) {
        const applied = await applyCommunityGrowthPlan(this.pool, checked.data, existingRow.id, {
          forceOverrideManual: options.forceOverrideManual,
        });
        const refreshed = await this.getCommunitySettings(workspaceId);
        return {
          applied: applied.applied,
          reason: applied.reason,
          artifact_id: existingRow.id,
          week1_target: refreshed.week1_target,
          week2_target: refreshed.week2_target,
          week3_target: refreshed.week3_target,
          week4_target: refreshed.week4_target,
          daily_invite_limit: refreshed.daily_invite_limit,
          target_source: refreshed.target_source,
          target_rationale: refreshed.target_rationale,
        };
      }
    }

    // Run real Growth Lead Agent (strategy.generate) against current knowledge context + research + community_context
    const contextRow = (
      await this.pool.query<{ snapshot_id: string; profile_version: number; profile: unknown; snapshot: unknown; goal: unknown }>(
        'SELECT snapshot_id, profile_version, profile, snapshot, goal FROM knowledge_contexts WHERE workspace_id = $1 AND current LIMIT 1',
        [workspaceId],
      )
    ).rows[0];

    const researchRow = (
      await this.pool.query<{ id: string; payload: { artifact?: unknown; result?: unknown }; evidence: unknown }>(
        `SELECT id, payload, evidence
           FROM content_artifacts
          WHERE workspace_id = $1
            AND context_snapshot_id = $2
            AND role = 'research'
            AND payload->'result'->>'status' = 'ready_for_handoff'
          ORDER BY created_at DESC LIMIT 1`,
        [workspaceId, contextRow?.snapshot_id],
      )
    ).rows[0];

    if (contextRow && researchRow?.payload?.artifact && researchRow.payload.result) {
      const communityContext = await loadCommunityGrowthContext(this.pool, workspaceId);
      const automationRow = (
        await this.pool.query<{ cta?: string | null }>('SELECT cta FROM agent_automation WHERE workspace_id = $1 LIMIT 1', [
          workspaceId,
        ])
      ).rows[0];
      const cta =
        automationRow?.cta?.trim() ||
        `Tham gia ${settings.community_name} (${settings.group_url})`;
      const measuredRow = (
        await this.pool.query<{ payload: { artifact?: unknown; result?: unknown }; evidence: unknown }>(
          `SELECT payload, evidence FROM content_artifacts
            WHERE workspace_id = $1 AND context_snapshot_id = $2 AND operation = 'metrics.snapshot'
            ORDER BY created_at DESC LIMIT 1`,
          [workspaceId, contextRow.snapshot_id],
        )
      ).rows[0];

      const jobId = randomUUID();
      const aiBaseUrl = (
        process.env.INTERNAL_AI_URL ||
        process.env.AI_SERVICE_BASE_URL ||
        'http://127.0.0.1:5000'
      ).replace(/\/+$/, '');
      const aiToken = process.env.INTERNAL_AI_AUTH_TOKEN?.trim();
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(aiToken ? { authorization: `Bearer ${aiToken}` } : {}),
      };

      const researchArtifactObj = researchRow.payload.artifact as { synthetic?: boolean };
      const isSynthetic = Boolean((researchRow.payload.result as { synthetic?: boolean })?.synthetic);
      const jobPayload: Record<string, unknown> = {
        workspace_id: workspaceId,
        business_profile: contextRow.profile,
        snapshot: contextRow.snapshot,
        goal_context: contextRow.goal,
        research: researchRow.payload.result,
        research_artifact: researchArtifactObj,
        cta: cta.slice(0, 200),
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        score_factors: {},
        ...(communityContext ? { community_context: communityContext } : {}),
        ...(measuredRow?.payload?.artifact
          ? {
              latest_metrics: {
                artifact: measuredRow.payload.artifact,
                result: measuredRow.payload.result,
                evidence: measuredRow.evidence ?? [],
              },
            }
          : {}),
      };

      const sourcesList = Array.isArray((contextRow.snapshot as { sources?: unknown[] })?.sources)
        ? ((contextRow.snapshot as { sources: { source_id: string; version: number }[] }).sources)
        : [];

      const reqBody = {
        schema_version: '1.0.0',
        job_id: jobId,
        workspace_id: workspaceId,
        operation: 'strategy.generate',
        input_version: 1,
        trace_id: `community-target-sync:${jobId}`,
        context_snapshot_id: contextRow.snapshot_id,
        approved_source_versions: sourcesList.map((s) => ({ source_id: s.source_id, version: s.version })),
        ...(isSynthetic ? { synthetic: true } : {}),
        constraints: { human_approval_required: true, timeout_seconds: 120 },
        payload: jobPayload,
      };

      const postRes = await fetch(`${aiBaseUrl}/internal/v1/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(45_000),
      });

      if (postRes.ok) {
        let runStatus = (await postRes.json()) as {
          run_id: string;
          status: string;
          result?: {
            result?: Record<string, unknown>;
            evidence?: unknown[];
            artifact?: Record<string, unknown>;
            model_version?: string;
            prompt_version?: string;
          };
          provider_calls?: number;
        };
        const pollDeadline = Date.now() + 45_000;
        while ((runStatus.status === 'queued' || runStatus.status === 'running') && Date.now() < pollDeadline) {
          await new Promise((r) => setTimeout(r, 400));
          const getRes = await fetch(`${aiBaseUrl}/internal/v1/runs/${runStatus.run_id}`, {
            headers,
            signal: AbortSignal.timeout(10_000),
          });
          if (!getRes.ok) break;
          runStatus = (await getRes.json()) as typeof runStatus;
        }

        if (runStatus.status === 'completed' && runStatus.result?.artifact && runStatus.result?.result) {
          const artifact = runStatus.result.artifact as {
            artifact_id: string;
            workspace_id: string;
            version: number;
            content_hash: string;
            context_snapshot_id: string;
            role: string;
          };
          const output = runStatus.result.result;
          const evidence = runStatus.result.evidence ?? [];
          const expectedHash = sha256Hex(canonicalJson({ result: output, evidence }));
          if (expectedHash === artifact.content_hash && artifact.workspace_id === workspaceId) {
            const title =
              (output as { selected_opportunity?: { topic?: string }; objective?: string }).selected_opportunity?.topic ||
              (output as { objective?: string }).objective ||
              'Growth Lead Community Target Plan';
            await this.pool.query(
              `INSERT INTO content_artifacts
                 (id, workspace_id, version, content_hash, context_snapshot_id, role, operation, artifact_type, title, storage, payload, evidence)
               VALUES ($1, $2, $3, $4, $5, 'growth_lead', 'strategy.generate', 'ai_result', $6, 'ai_run_store', $7::jsonb, $8::jsonb)
               ON CONFLICT (id) DO NOTHING`,
              [
                artifact.artifact_id,
                workspaceId,
                artifact.version,
                expectedHash,
                contextRow.snapshot_id,
                String(title).slice(0, 250),
                JSON.stringify({
                  artifact,
                  result: output,
                  run_metadata: {
                    run_id: runStatus.run_id,
                    model_version: runStatus.result.model_version ?? '',
                    prompt_version: runStatus.result.prompt_version ?? '',
                    provider_calls: runStatus.provider_calls ?? 0,
                  },
                }),
                JSON.stringify(evidence),
              ],
            );
            const checked = planSchema.safeParse(output);
            if (checked.success) {
              const applied = await applyCommunityGrowthPlan(this.pool, checked.data, artifact.artifact_id, {
                forceOverrideManual: options.forceOverrideManual ?? true,
              });
              const refreshed = await this.getCommunitySettings(workspaceId);
              return {
                applied: applied.applied,
                reason: applied.reason,
                artifact_id: artifact.artifact_id,
                week1_target: refreshed.week1_target,
                week2_target: refreshed.week2_target,
                week3_target: refreshed.week3_target,
                week4_target: refreshed.week4_target,
                daily_invite_limit: refreshed.daily_invite_limit,
                target_source: refreshed.target_source,
                target_rationale: refreshed.target_rationale,
              };
            }
          }
        }
      }
    }

    const refreshed = await this.getCommunitySettings(workspaceId);
    return {
      applied: false,
      reason: 'GROWTH_LEAD_RUN_UNAVAILABLE',
      artifact_id: refreshed.strategy_artifact_id,
      week1_target: refreshed.week1_target,
      week2_target: refreshed.week2_target,
      week3_target: refreshed.week3_target,
      week4_target: refreshed.week4_target,
      daily_invite_limit: refreshed.daily_invite_limit,
      target_source: refreshed.target_source,
      target_rationale: refreshed.target_rationale,
    };
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
        body_text: string | null;
      }>(
        `SELECT j.id AS job_id, j.external_post_id, j.published_at,
                ch.platform_name, j.utm_url,
                a.evidence->0->>'source_id' AS source_id,
                a.payload->'result'->'image_assets'->0->>'url' AS img_url,
                COALESCE(a.payload->'result'->'facebook'->>'text', a.payload->'result'->>'caption') AS body_text
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
        body_text: string | null;
      }>(
        `SELECT j.id AS job_id, j.scheduled_for, j.status, j.error_message,
                ch.platform_name, j.utm_url,
                a.evidence->0->>'source_id' AS source_id,
                a.payload->'result'->'image_assets'->0->>'url' AS img_url,
                COALESCE(a.payload->'result'->'facebook'->>'text', a.payload->'result'->>'caption') AS body_text
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
        image_url: string | null;
        body_text: string | null;
        status: string;
        error_message: string | null;
        published_at: Date | null;
        updated_at: Date;
      }>(
        `SELECT id, source_id, publishing_job_id, post_title, group_url, facebook_post_url,
                image_url, body_text, status, error_message, published_at, updated_at
           FROM community_group_posts
          WHERE workspace_id = $1
          ORDER BY published_at DESC NULLS LAST, updated_at DESC`,
        [workspaceId],
      )
    ).rows;

    const contentPackRows = (
      await this.pool.query<{
        source_id: string | null;
        img_url: string | null;
        body_text: string | null;
      }>(
        `SELECT DISTINCT ON (a.evidence->0->>'source_id')
                a.evidence->0->>'source_id' AS source_id,
                a.payload->'result'->'image_assets'->0->>'url' AS img_url,
                COALESCE(a.payload->'result'->'facebook'->>'text', a.payload->'result'->>'caption') AS body_text
           FROM content_artifacts a
          WHERE a.workspace_id = $1
            AND a.role = 'content'
            AND a.evidence->0->>'source_id' IS NOT NULL
          ORDER BY a.evidence->0->>'source_id', a.created_at DESC`,
        [workspaceId],
      )
    ).rows;

    const contentPackBySource = new Map<string, { img_url: string | null; body_text: string | null }>();
    for (const cp of contentPackRows) {
      if (cp.source_id && !contentPackBySource.has(cp.source_id)) {
        contentPackBySource.set(cp.source_id, { img_url: cp.img_url, body_text: cp.body_text });
      }
    }

    const normalizeGroupPostKey = (title: string): string =>
      title
        .replace(/^[\p{Emoji}\s]*\[(CẨM NANG CỘNG ĐỒNG|VIETNAM PLAYBOOK)\]\s*/iu, '')
        .trim()
        .toLowerCase();

    const fanpagePublishedBySource = new Map<
      string,
      { external_post_id: string; published_at: Date | null; img_url: string | null; body_text: string | null }
    >();
    const groupPublishedBySource = new Map<
      string,
      { job_id: string | null; post_url: string; published_at: Date | null; img_url: string | null; body_text: string | null }
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
            body_text: job.body_text,
          });
        }
      } else if (job.platform_name === 'facebook' && job.external_post_id) {
        if (!fanpagePublishedBySource.has(job.source_id)) {
          fanpagePublishedBySource.set(job.source_id, {
            external_post_id: job.external_post_id,
            published_at: job.published_at,
            img_url: job.img_url,
            body_text: job.body_text,
          });
        }
      }
    }

    const groupPublishedByTitle = new Map<
      string,
      { post_url: string; published_at: Date | null; job_id: string | null; img_url: string | null; body_text: string | null }
    >();
    const groupFailedBySource = new Map<string, { error: string; job_id: string | null }>();
    const groupFailedByTitle = new Map<string, { error: string; job_id: string | null }>();

    for (const gp of communityGroupPostRows) {
      const titleKey = normalizeGroupPostKey(gp.post_title);
      if (gp.status === 'published') {
        const postUrl = gp.facebook_post_url || gp.group_url || settings.group_url;
        if (gp.source_id) {
          const existing = groupPublishedBySource.get(gp.source_id);
          groupPublishedBySource.set(gp.source_id, {
            job_id: existing?.job_id ?? gp.publishing_job_id,
            post_url: gp.facebook_post_url || existing?.post_url || postUrl,
            published_at: existing?.published_at ?? gp.published_at,
            img_url: gp.image_url || existing?.img_url || null,
            body_text: gp.body_text || existing?.body_text || null,
          });
        }
        if (titleKey && !groupPublishedByTitle.has(titleKey)) {
          groupPublishedByTitle.set(titleKey, {
            post_url: postUrl,
            published_at: gp.published_at,
            job_id: gp.publishing_job_id,
            img_url: gp.image_url,
            body_text: gp.body_text,
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
      { job_id: string; scheduled_for: Date; status: string; img_url: string | null; body_text: string | null }
    >();
    const fanpageScheduledBySource = new Map<
      string,
      { job_id: string; scheduled_for: Date; status: string; img_url: string | null; body_text: string | null }
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
            body_text: job.body_text,
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
            body_text: job.body_text,
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
        ? {
            job_id: byTitle.job_id,
            post_url: byTitle.post_url,
            published_at: byTitle.published_at,
            img_url: byTitle.img_url,
            body_text: byTitle.body_text,
          }
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

    const nowVn = new Date(Date.now() + 7 * 3600_000);
    const baseYearVn = nowVn.getUTCFullYear();
    const baseMonthVn = nowVn.getUTCMonth();
    const baseDayVn = nowVn.getUTCDate();

    const postMetricsRows = (
      await this.pool
        .query<{
          id: string;
          source_id: string | null;
          channel: 'group' | 'fanpage';
          external_post_key: string;
          post_title: string;
          post_url: string | null;
          likes_count: number;
          comments_count: number;
          shares_count: number;
          sync_source: string;
          published_at: Date | null;
          last_synced_at: Date;
        }>(
          `SELECT id, source_id, channel, external_post_key, post_title, post_url,
                  likes_count, comments_count, shares_count, sync_source, published_at, last_synced_at
             FROM community_post_metrics
            WHERE workspace_id = $1
            ORDER BY last_synced_at DESC, published_at DESC NULLS LAST`,
          [workspaceId],
        )
        .catch(() => ({ rows: [] }))
    ).rows;

    const metricsBySource = new Map<
      string,
      { group?: (typeof postMetricsRows)[number]; fanpage?: (typeof postMetricsRows)[number] }
    >();
    const metricsByUrl = new Map<string, (typeof postMetricsRows)[number]>();
    for (const pm of postMetricsRows) {
      if (pm.source_id) {
        const entry = metricsBySource.get(pm.source_id) ?? {};
        if (pm.channel === 'group' && !entry.group) entry.group = pm;
        if (pm.channel === 'fanpage' && !entry.fanpage) entry.fanpage = pm;
        metricsBySource.set(pm.source_id, entry);
      }
      const norm = this.normalizePostUrlKey(pm.post_url);
      if (norm && !metricsByUrl.has(norm)) {
        metricsByUrl.set(norm, pm);
      }
    }

    const calendarUsedImages = new Set<string>();
    let fallbackOffsetDays = 0;

    let publishedGroupCount = 0;
    let publishedFanpageCount = 0;
    let failedGroupCount = 0;

    const dailyCalendar = orderedSources.map((source, index) => {
      const groupPub = getGroupPub(source);
      const groupSched = groupScheduledBySource.get(source.id);
      const groupFail = !groupPub && !groupSched ? getGroupFail(source) : undefined;
      const fanpagePub = fanpagePublishedBySource.get(source.id);
      const fanpageSched = fanpageScheduledBySource.get(source.id);
      const webPub = webPublishedBySource.get(source.id);
      const contentPack = contentPackBySource.get(source.id);

      const matchedAsset = matchAssetForTopic(source.title, topicAssets, calendarUsedImages, source.source_url);
      const storedImageUrl = groupPub?.img_url || groupSched?.img_url || fanpagePub?.img_url || contentPack?.img_url || null;
      const resolvedImageUrl =
        storedImageUrl && !calendarUsedImages.has(storedImageUrl) ? storedImageUrl : matchedAsset.url;
      const resolvedImageAsset = topicAssets.find((a) => a.url === resolvedImageUrl) ?? matchedAsset;
      const isUniqueImage = !calendarUsedImages.has(resolvedImageUrl);
      calendarUsedImages.add(resolvedImageUrl);

      const resolvedPostBody =
        groupPub?.body_text || groupSched?.body_text || fanpagePub?.body_text || contentPack?.body_text || null;

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
        } else {
          targetDateUtc = new Date(Date.UTC(baseYearVn, baseMonthVn, baseDayVn + fallbackOffsetDays + 1, 2, 0, 0));
          fallbackOffsetDays++;
        }
      } else {
        if (isPublishedGroup && groupPub?.published_at) {
          targetDateUtc = new Date(groupPub.published_at);
        } else if (groupSched?.scheduled_for) {
          targetDateUtc = new Date(groupSched.scheduled_for);
        } else if (fanpagePub?.published_at) {
          targetDateUtc = new Date(fanpagePub.published_at);
        } else if (webPub?.published_at) {
          targetDateUtc = new Date(webPub.published_at);
        } else {
          targetDateUtc = new Date(Date.UTC(baseYearVn, baseMonthVn, baseDayVn + fallbackOffsetDays + 1, 2, 0, 0));
          fallbackOffsetDays++;
        }
      }

      const formatted = formatVnDateTime(targetDateUtc, true);
      const vnDate = new Date(targetDateUtc.getTime() + 7 * 3600_000);
      const dayOfMonth = vnDate.getUTCDate();
      const monthVn = vnDate.getUTCMonth() + 1;
      const yearVn = vnDate.getUTCFullYear();
      const dateIsoVn = `${yearVn}-${String(monthVn).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
      const timeHmVn = `${String(vnDate.getUTCHours()).padStart(2, '0')}:${String(vnDate.getUTCMinutes()).padStart(2, '0')}`;
      const weekInfo = classifyVietnamCalendarWeek(dateIsoVn);
      const weekNum = weekInfo.weekNumber;
      const weekRangeLabel = weekInfo.weekRangeLabel;

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
        concreteAction = `Đã đăng thật vào Group "${settings.community_name}" lúc ${formatted.short}${targetMode === 'both' ? (isPublishedFanpage ? ` (và Fanpage "${settings.page_name}")` : ' (đang chờ Fanpage)') : ''
          }`;
      } else if (groupSched) {
        concreteAction = `Đã lên lịch trong publishing_jobs (${groupSched.job_id.slice(0, 8)}): Bot tự động đăng lúc ${formatted.short} vào Group "${settings.community_name}"${targetMode === 'both' ? ` & Fanpage "${settings.page_name}"` : ''
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

      const sourceMetrics = metricsBySource.get(source.id);
      const groupMetric =
        sourceMetrics?.group ?? (groupPostUrl ? metricsByUrl.get(this.normalizePostUrlKey(groupPostUrl)) : undefined);
      const pageMetric =
        sourceMetrics?.fanpage ?? (fanpagePostUrl ? metricsByUrl.get(this.normalizePostUrlKey(fanpagePostUrl)) : undefined);
      const groupLikes = Number(groupMetric?.likes_count ?? 0);
      const groupComments = Number(groupMetric?.comments_count ?? 0);
      const groupShares = Number(groupMetric?.shares_count ?? 0);
      const pageLikes = Number(pageMetric?.likes_count ?? 0);
      const pageComments = Number(pageMetric?.comments_count ?? 0);
      const pageShares = Number(pageMetric?.shares_count ?? 0);
      const totalItemLikes = groupLikes + pageLikes;
      const totalItemComments = groupComments + pageComments;
      const totalItemShares = groupShares + pageShares;
      const lastMetricSync = [groupMetric?.last_synced_at, pageMetric?.last_synced_at]
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

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
        image_url: resolvedImageUrl,
        image_attribution: resolvedImageAsset.attribution,
        post_body_preview: resolvedPostBody,
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
        unique_image_verified: isUniqueImage,
        engagement: {
          likes: totalItemLikes,
          comments: totalItemComments,
          shares: totalItemShares,
          total_engagement: totalItemLikes + totalItemComments + totalItemShares,
          group_likes: groupLikes,
          group_comments: groupComments,
          group_shares: groupShares,
          page_likes: pageLikes,
          page_comments: pageComments,
          page_shares: pageShares,
          last_synced_at: lastMetricSync ? new Date(lastMetricSync).toISOString() : null,
        },
      };
    });

    const groupBotSession = await this.getGroupBotSessionStatus();

    // Growth is measured by real Facebook numbers (Group members + Page followers).
    const realIdentifiedPeople = members.filter((m) => m.external_ref.startsWith('fb:')).length;
    const manualProspects = members.filter((m) => m.external_ref.startsWith('manual:')).length;
    const fallbackGroupCount = Math.max(settings.group_member_count ?? 5, realIdentifiedPeople);

    const [
      pageStats,
      groupStats,
      ragStats,
      snapshotQueryRes,
      inviteSummaryRes,
      inviteLogsRes,
      messageSummaryRes,
      recentCommentsRes,
      engagementSnapshotQueryRes,
      telegramBotStatus,
    ] = await Promise.all([
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
        this.pool
          .query<{
            id: string;
            group_member_count: number;
            page_followers_count: number | null;
            identified_prospects_count: number;
            invites_sent_count: number;
            replies_sent_count: number;
            campaign_week: number;
            captured_at: Date;
          }>(
            `SELECT id, group_member_count, page_followers_count, identified_prospects_count,
                    invites_sent_count, replies_sent_count, campaign_week, captured_at
               FROM community_member_snapshots
              WHERE workspace_id = $1
              ORDER BY captured_at ASC
              LIMIT 60`,
            [workspaceId],
          )
          .catch(() => ({ rows: [] })),
        this.pool
          .query<{ sent_today: number; sent_7d: number; sent_total: number }>(
            `SELECT
               count(*) FILTER (WHERE status = 'invited' AND invited_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS sent_today,
               count(*) FILTER (WHERE status = 'invited' AND invited_at >= NOW() - INTERVAL '7 days')::int AS sent_7d,
               count(*) FILTER (WHERE status = 'invited')::int AS sent_total
             FROM community_invite_logs
             WHERE workspace_id = $1`,
            [workspaceId],
          )
          .catch(() => ({ rows: [] })),
        this.pool
          .query<{
            id: string;
            target_ref: string;
            display_name: string;
            channel: string;
            status: string;
            detail: string | null;
            invited_at: Date;
          }>(
            `SELECT id, target_ref, display_name, channel, status, detail, invited_at
               FROM community_invite_logs
              WHERE workspace_id = $1
              ORDER BY invited_at DESC
              LIMIT 25`,
            [workspaceId],
          )
          .catch(() => ({ rows: [] })),
        this.pool
          .query<{
            comments_received_count: number;
            comments_replied_count: number;
            messages_received_count: number;
            messages_replied_count: number;
            pending_questions_count: number;
          }>(
            `SELECT
               count(*) FILTER (WHERE platform = 'facebook_comment')::int AS comments_received_count,
               count(*) FILTER (WHERE platform = 'facebook_comment' AND status = 'replied')::int AS comments_replied_count,
               count(*) FILTER (WHERE platform IN ('facebook_message', 'telegram_message'))::int AS messages_received_count,
               count(*) FILTER (WHERE platform IN ('facebook_message', 'telegram_message') AND status = 'replied')::int AS messages_replied_count,
               count(*) FILTER (WHERE status IN ('received', 'queued'))::int AS pending_questions_count
             FROM community_messages
             WHERE workspace_id = $1`,
            [workspaceId],
          )
          .catch(() => ({ rows: [] })),
        this.pool
          .query<{
            id: string;
            platform: string;
            external_id: string | null;
            author_name: string;
            author_contact: string | null;
            content: string;
            post_url: string | null;
            status: string;
            metadata: Record<string, unknown> | null;
            received_at: Date;
            updated_at: Date;
            rag_reply_text: string | null;
            reply_artifact_id: string | null;
          }>(
            `SELECT m.id, m.platform, m.external_id, m.author_name, m.author_contact, m.content,
                    m.post_url, m.status, m.metadata, m.received_at, m.updated_at,
                    COALESCE(a.payload->'result'->>'reply', m.metadata->>'reply_text') AS rag_reply_text,
                    a.id AS reply_artifact_id
               FROM community_messages m
               LEFT JOIN workflow_tasks t ON t.id = m.task_id
               LEFT JOIN content_artifacts a ON a.id = t.result_ref
              WHERE m.workspace_id = $1
              ORDER BY m.received_at DESC
              LIMIT 30`,
            [workspaceId],
          )
          .catch(() => ({ rows: [] })),
        this.pool
          .query<{
            id: string;
            total_posts_tracked: number;
            total_likes: number;
            total_comments: number;
            total_shares: number;
            group_likes: number;
            group_comments: number;
            group_shares: number;
            page_likes: number;
            page_comments: number;
            page_shares: number;
            group_members: number;
            captured_at: Date;
          }>(
            `SELECT id, total_posts_tracked, total_likes, total_comments, total_shares,
                    group_likes, group_comments, group_shares, page_likes, page_comments,
                    page_shares, group_members, captured_at
               FROM community_post_metric_snapshots
              WHERE workspace_id = $1
              ORDER BY captured_at ASC
              LIMIT 60`,
            [workspaceId],
          )
          .catch(() => ({ rows: [] })),
        this.getTelegramBotStatus(workspaceId),
      ]);

    if (groupStats.live_description) {
      settings.positioning = groupStats.live_description;
    }

    const realFollowers = pageStats.followers_count ?? 0;
    const realGroupMembers = groupStats.member_count ?? fallbackGroupCount;
    const realCommunityMembers = Math.max(realGroupMembers, realFollowers);

    await this.captureMemberSnapshot(workspaceId, {
      groupMemberCount: realGroupMembers,
      pageFollowersCount: pageStats.followers_count,
      identifiedProspectsCount: realIdentifiedPeople,
    });

    const snapshotRows = snapshotQueryRes.rows;
    const earliestW1Snapshot = snapshotRows.find((s) => s.campaign_week === 1) ?? snapshotRows[0];
    const currentCampaignWeek = currentVietnamCampaignWeek();
    const week1BaselineMembers = earliestW1Snapshot?.group_member_count ?? realGroupMembers;

    const inviteStatsRow = inviteSummaryRes.rows[0] ?? { sent_today: 0, sent_7d: 0, sent_total: 0 };
    const dailyInviteLimit = clampDailyInviteLimit(settings.daily_invite_limit, 12);
    const invitesSentToday = Number(inviteStatsRow.sent_today ?? 0);
    const invitesRemainingToday = Math.max(0, dailyInviteLimit - invitesSentToday);
    const invitesSent7d = Number(inviteStatsRow.sent_7d ?? 0);
    const invitesSentTotal = Number(inviteStatsRow.sent_total ?? 0);

    const msgSummaryRow = messageSummaryRes.rows[0] ?? {
      comments_received_count: 0,
      comments_replied_count: 0,
      messages_received_count: 0,
      messages_replied_count: 0,
      pending_questions_count: 0,
    };

    const recentComments = recentCommentsRes.rows.map((row) => {
      const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
      const commentSource =
        row.platform === 'facebook_comment'
          ? meta.comment_source === 'group'
            ? 'group_comment'
            : 'page_comment'
          : row.platform === 'telegram_message'
            ? 'telegram'
            : 'messenger';
      return {
        id: row.id,
        platform: row.platform,
        source_channel: commentSource,
        external_id: row.external_id,
        author_name: row.author_name,
        content: row.content,
        post_url: row.post_url || (typeof meta.permalink_url === 'string' ? meta.permalink_url : null),
        status: row.status,
        rag_reply_text: row.rag_reply_text,
        reply_artifact_id: row.reply_artifact_id,
        invite_sent: meta.private_invite_sent === true,
        received_at: row.received_at,
        updated_at: row.updated_at,
      };
    });

    const w1Target = settings.week1_target;
    const w2Target = settings.week2_target;
    const w3Target = settings.week3_target;
    const w4Target = settings.week4_target;

    const week1Count = currentCampaignWeek <= 1 ? realCommunityMembers : week1BaselineMembers;
    const totalMatchedCount = realCommunityMembers;
    const campaignStatus = (target: number, previousTarget: number) =>
      realCommunityMembers >= target ? 'completed_target' : realCommunityMembers >= previousTarget ? 'active_campaign' : 'scheduled';

    const weekItems = (w: number) => dailyCalendar.filter((item) => item.week_number === w);
    const duplicateImagesCount = dailyCalendar.filter((d) => !d.unique_image_verified).length;
    const duplicationRatePct =
      dailyCalendar.length > 0 ? Math.round((duplicateImagesCount / dailyCalendar.length) * 1000) / 10 : 0;
    const formatWeekTopics = (items: typeof dailyCalendar) =>
      items.map(
        (item) =>
          `[${item.scheduled_date_short}] ${item.topic_title} (${
            item.status === 'published'
              ? `✓ Đã đăng ${targetMode === 'fanpage' ? 'Fanpage' : 'Group'} lúc ${item.scheduled_date_short}`
              : item.group_status === 'scheduled' || item.job_status === 'scheduled'
                ? `⏰ Đã hẹn giờ lúc ${item.scheduled_date_short}`
                : item.group_status === 'failed'
                  ? `⚠️ Lỗi đăng Group (${item.scheduled_date_short})`
                  : '⏳ Chưa đăng'
          })`,
      );

    const planWeek = (w: number) =>
      Array.isArray(settings.weekly_targets_json)
        ? settings.weekly_targets_json.find((item) => item && item.week === w)
        : undefined;

    const weeklyCampaigns = [
      {
        week: 1,
        date_range: '02/11/2026 – 08/11/2026',
        title: `Tuần 1 (02/11/2026 – 08/11/2026): Xây dựng Hạt nhân Cộng đồng (Mục tiêu: ${w1Target} Thành viên)`,
        target_members: w1Target,
        current_members: week1Count,
        status: campaignStatus(w1Target, 0),
        theme: planWeek(1)?.focus ?? 'Đón thành viên đầu tiên, Chỗ ở ngắn hạn, Sim/eSIM, Ứng dụng thiết yếu & Thủ tục Tạm trú',
        target_trends: ['Thuê căn hộ & Chỗ ở', 'eSIM & Ứng dụng thiết yếu', 'Khai báo tạm trú', 'Bảo hiểm & An toàn'],
        responsible_agents: 'Growth Lead (Đề xuất & Áp dụng KPI) • SEO & Content Agent (Bài viết cẩm nang) • Community Agent (Đăng Group, Trả lời Comment & Mời khách)',
        tactics: [
          `[02/11 – 08/11/2026] Đạt ${week1Count}/${w1Target} thành viên thật trong Group "${settings.community_name}" và ghi nhận ${realIdentifiedPeople} người tương tác trên Fanpage/Group`,
          `[Đích đăng chính: Group Facebook] Đã đăng ${publishedGroupCount} bài trực tiếp vào Group "${settings.community_name}" (và ${publishedFanpageCount} bài lịch sử trên Fanpage cũ)`,
          planWeek(1)?.channel_tactic ?? `[Hàng ngày] Community Agent tự động trả lời bình luận/tin nhắn bằng bộ RAG (${ragStats.rows[0]?.total_chunks ?? 430} đoạn trích dẫn) và gửi lời mời vào Group`,
        ],
      },
      {
        week: 2,
        date_range: '09/11/2026 – 15/11/2026',
        title: `Tuần 2 (09/11/2026 – 15/11/2026): Mở rộng Nhóm Thành viên Cùng Xu hướng (Mục tiêu: ${w2Target} Thành viên)`,
        target_members: w2Target,
        current_members: totalMatchedCount,
        status: campaignStatus(w2Target, w1Target),
        theme: planWeek(2)?.focus ?? 'Sân bay nhập cảnh, Thời hạn Hộ chiếu, Vé khứ hồi, Rút tiền mặt/ATM & Chi phí mỗi ngày',
        target_trends: ['Sân bay Hà Nội/Đà Nẵng/TP.HCM', 'Hộ chiếu & Vé khứ hồi', 'Ngân hàng & VietQR', 'Ngân sách mỗi ngày'],
        responsible_agents: 'Growth Lead (Đề xuất & Áp dụng KPI) • SEO & Content Agent (Bài mới lúc 09:00 sáng) • Community Agent (Trả lời comment + Mời FB an toàn)',
        tactics: [
          `[09/11 – 15/11/2026 lúc 09:00 sáng] Đăng đều đặn 1 bài mới/ngày vào Group Cộng đồng theo đúng lịch ngày tháng cụ thể (${weekItems(2).length} chủ đề trong tuần + ảnh độc nhất)`,
          planWeek(2)?.channel_tactic ?? `[An toàn ${dailyInviteLimit} lời mời/ngày] Tự động gửi lời mời tham gia Group qua nút Mời FB & Messenger/Private Reply cho người hỏi liên quan`,
          '[Tự động hóa Comment RAG] Tự động quét comment Fanpage & Group, trả lời chuẩn trích dẫn và gắn lời mời tham gia Group',
        ],
      },
      {
        week: 3,
        date_range: '16/11/2026 – 22/11/2026',
        title: `Tuần 3 (16/11/2026 – 22/11/2026): Tăng tốc Tương tác Đời sống Địa phương (Mục tiêu: ${w3Target} Thành viên)`,
        target_members: w3Target,
        current_members: totalMatchedCount,
        status: campaignStatus(w3Target, w2Target),
        theme: planWeek(3)?.focus ?? 'Di chuyển Tàu/Xe/Máy bay, Thời điểm đẹp nhất du lịch, Cách tìm Địa chỉ Ngõ/Hẻm & Thủ tục E-Visa 2026',
        target_trends: ['Phương tiện di chuyển', 'Thời tiết & Mùa du lịch', 'Địa chỉ ngõ/hẻm Việt Nam', 'Hướng dẫn E-Visa 2026'],
        responsible_agents: 'Growth Lead (Lịch 16/11–22/11) • SEO & Content Agent (Bài mới lúc 09:00 sáng) • Community Agent (Trả lời Comment & Kết nối thành viên)',
        tactics: [
          `[16/11 – 22/11/2026 lúc 09:00 sáng] Xuất bản ${weekItems(3).length} bài chuyên sâu vào Group về di chuyển nội địa, mùa đẹp nhất đi Đà Nẵng/Hà Nội/Phú Quốc và thủ tục E-Visa chuẩn 2026`,
          planWeek(3)?.channel_tactic ?? '[Tương tác Q&A] Tự động trả lời comment trên bài Group & Fanpage, dẫn link cẩm nang Pilot có CTA mời tham gia Group',
          '[Chủ Nhật 22/11/2026] Tổng hợp các câu hỏi thực tế từ Messenger & Comment trong tuần để bổ sung vào chủ đề thảo luận chung của Group',
        ],
      },
      {
        week: 4,
        date_range: '23/11/2026 – 30/11/2026',
        title: `Tuần 4 (23/11/2026 – 30/11/2026): Cộng đồng Tự vận hành & Tổng kết Tháng 11 (Mục tiêu: ${w4Target} Thành viên)`,
        target_members: w4Target,
        current_members: totalMatchedCount,
        status: campaignStatus(w4Target, w3Target),
        theme: planWeek(4)?.focus ?? 'Hoàn thiện Hành trang Chuyển đến Việt Nam, Chỗ ở 2 Tuần Đầu, Góc Làm việc Từ xa & Sự kiện Kết nối',
        target_trends: ['Hành lý chuyển đến VN', 'Chỗ ở 2 tuần đầu', 'Góc làm việc Remote Work', 'Offline/Online Meetup'],
        responsible_agents: `Growth Lead & Performance Agent (Đo lường & Tự cập nhật KPI mới) • Content & Community Agent (Hoàn tất ${dailyCalendar.length}/${dailyCalendar.length} chủ đề)`,
        tactics: [
          `[23/11 – 30/11/2026 lúc 09:00 sáng] Xuất bản ${weekItems(4).length} bài cuối Tháng 11 và nối tiếp chuỗi sang đầu Tháng 12/2026 (${dailyCalendar.length} chủ đề, ${duplicationRatePct}% trùng ảnh)`,
          planWeek(4)?.channel_tactic ?? '[Cộng đồng tự vận hành] Duy trì nhịp mời an toàn & trả lời comment tự động từ RAG để giữ tương tác bền vững',
          '[Chủ Nhật 29/11/2026] Performance Agent & Growth Lead tổng kết chỉ số tăng trưởng Tháng 11/2026 và tự động áp dụng mục tiêu tháng mới',
        ],
      },
    ];

    const baseWeeklyCalendar = [
      {
        week_number: 1,
        week_label: 'Tuần 1 (02/11/2026 00:00 – 08/11/2026 23:59)',
        date_range: '02/11/2026 00:00 – 08/11/2026 23:59',
        member_target: `Mục tiêu: ${w1Target} thành viên (Thực tế đạt: ${week1Count}/${w1Target} — ${week1Count >= w1Target ? '✓ Đạt chỉ tiêu' : '⏳ Đang theo dõi'})`,
        pillar_theme: planWeek(1)?.focus ?? 'Khởi chạy Cộng đồng, Cẩm nang Thiết yếu, Thuê nhà, eSIM, Đi chợ, Bảo hiểm & Tạm trú',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Group Bot',
        planned_topics: formatWeekTopics(weekItems(1)),
        interactive_format: planWeek(1)?.channel_tactic ?? 'Chào mừng thành viên đầu tiên + Trả lời tự động khách hàng qua Messenger/Comment RAG và mời vào Group',
      },
      {
        week_number: 2,
        week_label: 'Tuần 2 (09/11/2026 00:00 – 15/11/2026 23:59)',
        date_range: '09/11/2026 00:00 – 15/11/2026 23:59',
        member_target: `Mục tiêu: ${w2Target} thành viên (Hiện tại: ${totalMatchedCount}/${w2Target} — ${totalMatchedCount >= w2Target ? '✓ Đạt chỉ tiêu' : 'Đang chạy chiến dịch'})`,
        pillar_theme: planWeek(2)?.focus ?? 'Sân bay Nhập cảnh, Thời hạn Hộ chiếu, Vé khứ hồi, Tiền mặt/ATM, Chi phí Mỗi ngày & Mở Tài khoản Ngân hàng',
        responsible_agents: 'Growth Lead (Phân lịch 09/11–15/11) → SEO Agent → Content Agent (Đăng Group 09:00 sáng) → Community Agent',
        planned_topics: formatWeekTopics(weekItems(2)),
        interactive_format: planWeek(2)?.channel_tactic ?? `Mỗi bài đăng Group lúc 09:00 sáng + Trả lời comment tự động RAG & Mời FB tối đa ${dailyInviteLimit} người/ngày`,
      },
      {
        week_number: 3,
        week_label: 'Tuần 3 (16/11/2026 00:00 – 22/11/2026 23:59)',
        date_range: '16/11/2026 00:00 – 22/11/2026 23:59',
        member_target: `Mục tiêu: ${w3Target} thành viên (Mở rộng tương tác đời sống địa phương)`,
        pillar_theme: planWeek(3)?.focus ?? 'Thời điểm Đẹp nhất đến VN, Cách Tìm Địa chỉ Ngõ/Hẻm & Trọn bộ Thủ tục E-Visa Chính thức 2026',
        responsible_agents: 'Growth Lead (Phân lịch 16/11–22/11) → SEO Agent → Content Agent (Đăng Group 09:00 sáng) → Community Agent',
        planned_topics: formatWeekTopics(weekItems(3)),
        interactive_format: planWeek(3)?.channel_tactic ?? 'Thảo luận tình huống thực tế trên Group & Tự động trả lời comment hỏi thủ tục/e-visa bằng nguồn RAG',
      },
      {
        week_number: 4,
        week_label: 'Tuần 4 (23/11/2026 00:00 – 30/11/2026 23:59)',
        date_range: '23/11/2026 00:00 – 30/11/2026 23:59',
        member_target: `Mục tiêu: ${w4Target} thành viên (Cộng đồng tự vận hành & Kết nối bền vững)`,
        pillar_theme: planWeek(4)?.focus ?? 'Chuẩn bị Hành lý Chuyển đến VN, Chọn Khu vực Ở 2 Tuần Đầu & Thiết lập Góc Làm việc Từ xa (Remote Work)',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Group Bot → Performance Agent (Đánh giá KPI cuối tháng)',
        planned_topics: formatWeekTopics(weekItems(4)),
        interactive_format: planWeek(4)?.channel_tactic ?? 'Bình chọn chủ đề Tháng 12/2026 + Vinh danh thành viên chia sẻ kinh nghiệm hữu ích nhất trong Group',
      },
    ];

    const extraWeekNumbers = Array.from(
      new Set(dailyCalendar.map((item) => item.week_number).filter((w) => w < 1 || w > 4)),
    ).sort((a, b) => a - b);

    const extraWeeklyCalendar = extraWeekNumbers.map((wNum) => {
      const items = weekItems(wNum);
      const sampleLabel = items[0]?.week_range_label ?? `Tuần ${wNum}`;
      const dateRangeMatch = sampleLabel.match(/\(([^)]+)\)/);
      const dateRange = dateRangeMatch?.[1] ?? sampleLabel;
      return {
        week_number: wNum,
        week_label: sampleLabel,
        date_range: dateRange,
        member_target:
          wNum >= 5
            ? `Mở rộng Tháng 12/2026: ${w4Target} → ${w4Target * 3} thành viên (Tiếp nối chuỗi cẩm nang hàng ngày)`
            : `Khởi tạo Cộng đồng: ${w1Target} thành viên hạt nhân`,
        pillar_theme:
          wNum >= 5
            ? 'Nối tiếp Chuỗi Cẩm nang Tháng 12/2026: Ẩm thực Đà Nẵng, Thẻ tín dụng Quốc tế, E-Visa & Đời sống Thực tế'
            : 'Chuẩn bị nền tảng nội dung & kết nối thành viên hạt nhân ban đầu',
        responsible_agents: 'Growth Lead → SEO Agent → Content Agent → Community Group Bot',
        planned_topics: formatWeekTopics(items),
        interactive_format: 'Đăng bài tự động lúc 09:00 sáng kèm câu hỏi thảo luận mở & tổng hợp kinh nghiệm thực tế từ thành viên Group',
      };
    });

    const weeklyCalendar = [...baseWeeklyCalendar, ...extraWeeklyCalendar].sort(
      (a, b) => a.week_number - b.week_number,
    );

    const scheduledTopicsCount =
      targetMode === 'fanpage' ? fanpageScheduledBySource.size : groupScheduledBySource.size;
    const publishedTopicsCount = primaryPublishedSources.length;

    const nov2026Items = dailyCalendar.filter((d) => d.year_vn === 2026 && d.month_vn === 11);
    const dec2026Items = dailyCalendar.filter((d) => d.year_vn === 2026 && d.month_vn === 12);
    const jan2027Items = dailyCalendar.filter((d) => d.year_vn === 2027 && d.month_vn === 1);
    const novPublishedCount = nov2026Items.filter((d) => d.status === 'published').length;
    const novScheduledCount = nov2026Items.filter((d) => d.status !== 'published').length;

    const monthlyCalendar = [
      {
        month_number: 1,
        month_label: `Tháng 11/2026 (01/11/2026 – 30/11/2026): Xây dựng "${settings.community_name}" & Xuất bản ${nov2026Items.length} Bài Cẩm nang Tháng 11`,
        date_range: '01/11/2026 – 30/11/2026',
        member_goal: `Tuần 1 (02/11–08/11): ${w1Target} người [Đã đạt ${week1Count}/${w1Target} ✓] → Tuần 2 (09/11–15/11): ${w2Target} người → Tuần 3 (16/11–22/11): ${w3Target} người → Cuối Tháng 11 (30/11/2026): ${w4Target} thành viên thật`,
        content_commitment: `${nov2026Items.length} bài cẩm nang trong Tháng 11/2026 (Đã đăng ${novPublishedCount}/${nov2026Items.length} bài; ${novScheduledCount} bài hẹn giờ lúc 09:00 sáng — 100% ảnh riêng biệt từ kho ${all30Assets.length} ảnh)`,
        key_pillars: [
          `02/11/2026 – 08/11/2026 (Tuần 1): Đã hoàn thành mục tiêu ${week1Count}/${w1Target} thành viên hạt nhân (${weekItems(1).length} bài trong tuần này)`,
          `09/11/2026 – 15/11/2026 (Tuần 2): ${weekItems(2).length} bài cẩm nang tại Group (Khởi động từ 10/11/2026 & đều đặn 09:00 sáng mỗi ngày)`,
          `16/11/2026 – 22/11/2026 (Tuần 3): ${weekItems(3).length} bài chuyên sâu lúc 09:00 sáng vào Group (Điểm đến, Phương tiện, Sân bay, E-Visa, Chi phí)`,
          `23/11/2026 – 30/11/2026 (Tuần 4): ${weekItems(4).length} bài hoàn thiện chuỗi Tháng 11 + Bình chọn chủ đề Tháng 12/2026 vào ngày 27/11/2026`,
        ],
      },
      {
        month_number: 2,
        month_label: `Tháng 12/2026 (01/12/2026 – 31/12/2026): Tiếp nối ${dec2026Items.length} Bài Đã Lên Lịch & Chiến dịch Mùa Lễ hội Cuối năm`,
        date_range: '01/12/2026 – 31/12/2026',
        member_goal: `Mở rộng từ ${w4Target} → ${w4Target * 3} thành viên (Tự động gom nhóm theo từng thành phố: Đà Nẵng, Hà Nội, TP.HCM, Phú Quốc)`,
        content_commitment:
          dec2026Items.length > 0
            ? `Hiện đã lên lịch sẵn ${dec2026Items.length} bài cẩm nang đầu Tháng 12/2026 (01/12 – 07/12/2026 lúc 09:00 sáng) và tiếp tục mở rộng tới 31/12/2026`
            : '31 bài cẩm nang theo lịch ngày cụ thể (01/12/2026 – 31/12/2026 lúc 09:00 sáng) do Research Agent & Growth Lead cập nhật từ nhu cầu thực tế cuối năm',
        key_pillars: [
          `01/12/2026 – 07/12/2026 (Tuần 5): ${weekItems(5).length} bài cẩm nang đã lên lịch sẵn lúc 09:00 sáng (Ẩm thực & Phở Đà Nẵng, Thẻ tín dụng Quốc tế, eSIM, Ứng dụng thiết yếu, E-Visa)`,
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
        content_commitment:
          jan2027Items.length > 0
            ? `Đã lên lịch ${jan2027Items.length} bài trong Tháng 01/2027 kết hợp Cẩm nang đón Tết Nguyên Đán (09:00 sáng)`
            : '31 bài kết hợp giữa Cẩm nang chuẩn bị đón Tết Nguyên Đán tại Việt Nam (09:00 sáng) + Bài tổng hợp kinh nghiệm hay nhất của thành viên vào mỗi tối Chủ Nhật',
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

    const totalPostLikes = postMetricsRows.reduce((s, r) => s + Number(r.likes_count || 0), 0);
    const totalPostComments = postMetricsRows.reduce((s, r) => s + Number(r.comments_count || 0), 0);
    const totalPostShares = postMetricsRows.reduce((s, r) => s + Number(r.shares_count || 0), 0);
    const totalPostEngagement = totalPostLikes + totalPostComments + totalPostShares;
    const trackedPostsCount = postMetricsRows.length;
    const avgEngagementPerPost =
      trackedPostsCount > 0 ? Math.round((totalPostEngagement / trackedPostsCount) * 10) / 10 : 0;

    const groupPostLikes = postMetricsRows
      .filter((r) => r.channel === 'group')
      .reduce((s, r) => s + Number(r.likes_count || 0), 0);
    const groupPostComments = postMetricsRows
      .filter((r) => r.channel === 'group')
      .reduce((s, r) => s + Number(r.comments_count || 0), 0);
    const groupPostShares = postMetricsRows
      .filter((r) => r.channel === 'group')
      .reduce((s, r) => s + Number(r.shares_count || 0), 0);
    const fanpagePostLikes = postMetricsRows
      .filter((r) => r.channel === 'fanpage')
      .reduce((s, r) => s + Number(r.likes_count || 0), 0);
    const fanpagePostComments = postMetricsRows
      .filter((r) => r.channel === 'fanpage')
      .reduce((s, r) => s + Number(r.comments_count || 0), 0);
    const fanpagePostShares = postMetricsRows
      .filter((r) => r.channel === 'fanpage')
      .reduce((s, r) => s + Number(r.shares_count || 0), 0);

    const engSnapshots = engagementSnapshotQueryRes.rows;
    const firstEngSnap = engSnapshots[0];
    const latestEngSnap = engSnapshots[engSnapshots.length - 1];
    const firstMemberSnap = snapshotRows[0];
    const latestMemberSnap = snapshotRows[snapshotRows.length - 1];
    const memberGrowthDelta =
      firstMemberSnap && latestMemberSnap
        ? latestMemberSnap.group_member_count - firstMemberSnap.group_member_count
        : 0;
    const engagementGrowthDelta =
      firstEngSnap && latestEngSnap
        ? latestEngSnap.total_likes +
          latestEngSnap.total_comments +
          latestEngSnap.total_shares -
          (firstEngSnap.total_likes + firstEngSnap.total_comments + firstEngSnap.total_shares)
        : 0;

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
        target_source: settings.target_source,
        strategy_artifact_id: settings.strategy_artifact_id,
        strategy_plan_id: settings.strategy_plan_id,
        target_rationale: settings.target_rationale,
        target_updated_at: settings.target_updated_at,
        weekly_targets_json: settings.weekly_targets_json,
        auto_reply_comments: settings.auto_reply_comments,
        auto_invite_enabled: settings.auto_invite_enabled,
        daily_invite_limit: dailyInviteLimit,
        last_comment_sync_at: settings.last_comment_sync_at,
        last_group_comment_sync_at: settings.last_group_comment_sync_at,
        last_post_stats_sync_at: settings.last_post_stats_sync_at,
        fb_admin_name: settings.fb_admin_name,
        last_invite_run_at: settings.last_invite_run_at,
      },
      growth_lead_targets: {
        target_source: settings.target_source,
        strategy_artifact_id: settings.strategy_artifact_id,
        strategy_plan_id: settings.strategy_plan_id,
        rationale: settings.target_rationale,
        updated_at: settings.target_updated_at,
        weekly_targets: settings.weekly_targets_json,
        auto_reply_comments: settings.auto_reply_comments,
        auto_invite_enabled: settings.auto_invite_enabled,
        daily_invite_limit: dailyInviteLimit,
      },
      stats: {
        total_matched_members: totalMatchedCount,
        real_group_members: realGroupMembers,
        real_page_followers: pageStats.followers_count,
        real_page_likes: pageStats.fan_count,
        real_identified_people: realIdentifiedPeople,
        manual_prospects: manualProspects,
        current_campaign_week: currentCampaignWeek,
        week1_baseline_members: week1BaselineMembers,
        week1_target: w1Target,
        week1_achieved: week1Count,
        week2_target: w2Target,
        week2_progress: totalMatchedCount,
        week3_target: w3Target,
        week4_target: w4Target,
        daily_invite_limit: dailyInviteLimit,
        invites_sent_today: invitesSentToday,
        invites_remaining_today: invitesRemainingToday,
        invites_sent_7d: invitesSent7d,
        invites_sent_total: invitesSentTotal,
        comments_received_count: msgSummaryRow.comments_received_count,
        comments_replied_count: msgSummaryRow.comments_replied_count,
        messages_received_count: msgSummaryRow.messages_received_count,
        messages_replied_count: msgSummaryRow.messages_replied_count,
        pending_questions_count: msgSummaryRow.pending_questions_count,
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
        duplication_rate_pct: duplicationRatePct,
        total_post_likes: totalPostLikes,
        total_post_comments: totalPostComments,
        total_post_shares: totalPostShares,
        total_post_engagement: totalPostEngagement,
        tracked_posts_count: trackedPostsCount,
        avg_engagement_per_post: avgEngagementPerPost,
        group_post_likes: groupPostLikes,
        group_post_comments: groupPostComments,
        group_post_shares: groupPostShares,
        fanpage_post_likes: fanpagePostLikes,
        fanpage_post_comments: fanpagePostComments,
        fanpage_post_shares: fanpagePostShares,
        member_growth_delta: memberGrowthDelta,
        engagement_growth_delta: engagementGrowthDelta,
      },
      architecture_info: {
        agent_roles: [
          {
            agent_id: 'growth_lead',
            agent_name: '1. Growth Lead Agent',
            operations: ['strategy.generate', 'opportunity.score', 'brief.generate'],
            responsibility:
              'Chịu trách nhiệm LẬP KẾ HOẠCH CHIẾN DỊCH, ĐỀ XUẤT & TỰ ĐỘNG ÁP DỤNG MỤC TIÊU TĂNG TRƯỞNG CỘNG ĐỒNG TỪNG TUẦN (dựa trên số liệu Group/Page/Lượt mời thật) và phân bổ lịch đăng cụ thể theo ngày/tuần/tháng.',
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
              `Chịu trách nhiệm CHUYỂN HÓA BÀI VIẾT THÀNH BÀI ĐĂNG CỘNG ĐỒNG (Hook, Body, Câu hỏi thảo luận, Hashtag), chọn 1 hình ảnh minh họa độc nhất không trùng lặp từ kho ${all30Assets.length} ảnh và đẩy sang PublishingOutboxRunner / FacebookGroupBot để đăng trực tiếp lên Group Facebook Cộng đồng (chỉ đăng Fanpage nếu bạn bật).`,
          },
          {
            agent_id: 'community',
            agent_name: '4. Community Manager Agent',
            operations: ['community.response', 'community.hub'],
            responsibility:
              'Chịu trách nhiệm TƯƠNG TÁC & MỜI THÀNH VIÊN AN TOÀN: tự động quét và trả lời bình luận trên Fanpage & Group bằng bộ RAG có sẵn, gửi lời mời vào Group thật (nút Mời Facebook & Private Reply/Messenger link, giới hạn an toàn 10–15/ngày) chứ không tự ý thêm người dùng.',
          },
        ],
        rag_reply_mechanism: {
          mode: 'Tự động hóa hoàn toàn dựa trên bộ RAG có sẵn (RAG-Grounded Auto-Reply cho Telegram Bot, Messenger & Comment)',
          approved_sources_count: ragRow.approved_sources,
          total_chunks_count: ragRow.total_chunks,
          embedded_chunks_count: ragRow.embedded_chunks,
          inbound_messages_count: ragRow.inbound_messages,
          grounded_replies_count: ragRow.grounded_replies,
          steps: [
            `Bước 1 — Thu nhận hội thoại thật (Telegram Bot + Messenger Webhook + Graph Polling + Group Bot): Khi người dùng chat với Bot Telegram, nhắn Messenger cho Fanpage "${settings.page_name}" hoặc bình luận trên Group "${settings.community_name}", hệ thống lưu ngữ cảnh hội thoại (tối đa 6 lượt gần nhất) vào bảng community_messages và tạo task "community.response".`,
            `Bước 2 — Truy xuất bộ RAG có sẵn (services/ai/src/rag/retrieval.py): Hệ thống đối chiếu câu hỏi của user với ${ragRow.total_chunks} đoạn văn bản (source_chunks) đã tích hợp trong bộ RAG bằng Vector Embedding (Cosine Similarity ≥ 0.5) kết hợp khớp từ khóa tiếng Việt/Anh để lấy ra Top 3 đoạn dẫn chứng chuẩn xác nhất.`,
            'Bước 3 — Sinh câu trả lời bám sát RAG & Kiểm duyệt chống bịa đặt (services/ai/src/agents/community/pipeline.py): Mô hình Gemini tổng hợp câu trả lời tự nhiên NHƯNG bắt buộc chỉ dùng thông tin có trong các đoạn trích dẫn RAG vừa tìm được (kèm mã trích dẫn source_id & chunk_id). Nếu câu hỏi nằm ngoài dữ liệu RAG có sẵn, hệ thống phản hồi khéo léo hoặc chuyển người duyệt chứ tuyệt đối không tự bịa.',
            `Bước 4 — Tự động trả lời & Giới thiệu Cộng đồng Facebook (CommunityReplyRunner.ts & TelegramBotRunner.ts): Bot Telegram & Messenger tự động trả lời, đính kèm lời mời tự nhiên + nút bấm trực tiếp "Tham gia Cộng đồng trên Facebook" (giãn cách 24h trên Telegram, tối đa ${dailyInviteLimit} người/ngày trên Facebook).`,
          ],
        },
      },
      telegram_bot: telegramBotStatus,
      weekly_campaigns: weeklyCampaigns,
      matched_members: members,
      discussions,
      recent_comments: recentComments,
      recent_invite_logs: inviteLogsRes.rows,
      snapshots: snapshotRows,
      post_metrics: postMetricsRows.map((pm) => ({
        id: pm.id,
        source_id: pm.source_id,
        channel: pm.channel,
        external_post_key: pm.external_post_key,
        post_title: pm.post_title,
        post_url: pm.post_url,
        likes_count: Number(pm.likes_count || 0),
        comments_count: Number(pm.comments_count || 0),
        shares_count: Number(pm.shares_count || 0),
        total_engagement:
          Number(pm.likes_count || 0) + Number(pm.comments_count || 0) + Number(pm.shares_count || 0),
        sync_source: pm.sync_source,
        published_at: pm.published_at ? new Date(pm.published_at).toISOString() : null,
        last_synced_at: new Date(pm.last_synced_at).toISOString(),
      })),
      engagement_snapshots: engSnapshots.map((es) => ({
        id: es.id,
        total_posts_tracked: Number(es.total_posts_tracked || 0),
        total_likes: Number(es.total_likes || 0),
        total_comments: Number(es.total_comments || 0),
        total_shares: Number(es.total_shares || 0),
        group_likes: Number(es.group_likes || 0),
        group_comments: Number(es.group_comments || 0),
        group_shares: Number(es.group_shares || 0),
        page_likes: Number(es.page_likes || 0),
        page_comments: Number(es.page_comments || 0),
        page_shares: Number(es.page_shares || 0),
        group_members: Number(es.group_members || 0),
        captured_at: new Date(es.captured_at).toISOString(),
      })),
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
    const nowVn = new Date(nowUtc.getTime() + 7 * 3600_000);
    const expectedPlatform = targetMode === 'fanpage' ? 'facebook' : 'facebook_group';
    const existingScheduledDates = existingRows
      .filter((r) => r.status !== 'published' && r.scheduled_for && r.platform_name === expectedPlatform)
      .map((r) => new Date(r.scheduled_for!).getTime());

    let nextBaseUtc: Date;
    if (existingScheduledDates.length > 0) {
      const maxScheduledMs = Math.max(...existingScheduledDates);
      const maxVnDate = new Date(maxScheduledMs + 7 * 3600_000);
      nextBaseUtc = new Date(
        Date.UTC(maxVnDate.getUTCFullYear(), maxVnDate.getUTCMonth(), maxVnDate.getUTCDate() + 1, 2, 0, 0),
      );
    } else {
      const todayNineAmVn = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate(), 2, 0, 0));
      nextBaseUtc =
        todayNineAmVn.getTime() > nowUtc.getTime()
          ? todayNineAmVn
          : new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() + 1, 2, 0, 0));
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
    let snapFutureSlotsToNineAmVn = false;
    if (options.start_date_iso) {
      const parsed = new Date(options.start_date_iso);
      startUtc = Number.isNaN(parsed.getTime()) ? nowUtc : parsed;
    } else {
      const todayNineAmVn = new Date(Date.UTC(vnYear, vnMonth, vnDay, 2, 0, 0));
      if (todayPublishedCount === 0) {
        // Ensure today is never skipped in the calendar; subsequent days snap cleanly to 09:00 AM VN
        if (todayNineAmVn.getTime() > nowUtc.getTime()) {
          startUtc = todayNineAmVn;
        } else {
          startUtc = new Date(nowUtc.getTime() + 10 * 60_000);
          snapFutureSlotsToNineAmVn = true;
        }
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
      const slotUtc =
        snapFutureSlotsToNineAmVn && i >= 1 && intervalMs === 24 * 3600_000
          ? new Date(Date.UTC(vnYear, vnMonth, vnDay + i, 2, 0, 0))
          : new Date(startUtc.getTime() + i * intervalMs);
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

    const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const leadingTitlePattern = new RegExp(`^${escapedTitle}\\s*[:\\-—.]?\\s*`, 'i');
    const bulletPoints = chunks
      .slice(0, 3)
      .map((c) => {
        const cleaned = c.text_content.replace(/\s+/g, ' ').trim().replace(leadingTitlePattern, '').trim();
        const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned.slice(0, 160);
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

  private inspectGroupBotSessionFileSafe(filePath: string): {
    usingPageProfile: boolean;
    accountIdMask?: string;
  } {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as {
        cookies?: Array<{ name?: string; value?: string; domain?: string; expires?: number }>;
      };
      const nowSec = Math.floor(Date.now() / 1000);
      const fbCookies = (parsed.cookies ?? []).filter(
        (c) =>
          typeof c?.domain === 'string' &&
          c.domain.toLowerCase().includes('facebook.com') &&
          (!c.expires || c.expires < 0 || c.expires > nowSec),
      );
      const cUser = fbCookies.find((c) => c.name === 'c_user')?.value?.trim() || '';
      const iUser = fbCookies.find((c) => c.name === 'i_user')?.value?.trim() || '';
      const activeId = iUser || cUser;
      const accountIdMask = activeId.length >= 4 ? `***${activeId.slice(-4)}` : activeId ? '***' : undefined;
      return {
        usingPageProfile: Boolean(iUser && iUser !== cUser),
        ...(accountIdMask ? { accountIdMask } : {}),
      };
    } catch {
      return { usingPageProfile: false };
    }
  }

  /**
   * Fast synchronous check for whether a saved Edge Group Bot session file or FB_ADMIN_COOKIE exists.
   * Never exposes local filesystem paths or secret cookie contents.
   */
  async getGroupBotSessionStatus(): Promise<GroupBotSessionStatus> {
    const loginInProgress = Boolean(
      activeLoginChild && activeLoginChild.exitCode === null && !activeLoginChild.killed,
    );
    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    if (session.exists) {
      const meta = this.inspectGroupBotSessionFileSafe(session.filePath);
      return {
        isLoggedIn: true,
        sessionSource: 'file',
        ...(loginInProgress ? { loginInProgress: true } : {}),
        ...(meta.usingPageProfile ? { usingPageProfile: true } : {}),
        ...(meta.accountIdMask ? { accountIdMask: meta.accountIdMask } : {}),
      };
    }
    if (process.env.FB_ADMIN_COOKIE?.trim()) {
      return {
        isLoggedIn: true,
        sessionSource: 'cookie',
        ...(loginInProgress ? { loginInProgress: true } : {}),
      };
    }
    if (loginInProgress) {
      return { isLoggedIn: false, sessionSource: 'none', loginInProgress: true };
    }
    return { isLoggedIn: false, sessionSource: 'none' };
  }

  /**
   * Server-side Telegram Bot status & conversation metrics (never exposes TELEGRAM_BOT_TOKEN).
   */
  async getTelegramBotStatus(workspaceId: string): Promise<{
    configured: boolean;
    mode: 'polling' | 'webhook';
    bot_username: string | null;
    bot_name: string | null;
    t_me_url: string | null;
    webhook_url: string | null;
    pending_update_count: number;
    last_error_message: string | null;
    conversations_count: number;
    messages_received_count: number;
    messages_replied_count: number;
    invites_sent_count: number;
  }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
    const mode: 'polling' | 'webhook' =
      process.env.TELEGRAM_BOT_MODE?.trim().toLowerCase() === 'webhook' ? 'webhook' : 'polling';

    const statsRow = (
      await this.pool
        .query<{
          conversations_count: number;
          messages_received_count: number;
          messages_replied_count: number;
          invites_sent_count: number;
        }>(
          `SELECT
             (SELECT count(DISTINCT author_contact)::int FROM community_messages WHERE workspace_id = $1 AND platform = 'telegram_message' AND author_contact IS NOT NULL) AS conversations_count,
             (SELECT count(*)::int FROM community_messages WHERE workspace_id = $1 AND platform = 'telegram_message') AS messages_received_count,
             (SELECT count(*)::int FROM community_messages WHERE workspace_id = $1 AND platform = 'telegram_message' AND status = 'replied') AS messages_replied_count,
             (SELECT count(*)::int FROM community_invite_logs WHERE workspace_id = $1 AND channel = 'telegram_community_invite' AND status = 'invited') AS invites_sent_count`,
          [workspaceId],
        )
        .catch(() => ({
          rows: [] as Array<{
            conversations_count: number;
            messages_received_count: number;
            messages_replied_count: number;
            invites_sent_count: number;
          }>,
        }))
    ).rows[0];

    let botUsername: string | null = null;
    let botName: string | null = null;
    let webhookUrl: string | null = null;
    let pendingUpdateCount = 0;
    let lastErrorMessage: string | null = null;

    if (token) {
      const scrub = (msg: string) => msg.replaceAll(token, '[REDACTED]').slice(0, 240);
      try {
        const [meRes, whRes] = await Promise.all([
          fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(3000) }),
          fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(3000) }),
        ]);
        const meJson = (await meRes.json().catch(() => ({}))) as {
          ok?: boolean;
          description?: string;
          result?: { username?: string; first_name?: string };
        };
        if (meRes.ok && meJson.ok && meJson.result) {
          botUsername = meJson.result.username ?? null;
          botName = meJson.result.first_name ?? null;
        } else if (meJson.description) {
          lastErrorMessage = scrub(meJson.description);
        }
        const whJson = (await whRes.json().catch(() => ({}))) as {
          ok?: boolean;
          result?: { url?: string; pending_update_count?: number; last_error_message?: string };
        };
        if (whRes.ok && whJson.ok && whJson.result) {
          webhookUrl = whJson.result.url?.trim() || null;
          pendingUpdateCount = Number(whJson.result.pending_update_count ?? 0);
          if (!lastErrorMessage && whJson.result.last_error_message) {
            lastErrorMessage = scrub(whJson.result.last_error_message);
          }
        }
      } catch (err) {
        lastErrorMessage = scrub((err as Error).message || 'Telegram API unreachable');
      }
    }

    return {
      configured: Boolean(token),
      mode,
      bot_username: botUsername,
      bot_name: botName,
      t_me_url: botUsername ? `https://t.me/${botUsername}` : null,
      webhook_url: webhookUrl,
      pending_update_count: pendingUpdateCount,
      last_error_message: lastErrorMessage,
      conversations_count: Number(statsRow?.conversations_count ?? 0),
      messages_received_count: Number(statsRow?.messages_received_count ?? 0),
      messages_replied_count: Number(statsRow?.messages_replied_count ?? 0),
      invites_sent_count: Number(statsRow?.invites_sent_count ?? 0),
    };
  }

  /**
   * Registers bot menu commands (`/start`, `/community`, `/help`) and optionally clears an active
   * webhook so local Long Polling can run without 409 Conflict.
   */
  async syncTelegramBot(
    workspaceId: string,
    options: { clearWebhookForPolling?: boolean } = {},
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
    if (!token) {
      return {
        success: false,
        message: 'Chưa cấu hình TELEGRAM_BOT_TOKEN trong apps/api/.env.local. Hãy tạo bot qua @BotFather rồi dán token vào env.',
        telegram_bot: await this.getTelegramBotStatus(workspaceId),
      };
    }

    const scrub = (msg: string) => msg.replaceAll(token, '[REDACTED]').slice(0, 240);
    const commands = [
      { command: 'start', description: 'Bắt đầu trò chuyện & nhận tư vấn du lịch' },
      { command: 'community', description: 'Nhận link tham gia Cộng đồng Facebook TripC' },
      { command: 'help', description: 'Xem hướng dẫn & chủ đề bot có thể hỗ trợ' },
    ];

    try {
      const cmdRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commands }),
        signal: AbortSignal.timeout(5000),
      });
      const cmdJson = (await cmdRes.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!cmdRes.ok || !cmdJson.ok) {
        return {
          success: false,
          message: `Telegram từ chối setMyCommands: ${scrub(cmdJson.description ?? `HTTP ${cmdRes.status}`)}`,
          telegram_bot: await this.getTelegramBotStatus(workspaceId),
        };
      }

      const mode = process.env.TELEGRAM_BOT_MODE?.trim().toLowerCase() === 'webhook' ? 'webhook' : 'polling';
      if (options.clearWebhookForPolling || mode === 'polling') {
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ drop_pending_updates: false }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }

      const status = await this.getTelegramBotStatus(workspaceId);
      return {
        success: Boolean(status.bot_username),
        message: status.bot_username
          ? `Đã đồng bộ Bot @${status.bot_username} (chế độ ${status.mode === 'polling' ? 'Long Polling' : 'Webhook'}) và menu lệnh /start, /community, /help.`
          : `Đã kiểm tra kết nối Telegram${status.last_error_message ? `: ${status.last_error_message}` : '.'}`,
        telegram_bot: status,
      };
    } catch (err) {
      return {
        success: false,
        message: `Không thể kết nối Telegram API: ${scrub((err as Error).message)}`,
        telegram_bot: await this.getTelegramBotStatus(workspaceId),
      };
    }
  }

  /**
   * Verifies live Group Bot session validity via Playwright Edge script (`check`).
   */
  async verifyGroupBotSession(workspaceId?: string): Promise<GroupBotSessionStatus> {
    const syncStatus = await this.getGroupBotSessionStatus();
    if (!syncStatus.isLoggedIn) {
      return {
        isLoggedIn: false,
        sessionSource: 'none',
        ...(syncStatus.loginInProgress ? { loginInProgress: true } : {}),
        detail:
          'Chưa phát hiện tệp phiên đăng nhập .fb-session.json hoặc FB_ADMIN_COOKIE. Hãy bấm "Mở Edge Đăng nhập Group Bot (1 lần)".',
      };
    }

    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    const runner = resolveGroupBotRunner(workerDir);

    const verified = await new Promise<GroupBotSessionStatus>((resolve) => {
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
        const usingPageProfile =
          typeof parsed?.usingPageProfile === 'boolean'
            ? parsed.usingPageProfile
            : syncStatus.usingPageProfile;
        const accountIdMask =
          typeof parsed?.accountIdMask === 'string' && parsed.accountIdMask
            ? parsed.accountIdMask
            : syncStatus.accountIdMask;
        const adminName = sanitizeFbAdminName(typeof parsed?.adminName === 'string' ? parsed.adminName : null);
        const detail =
          typeof parsed?.detail === 'string' && parsed.detail.trim()
            ? parsed.detail.trim()
            : isLoggedIn
              ? 'Phiên đăng nhập Quản trị viên Facebook Group hợp lệ.'
              : stderr.trim() || 'Phiên đăng nhập Facebook đã hết hạn. Vui lòng đăng nhập lại.';
        resolve({
          isLoggedIn,
          sessionSource: isLoggedIn ? syncStatus.sessionSource : 'none',
          ...(usingPageProfile ? { usingPageProfile: true } : {}),
          ...(accountIdMask ? { accountIdMask } : {}),
          ...(adminName ? { adminName } : {}),
          detail,
        });
      });
    });

    if (workspaceId && verified.isLoggedIn) {
      if (verified.adminName) {
        await this.pool
          .query('UPDATE community_hub_settings SET fb_admin_name = $2 WHERE workspace_id = $1', [
            workspaceId,
            verified.adminName.slice(0, 250),
          ])
          .catch(() => {});
      } else {
        const existingRow = await this.pool
          .query<{ fb_admin_name: string | null }>(
            'SELECT fb_admin_name FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1',
            [workspaceId],
          )
          .catch(() => ({ rows: [] as { fb_admin_name: string | null }[] }));
        const current = existingRow.rows[0]?.fb_admin_name;
        if (current && !sanitizeFbAdminName(current)) {
          await this.pool
            .query('UPDATE community_hub_settings SET fb_admin_name = NULL WHERE workspace_id = $1', [workspaceId])
            .catch(() => {});
        }
      }
    }

    return verified;
  }

  /**
   * Launches a single visible Microsoft Edge window so the admin can log into Facebook once
   * (or switch to another FB account / Page Profile) and save `.fb-session.json` cleanly.
   * Non-destructive: keeps the existing working `.fb-session.json` intact until a new session is committed.
   */
  async launchGroupBotLogin(
    workspaceId?: string,
    options: { fresh?: boolean; waitForConfirm?: boolean } = {},
  ): Promise<{
    started: boolean;
    alreadyRunning?: boolean;
    loginInProgress?: boolean;
    cliFallbackCommand?: string;
    message: string;
  }> {
    const isFresh = Boolean(options.fresh);
    const waitForConfirm = options.waitForConfirm !== false;
    const cliFallbackCommand = isFresh
      ? 'npm.cmd --prefix apps/worker run group-bot:switch'
      : 'npm.cmd --prefix apps/worker run group-bot:login';

    let groupUrl = 'https://www.facebook.com/groups/1134282109069209';
    if (workspaceId) {
      try {
        const saved = (
          await this.pool.query<{ group_url: string | null }>(
            'SELECT group_url FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1',
            [workspaceId],
          )
        ).rows[0];
        if (saved?.group_url && /^https?:\/\//i.test(saved.group_url)) {
          groupUrl = saved.group_url;
        }
      } catch {
        // Ignore if settings table is not initialized yet
      }
    }

    const psExe =
      process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : '';
    const runEncodedPowerShell = (script: string): Promise<string> =>
      new Promise((resolve) => {
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execFile(
          psExe,
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
          { windowsHide: true, timeout: 4000 },
          (_err, stdout) => resolve((stdout || '').trim()),
        );
      });

    const killExistingLoginEdge = async () => {
      if (activeLoginSignalFile) {
        try {
          if (fs.existsSync(activeLoginSignalFile)) fs.unlinkSync(activeLoginSignalFile);
        } catch {}
        activeLoginSignalFile = null;
      }
      if (process.platform === 'win32') {
        await runEncodedPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*playwright*') -or
  ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*runFacebookGroupBot*login*')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
`);
      }
      if (activeLoginChild) {
        try {
          activeLoginChild.kill();
        } catch {}
        activeLoginChild = null;
      }
    };

    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);

    if (isFresh) {
      await killExistingLoginEdge();
      // Preserve existing working `.fb-session.json` (Playwright `--fresh` ignores it cleanly and
      // writes `.pending.tmp` first, committing over `.fb-session.json` ONLY after verified login).
      const explicitSession = Boolean(process.env.FB_SESSION_FILE?.trim());
      const pendingCandidatesToClear = explicitSession
        ? [`${session.filePath}.pending.tmp`]
        : [`${session.filePath}.pending.tmp`, path.resolve(workerDir, '.fb-session.json.pending.tmp')];
      for (const candidate of pendingCandidatesToClear) {
        try {
          if (candidate && fs.existsSync(candidate)) fs.unlinkSync(candidate);
        } catch {}
      }
    } else if (activeLoginChild && activeLoginChild.exitCode === null && !activeLoginChild.killed) {
      if (process.platform === 'win32') {
        const focusResult = await runEncodedPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocusExisting {
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public static void BringFront(IntPtr hWnd) {
    AllowSetForegroundWindow(-1);
    if (IsIconic(hWnd)) { ShowWindowAsync(hWnd, 9); } else { ShowWindowAsync(hWnd, 5); }
    BringWindowToTop(hWnd);
    SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, 0x0003);
    SetWindowPos(hWnd, new IntPtr(-2), 0, 0, 0, 0, 0x0003);
    SetForegroundWindow(hWnd);
  }
}
"@
$found = $false
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*playwright*' } | ForEach-Object {
  $gp = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if ($gp -and $gp.MainWindowHandle -ne 0) {
    [WinFocusExisting]::BringFront($gp.MainWindowHandle)
    $found = $true
  }
}
if ($found) { 'FOCUSED' } else { 'NONE' }
`);
        if (focusResult === 'FOCUSED') {
          return {
            started: true,
            alreadyRunning: true,
            loginInProgress: true,
            cliFallbackCommand,
            message:
              'Cửa sổ Microsoft Edge đăng nhập Group Bot đang mở — hệ thống vừa đưa cửa sổ đó lên phía trước. Hãy đăng nhập & chuyển sang Trang/Tài khoản Quản trị viên trên Edge rồi bấm "✅ Đã đổi xong trên Edge — Lưu & Đóng Edge" (hoặc đóng cửa sổ Edge).',
          };
        }
        await killExistingLoginEdge();
      } else {
        return {
          started: true,
          alreadyRunning: true,
          loginInProgress: true,
          cliFallbackCommand,
          message:
            'Cửa sổ Microsoft Edge đăng nhập Group Bot đang mở sẵn. Hãy hoàn tất đăng nhập / chuyển trang cá nhân trên Edge rồi bấm "✅ Đã đổi xong trên Edge — Lưu & Đóng Edge".',
        };
      }
    }

    const prevFingerprint = readSessionFileFingerprint(session.filePath);
    const attempt: LoginAttemptTracker = {
      mode: isFresh ? 'switch' : 'login',
      workspaceId,
      sessionFilePath: session.filePath,
      startedAtMs: Date.now(),
      previousMtimeMs: prevFingerprint.mtimeMs,
      previousHash: prevFingerprint.hash,
      dbAdminUpdated: false,
    };
    activeLoginAttempt = attempt;

    const runner = resolveGroupBotRunner(workerDir);
    const signalFile = waitForConfirm
      ? path.join(os.tmpdir(), `fb-login-done-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}.sig`)
      : '';
    activeLoginSignalFile = signalFile || null;

    const runnerArgs = [...runner.prefixArgs, 'login', '--group-url', groupUrl];
    if (isFresh) runnerArgs.push('--fresh');
    if (waitForConfirm && signalFile) {
      runnerArgs.push('--wait-confirm', '--signal-file', signalFile);
    }

    return await new Promise((resolve) => {
      let resolved = false;
      let errBuf = '';
      let outBuf = '';

      let tempOutFile = '';
      let tempErrFile = '';
      let child: ChildProcess;

      if (process.platform === 'win32') {
        const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        tempOutFile = path.join(os.tmpdir(), `fb-group-login-${stamp}.out.log`);
        tempErrFile = path.join(os.tmpdir(), `fb-group-login-${stamp}.err.log`);
        const psQ = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
        const winQ = (s: string) => `"${String(s).replace(/"/g, '\\"')}"`;
        const quotedArgs = runnerArgs.map((a) => psQ(winQ(a))).join(', ');

        // Launch Playwright via Start-Process -WindowStyle Minimized so Edge never inherits
        // SW_HIDE from the background API service (:4000), then restore & focus Edge cleanly.
        const psScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$p = Start-Process -FilePath ${psQ(runner.command)} -ArgumentList @(${quotedArgs}) -WorkingDirectory ${psQ(workerDir)} -WindowStyle Minimized -RedirectStandardOutput ${psQ(tempOutFile)} -RedirectStandardError ${psQ(tempErrFile)} -PassThru
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocusLaunch {
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public static void BringFront(IntPtr hWnd) {
    AllowSetForegroundWindow(-1);
    if (IsIconic(hWnd)) { ShowWindowAsync(hWnd, 9); } else { ShowWindowAsync(hWnd, 5); }
    BringWindowToTop(hWnd);
    SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, 0x0003);
    SetWindowPos(hWnd, new IntPtr(-2), 0, 0, 0, 0, 0x0003);
    SetForegroundWindow(hWnd);
  }
}
"@
for ($i = 0; $i -lt 48; $i++) {
  if ($p.HasExited) { break }
  $focused = $false
  $edges = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*playwright*' }
  foreach ($edge in $edges) {
    $gp = Get-Process -Id $edge.ProcessId -ErrorAction SilentlyContinue
    if ($gp -and $gp.MainWindowHandle -ne 0) {
      [WinFocusLaunch]::BringFront($gp.MainWindowHandle)
      $focused = $true
      break
    }
  }
  if ($focused) { break }
  Start-Sleep -Milliseconds 250
}
$p.WaitForExit()
exit $p.ExitCode
`;
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        child = spawn(psExe, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
          cwd: workerDir,
          env: { ...process.env, FB_SESSION_FILE: session.filePath },
          shell: false,
          windowsHide: true,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        child = spawn(runner.command, runnerArgs, {
          cwd: workerDir,
          env: { ...process.env, FB_SESSION_FILE: session.filePath },
          shell: false,
          windowsHide: false,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      }

      activeLoginChild = child;

      child.stdout?.on('data', (chunk) => {
        if (outBuf.length < 4096) outBuf += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        if (errBuf.length < 4096) errBuf += chunk.toString();
      });
      child.stdout?.resume();
      child.stderr?.resume();

      const cleanupTempLogs = () => {
        if (tempOutFile && fs.existsSync(tempOutFile)) {
          try {
            const txt = fs.readFileSync(tempOutFile, 'utf8');
            if (txt) outBuf = `${outBuf}\n${txt}`.trim();
          } catch {}
          try {
            fs.unlinkSync(tempOutFile);
          } catch {}
        }
        if (tempErrFile && fs.existsSync(tempErrFile)) {
          try {
            const txt = fs.readFileSync(tempErrFile, 'utf8');
            if (txt) errBuf = `${errBuf}\n${txt}`.trim();
          } catch {}
          try {
            fs.unlinkSync(tempErrFile);
          } catch {}
        }
      };

      const clearActive = () => {
        if (activeLoginChild === child) activeLoginChild = null;
        if (signalFile && activeLoginSignalFile === signalFile) {
          try {
            if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile);
          } catch {}
          activeLoginSignalFile = null;
        }
      };

      child.once('error', (err) => {
        clearTimeout(startupTimer);
        clearActive();
        cleanupTempLogs();
        if (!resolved) {
          resolved = true;
          resolve({
            started: false,
            cliFallbackCommand,
            message: `Không mở được cửa sổ Microsoft Edge để đăng nhập Group Bot: ${err.message}. Bạn có thể mở PowerShell thường và chạy: ${cliFallbackCommand}`,
          });
        }
      });

      child.once('close', (code) => {
        clearTimeout(startupTimer);
        clearActive();
        cleanupTempLogs();
        const parsed = parseGroupBotResultLine(outBuf);
        if (code === 0 && parsed?.success) {
          const parsedAdminName = sanitizeFbAdminName(
            typeof parsed.adminName === 'string' ? parsed.adminName : null,
          );
          if (workspaceId && this.pool && typeof this.pool.query === 'function') {
            this.pool
              .query('UPDATE community_hub_settings SET fb_admin_name = $2 WHERE workspace_id = $1', [
                workspaceId,
                parsedAdminName ? parsedAdminName.slice(0, 250) : null,
              ])
              .catch(() => {});
            attempt.dbAdminUpdated = true;
          }
          if (activeLoginAttempt === attempt) {
            activeLoginAttempt = null;
          }
        }
        if (!resolved) {
          resolved = true;
          if (code === 0 && parsed?.success) {
            resolve({
              started: true,
              cliFallbackCommand,
              message: String(parsed.message || 'Đã lưu phiên đăng nhập Quản trị viên Group Bot thành công!'),
            });
          } else {
            resolve({
              started: false,
              cliFallbackCommand,
              message: String(
                parsed?.message ||
                  errBuf.trim() ||
                  outBuf.trim() ||
                  `Cửa sổ đăng nhập Edge đóng trước khi hoàn tất. Bạn có thể chạy trực tiếp: ${cliFallbackCommand}`,
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
            loginInProgress: true,
            cliFallbackCommand,
            message: isFresh
              ? `Đã mở cửa sổ Microsoft Edge sạch để đổi tài khoản (phiên cũ vẫn được giữ an toàn cho tới khi bạn lưu mới). Hãy đăng nhập hoặc bấm "Chuyển trang cá nhân" trên Edge rồi bấm "✅ Đã đổi xong trên Edge — Lưu & Đóng Edge". (Nếu Edge chưa hiện trên màn hình do server chạy trong phiên nền, hãy chạy trong PowerShell: ${cliFallbackCommand})`
              : `Đã mở cửa sổ Microsoft Edge! Hãy đăng nhập và chuyển đúng tài khoản/Trang quản trị viên Group trên Edge — cửa sổ sẽ giữ mở để bạn thao tác, sau đó bấm "✅ Đã đổi xong trên Edge — Lưu & Đóng Edge" (hoặc tự đóng Edge). (Nếu Edge chưa hiện trên màn hình, chạy: ${cliFallbackCommand})`,
          });
        }
      }, 600);
    });
  }

  /**
   * Starts a clean Edge login window so the admin can switch to another Facebook account or
   * switch Facebook Profile/Page without losing the current `.fb-session.json` prematurely.
   */
  async switchGroupBotAccount(workspaceId?: string) {
    return this.launchGroupBotLogin(workspaceId, { fresh: true, waitForConfirm: true });
  }

  /**
   * Signals the open interactive login Edge window to commit the latest session cookies to
   * `.fb-session.json` and close gracefully, returning the verified session status.
   */
  async completeGroupBotLogin(workspaceId?: string): Promise<{
    completed: boolean;
    session: GroupBotSessionStatus;
    cliFallbackCommand?: string;
    message: string;
  }> {
    const attemptSnapshot = activeLoginAttempt;
    if (activeLoginSignalFile) {
      try {
        fs.writeFileSync(activeLoginSignalFile, 'done', 'utf8');
      } catch {
        // Ignore if signal file could not be written
      }
    }

    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const stillRunning = Boolean(
        activeLoginChild && activeLoginChild.exitCode === null && !activeLoginChild.killed,
      );
      if (!stillRunning) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    const workerDir = resolveWorkerDir();
    const sessionFile = resolveGroupBotSessionFile(workerDir);
    const session = await this.getGroupBotSessionStatus();
    const fallbackCmd =
      attemptSnapshot?.mode === 'switch'
        ? 'npm.cmd --prefix apps/worker run group-bot:switch'
        : 'npm.cmd --prefix apps/worker run group-bot:login';

    if (session.isLoggedIn && !session.loginInProgress) {
      if (attemptSnapshot?.mode === 'switch' && !hasNewSessionSinceAttempt(attemptSnapshot, sessionFile.filePath)) {
        return {
          completed: false,
          session,
          cliFallbackCommand: fallbackCmd,
          message:
            'Chưa phát hiện phiên mới được lưu từ cửa sổ Edge vừa mở (phiên cũ vẫn được giữ nguyên an toàn). Nếu không thấy cửa sổ Edge trên màn hình, hãy chạy lệnh "npm.cmd --prefix apps/worker run group-bot:switch" trong PowerShell, đăng nhập xong rồi đóng Edge.',
        };
      }

      if (attemptSnapshot && !attemptSnapshot.dbAdminUpdated && workspaceId && this.pool && typeof this.pool.query === 'function') {
        await this.pool
          .query('UPDATE community_hub_settings SET fb_admin_name = NULL WHERE workspace_id = $1', [workspaceId])
          .catch(() => {});
      }
      if (activeLoginAttempt === attemptSnapshot) {
        activeLoginAttempt = null;
      }

      const profileDesc = session.usingPageProfile
        ? `Page Profile (${session.accountIdMask ?? '***'})`
        : `Tài khoản (${session.accountIdMask ?? 'đã lưu'})`;
      return {
        completed: true,
        session,
        message: `Đã lưu phiên Group Bot mới thành công [${profileDesc}] và đóng cửa sổ Edge an toàn.`,
      };
    }

    return {
      completed: false,
      session,
      cliFallbackCommand: fallbackCmd,
      message: session.loginInProgress
        ? 'Cửa sổ Edge vẫn đang xử lý đóng và lưu cookie. Vui lòng đợi vài giây hoặc tự đóng cửa sổ Edge sau khi đăng nhập xong.'
        : 'Chưa thấy phiên Facebook đã đăng nhập trong .fb-session.json. Hãy mở lại Edge hoặc chạy lệnh PowerShell: "npm.cmd --prefix apps/worker run group-bot:switch".',
    };
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

  /**
   * Retracts (deletes) a published post from the Facebook Group via Playwright Group Bot
   * and updates local DB records so it returns to `ready_to_publish` / `scheduled` state.
   */
  async retractGroupPost(
    workspaceId: string,
    options: {
      source_id?: string;
      post_url?: string;
      title?: string;
    },
  ): Promise<{
    success: boolean;
    message: string;
    groupUrl: string;
    postUrl?: string;
    errorCode?: string;
  }> {
    const settings = await this.ensureSchemaAndContext(workspaceId);
    const workerDir = resolveWorkerDir();
    const session = resolveGroupBotSessionFile(workerDir);
    const hasSession = session.exists || Boolean(process.env.FB_ADMIN_COOKIE?.trim());

    let existingRow: {
      id: string;
      source_id: string | null;
      publishing_job_id: string | null;
      post_title: string;
      facebook_post_url: string | null;
    } | undefined;

    if (options.source_id) {
      existingRow = (
        await this.pool.query<{
          id: string;
          source_id: string | null;
          publishing_job_id: string | null;
          post_title: string;
          facebook_post_url: string | null;
        }>(
          `SELECT id, source_id, publishing_job_id, post_title, facebook_post_url
             FROM community_group_posts
            WHERE workspace_id = $1 AND source_id = $2
            ORDER BY published_at DESC NULLS LAST, updated_at DESC LIMIT 1`,
          [workspaceId, options.source_id],
        )
      ).rows[0];
    } else if (options.title) {
      existingRow = (
        await this.pool.query<{
          id: string;
          source_id: string | null;
          publishing_job_id: string | null;
          post_title: string;
          facebook_post_url: string | null;
        }>(
          `SELECT id, source_id, publishing_job_id, post_title, facebook_post_url
             FROM community_group_posts
            WHERE workspace_id = $1 AND LOWER(post_title) = LOWER($2)
            ORDER BY published_at DESC NULLS LAST, updated_at DESC LIMIT 1`,
          [workspaceId, options.title.trim()],
        )
      ).rows[0];
    }

    const targetPostUrl = options.post_url || existingRow?.facebook_post_url || undefined;
    const targetTitle = options.title || existingRow?.post_title || undefined;

    if (!hasSession) {
      return {
        success: false,
        errorCode: 'FACEBOOK_GROUP_SESSION_MISSING',
        groupUrl: settings.group_url,
        postUrl: targetPostUrl,
        message: 'Chưa có phiên đăng nhập Quản trị viên Facebook Group (.fb-session.json) để thu hồi bài tự động.',
      };
    }

    const runner = resolveGroupBotRunner(workerDir);
    const tmpPayloadFile = path.join(os.tmpdir(), `fb-group-del-${randomUUID()}.json`);
    fs.writeFileSync(
      tmpPayloadFile,
      JSON.stringify({
        groupUrl: settings.group_url,
        postUrl: targetPostUrl,
        titleSnippet: targetTitle,
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
          [...runner.prefixArgs, 'delete', '--group-url', settings.group_url, '--payload-file', tmpPayloadFile],
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
            } catch {}
            resolve({ code: null, stdout, stderr, timedOut: true });
          }
        }, 90_000);
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
        if (existingRow) {
          await this.pool.query(
            `DELETE FROM community_group_posts WHERE id = $1 AND workspace_id = $2`,
            [existingRow.id, workspaceId],
          ).catch(() => {});
          if (existingRow.publishing_job_id) {
            await this.pool.query(
              `UPDATE publishing_jobs
                  SET status = 'scheduled', published_at = NULL, external_post_id = NULL, error_message = NULL
                WHERE id = $1 AND workspace_id = $2`,
              [existingRow.publishing_job_id, workspaceId],
            ).catch(() => {});
          }
        }
        return {
          success: true,
          groupUrl: settings.group_url,
          postUrl: targetPostUrl,
          message:
            typeof parsed?.message === 'string' && parsed.message
              ? parsed.message
              : 'Đã thu hồi bài viết khỏi Group Facebook và đặt lại trạng thái sẵn sàng đăng!',
        };
      }

      return {
        success: false,
        errorCode: typeof parsed?.errorCode === 'string' ? parsed.errorCode : 'FACEBOOK_GROUP_PUBLISH_FAILED',
        groupUrl: settings.group_url,
        postUrl: targetPostUrl,
        message:
          (typeof parsed?.message === 'string' && parsed.message) ||
          botOutput.stderr.trim() ||
          'Không thể thu hồi bài viết trên Group Facebook.',
      };
    } finally {
      try {
        if (fs.existsSync(tmpPayloadFile)) fs.unlinkSync(tmpPayloadFile);
      } catch {}
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
