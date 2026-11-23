import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright-core';

const WORKER_ROOT = path.resolve(__dirname, '../..');
const SESSION_FILE = path.join(WORKER_ROOT, '.gmaps-session.json');
const PROFILE_DIR = path.join(WORKER_ROOT, '.gmaps-profile');

export interface GMapsBotStatus {
  ok: boolean;
  isLoggedIn: boolean;
  sessionFile: string;
  updatedAt: string | null;
  detail: string;
}

export interface GMapsReviewPayload {
  placeQuery: string;
  spotName: string;
  reviewText: string;
  imageUrl?: string;
  driveFileId?: string;
  headless?: boolean;
}

function emitJson(result: Record<string, unknown>) {
  console.log(`GMAPS_BOT_RESULT:${JSON.stringify(result)}`);
}

function hasGoogleAuthCookies(filePath: string): { valid: boolean; updatedAt: string | null } {
  if (!fs.existsSync(filePath)) return { valid: false, updatedAt: null };
  try {
    const stat = fs.statSync(filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      cookies?: Array<{ name?: string; value?: string; domain?: string }>;
    };
    const cookies = raw.cookies ?? [];
    const hasSid = cookies.some(
      (c) =>
        (c.domain || '').includes('google.com') &&
        (c.name === 'SID' || c.name === '__Secure-1PSID' || c.name === '__Secure-3PSID') &&
        Boolean(c.value)
    );
    return { valid: hasSid, updatedAt: stat.mtime.toISOString() };
  } catch {
    return { valid: false, updatedAt: null };
  }
}

async function launchGoogleBrowser(headless = false): Promise<{
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
}> {
  const launchOptions = {
    headless,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  };

  let browser: Browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      ...launchOptions,
    });
  } catch {
    browser = await chromium.launch({
      channel: 'chrome',
      ...launchOptions,
    });
  }

  let storageStatePath: string | undefined;
  if (fs.existsSync(SESSION_FILE)) {
    try {
      JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      storageStatePath = SESSION_FILE;
    } catch {
      // Ignore corrupt session file
    }
  }

  const context = await browser.newContext({
    locale: 'vi-VN',
    viewport: null,
    storageState: storageStatePath,
  });

  return {
    browser,
    context,
    close: async () => {
      try {
        if (browser.isConnected()) {
          await context.storageState({ path: SESSION_FILE });
        }
      } catch {
        // Ignore
      }
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

async function downloadDriveImageToTemp(imageUrl?: string, driveFileId?: string): Promise<string | null> {
  const url = driveFileId
    ? `https://lh3.googleusercontent.com/d/${driveFileId}=w1200`
    : imageUrl;
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1000) return null;
    const tempFile = path.join(os.tmpdir(), `tripc_gmaps_${driveFileId || Date.now()}.png`);
    fs.writeFileSync(tempFile, buf);
    return tempFile;
  } catch {
    return null;
  }
}

