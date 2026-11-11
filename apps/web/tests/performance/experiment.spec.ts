import { test, expect } from '@playwright/test';

test('Facebook history renders missing values, zero baselines, provenance and a reconnect warning', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('agos.session',JSON.stringify({token:'dev_owner',expiresAt:'2099-01-01T00:00:00Z',user:{id:'11111111-1111-4000-8000-000000000001',email:'owner.performance@example.test',full_name:'Performance Owner'}}));
    localStorage.setItem('agos.workspace','f1000000-0000-4000-8000-000000000001');
  });
  await page.route('**/performance-social?*',route=>route.fulfill({json:{items:[{
    publishing_job_id:'job-fixture',artifact_id:'artifact-fixture',artifact_version:2,content_hash:'a'.repeat(64),title:'Controlled Facebook history fixture',
    external_post_id:'123_456',connection_status:'error',last_error:'FACEBOOK_TOKEN_INVALID_OR_EXPIRED',comparisons:[
      {metric:'reactions',baseline_value:0,current_value:1,absolute_change:1,relative_change_pct:null,status:'zero_baseline',baseline_captured_at:'2026-10-01T00:00:00Z',current_captured_at:'2026-10-02T00:00:00Z',missing_reason:null},
      {metric:'shares',baseline_value:null,current_value:null,absolute_change:null,relative_change_pct:null,status:'current_missing',baseline_captured_at:null,current_captured_at:'2026-10-02T00:00:00Z',missing_reason:'COUNTER_NOT_RETURNED'},
    ],
  }]}}));
  await page.goto('http://127.0.0.1:3018/agents/performance');
  await page.getByLabel('Kỳ so sánh Facebook bắt đầu',{exact:true}).fill('2026-10-02');
  await page.getByLabel('Kỳ so sánh Facebook kết thúc',{exact:true}).fill('2026-10-02');
  await page.getByRole('button',{name:'Xem so sánh Facebook',exact:true}).click();
  const article=page.getByRole('article').filter({hasText:'Controlled Facebook history fixture'});
  await expect(article).toContainText('artifact-fixture');
  await expect(article).toContainText('v2');
  await expect(article).toContainText('Mốc trước bằng 0 — không tính %');
  await expect(article).toContainText('Chưa có số hiện tại');
  await expect(article.getByRole('alert')).toContainText('FACEBOOK_TOKEN_INVALID_OR_EXPIRED');
});

test('owner approves two CTAs, visitor keeps assignment and a persisted form lead becomes one conversion', async ({ browser, page }) => {
  const workspace = 'f1000000-0000-4000-8000-000000000001';
  const campaign = `cta-test-${Date.now()}`;
  await page.addInitScript(({ workspace }) => {
    localStorage.setItem('agos.session', JSON.stringify({ token: 'dev_owner', expiresAt: '2099-01-01T00:00:00Z',
      user: { id: '11111111-1111-4000-8000-000000000001', email: 'owner.performance@example.test', full_name: 'Performance Owner' } }));
    localStorage.setItem('agos.workspace', workspace);
  }, { workspace });
  await page.goto('http://127.0.0.1:3018/agents/performance');
  await expect(page.getByRole('heading', { name: 'Tạo báo cáo Performance', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chụp số liệu và chạy Performance', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Đọc số liệu bài đăng Facebook', exact: true })).toBeVisible();
  await page.getByLabel('Ngày xuất bản bắt đầu', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Ngày xuất bản kết thúc', { exact: true }).fill('2026-10-02');
  await page.getByRole('button', { name: 'Đồng bộ số đếm Facebook', exact: true }).click();
  await expect(page.getByText('Configure Page ID, Page access token and an explicit supported Graph API version', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thử nghiệm hai CTA', exact: true })).toBeVisible();
  const hypothesis = `A specific CTA improves leads ${Date.now()}`;
  await page.getByLabel('Giả thuyết', { exact: true }).fill(hypothesis);
  await page.getByLabel('CTA control', { exact: true }).fill('Ask for information');
  await page.getByLabel('CTA treatment', { exact: true }).fill('Get the practical guide');
  await page.getByRole('button', { name: 'Tạo bản nháp thử nghiệm', exact: true }).click();
  const experiment = page.getByRole('article').filter({ has: page.getByRole('heading', { name: hypothesis, exact: true }) });
  await expect(experiment).toBeVisible();
  await experiment.getByRole('button', { name: 'Duyệt hai CTA và bắt đầu', exact: true }).click();
  await expect(experiment.getByRole('button', { name: 'Dừng thử nghiệm', exact: true })).toBeVisible();

  const context = await browser.newContext();
  await context.route('http://127.0.0.1:4019/public/**', route => route.continue({
    headers: { ...route.request().headers(), 'x-forwarded-for': '203.0.113.9' },
  }));
  const visitor = await context.newPage();
  const assignments: string[] = [];
  visitor.on('response', async response => {
    if (response.url().endsWith('/experiment') && response.ok()) {
      const body = await response.json().catch(() => null);
      if (body?.assignment_id) assignments.push(body.assignment_id);
    }
  });
  await visitor.goto(`http://127.0.0.1:3019/?utm_source=performance-smoke&utm_campaign=${campaign}`);
  await expect.poll(() => assignments.length).toBeGreaterThan(0);
  const cta = visitor.getByRole('button', { name: /Ask for information|Get the practical guide/ });
  await expect(cta).toBeVisible();
  const label = await cta.textContent();
  await visitor.reload();
  await expect.poll(() => assignments.length).toBeGreaterThan(1);
  expect(new Set(assignments).size).toBe(1);
  await expect(visitor.getByRole('button', { name: label!, exact: true })).toBeVisible();
  await visitor.getByRole('button', { name: label!, exact: true }).click();
  await visitor.getByLabel('Name', { exact: true }).fill('Synthetic visitor');
  await visitor.getByLabel('Email', { exact: true }).fill(`visitor-${Date.now()}@example.test`);
  await visitor.getByRole('checkbox').check();
  await visitor.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(visitor.getByRole('status')).toContainText('TripC will reply');
  await page.reload();
  await expect(experiment).toContainText('1 exposure · 1 lead');
  await expect(experiment).toContainText('Chưa đủ bằng chứng');
  await page.goto('http://127.0.0.1:3018/growth-results');
  await expect(page.getByText(`performance-smoke / ${campaign}`, { exact: true })).toBeVisible();
  await context.close();
});
