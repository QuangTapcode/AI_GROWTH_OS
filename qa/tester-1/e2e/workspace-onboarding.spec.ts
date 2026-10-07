import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('M01: Luồng Đăng nhập và Onboarding Workspace', () => {

  test('Đăng nhập thành công bằng tài khoản Owner (TripC)', async ({ page }) => {
    // 1. Khởi tạo Page Object
    const loginPage = new LoginPage(page);

    // 2. Thực hiện hành động
    //await loginPage.goto();
    // (Tài khoản giả lập - Đợi BE Thiệu Quang cấp account thật trên Staging)
    //await loginPage.login('owner@tripc.vn', 'password123');

    // 3. Kiểm tra kết quả (Ví dụ: Chuyển hướng thành công sang Dashboard)
    // await expect(page).toHaveURL('/workspace/dashboard');
    // await expect(page.locator('h1')).toContainText('TripC Workspace');
  });

  test('Hiển thị lỗi khi đăng nhập sai thông tin', async ({ page }) => {
    const loginPage = new LoginPage(page);
  //  await loginPage.goto();
  //  await loginPage.login('wrong@email.com', 'wrongpass');

    // Kiểm tra thông báo lỗi hiển thị
    // await loginPage.expectLoginFailure();
  });
});