async function tryFillReviewDialog(
  page: Page,
  payload: GMapsReviewPayload,
  localImagePath: string | null
): Promise<{ filled: boolean; submitted: boolean; detail: string }> {
  // Wait specifically for Google Maps review composer iframe (ReviewsService.LoadWriteWidget)
  let widgetTarget: Page | Frame | null = null;
  for (let i = 0; i < 20; i++) {
    const widgetFrame = page.frames().find((f) => f.url().includes('ReviewsService.LoadWriteWidget'));
    if (widgetFrame) {
      const hasTextbox = (await widgetFrame.locator('textarea, [role="textbox"]').count().catch(() => 0)) > 0;
      if (hasTextbox) {
        widgetTarget = widgetFrame;
        break;
      }
    }
    await page.waitForTimeout(500);
  }

  if (!widgetTarget) {
    return {
      filled: false,
      submitted: false,
      detail: 'Không tìm thấy iframe soạn đánh giá Google Maps (ReviewsService.LoadWriteWidget)',
    };
  }

  let starClicked = false;
  let textFilled = false;
  let photoUploaded = false;
  let postClicked = false;

  try {
    // 1. Click 5th star inside the widget frame
    const starSelectors = [
      '[aria-label*="Năm sao"]',
      '[aria-label*="5 sao"]',
      '[aria-label*="5 stars"]',
      '[aria-label*="Five stars"]',
      '[data-rating="5"]',
      '[role="radio"][aria-posinset="5"]',
    ];
    for (const sel of starSelectors) {
      const loc = widgetTarget.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ timeout: 3000 }).catch(() => {});
        starClicked = true;
        break;
      }
    }
    if (!starClicked) {
      const fifthRadio = widgetTarget.locator('[role="radio"]').nth(4);
      if (await fifthRadio.isVisible().catch(() => false)) {
        await fifthRadio.click({ timeout: 3000 }).catch(() => {});
        starClicked = true;
      }
    }

    // 2. Fill review text
    const textLoc = widgetTarget.locator('textarea, [role="textbox"]').first();
    if (await textLoc.isVisible().catch(() => false)) {
      await textLoc.click({ timeout: 3000 }).catch(() => {});
      await textLoc.fill(payload.reviewText, { timeout: 4000 }).catch(() => {});
      textFilled = true;
    }

    // 3. Upload local image from Google Drive via "Thêm ảnh và video" filechooser or hidden input[type=file]
    if (localImagePath) {
      const existingFileInp = widgetTarget.locator('input[type="file"]').first();
      if ((await existingFileInp.count().catch(() => 0)) > 0) {
        await existingFileInp.setInputFiles(localImagePath).catch(() => {});
        photoUploaded = true;
        await page.waitForTimeout(3000);
      } else {
        const photoTrigger = widgetTarget.getByText(/Thêm ảnh|Add photos/i).first();
        if ((await photoTrigger.count().catch(() => 0)) > 0) {
          const [fc] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
            photoTrigger.click({ timeout: 3000 }).catch(() => {}),
          ]);
          if (fc) {
            await fc.setFiles(localImagePath).catch(() => {});
            photoUploaded = true;
            await page.waitForTimeout(3500);
          } else {
            const lazyFileInp = widgetTarget.locator('input[type="file"]').first();
            if ((await lazyFileInp.count().catch(() => 0)) > 0) {
              await lazyFileInp.setInputFiles(localImagePath).catch(() => {});
              photoUploaded = true;
              await page.waitForTimeout(3500);
            }
          }
        }
      }
    }

    // 4. Click exact Post / Đăng button
    if (starClicked || textFilled) {
      const postBtn = widgetTarget
        .locator('button')
        .filter({ hasText: /^(Đăng|Post|Đăng cập nhật|Update)$/i })
        .last();
      if (await postBtn.isVisible().catch(() => false)) {
        await postBtn.click({ timeout: 4000 }).catch(() => {});
        postClicked = true;
        await page.waitForTimeout(3000);
      }
    }
  } catch {
    // Return partial progress
  }

  return {
    filled: starClicked || textFilled,
    submitted: postClicked,
    detail: `star=${starClicked}, text=${textFilled}, photo=${photoUploaded}, submitted=${postClicked}`,
  };
}

