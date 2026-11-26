import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', headless: true });

test.describe('Autonomous 3D Office 2026 - Live UI Verification', () => {
  test('kiểm tra toàn diện giao diện 3D Office, HUD, Inspector, Mini-map và Command Palette', async ({ page }) => {
    // 0. Thiết lập Mock Session & Workspace trong localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'agos.session',
        JSON.stringify({
          token: 'demo-token-office-2026',
          expiresAt: '2030-01-01T00:00:00.000Z',
          user: {
            id: 'user-demo-1',
            email: 'admin@growthos.ai',
            full_name: 'Lead AI Architect',
          },
        })
      );
      window.localStorage.setItem('agos.workspace', '10000000-0000-4000-8000-000000000001');
    });

    // Mock all API endpoints on port 4000
    await page.route(/.*:4000\/.*/, async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/me') || url.includes('/me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-demo-1',
              email: 'admin@growthos.ai',
              full_name: 'Lead AI Architect',
              avatar_url: null,
              last_login_at: null,
            },
            workspaces: [
              {
                workspace_id: '10000000-0000-4000-8000-000000000001',
                name: 'TripC Da Nang',
                slug: 'tripc',
                role: 'owner',
              },
            ],
          }),
        });
      } else if (url.includes('/automation')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            settings: { enabled: true },
            tasks: [
              {
                id: 'task-1',
                role: 'growth_lead',
                operation: 'Daily Strategic Audit',
                status: 'running',
                started_at: '2026-11-24T08:00:00Z',
              },
              {
                id: 'task-2',
                role: 'seo',
                operation: 'Keyword Cluster Mapping',
                status: 'completed',
              },
              {
                id: 'task-3',
                role: 'content',
                operation: 'Viral Script Generation',
                status: 'needs_review',
              },
            ],
          }),
        });
      } else if (url.includes('/approvals') || url.includes('/exceptions')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [] }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
    });

    // 1. Điều hướng vào route /office
    await page.goto('http://127.0.0.1:3000/office', { waitUntil: 'networkidle', timeout: 30000 });

    // 2. Chờ phần tử HUD xuất hiện
    const titleLocator = page.locator('text=AI GROWTH OS').first();
    await expect(titleLocator).toBeVisible({ timeout: 15000 });

    const badge3D = page.locator('text=3D OFFICE 2026').first();
    await expect(badge3D).toBeVisible();

    // Chờ 3D Canvas hoặc giao diện render ổn định
    await page.waitForTimeout(2500);

    // Chụp ảnh tổng quan toàn màn hình 3D Office
    await page.screenshot({ path: 'tests/e2e/screenshots/01_office_overview.png', fullPage: true });

    // 3. Kiểm tra dải 8 Agent Pills trên HUD
    const agentNames = [
      'Growth Lead',
      'Asset Manager',
      'Content Planner',
      'Publisher',
      'Maps Specialist',
      'Comment Reply',
      'Inbox Concierge',
      'Community Growth',
    ];

    for (const name of agentNames) {
      await expect(page.locator(`text=${name}`).first()).toBeVisible();
    }

    // 4. Bấm chọn Agent 1 (Growth Lead) để mở AgentInspector drawer
    const growthLeadPill = page.locator('button', { hasText: 'Growth Lead' }).first();
    await growthLeadPill.click();

    // Kiểm tra Inspector hiển thị các tab
    await expect(page.locator('text=Tổng Quan').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Tiến Trình').first()).toBeVisible();
    await expect(page.locator('text=Nhật Ký Tác Vụ').first()).toBeVisible();

    // Bấm sang tab "Tiến Trình" để kiểm tra AgentTaskSteps
    await page.locator('button', { hasText: 'Tiến Trình' }).click();
    await expect(page.locator('text=Tiến trình tác vụ tự hành').first()).toBeVisible();

    // Chụp ảnh Agent Inspector
    await page.screenshot({ path: 'tests/e2e/screenshots/02_agent_inspector.png' });

    // Bấm phím Esc để đóng Inspector
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 5. Mở Sơ Đồ Mặt Bằng (Floor Plan Mini-Map) bằng phím P
    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    const floorPlanSvg = page.locator('svg[viewBox="0 0 100 70"]');
    await expect(floorPlanSvg).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/e2e/screenshots/03_floor_plan.png' });

    // 6. Mở Nhật Ký Sự Kiện bằng phím T
    await page.keyboard.press('t');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Nhật Ký Tác Vụ').first()).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/screenshots/04_activity_timeline.png' });

    // 7. Kích hoạt Command Palette bằng nút tìm lệnh
    const searchBtn = page.locator('button[title*="Ctrl+K"]');
    await searchBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('input[placeholder*="Ctrl+K"]')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/e2e/screenshots/05_command_palette.png' });

    // Đóng Command Palette bằng Esc
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 8. Chuyển đổi sang chế độ 2D Fallback
    const button2D = page.locator('button', { hasText: '2D' }).first();
    await button2D.click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Chế độ Văn Phòng 2D (Standard Performance)').first()).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/screenshots/06_office_2d_fallback.png' });

    // Chuyển lại về 3D
    const button3D = page.locator('button', { hasText: '3D' }).first();
    await button3D.click();
    await page.waitForTimeout(1000);
  });
});
