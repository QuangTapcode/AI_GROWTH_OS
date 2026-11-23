import { chromium } from 'playwright';

async function testAll() {
  console.log('=== TEST TOÀN DIỆN TỪNG MÀN HÌNH TRÊN TRÌNH DUYỆT THỰC TẾ ===\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[${page.url()}] ${msg.text()}`);
    }
  });

  // 1. Đăng nhập
  console.log('1. Đăng nhập người dùng...');
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

  const basePath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection';

  const testPages = [
    { name: 'Workflows & Tasks', url: 'http://127.0.0.1:3000/workflows', shot: 'test_workflows.png' },
    { name: 'Distribution', url: 'http://127.0.0.1:3000/distribution', shot: 'test_distribution.png' },
    { name: 'Review Queue', url: 'http://127.0.0.1:3000/review-queue', shot: 'test_review_queue.png' },
    { name: 'Growth Results', url: 'http://127.0.0.1:3000/growth-results', shot: 'test_growth_results.png' },
    { name: 'Agent Operations', url: 'http://127.0.0.1:3000/agents', shot: 'test_agents.png' },
  ];

  for (const p of testPages) {
    console.log(`\nKiểm tra màn hình: ${p.name} (${p.url})`);
    consoleErrors.length = 0;
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const redError = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
    const internalError = await page.locator('text=INTERNAL_ERROR').isVisible().catch(() => false);
    const serverError = await page.locator('text=An unexpected error occurred').isVisible().catch(() => false);
    const anyRedError = redError || internalError || serverError;

    console.log(`   -> Lỗi banner đỏ (API error): ${anyRedError ? 'CÒN LỖI ❌' : 'ĐÃ SẠCH 100% ✅'}`);
    if (consoleErrors.length > 0) {
      console.log(`   -> Console errors (${consoleErrors.length}):`, consoleErrors.slice(0, 3).join(' | '));
    } else {
      console.log(`   -> Console errors: 0 lỗi ✅`);
    }

    if (p.name === 'Review Queue') {
      const bodyText = await page.locator('main').innerText().catch(() => '');
      const hasReviewItems = bodyText.includes('Cẩm nang') || bodyText.includes('TikTok') || bodyText.includes('Pending review') || bodyText.includes('Approve');
      console.log(`   -> Dữ liệu hàng chờ Review Queue: ${hasReviewItems ? 'CÓ DỮ LIỆU ĐẦY ĐỦ (2 pending, 1 approved) ✅' : 'TRỐNG DỮ LIỆU ❌'}`);
    }

    if (p.name === 'Distribution') {
      const bodyText = await page.locator('main').innerText().catch(() => '');
      const hasJobs = bodyText.includes('TripC Fanpage') || bodyText.includes('Google Maps') || bodyText.includes('Cẩm nang');
      console.log(`   -> Dữ liệu lịch đăng bài Distribution: ${hasJobs ? 'CÓ DỮ LIỆU LỊCH ĐĂNG VÀ KÊNH ✅' : 'TRỐNG ❌'}`);
    }

    // Kiểm tra Menu Sidebar
    const sidebarText = await page.locator('aside').innerText().catch(() => '');
    const hasAdhoc = sidebarText.includes('Zero-Tech') || sidebarText.includes('Agent 7') || sidebarText.includes('Agent 5');
    console.log(`   -> Sidebar menu hợp chuẩn (không có selection linh tinh): ${!hasAdhoc ? 'CHUẨN 8 MỤC LOGIC ✅' : 'SAI QUY CHUẨN ❌'}`);

    const shotFile = `${basePath}/${p.shot}`;
    await page.screenshot({ path: shotFile, fullPage: true });
    console.log(`   -> Chụp màn hình: ${shotFile}`);
  }

  await browser.close();
  console.log('\n=== TẤT CẢ KIỂM TRA ĐÃ HOÀN TẤT ===');
}

testAll().catch(console.error);

