import { Page, expect } from '@playwright/test';

export class PilotFormPage {
  readonly page: Page;
  
  // Locators của Form thu thập Lead
  readonly nameInput = 'input[name="fullName"]';
  readonly emailInput = 'input[name="email"]';
  readonly companyInput = 'input[name="company"]';
  readonly submitButton = 'button[type="submit"]';
  
  // Locators của các thông báo trạng thái
  readonly successMessage = '.toast-success';
  readonly errorMessage = '.toast-error';
  readonly loadingSpinner = '.spinner';

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/pilot-registration');
  }

  async fillForm(name: string, email: string, company: string) {
    await this.page.fill(this.nameInput, name);
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.companyInput, company);
  }

  async submit() {
    await this.page.click(this.submitButton);
  }
}