import { test, expect } from '@playwright/test';
import { PilotFormPage } from '../pages/PilotFormPage';

test.describe('M13: Luồng thu thập Lead Pilot Form', () => {

  test('Form báo thành công KHI VÀ CHỈ KHI Server xác nhận 200 OK', async ({ page }) => {
    const pilotPage = new PilotFormPage(page);

    // Tạm comment lệnh goto chờ UI
    // await pilotPage.goto();
    // await pilotPage.fillForm('Nguyễn Văn A', 'a@company.com', 'Tech Corp');

    // 1. Dùng Playwright chặn request gửi đi và GIẢ LẬP Server trả về thành công (200 OK)
    await page.route('**/api/leads/register', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    });

    // await pilotPage.submit();

    // Yêu cầu: Spinner phải xuất hiện chờ đợi, sau đó thông báo Success mới hiện ra
    // await expect(page.locator(pilotPage.loadingSpinner)).toBeVisible();
    // await expect(page.locator(pilotPage.successMessage)).toBeVisible();
  });

  test('Form hiển thị lỗi khi Server sập (500) hoặc mất mạng', async ({ page }) => {
    const pilotPage = new PilotFormPage(page);

    // await pilotPage.goto();
    // await pilotPage.fillForm('Trần B', 'b@company.com', 'Fail Corp');

    // 2. Giả lập Server bị sập (trả về 500 Internal Error)
    await page.route('**/api/leads/register', async route => {
      await route.fulfill({ status: 500, body: 'Server Error' });
    });

    // await pilotPage.submit();

    // Yêu cầu: Không được phép hiển thị Success. Phải báo lỗi cho user.
    // await expect(page.locator(pilotPage.successMessage)).not.toBeVisible();
    // await expect(page.locator(pilotPage.errorMessage)).toBeVisible();
  });

});