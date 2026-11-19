import { chromium } from 'playwright';

async function deepAudit() {
  console.log('=== KHỞI ĐỘNG KIỂM TRA TOÀN DIỆN E2E TRÊN GIAO DIỆN WEB THẬT ===');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const failedNetwork = [];
  const consoleErrors = [];

  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('favicon') && !res.url().includes('_next')) {
      failedNetwork.push(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error] ${msg.text()}`);
    }
  });

  // 1. Đăng nhập qua form thực tế
  console.log('1. Đăng nhập giao diện tại /login...');
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'owner.tripc.demo@gmail.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // 2. Rà soát cấu trúc Sidebar trên màn hình sau đăng nhập
  console.log('2. Rà soát Menu Sidebar theo chuẩn hệ thống...');
  await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const sidebarText = await page.locator('aside, nav').allInnerTexts();
  const joinedSidebar = sidebarText.join(' ');
  
  const forbiddenItems = [
    'Zero-Tech Onboarding',
    'Agent 7: Inbox & Leads (1-1)',
    'Agent 5: Maps & Drive',
    'Admin: Multi-LLM'
  ];

  for (const item of forbiddenItems) {
    if (joinedSidebar.includes(item)) {
      console.error(`❌ LỖI KIẾN TRÚC MENU: Vẫn xuất hiện "${item}" trên thanh sidebar!`);
    } else {
      console.log(`✅ Chuẩn kiến trúc: "${item}" đã được loại bỏ khỏi menu chính.`);
    }
  }

  // 3. Rà soát chi tiết 15 màn hình nghiệp vụ
  const testRoutes = [
    { name: 'Overview / Dashboard', url: '/dashboard' },
    { name: 'Agent Operations Tổng quan', url: '/agents' },
    { name: 'Agent Community', url: '/agents/community' },
    { name: 'Agent Research', url: '/agents/research' },
    { name: 'Agent Growth Lead', url: '/agents/growth_lead' },
    { name: 'Agent SEO', url: '/agents/seo' },
    { name: 'Agent Content Planner', url: '/agents/content' },
    { name: 'Agent Performance', url: '/agents/performance' },
    { name: 'Workflows & Tasks', url: '/workflows' },
    { name: 'Artifacts Kho tài nguyên', url: '/artifacts' },
    { name: 'Review Queue Phê duyệt', url: '/review-queue' },
    { name: 'Distribution Đa kênh', url: '/distribution' },
    { name: 'Growth Results Đo lường', url: '/growth-results' },
    { name: 'Workspace & Tích hợp', url: '/workspace' },
    { name: 'Knowledge Contexts', url: '/knowledge-contexts' }
  ];

  console.log('\n3. Rà soát chi tiết 15 màn hình nghiệp vụ:');
  for (const route of testRoutes) {
    failedNetwork.length = 0;
    consoleErrors.length = 0;

    await page.goto('http://127.0.0.1:3000' + route.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const hasErrorBanner = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
    const hasYellowBanner = await page.locator('text=API Backend (:4000) vừa gặp lỗi').isVisible().catch(() => false);
    const has500 = failedNetwork.some(e => e.includes('500'));

    if (hasErrorBanner || hasYellowBanner || has500) {
      console.error(`❌ [FAIL] ${route.name} (${route.url}) có lỗi:`);
      if (hasErrorBanner) console.error('   -> Phát hiện banner: Could not load data from the API');
      if (hasYellowBanner) console.error('   -> Phát hiện banner: API Backend vừa gặp lỗi khi tải dữ liệu nền');
      failedNetwork.forEach(n => console.error('   ->', n));
    } else {
      console.log(`✅ [PASS] ${route.name} (${route.url}) - Giao diện sạch, 0 lỗi 500, tải thành công.`);
    }
  }

  // 4. Test tương tác Dropdown chu kỳ trên /growth-results
  console.log('\n4. Test tương tác Dropdown chu kỳ & Bật/Tắt trên /growth-results:');
  await page.goto('http://127.0.0.1:3000/growth-results', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const select = page.locator('select');
  if (await select.count() > 0) {
    failedNetwork.length = 0;
    await select.selectOption('7d');
    await page.waitForTimeout(1500);
    console.log(`   -> Chuyển sang 7 ngày: ${failedNetwork.length === 0 ? 'Thành công (0 lỗi)' : 'Có lỗi: ' + failedNetwork.join(', ')}`);

    failedNetwork.length = 0;
    await select.selectOption('90d');
    await page.waitForTimeout(1500);
    console.log(`   -> Chuyển sang 90 ngày: ${failedNetwork.length === 0 ? 'Thành công (0 lỗi)' : 'Có lỗi: ' + failedNetwork.join(', ')}`);

    failedNetwork.length = 0;
    await select.selectOption('30d');
    await page.waitForTimeout(1500);
    console.log(`   -> Chuyển về 30 ngày: ${failedNetwork.length === 0 ? 'Thành công (0 lỗi)' : 'Có lỗi: ' + failedNetwork.join(', ')}`);
  }

  // Chụp ảnh bằng chứng trang Growth Results
  const screenshotGrowth = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/growth-results-verified.png';
  await page.screenshot({ path: screenshotGrowth, fullPage: true });
  console.log(`📸 Đã chụp ảnh xác thực Growth Results: ${screenshotGrowth}`);

  // 5. Test nút bấm trên Agent Operations
  console.log('\n5. Test tương tác nút bấm trên /agents:');
  await page.goto('http://127.0.0.1:3000/agents', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Kiểm tra nút Autopilot
  const autopilotBtn = page.locator('button:has-text("Bắt đầu tự động"), button:has-text("Kích hoạt Autopilot")');
  if (await autopilotBtn.count() > 0) {
    failedNetwork.length = 0;
    await autopilotBtn.first().click();
    await page.waitForTimeout(2000);
    const has500OnAutopilot = failedNetwork.some(n => n.includes('500'));
    console.log(`   -> Bấm kích hoạt Autopilot: ${!has500OnAutopilot ? 'Thành công (Không có lỗi 500)' : 'Lỗi: ' + failedNetwork.join(', ')}`);
  }

  const screenshotAgents = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/agents-verified-fixed.png';
  await page.screenshot({ path: screenshotAgents, fullPage: true });
  console.log(`📸 Đã chụp ảnh xác thực Agent Operations: ${screenshotAgents}`);

  console.log('\n=== HOÀN TẤT KIỂM TOÁN E2E TOÀN BỘ HỆ THỐNG ===');
  await browser.close();
}

deepAudit().catch(err => {
  console.error('Lỗi thực thi kiểm toán E2E:', err);
  process.exit(1);
});
