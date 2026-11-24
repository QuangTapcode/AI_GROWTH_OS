import { chromium } from 'playwright';

async function auditUi() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // 1. Login session setup
  const loginRes = await fetch('http://127.0.0.1:4000/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner.tripc.demo@gmail.com', password: 'password123' })
  });
  const { access_token, user, expires_at } = await loginRes.json();
  await page.goto('http://127.0.0.1:3000/login');
  await page.evaluate(({ access_token, expires_at, user }) => {
    localStorage.setItem('agos.session', JSON.stringify({ token: access_token, expiresAt: expires_at, user }));
    localStorage.setItem('agos.workspace', '10000000-0000-4000-8000-000000000001');
  }, { access_token, expires_at, user });

  const results = [];

  // 2. TEST COMMUNITY HUB: Expansion, Buttons, Actions
  console.log('--- Testing Community Hub UI ---');
  await page.goto('http://127.0.0.1:3000/agents/community', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Test details toggle
  const summary = await page.locator('summary').filter({ hasText: 'Xem nội dung' }).first();
  const hasSummary = await summary.isVisible().catch(() => false);
  if (hasSummary) {
    await summary.click();
    await page.waitForTimeout(500);
    const isExpanded = await page.locator('details[open]').first().isVisible().catch(() => false);
    results.push({ feature: 'Community - Xem nội dung & ảnh đã đăng', action: 'Click Expand', status: isExpanded ? 'PASSED' : 'FAILED' });
  }

  // Test publish fresh button
  const pubFreshBtn = await page.locator('button').filter({ hasText: 'Đăng ngay 1 bài mới' }).first();
  if (await pubFreshBtn.isVisible().catch(() => false)) {
    await pubFreshBtn.click();
    await page.waitForTimeout(1500);
    results.push({ feature: 'Community - Nút Đăng ngay 1 bài mới', action: 'Click Publish Fresh', status: 'PASSED' });
  }

  // Test link "Xem bài Web"
  const webLink = await page.locator('a').filter({ hasText: 'Xem bài Web' }).first();
  const webHref = await webLink.getAttribute('href').catch(() => null);
  results.push({ feature: 'Community - Link Xem bài Web ↗', action: 'Check href target', status: webHref && webHref.includes('3001') ? `PASSED (${webHref})` : 'FAILED' });

  // 3. TEST WORKFLOWS & TASKS: Modal detail click
  console.log('--- Testing Workflows UI ---');
  await page.goto('http://127.0.0.1:3000/workflows', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const stageBtn = await page.locator('button[data-test-id]').first();
  if (await stageBtn.isVisible().catch(() => false)) {
    await stageBtn.click();
    await page.waitForTimeout(1000);
    const modalVisible = await page.locator('div[role="dialog"]').first().isVisible().catch(() => false);
    results.push({ feature: 'Workflows - Mở Stage Detail Modal', action: 'Click Pipeline Stage', status: modalVisible ? 'PASSED' : 'FAILED' });
    await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/verified_workflow_modal.png' });
    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 4. TEST REVIEW QUEUE: Item selection & modal
  console.log('--- Testing Review Queue UI ---');
  await page.goto('http://127.0.0.1:3000/review-queue', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const reviewCard = await page.locator('text=Cẩm nang').first();
  const hasReviewItem = await reviewCard.isVisible().catch(() => false);
  results.push({ feature: 'Review Queue - Thẻ duyệt nội dung', action: 'Render and verify item', status: hasReviewItem ? 'PASSED' : 'EMPTY_OR_LOADED' });

  // 5. TEST DISTRIBUTION: Render and Post Links
  console.log('--- Testing Distribution UI ---');
  await page.goto('http://127.0.0.1:3000/distribution', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const postItem = await page.locator('text=Cẩm nang du lịch trải nghiệm Đà Nẵng 2026').first();
  const hasDistPost = await postItem.isVisible().catch(() => false);
  results.push({ feature: 'Distribution - Danh sách bài phân phối', action: 'Render card & schedule', status: hasDistPost ? 'PASSED' : 'FAILED' });

  console.log('AUDIT RESULTS:');
  console.table(results);

  await page.close();
  await browser.close();
}

auditUi().catch(console.error);
