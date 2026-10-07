import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { KnowledgePage } from '../pages/KnowledgePage';
import * as fs from 'fs';
import * as path from 'path';

// 1. Đọc dữ liệu dùng chung từ thư mục fixtures
const testDataPath = path.join(__dirname, '../../fixtures/test_data.json');
const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
const tripcOwner = testData.users.tenant_1_tripc.owner;

test.describe('M02: Luồng Vòng đời Tài liệu (Knowledge Source Lifecycle)', () => {

  test('Tải lên và hiển thị tài liệu mới thành công', async ({ page }) => {
    // Bước 1: Đăng nhập bằng dữ liệu lấy từ file JSON
    const loginPage = new LoginPage(page);
    //await loginPage.goto();
    //await loginPage.login(tripcOwner.email, tripcOwner.password);

    // Bước 2: Vào trang Knowledge Base
    const knowledgePage = new KnowledgePage(page);
    //await knowledgePage.goto();

    // Bước 3: Tạo nhanh 1 file PDF giả lập
    const fakePdfPath = 'bao-cao-tripc.pdf';
    fs.writeFileSync(fakePdfPath, 'Nội dung PDF giả lập để test...');

    // Đợi FE code xong UI sẽ mở comment các dòng dưới để chạy thực tế:
    // await knowledgePage.uploadFile(fakePdfPath);
    // await expect(page.locator(knowledgePage.sourceList)).toContainText('bao-cao-tripc.pdf');

    // Bước 4: Xóa file giả lập
    fs.unlinkSync(fakePdfPath);
  });
});