import { chromium } from 'playwright';

async function testViews() {
  console.log('=== TEST TRỰC TIẾP TRÊN TRÌNH DUYỆT CÁC MÀN HÌNH ĐÃ SỬA ===\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Lấy token đăng nhập
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

  // 2. Test Workflows (/workflows)
  console.log('1. Kiểm tra /workflows...');
  await page.goto('http://127.0.0.1:3000/workflows', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Loading workflow tasks...', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const workflowsHasError = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
  console.log(`   -> Lỗi banner đỏ: ${workflowsHasError ? 'CÒN LỖI ❌' : 'ĐÃ HẾT LỖI ✅'}`);
  const workflowsPath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/workflows-fixed.png';
  await page.screenshot({ path: workflowsPath, fullPage: true });
  console.log(`   -> Chụp ảnh: ${workflowsPath}\n`);

  // 3. Test Distribution (/distribution)
  console.log('2. Kiểm tra /distribution...');
  await page.goto('http://127.0.0.1:3000/distribution', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Loading workspace...', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const distHasError = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
  console.log(`   -> Lỗi banner đỏ: ${distHasError ? 'CÒN LỖI ❌' : 'ĐÃ HẾT LỖI ✅'}`);
  const distPath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/distribution-fixed.png';
  await page.screenshot({ path: distPath, fullPage: true });
  console.log(`   -> Chụp ảnh: ${distPath}\n`);

  // 4. Test Review Queue (/review-queue)
  console.log('3. Kiểm tra /review-queue...');
  await page.goto('http://127.0.0.1:3000/review-queue', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Loading review queue...', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const reviewHasError = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
  console.log(`   -> Lỗi banner đỏ: ${reviewHasError ? 'CÒN LỖI ❌' : 'ĐÃ HẾT LỖI ✅'}`);
  
  const itemsText = await page.locator('main').innerText();
  const hasItems = itemsText.includes('Cẩm nang') || itemsText.includes('Sơn Trà') || itemsText.includes('pending') || itemsText.includes('Pending review');
  console.log(`   -> Có dữ liệu hàng chờ phê duyệt: ${hasItems ? 'CÓ DỮ LIỆU ĐẦY ĐỦ ✅' : 'CHƯA CÓ ❌'}`);
  
  const reviewPath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/review-queue-fixed.png';
  await page.screenshot({ path: reviewPath, fullPage: true });
  console.log(`   -> Chụp ảnh: ${reviewPath}\n`);

  await browser.close();
  console.log('=== HOÀN TẤT KIỂM TRA ===');
}

testViews().catch(console.error);
