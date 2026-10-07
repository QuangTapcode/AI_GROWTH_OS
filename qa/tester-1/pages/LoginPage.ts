import { Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  
  // Định nghĩa các phần tử trên trang (Locators)
  readonly emailInput = 'input[name="email"]';
  readonly passwordInput = 'input[name="password"]';
  readonly loginButton = 'button[type="submit"]';
  readonly errorMessage = '.error-message'; // Chờ FE chốt class name

  constructor(page: Page) {
    this.page = page;
  }

  // Hành động điều hướng
  async goto() {
    await this.page.goto('/login'); // Sẽ tự ghép với baseURL: 'http://localhost:3000'
  }

  // Hành động đăng nhập
  async login(email: string, password: string) {
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.passwordInput, password);
    await this.page.click(this.loginButton);
  }

  // Hàm kiểm tra (Assertions) dùng chung
  async expectLoginFailure() {
    await expect(this.page.locator(this.errorMessage)).toBeVisible();
  }
}