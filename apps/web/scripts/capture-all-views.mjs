import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce';
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, 'inspection');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function inspectAllPages() {
  console.log('=== TIẾN HÀNH KIỂM TRA TRỰC TIẾP TRÊN TRÌNH DUYỆT TỪNG MỤC MỘT ===\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Đăng nhập
  console.log('[Auth] Đăng nhập vào hệ thống...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.fill('input[type="email"]', 'owner.tripc.demo@gmail.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('✓ Đăng nhập thành công, đã vào /dashboard.\n');

  const targets = [
    {
      id: '01_dashboard',
      name: '1. Overview (Tổng quan)',
      url: '/dashboard'
    },
    {
      id: '02_agents',
      name: '2. Agent Operations (Tổng quan 6 Agent)',
      url: '/agents'
    },
    {
      id: '02_1_community',
      name: '2.1 Agent Community (Cộng đồng)',
      url: '/agents/community'
    },
    {
      id: '02_2_research',
      name: '2.2 Agent Research (Nghiên cứu)',
      url: '/agents/research'
    },
    {
      id: '02_3_growth_lead',
      name: '2.3 Agent Growth Lead (Điều phối)',
      url: '/agents/growth_lead'
    },
    {
      id: '02_4_seo',
      name: '2.4 Agent SEO (Tối ưu tìm kiếm)',
      url: '/agents/seo'
    },
    {
      id: '02_5_content',
      name: '2.5 Agent Content (Kịch bản)',
      url: '/agents/content'
    },
    {
      id: '02_6_performance',
      name: '2.6 Agent Performance (Hiệu suất)',
      url: '/agents/performance'
    },
    {
      id: '03_workflows',
      name: '3. Workflows & Tasks (Nhiệm vụ & Quy trình)',
      url: '/workflows'
    },
    {
      id: '04_artifacts',
      name: '4. Artifacts (Kho tài nguyên)',
      url: '/artifacts'
    },
    {
      id: '05_review_queue',
      name: '5. Review Queue (Hàng chờ phê duyệt)',
      url: '/review-queue'
    },
    {
      id: '06_distribution',
      name: '6. Distribution (Phân phối đa kênh)',
      url: '/distribution'
    },
    {
      id: '07_growth_results',
      name: '7. Growth Results (Đo lường tăng trưởng)',
      url: '/growth-results'
    },
    {
      id: '08_workspace',
      name: '8. Workspace & Integrations (Cài đặt & Tích hợp)',
      url: '/workspace'
    }
  ];

  for (const item of targets) {
    console.log(`Đang kiểm tra: ${item.name} (${item.url})...`);
    await page.goto('http://127.0.0.1:3000' + item.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const screenshotPath = path.join(SCREENSHOTS_DIR, `${item.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Kiểm tra các phần tử hiển thị thực tế
    const mainText = await page.locator('main').innerText().catch(() => '');
    const hasErrorBanner = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
    const hasYellowBanner = await page.locator('text=API Backend (:4000) vừa gặp lỗi').isVisible().catch(() => false);

    // Lấy tiêu đề thực tế trong thẻ main
    const heading = await page.locator('main h1, main h2').first().innerText().catch(() => 'Không có heading');

    console.log(`  -> Tiêu đề hiển thị: "${heading.trim()}"`);
    console.log(`  -> Banner lỗi: ${hasErrorBanner || hasYellowBanner ? 'CÓ LỖI' : 'SẠCH (0 lỗi)'}`);
    console.log(`  -> Nội dung đầu trang: ${mainText.slice(0, 100).replace(/\n/g, ' ')}...`);
    console.log(`  -> Ảnh đã chụp: ${screenshotPath}\n`);
  }

  await browser.close();
  console.log('=== TOÀN BỘ 14 MÀN HÌNH ĐÃ ĐƯỢC CHỤP ẢNH VÀ XÁC THỰC TRỰC TIẾP ===');
}

inspectAllPages().catch(err => {
  console.error('Lỗi kiểm tra:', err);
  process.exit(1);
});
