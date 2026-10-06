import { Page, expect } from '@playwright/test';

export class KnowledgePage {
  readonly page: Page;
  
  // Các nút và thành phần trên giao diện
  readonly uploadButton = 'button:has-text("Upload")';
  readonly fileInput = 'input[type="file"]';
  readonly submitButton = 'button:has-text("Submit")';
  readonly sourceList = '.source-list-container'; 
  readonly deleteButton = 'button:has-text("Delete")';

  constructor(page: Page) {
    this.page = page;
  }

  // Điều hướng tới trang Knowledge
  async goto() {
    await this.page.goto('/workspace/knowledge');
  }

  // Hành động tải file
  async uploadFile(filePath: string) {
    await this.page.click(this.uploadButton);
    await this.page.setInputFiles(this.fileInput, filePath);
    await this.page.click(this.submitButton);
  }
}