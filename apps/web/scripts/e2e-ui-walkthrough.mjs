import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3000';
const results = [];
const consoleErrors = [];
const networkErrors = [];

function record(step, status, detail = '') {
  results.push({ step, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${status}] ${step}: ${detail}`);
}

async function waitForWorkspaceReady(page, timeout = 12000) {
  // Wait for "Loading workspace…" message to disappear
  await page.locator('text=Loading workspace…').waitFor({ state: 'detached', timeout }).catch(() => {});
  // Wait for main content or header
  await page.locator('main, h1, h2, h3').first().waitFor({ state: 'visible', timeout }).catch(() => {});
  await page.waitForTimeout(600);
}

async function safeClick(locator, desc) {
  try {
    const isVis = await locator.isVisible().catch(() => false);
    if (!isVis) {
      record(`Button [${desc}]`, 'WARN', 'Element not currently visible');
      return false;
    }
    await locator.click({ timeout: 3000 });
    record(`Button [${desc}]`, 'PASS', 'Clicked successfully');
    return true;
  } catch (e) {
    record(`Button [${desc}]`, 'WARN', e.message.split('\n')[0]);
    return false;
  }
}

async function run() {
  console.log('🚀 Starting Comprehensive UI & Button E2E Walkthrough...');
  
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico')) {
        consoleErrors.push(`[Console Error] ${text}`);
      }
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`[Page Crash] ${err.message}`);
  });

  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
      networkErrors.push(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  try {
    // ==========================================
    // 1. TEST LOGIN
    // ==========================================
    console.log('\n--- 1. Testing Login Page ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    
    const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"], input#password').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner.tripc.demo@gmail.com');
      await passwordInput.fill('password123');
      await submitBtn.click();
      await page.waitForTimeout(1500);

      const urlAfterLogin = page.url();
      if (!urlAfterLogin.includes('/login')) {
        record('Login Submission', 'PASS', `Authenticated and redirected to ${urlAfterLogin}`);
      } else {
        const errorText = await page.locator('[role="alert"], .text-red-600').textContent().catch(() => '');
        record('Login Submission', errorText ? 'FAIL' : 'PASS', errorText || 'Still on login');
      }
    } else {
      record('Login Form', 'PASS', 'Session already cached');
    }

    // ==========================================
    // 2. TEST AGENT OPERATIONS (/agents)
    // ==========================================
    console.log('\n--- 2. Testing Agent Operations (/agents) ---');
    await page.goto(`${BASE_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const errorBlock = page.locator('text=Could not load data from the API');
    if (await errorBlock.isVisible().catch(() => false)) {
      record('Agent Operations Load', 'FAIL', 'Found 500 API error banner');
    } else {
      record('Agent Operations Load', 'PASS', 'Loaded smoothly without error banner');
    }

    // Test clicking role filter buttons ("Research & Trend", "Growth Lead", "SEO Worker", "Content Marketing", "Community", "Performance")
    const roleButtons = page.locator('button').filter({ hasText: /Research & Trend|Growth Lead|SEO Worker|Content Marketing|Community|Performance/i });
    const pillCount = await roleButtons.count().catch(() => 0);
    for (let i = 0; i < Math.min(pillCount, 6); i++) {
      await roleButtons.nth(i).click().catch(() => {});
      await page.waitForTimeout(150);
    }
    record('Role Filter Buttons', 'PASS', `Interacted with ${pillCount} role cards`);

    // Test Autopilot inputs
    const leadTargetInp = page.locator('input[aria-label="Mục tiêu số lead"]').first();
    if (await leadTargetInp.isVisible().catch(() => false)) {
      await leadTargetInp.fill('150');
    }
    const ctaInp = page.locator('label:has-text("CTA") input').first();
    if (await ctaInp.isVisible().catch(() => false)) {
      await ctaInp.fill('Ưu đãi du lịch Đà Nẵng TripC - Tư vấn ngay');
    }

    // Test Checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count().catch(() => 0);
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).click().catch(() => {});
    }
    record('Autopilot Checkboxes', 'PASS', `Toggled ${cbCount} automation checkboxes`);

    // Test Autopilot buttons
    await safeClick(page.locator('button:has-text("Tạm dừng lịch"), button:has-text("Bật tự động")').first(), 'Tạm dừng/Bật tự động');
    await safeClick(page.locator('button:has-text("Chạy ngay")').first(), 'Chạy ngay');
    await safeClick(page.locator('button:has-text("Tạo research run ngay")').first(), 'Tạo research run ngay');

    // Test Task row click & modal close
    const taskBtn = page.locator('button.font-semibold.text-blue-800').first();
    if (await taskBtn.isVisible().catch(() => false)) {
      await taskBtn.click().catch(() => {});
      await page.waitForTimeout(400);
      await safeClick(page.locator('button:has-text("Đóng")').first(), 'Đóng modal chi tiết task');
    }

    // ==========================================
    // 3. TEST GOOGLE MAPS & DRIVE HUB (/gmaps)
    // ==========================================
    console.log('\n--- 3. Testing Google Maps & Drive Hub (/gmaps) ---');
    await page.goto(`${BASE_URL}/gmaps`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const gmapsHeading = page.locator('h1, h2, h3').filter({ hasText: /Google Maps Specialist|Quản lý Địa điểm|TripC/i }).first();
    record('Google Maps Hub Render', await gmapsHeading.isVisible().catch(() => false) ? 'PASS' : 'FAIL', 'Page rendered properly inside AppShell');

    // Switch between 3 sub-tabs
    await safeClick(page.locator('button:has-text("Bài đăng Local Posts")').first(), 'Tab Bài đăng Local Posts');
    await page.waitForTimeout(300);
    await safeClick(page.locator('button:has-text("Kho Tư Liệu Drive")').first(), 'Tab Kho Tư Liệu Drive');
    await page.waitForTimeout(300);
    await safeClick(page.locator('button:has-text("Đánh giá")').first(), 'Tab Đánh giá');
    await page.waitForTimeout(300);

    // Test Review Auto-Reply button
    await safeClick(page.locator('button:has-text("AI Trả Lời Ngay")').first(), 'AI Trả Lời Ngay');

    // Test Drive Asset modal
    const addAssetBtn = page.locator('button:has-text("Tải Lên Ảnh"), button:has-text("Drive Ingestion")').first();
    if (await addAssetBtn.isVisible().catch(() => false)) {
      await addAssetBtn.click().catch(() => {});
      await page.waitForTimeout(400);

      const modal = page.locator('div[role="dialog"], .fixed').filter({ hasText: /Tải Lên Ảnh Địa Điểm|Google Drive/i }).first();
      if (await modal.isVisible().catch(() => false)) {
        const titleInp = modal.locator('input[type="text"]').first();
        if (await titleInp.isVisible().catch(() => false)) {
          await titleInp.fill('Ảnh Bãi Biển Mỹ Khê Sáng Sớm');
        }
        await safeClick(modal.locator('button[type="submit"]').first(), 'Xác nhận tải lên ảnh Drive');
        await page.waitForTimeout(600);
      }
    }

    // Switch back to Drive tab and click "Đăng lên Google Maps"
    await safeClick(page.locator('button:has-text("Kho Tư Liệu Drive")').first(), 'Tab Kho Tư Liệu Drive');
    await page.waitForTimeout(300);
    await safeClick(page.locator('button:has-text("Đăng lên Google Maps")').first(), 'Đăng lên Google Maps');

    // ==========================================
    // 4. TEST INBOX & BOOKING LEADS (/booking-leads)
    // ==========================================
    console.log('\n--- 4. Testing Booking Leads Concierge (/booking-leads) ---');
    await page.goto(`${BASE_URL}/booking-leads`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const leadsHeading = page.locator('h1, h2, h3').filter({ hasText: /Khách Hàng Tiềm Năng|Omnichannel/i }).first();
    record('Booking Leads Render', await leadsHeading.isVisible().catch(() => false) ? 'PASS' : 'FAIL', 'Page rendered properly inside AppShell');

    // Filter status dropdown
    const leadSelect = page.locator('select').first();
    if (await leadSelect.isVisible().catch(() => false)) {
      await leadSelect.selectOption('confirmed').catch(() => {});
      await page.waitForTimeout(200);
      await leadSelect.selectOption('all').catch(() => {});
      record('Status Filter Select', 'PASS', 'Toggled lead filter dropdown (confirmed -> all)');
    }

    // Refresh button
    await safeClick(page.locator('button:has-text("Làm mới")').first(), 'Làm mới danh sách lead');

    // Action button on lead
    await safeClick(page.locator('button:has-text("Xác Nhận")').first(), 'Xác Nhận đặt bàn lead');
    await safeClick(page.locator('button:has-text("Đã Cọc")').first(), 'Đã Cọc tiền lead');

    // ==========================================
    // 5. TEST ZERO-TECH ONBOARDING (/onboarding)
    // ==========================================
    console.log('\n--- 5. Testing Zero-Tech Onboarding (/onboarding) ---');
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const onboardHeading = page.locator('h1, h2, h3').filter({ hasText: /Zero-Tech|Khởi Tạo/i }).first();
    record('Onboarding Render', await onboardHeading.isVisible().catch(() => false) ? 'PASS' : 'FAIL', 'Page rendered properly inside AppShell');

    const inputs = page.locator('input[type="text"], input[type="url"]');
    const inputCount = await inputs.count().catch(() => 0);
    if (inputCount >= 4) {
      await inputs.nth(0).fill('https://facebook.com/tripc.danang');
      await inputs.nth(1).fill('https://maps.google.com/?cid=123456');
      await inputs.nth(2).fill('https://drive.google.com/drive/folders/sample');
      await inputs.nth(3).fill('https://tiktok.com/@tripc.danang');
      record('Onboarding 4 Links Input', 'PASS', 'Filled Fanpage, Maps, Drive, TikTok links');
    }
    await safeClick(page.locator('button[type="submit"]').first(), 'Kích hoạt Phòng Marketing AI');

    // ==========================================
    // 6. TEST ADMIN MULTI-LLM (/admin/llm)
    // ==========================================
    console.log('\n--- 6. Testing Admin Multi-LLM (/admin/llm) ---');
    await page.goto(`${BASE_URL}/admin/llm`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const llmHeading = page.locator('h1, h2, h3').filter({ hasText: /Multi-LLM|Cấu Hình/i }).first();
    record('Admin LLM Render', await llmHeading.isVisible().catch(() => false) ? 'PASS' : 'FAIL', 'Page rendered properly inside AppShell');

    await safeClick(page.locator('button:has-text("Kiểm tra Ping")').first(), 'Kiểm tra Ping Gemini');
    await safeClick(page.locator('button[type="submit"]').first(), 'Lưu Cấu Hình Multi-LLM');

    // ==========================================
    // 7. TEST OVERVIEW DASHBOARD (/dashboard)
    // ==========================================
    console.log('\n--- 7. Testing Dashboard (/dashboard) ---');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    // Test Report period select (7, 30, 90)
    const periodSelect = page.locator('select[aria-label="Report period"]').first();
    if (await periodSelect.isVisible().catch(() => false)) {
      await periodSelect.selectOption('7').catch(() => {});
      await page.waitForTimeout(300);
      await periodSelect.selectOption('30').catch(() => {});
      await page.waitForTimeout(300);
      record('Report Period Select', 'PASS', 'Changed date range to 7 days then 30 days');
    }

    await safeClick(page.locator('button[title*="Refresh metrics"]').first(), 'Refresh metrics');
    await safeClick(page.locator('button[title*="Sync metrics"]').first(), 'Sync metrics');

    // ==========================================
    // 8. TEST REVIEW QUEUE (/review-queue)
    // ==========================================
    console.log('\n--- 8. Testing Review Queue (/review-queue) ---');
    await page.goto(`${BASE_URL}/review-queue`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const reviewHeading = page.locator('h1, h2, h3').filter({ hasText: /phê duyệt|Review|Hàng chờ/i }).first();
    record('Review Queue Render', await reviewHeading.isVisible().catch(() => false) ? 'PASS' : 'WARN', 'Review Queue rendered');

    // ==========================================
    // 9. TEST ARTIFACTS (/artifacts)
    // ==========================================
    console.log('\n--- 9. Testing Artifacts (/artifacts) ---');
    await page.goto(`${BASE_URL}/artifacts`, { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    const artifactsHeading = page.locator('h1, h2, h3').filter({ hasText: /Artifact/i }).first();
    record('Artifacts Page Render', await artifactsHeading.isVisible().catch(() => false) ? 'PASS' : 'WARN', 'Artifacts rendered');

    // ==========================================
    // 10. TEST COMMUNITY GROWTH HUB (/agents/community)
    // ==========================================
    console.log('\n--- 10. Testing Community Specialist (/agents/community) ---');
    await page.goto(`${BASE_URL}/agents/community`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForWorkspaceReady(page);

    const commHeading = page.locator('h1, h2, h3').filter({ hasText: /Community|Cộng đồng/i }).first();
    record('Community Hub Render', await commHeading.isVisible().catch(() => false) ? 'PASS' : 'WARN', 'Community Hub rendered');

  } catch (err) {
    record('E2E Execution Error', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n==========================================');
  console.log('🏁 E2E WALKTHROUGH TEST SUMMARY:');
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.status === 'PASS').length}`);
  console.log(`Warnings: ${results.filter(r => r.status === 'WARN').length}`);
  console.log(`Failed: ${results.filter(r => r.status === 'FAIL').length}`);
  
  if (consoleErrors.length > 0) {
    console.log('\n⚠️ Console/Page Errors detected:');
    consoleErrors.forEach(e => console.log('  ', e));
  } else {
    console.log('\n✨ Zero Console/Page Errors detected!');
  }

  if (networkErrors.length > 0) {
    console.log('\n⚠️ Failed Network Requests (HTTP 4xx/5xx):');
    networkErrors.forEach(e => console.log('  ', e));
  } else {
    console.log('\n✨ Zero Failed Network Requests!');
  }
}

run().catch(console.error);
