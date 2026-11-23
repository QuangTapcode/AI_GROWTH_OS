import { chromium } from 'playwright';

const OUT_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection';
const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';

async function verifyAll8AgentsAndPages() {
  // Pre-warm community hub, daily report, and LLM config routes so Next.js dev server has them compiled
  await Promise.all([
    fetch(`http://127.0.0.1:4000/v1/workspaces/${WORKSPACE_ID}/community/hub`, {
      headers: { Authorization: 'Bearer dev_owner' },
    }).catch(() => {}),
    fetch(`http://127.0.0.1:4000/v1/workspaces/${WORKSPACE_ID}/reports/daily-executive`, {
      headers: { Authorization: 'Bearer dev_owner' },
    }).catch(() => {}),
    fetch(`http://127.0.0.1:4000/v1/workspaces/${WORKSPACE_ID}/admin/llm-config`, {
      headers: { Authorization: 'Bearer dev_owner' },
    }).catch(() => {}),
  ]);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  const loginRes = await fetch('http://127.0.0.1:4000/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner.tripc.demo@gmail.com', password: 'password123' }),
  });
  const { access_token, user, expires_at } = await loginRes.json();

  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, e, u, w }) => {
      localStorage.setItem('agos.session', JSON.stringify({ token: t, expiresAt: e, user: u }));
      localStorage.setItem('agos.workspace', w);
    },
    { t: access_token, e: expires_at, u: user, w: WORKSPACE_ID }
  );

  const report = [];

  // 1. Test /onboarding (Zero-Tech 4 Links & 8 Agents Roster)
  await page.goto('http://127.0.0.1:3000/onboarding', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const onboardingText = await page.locator('body').innerText();
  const groupInputVal = await page.locator('input[type="url"]').nth(3).inputValue().catch(() => '');
  await page.screenshot({ path: `${OUT_DIR}/e2e_1_onboarding.png` });
  report.push({
    step: '1. Onboarding & 8 Agents Roster (/onboarding)',
    status: groupInputVal.includes('1134282109069209') && onboardingText.includes('8/8 Agent sẵn sàng') ? 'PASS' : 'FAIL',
    detail: `Group=${groupInputVal} | 8Agents=${onboardingText.includes('8/8 Agent sẵn sàng')}`,
  });

  // 2. Test /agents (Agent Operations + 8 Autonomous Agents Section)
  await page.goto('http://127.0.0.1:3000/agents', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const agentsText = await page.locator('body').innerText();
  const has8Section = agentsText.includes('8/8 AI Agent Tự Hành 24/7') && agentsText.includes('Agent 7') && agentsText.includes('Agent 8');
  await page.screenshot({ path: `${OUT_DIR}/e2e_2_agents_8team.png` });
  report.push({
    step: '2. Agent Operations 8-Agent Control Center (/agents)',
    status: has8Section ? 'PASS' : 'FAIL',
    detail: `has8Section=${has8Section}`,
  });

  // 2b. Test Daily Executive Report Modal in Header (Agent 1 output)
  const dailyBtn = page.locator('button').filter({ hasText: 'Báo Cáo Ngày' }).first();
  if (await dailyBtn.isVisible().catch(() => false)) {
    await dailyBtn.click();
    await page.locator('text=Sao chép nội dung').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(500);
    const modalText = await page.locator('body').innerText();
    const validReport =
      modalText.includes('DAILY EXECUTIVE REPORT') &&
      /leads\s*&\s*tư vấn 1-1/i.test(modalText) &&
      !modalText.includes('khách tiệc');
    await page.screenshot({ path: `${OUT_DIR}/e2e_2b_daily_report_modal.png` });
    report.push({
      step: '2b. Agent 1: Daily Executive Report Modal',
      status: validReport ? 'PASS' : 'FAIL',
      detail: `validReport=${validReport}`,
    });
    await page.locator('button').filter({ hasText: '✕' }).first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // 3. Test Agent 2 & Agent 5 (/gmaps and /gmaps?tab=drive_assets)
  await page.goto('http://127.0.0.1:3000/gmaps?tab=drive_assets', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('text=Xuất Bản Lên Google Maps Ngay').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: `${OUT_DIR}/e2e_3_agent2_drive_assets.png` });
  const driveText = await page.locator('body').innerText();
  const hasDriveCards = /tư liệu ảnh drive/i.test(driveText) && /đã xuất bản|sẵn sàng đăng/i.test(driveText);
  report.push({
    step: '3. Agent 2: Drive Asset Ingestion & Gemini Vision (/gmaps?tab=drive_assets)',
    status: hasDriveCards ? 'PASS' : 'FAIL',
    detail: `hasAssets=${hasDriveCards}`,
  });

  // 4. Switch to Reviews tab on /gmaps (Agent 5)
  const reviewsTab = page.locator('button').filter({ hasText: 'Đánh Giá (' }).first();
  if (await reviewsTab.isVisible().catch(() => false)) {
    await reviewsTab.click();
    await page.waitForTimeout(1500);
  }
  const reviewsText = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT_DIR}/e2e_4_agent5_gmaps_reviews.png` });
  report.push({
    step: '4. Agent 5: Google Maps Specialist & Auto-Reply Reviews (/gmaps)',
    status: reviewsText.includes('Phản hồi tự động từ AI Agent 5') && !reviewsText.includes('Phản hồi chính thức của Quán') ? 'PASS' : 'FAIL',
    detail: `autoReply=${reviewsText.includes('Phản hồi tự động từ AI Agent 5')}`,
  });

  // 5. Test Agent 7 (/booking-leads — Omnichannel Inbox & Lead Concierge)
  await page.goto('http://127.0.0.1:3000/booking-leads', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('text=Nguyễn Văn Minh').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const simBtn = page.locator('button').filter({ hasText: 'Chạy AI Tư Vấn 1-1 & Tự Động Bắt Lead' }).first();
  if (await simBtn.isVisible().catch(() => false)) {
    await simBtn.click();
    await page.locator('text=Hoàng Bảo').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  const bookingText = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT_DIR}/e2e_5_agent7_inbox_leads.png` });
  report.push({
    step: '5. Agent 7: Omnichannel Inbox 1-1 & Auto-Capture Lead (/booking-leads)',
    status:
      bookingText.includes('Auto-Concierge 24/7: ĐANG BẬT') &&
      bookingText.includes('Hoàng Bảo') &&
      !bookingText.includes('Thời Gian Ghé Quán')
        ? 'PASS'
        : 'FAIL',
    detail: `capturedHoangBao=${bookingText.includes('Hoàng Bảo')}`,
  });

  // 6. Test Agent 6 & Agent 8 (/agents/community — Real DB posts, Calendar, Discussions, RAG Comments)
  await page.goto('http://127.0.0.1:3000/agents/community', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('text=Lịch Đăng bài (30)').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const detailSummary = page.locator('summary').filter({ hasText: 'Xem nội dung' }).first();
  if (await detailSummary.isVisible().catch(() => false)) {
    await detailSummary.click();
    await page.waitForTimeout(800);
  }
  const commText = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT_DIR}/e2e_6_agent6_8_community.png` });
  report.push({
    step: '6. Agent 6 & 8: Community Growth Hub & 24/7 RAG Comment Reply (/agents/community)',
    status:
      commText.includes('1134282109069209') &&
      commText.includes('7 Đã đăng Group') &&
      commText.includes('23 Hẹn Group') &&
      commText.includes('30 chủ đề')
        ? 'PASS'
        : 'FAIL',
    detail: `7Pub=${commText.includes('7 Đã đăng Group')} | 23Sched=${commText.includes('23 Hẹn Group')} | 30Topics=${commText.includes('30 chủ đề')}`,
  });

  // 7. Test Agent 3 & Agent 4 (/distribution)
  await page.goto('http://127.0.0.1:3000/distribution', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const distText = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT_DIR}/e2e_7_agent4_distribution.png` });
  report.push({
    step: '7. Agent 4: Multi-Channel Publisher & TikTok Video Studio (/distribution)',
    status: !distText.includes('INTERNAL_ERROR') && distText.includes('Distribution') ? 'PASS' : 'FAIL',
    detail: `loaded=${!distText.includes('INTERNAL_ERROR')}`,
  });

  // 8. Test Multi-LLM Auto-Switch Admin (/admin/llm)
  await page.goto('http://127.0.0.1:3000/admin/llm', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('text=Multi-LLM Adapter').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const pingBtn = page.locator('button').filter({ hasText: 'Kiểm tra Ping' }).first();
  if (await pingBtn.isVisible().catch(() => false)) {
    await pingBtn.click();
    await page.locator('text=Độ trễ:').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  const llmText = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT_DIR}/e2e_8_llm_autoswitch.png` });
  report.push({
    step: '8. Multi-LLM Adapter & Auto-Switch Controller (/admin/llm)',
    status: llmText.includes('Multi-LLM Adapter') && llmText.includes('Độ trễ:') ? 'PASS' : 'FAIL',
    detail: `pingMeasured=${llmText.includes('Độ trễ:')}`,
  });

  // 9. Test Public Pilot Site (http://localhost:3001)
  await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const pilotText = await page.locator('body').innerText().catch(() => '');
  await page.screenshot({ path: `${OUT_DIR}/e2e_9_pilot_public_site.png` }).catch(() => {});
  report.push({
    step: '9. Public Pilot Website (http://localhost:3001)',
    status: pilotText.length > 50 ? 'PASS' : 'FAIL',
    detail: `chars=${pilotText.length}`,
  });

  console.table(report);
  await browser.close();
}

verifyAll8AgentsAndPages().catch((err) => {
  console.error(err);
  process.exit(1);
});