async function main() {
  const command = process.argv[2] || 'check';

  if (command === 'check') {
    const status = hasGoogleAuthCookies(SESSION_FILE);
    emitJson({
      ok: true,
      isLoggedIn: status.valid,
      sessionFile: SESSION_FILE,
      updatedAt: status.updatedAt,
      detail: status.valid
        ? 'Đã kết nối phiên Google Maps Bot (.gmaps-session.json). Sẵn sàng tự động đăng đánh giá & ảnh thật lên Google Maps.'
        : 'Chưa đăng nhập tài khoản Google trong trình duyệt Bot. Bấm "Mở Trình Duyệt Đăng Nhập Google Maps (1 lần)" hoặc bấm đăng bài để mở trình duyệt trực tiếp.',
    });
    process.exit(0);
  }

  if (command === 'login') {
    const { browser, context, close } = await launchGoogleBrowser(false);
    const page = context.pages()[0] || (await context.newPage());
    await page.bringToFront().catch(() => {});
    await page.goto(
      'https://accounts.google.com/ServiceLogin?hl=vi&continue=https%3A%2F%2Fwww.google.com%2Fmaps',
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    await page.bringToFront().catch(() => {});

    const deadline = Date.now() + 120_000;
    let loggedIn = false;
    while (Date.now() < deadline && browser.isConnected()) {
      try {
        const cookies = await context.cookies('https://www.google.com');
        const hasSid = cookies.some(
          (c) => (c.name === 'SID' || c.name === '__Secure-1PSID' || c.name === '__Secure-3PSID') && Boolean(c.value)
        );
        if (hasSid) {
          loggedIn = true;
          await context.storageState({ path: SESSION_FILE });
          break;
        }
        await page.waitForTimeout(1500);
      } catch {
        break;
      }
    }

    await close();
    emitJson({
      ok: loggedIn,
      isLoggedIn: loggedIn,
      sessionFile: SESSION_FILE,
      detail: loggedIn
        ? '✅ Đã đăng nhập và lưu phiên Google Maps Bot thành công! Từ giờ Agent 5 tự động đăng bài đánh giá & ảnh lên Google Maps.'
        : '⏳ Trình duyệt đã đóng hoặc hết thời gian chờ đăng nhập Google.',
    });
    process.exit(0);
  }

  if (command === 'post-review') {
    const authStatus = hasGoogleAuthCookies(SESSION_FILE);
    if (!authStatus.valid) {
      emitJson({
        ok: false,
        needsLogin: true,
        submitted: false,
        detail:
          '⚠️ Bot chưa đăng nhập tài khoản Google trong Edge (.gmaps-session.json chưa có cookie đăng nhập). Hãy bấm nút "🌐 Bước 1: Mở Edge Đăng Nhập Google (1 lần)" và hoàn tất đăng nhập Gmail, sau đó bấm Bước 2 để Bot tự động đăng bài đánh giá 5★ + ảnh!',
      });
      process.exit(0);
    }

    const payloadArgIdx = process.argv.indexOf('--payload-file');
    const payloadFile = payloadArgIdx !== -1 ? process.argv[payloadArgIdx + 1] : undefined;
    const payload: GMapsReviewPayload = payloadFile
      ? JSON.parse(fs.readFileSync(payloadFile, 'utf8'))
      : {
          placeQuery: 'Sun World Ba Na Hills, Đà Nẵng, Việt Nam',
          spotName: 'Sun World Ba Na Hills',
          reviewText: 'Trải nghiệm tuyệt vời tại Bà Nà Hills Đà Nẵng!',
          headless: false,
        };

    const localPhoto = await downloadDriveImageToTemp(payload.imageUrl, payload.driveFileId);
    const { context, close } = await launchGoogleBrowser(Boolean(payload.headless ?? true));
    const page = context.pages()[0] || (await context.newPage());
    if (!payload.headless) {
      await page.bringToFront().catch(() => {});
    }

    const openPlaceFromQuery = async (query: string) => {
      const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=vi`;
      await page.goto(mapsSearchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await Promise.race([
        page.waitForURL(/\/maps\/place\//, { timeout: 8000 }).catch(() => {}),
        page.locator('a.hfpxzc').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
      ]);
      if (page.url().includes('/maps/search/')) {
        const firstCard = page.locator('a.hfpxzc').first();
        if ((await firstCard.count().catch(() => 0)) > 0) {
          await firstCard.click({ timeout: 5000 }).catch(() => {});
        }
      }
      await page.locator('[role="tab"]').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    };

    await openPlaceFromQuery(payload.placeQuery);

    // If search query returned no place page (/maps/place/) or tabs, fall back to landmark-level place query
    const initialTabCount = await page.locator('[role="tab"]').count().catch(() => 0);
    if (!page.url().includes('/maps/place/') || initialTabCount === 0) {
      const lowerSpot = `${payload.spotName} ${payload.placeQuery}`.toLowerCase();
      const fallbackQuery =
        lowerSpot.includes('hội an') || lowerSpot.includes('chùa cầu') || lowerSpot.includes('thu bồn')
          ? 'Chùa Cầu Hội An, Quảng Nam, Việt Nam'
          : 'Sun World Ba Na Hills, Đà Nẵng, Việt Nam';
      await openPlaceFromQuery(fallbackQuery);
    }

    // Copy review text to clipboard inside the page so it's also ready if manual confirmation is needed
    await page
      .evaluate((txt) => {
        navigator.clipboard?.writeText(txt).catch(() => {});
      }, payload.reviewText)
      .catch(() => {});

    // Click "Bài đánh giá" / "Đánh giá" / "Reviews" tab if present
    const reviewsTabSelectors = [
      'button[role="tab"]:has-text("Bài đánh giá")',
      '[role="tab"]:has-text("Bài đánh giá")',
      'button[role="tab"]:has-text("Đánh giá")',
      'button[role="tab"]:has-text("Reviews")',
      'div[role="tab"]:has-text("Đánh giá")',
      'div[role="tab"]:has-text("Reviews")',
    ];
    for (const sel of reviewsTabSelectors) {
      const tab = page.locator(sel).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click({ timeout: 4000 }).catch(() => {});
        await page
          .locator('button, [role="button"]')
          .filter({ hasText: /Viết bài đánh giá|Chỉnh sửa bài đánh giá|Write a review|Edit your review/i })
          .first()
          .waitFor({ state: 'visible', timeout: 8000 })
          .catch(() => {});
        break;
      }
    }

    // Click "Viết bài đánh giá" / "Chỉnh sửa bài đánh giá" / "Write a review" button
    const writeReviewSelectors = [
      'button:has-text("Viết bài đánh giá")',
      'button[aria-label*="Viết bài đánh giá"]',
      'button:has-text("Chỉnh sửa bài đánh giá")',
      'button[aria-label*="Chỉnh sửa bài đánh giá"]',
      'button:has-text("Write a review")',
      'button[aria-label*="Write a review"]',
      'button:has-text("Edit your review")',
    ];
    let clickedWriteReview = false;
    for (const sel of writeReviewSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 4000 }).catch(() => {});
        clickedWriteReview = true;
        await page.waitForTimeout(2000);
        break;
      }
    }

    // If session expired and redirected to Google Sign-In, fail cleanly instead of hanging 90s
    if (page.url().includes('accounts.google.com')) {
      await close();
      emitJson({
        ok: false,
        needsLogin: true,
        submitted: false,
        placeUrl: page.url(),
        detail:
          '⚠️ Phiên đăng nhập Google trong .gmaps-session.json đã hết hạn hoặc cần xác nhận lại. Hãy chạy lại Bước 1 (npm run gmaps-bot:login) để làm mới cookie.',
      });
      process.exit(0);
    }

    const fillRes = await tryFillReviewDialog(page, payload, localPhoto);
    await context.storageState({ path: SESSION_FILE }).catch(() => {});

    const finalUrl = page.url();
    await page.waitForTimeout(fillRes.submitted ? 2500 : 1500);
    await close();

    emitJson({
      ok: fillRes.submitted,
      needsLogin: page.url().includes('accounts.google.com'),
      clickedWriteReview,
      filled: fillRes.filled,
      submitted: fillRes.submitted,
      placeUrl: finalUrl,
      localPhotoSaved: localPhoto,
      detail: fillRes.submitted
        ? `✅ Bot đã tự động mở Google Maps (${payload.spotName}), chọn 5 ★, điền nội dung đánh giá kèm ảnh Google Drive và bấm Đăng thành công!`
        : clickedWriteReview
        ? `⚠️ Bot đã bấm "Viết bài đánh giá" tại ${payload.spotName} nhưng chưa hoàn tất gửi bài (${fillRes.detail}). Hãy kiểm tra tài khoản Google hoặc thử lại.`
        : `⚠️ Đã mở "${payload.spotName}" (${finalUrl}) nhưng chưa thấy nút "Viết bài đánh giá". Hãy kiểm tra đăng nhập Google ở Bước 1.`,
    });
    process.exit(0);
  }
}

main().catch((err) => {
  emitJson({ ok: false, error: err?.message || String(err) });
  process.exit(1);
});

