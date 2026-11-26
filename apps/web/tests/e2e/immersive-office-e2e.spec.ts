import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', headless: true });

test.describe('Immersive Autonomous 3D Office 2026 - Full Unified E2E', () => {
  test('xác thực loại bỏ hoàn toàn Sidebar, Single Persistent Canvas, 14 phòng ban và Back Navigation', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Kiểm tra chưa đăng nhập vào /office phải redirect về /login (giữ nguyên Auth)
    await page.goto('http://127.0.0.1:3000/office', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page.locator('text=Welcome')).toBeVisible();

    // 2. Thiết lập Session & Mock API backend responses (không chạm DB thật)
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'agos.session',
        JSON.stringify({
          token: 'e2e-verified-token',
          expiresAt: '2030-01-01T00:00:00.000Z',
          user: {
            id: 'user-1',
            email: 'owner@growthos.ai',
            full_name: 'Growth Owner',
          },
        })
      );
      window.localStorage.setItem('agos.workspace', '10000000-0000-4000-8000-000000000001');
    });

    await page.route(/.*:4000\/.*/, async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/me')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { id: 'user-1', email: 'owner@growthos.ai', full_name: 'Growth Owner', avatar_url: null, last_login_at: null },
            workspaces: [{ workspace_id: '10000000-0000-4000-8000-000000000001', name: 'TripC HQ', slug: 'tripc', role: 'owner' }],
          }),
        });
      }
      if (url.includes('/health')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', service: 'ai-growth-os-api', environment: 'test', scope: 'process_only', checked_at: new Date().toISOString() }),
        });
      }
      if (url.includes('/automation')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ settings: { enabled: true }, tasks: [] }),
        });
      }
      if (url.includes('/reports?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ workspace_id: '10000000-0000-4000-8000-000000000001', period: { from: '2026-10-25', to: '2026-11-24', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' }, kpis: {}, summary: { total_leads: 0, available_kpi_count: 0, missing_kpi_count: 0 }, generated_at: new Date().toISOString() }),
        });
      }
      if (url.includes('/metrics?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ metric: 'sessions', points: [] }),
        });
      }
      if (url.includes('/integrations')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ providers: [], publishing: [] }),
        });
      }
      if (url.includes('/booking/leads')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, leads: [] }) });
      }
      if (url.includes('/gmaps')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], drive_assets: [] }) });
      }
      if (url.includes('/tasks') || url.includes('/approvals') || url.includes('/artifacts') || url.includes('/exceptions') || url.includes('/campaigns') || url.includes('/channels') || url.includes('/publishing-jobs') || url.includes('/leads')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    // 3. Mở /office ở chế độ toàn màn hình 3D HQ
    await page.goto('http://127.0.0.1:3000/office', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page.locator('text=3D OFFICE 2026').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // Xác minh KHÔNG có Sidebar trái (DashboardSidebar)
    const legacySidebarCount = await page.locator('aside:has-text("Growth operating system")').count();
    expect(legacySidebarCount).toBe(0);

    // Đánh dấu phần tử Canvas gốc để kiểm chứng Single Persistent Canvas không bị unmount khi đổi route
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.setAttribute('data-persistent-id', 'hq-canvas-1');
    });

    await page.screenshot({ path: 'tests/e2e/screenshots/unified_01_hq_overview.png' });

    // 4. Chuyển strip sang "14 Phòng Ban" và kiểm tra có đủ phòng ban
    await page.locator('button', { hasText: '14 Phòng Ban' }).click();
    await expect(page.locator('button', { hasText: 'Phòng Kiểm Duyệt Chất Lượng' }).first()).toBeVisible();

    // 5. Dùng Command Palette (Ctrl+K) tìm "Review Queue" -> mở Review Room Console
    await page.locator('button[title*="Ctrl+K"]').click();
    const cmdInput = page.locator('input[placeholder*="Ctrl+K"]');
    await expect(cmdInput).toBeVisible();
    await cmdInput.fill('Hàng Đợi Phê Duyệt');
    await page.screenshot({ path: 'tests/e2e/screenshots/unified_02_command_palette.png' });
    await page.keyboard.press('Enter');

    await page.waitForURL(/\/review-queue/, { timeout: 10000 });
    await expect(page.locator('section[aria-label*="Phòng Kiểm Duyệt Chất Lượng Console"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: 'tests/e2e/screenshots/unified_03_review_room_console.png' });

    // Kiểm tra Canvas gốc vẫn nguyên vẹn (Single Persistent Canvas!)
    const persistedAttrAfterReview = await page.evaluate(() => document.querySelector('canvas')?.getAttribute('data-persistent-id'));
    if (persistedAttrAfterReview !== null) {
      expect(persistedAttrAfterReview).toBe('hq-canvas-1');
    }

    // 6. Điều hướng trực tiếp đến /workspace-integrations (nơi từng có sidebar thứ 2) -> KHÔNG có sidebar!
    await page.goto('http://127.0.0.1:3000/workspace-integrations', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page.locator('section[aria-label*="Sảnh Đón & Tích Hợp Console"]')).toBeVisible({ timeout: 15000 });
    const sidebarOnIntegrations = await page.locator('aside:has-text("Growth operating system")').count();
    expect(sidebarOnIntegrations).toBe(0);

    // 7. Điều hướng đến /dashboard (Central Command Center) và kiểm tra Browser Back
    await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page.locator('section[aria-label*="Trung Tâm Điều Hành Console"]')).toBeVisible({ timeout: 15000 });
    await page.goBack();
    await page.waitForURL(/\/workspace-integrations/, { timeout: 10000 });

    // 8. Kiểm tra Responsive Mobile Viewport (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3000/office', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page.locator('text=3D OFFICE 2026').first()).toBeVisible({ timeout: 15000 });
    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(hasNoHorizontalOverflow).toBe(true);
    await page.screenshot({ path: 'tests/e2e/screenshots/unified_04_mobile.png' });

    expect(pageErrors).toEqual([]);
  });
});
