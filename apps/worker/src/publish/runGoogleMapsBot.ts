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

export function resolveCleanGoogleMapsQuery(spotName: string, rawPlaceQuery?: string): string {
  const combined = `${spotName || ''} ${rawPlaceQuery || ''}`.toLowerCase();

  const knownPlaceRules: Array<{ pattern: RegExp; query: string }> = [
    { pattern: /debay|hầm\s*rượu/i, query: 'Debay Wine Cellar, Bà Nà, Đà Nẵng' },
    { pattern: /cầu\s*vàng|golden\s*bridge/i, query: 'Cầu Vàng, Hòa Phú, Hòa Vang, Đà Nẵng' },
    { pattern: /làng\s*pháp|french\s*village/i, query: 'French Village Ba Na Hills, Đà Nẵng' },
    { pattern: /cáp\s*treo|cable\s*car/i, query: 'Ga Hội An Bà Nà Hills, Đà Nẵng' },
    { pattern: /le\s*jardin|vườn\s*hoa/i, query: "Le Jardin D'Amour Ba Na Hills, Đà Nẵng" },
    { pattern: /nhật\s*thực|eclipse\s*square/i, query: 'Eclipse Square Ba Na Hills, Đà Nẵng' },
    { pattern: /mặt\s*trăng|luna\s*castle|lunar\s*castle/i, query: 'Lunar Castle Ba Na Hills, Đà Nẵng' },
    { pattern: /thác\s*thần\s*mặt\s*trời|helios/i, query: 'Helios Waterfall Ba Na Hills, Đà Nẵng' },
    { pattern: /tượng\s*sáp|wax\s*museum/i, query: 'Bảo tàng Tượng sáp Bà Nà Hills, Đà Nẵng' },
    { pattern: /fantasy\s*park/i, query: 'Fantasy Park Ba Na Hills, Đà Nẵng' },
    { pattern: /alpine\s*coaster|tàu\s*lượn/i, query: 'Sun World Ba Na Hills, Đà Nẵng' },
    { pattern: /linh\s*ứng.*bà\s*nà|\[bà\s*nà\].*linh\s*ứng/i, query: 'Chùa Linh Ứng Bà Nà, Đà Nẵng' },
    { pattern: /linh\s*ứng/i, query: 'Chùa Linh Ứng, Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng' },
    { pattern: /bà\s*mụ|ba\s*mu/i, query: 'Chùa Bà Mụ, Hai Bà Trưng, Minh An, Hội An' },
    { pattern: /bảy\s*mẫu|rừng\s*dừa|coconut/i, query: 'Rừng dừa Bảy Mẫu, Cẩm Thanh, Hội An' },
    { pattern: /chùa\s*cầu|japanese\s*bridge/i, query: 'Chùa Cầu Hội An, Nguyễn Thị Minh Khai, Minh An, Hội An' },
    { pattern: /phúc\s*kiến|phuc\s*kien/i, query: 'Hội quán Phúc Kiến, 46 Trần Phú, Hội An' },
    { pattern: /tấn\s*kỳ|tan\s*ky/i, query: 'Nhà cổ Tấn Kỳ, 101 Nguyễn Thái Học, Hội An' },
    { pattern: /thanh\s*hà|làng\s*gốm|pottery/i, query: 'Làng gốm Thanh Hà, Phạm Phán, Thanh Hà, Hội An' },
    { pattern: /trà\s*quế|tra\s*que/i, query: 'Làng rau Trà Quế, Cẩm Hà, Hội An' },
    { pattern: /an\s*bàng|cửa\s*đại/i, query: 'Bãi biển An Bàng, Cẩm An, Hội An' },
    { pattern: /hoa\s*đăng|đèn\s*lồng|sông\s*hoài/i, query: 'Chợ đêm Hội An, Nguyễn Hoàng, Minh An, Hội An' },
    { pattern: /tường\s*vàng|hoa\s*giấy|bougainvillea|áo\s*dài|street\s*vendor|phố\s*cổ/i, query: 'Phố cổ Hội An, Minh An, Hội An, Quảng Nam' },
  ];

  for (const rule of knownPlaceRules) {
    if (rule.pattern.test(combined)) {
      return rule.query;
    }
  }

  const cleaned = (spotName || rawPlaceQuery || 'Sun World Ba Na Hills Đà Nẵng')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\([^)]*\)/g, '')
    .split(/[—–-]/)[0]
    .replace(/(100\s*năm\s*tuổi|trên\s*đỉnh\s*bà\s*nà|đạt\s*kỷ\s*lục\s*thế\s*giới|biểu\s*tượng\s*kỳ\s*quan|cổ\s*điển)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const region = combined.includes('hội an')
    ? 'Hội An, Quảng Nam'
    : combined.includes('bà nà')
    ? 'Bà Nà Hills, Đà Nẵng'
    : 'Đà Nẵng';
  return `${cleaned}, ${region}`;
}

async function tryFillReviewDialog(
  page: Page,
  payload: GMapsReviewPayload,
  localImagePath: string | null
): Promise<{ filled: boolean; submitted: boolean; detail: string }> {
  // Wait specifically for Google Maps review composer iframe (ReviewsService.LoadWriteWidget)
  let widgetTarget: Page | Frame | null = null;
  for (let i = 0; i < 24; i++) {
    const widgetFrame = page.frames().find((f) => f.url().includes('ReviewsService.LoadWriteWidget'));
    if (widgetFrame) {
      const hasStarsOrTextbox =
        (await widgetFrame.locator('[role="radio"], textarea, [role="textbox"]').count().catch(() => 0)) > 0;
      if (hasStarsOrTextbox) {
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
      '[role="radio"][aria-label*="Năm sao"]',
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
        await loc.click({ timeout: 3000, force: true }).catch(() => {});
        starClicked = true;
        break;
      }
    }
    if (!starClicked) {
      const fifthRadio = widgetTarget.locator('[role="radio"]').nth(4);
      if (await fifthRadio.isVisible().catch(() => false)) {
        await fifthRadio.click({ timeout: 3000, force: true }).catch(() => {});
        starClicked = true;
      }
    }
    await page.waitForTimeout(800);

    // 2. Fill review text
    const textLoc = widgetTarget.locator('textarea, [role="textbox"]').first();
    if (await textLoc.isVisible().catch(() => false)) {
      await textLoc.click({ timeout: 3000 }).catch(() => {});
      await textLoc.fill(payload.reviewText, { timeout: 4000 }).catch(() => {});
      await textLoc.dispatchEvent('input').catch(() => {});
      await textLoc.dispatchEvent('change').catch(() => {});
      textFilled = true;
    }
    await page.waitForTimeout(800);

    // 3. Upload local image from Google Drive if present
    if (localImagePath) {
      const existingFileInp = widgetTarget.locator('input[type="file"]').first();
      if ((await existingFileInp.count().catch(() => 0)) > 0) {
        await existingFileInp.setInputFiles(localImagePath).catch(() => {});
        photoUploaded = true;
      } else {
        // In Google Maps ReviewsService.LoadWriteWidget, "Thêm ảnh và video" is <div jsname="kZV5qc" jsaction="click:LBNrKc">
        const photoTrigger =
          (await widgetTarget.locator('[jsname="kZV5qc"]').count().catch(() => 0)) > 0
            ? widgetTarget.locator('[jsname="kZV5qc"]').first()
            : widgetTarget
                .locator('[jsaction*="LBNrKc"], button, [role="button"], div, span')
                .filter({ hasText: /Thêm ảnh|Add photos/i })
                .last();

        if ((await photoTrigger.count().catch(() => 0)) > 0) {
          const [fc] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null),
            photoTrigger.click({ timeout: 4000, force: true }).catch(() => {}),
          ]);
          if (fc) {
            await fc.setFiles(localImagePath).catch(() => {});
            photoUploaded = true;
          } else {
            const lazyFileInp = widgetTarget.locator('input[type="file"]').first();
            if ((await lazyFileInp.count().catch(() => 0)) > 0) {
              await lazyFileInp.setInputFiles(localImagePath).catch(() => {});
              photoUploaded = true;
            }
          }
        }
      }
      if (photoUploaded) {
        // Wait for Google Maps to upload the image and render its thumbnail in the widget
        await page.waitForTimeout(5500);
      }
    }

    // 4. Wait until the Post / Đăng button is enabled (photo upload finishes) and click it for real
    if (starClicked || textFilled) {
      const postBtnSelector = 'button[jsname="IJM3w"], button';
      const postBtn = widgetTarget
        .locator(postBtnSelector)
        .filter({ hasText: /^\s*(Đăng|Post|Đăng cập nhật|Cập nhật|Update|Gửi)\s*$/i })
        .last();

      for (let waitIdx = 0; waitIdx < 20; waitIdx++) {
        const isDisabled = await postBtn
          .evaluate(
            (el) =>
              el.hasAttribute('disabled') ||
              el.getAttribute('aria-disabled') === 'true' ||
              (el as HTMLButtonElement).disabled === true
          )
          .catch(() => true);
        if (!isDisabled) break;
        // Re-click 5th star if button is still disabled because star selection didn't register
        if (waitIdx === 3) {
          const fifthRadio = widgetTarget.locator('[role="radio"]').nth(4);
          await fifthRadio.click({ timeout: 2000, force: true }).catch(() => {});
        }
        await page.waitForTimeout(700);
      }

      if (await postBtn.isVisible().catch(() => false)) {
        try {
          await postBtn.click({ timeout: 6000 });
          postClicked = true;
          // Wait for Google Maps to process the review submission
          await page.waitForTimeout(4500);
        } catch {
          postClicked = false;
        }
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
        // Pick the first organic (non-sponsored) result card matching destination keywords
        const cards = page.locator('a.hfpxzc');
        const count = await cards.count().catch(() => 0);
        let chosenIdx = -1;
        const queryWords = query
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((w) => w.length >= 3 && !['việt', 'nam', 'quảng', 'đà', 'nẵng'].includes(w));

        for (let idx = 0; idx < count; idx++) {
          const card = cards.nth(idx);
          const info = await card
            .evaluate((el) => {
              const label = (el.getAttribute('aria-label') || '').toLowerCase();
              const parentText = (el.parentElement?.innerText || '').toLowerCase();
              const isSponsored =
                parentText.includes('được tài trợ') ||
                parentText.includes('sponsored') ||
                label.includes('lug.vn');
              return { label, isSponsored };
            })
            .catch(() => ({ label: '', isSponsored: true }));

          if (info.isSponsored) continue;
          if (queryWords.some((w) => info.label.includes(w))) {
            chosenIdx = idx;
            break;
          }
          if (chosenIdx === -1) {
            chosenIdx = idx;
          }
        }

        if (chosenIdx >= 0) {
          await cards.nth(chosenIdx).click({ timeout: 5000 }).catch(() => {});
          await page.waitForURL(/\/maps\/place\//, { timeout: 8000 }).catch(() => {});
        }
      }
      await page.locator('[role="tab"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    };

    const resolvedQuery = resolveCleanGoogleMapsQuery(payload.spotName, payload.placeQuery);
    await openPlaceFromQuery(resolvedQuery);

    // Verify we didn't land on a sponsored retail ad or unrelated store
    const currentUrlLower = decodeURIComponent(page.url()).toLowerCase();
    const isUnrelatedAd =
      currentUrlLower.includes('lug.vn') ||
      !page.url().includes('/maps/place/') ||
      (await page.locator('[role="tab"]').count().catch(() => 0)) === 0;

    if (isUnrelatedAd) {
      const lowerSpot = `${payload.spotName} ${payload.placeQuery}`.toLowerCase();
      const fallbackQuery =
        lowerSpot.includes('hội an') || lowerSpot.includes('chùa cầu') || lowerSpot.includes('thu bồn')
          ? 'Chùa Cầu Hội An, Nguyễn Thị Minh Khai, Minh An, Hội An'
          : 'Sun World Ba Na Hills, Đà Nẵng, Việt Nam';
      await openPlaceFromQuery(fallbackQuery);
    }

    // Copy review text to clipboard inside the page so it's also ready if manual confirmation is needed
    await page
      .evaluate((txt) => {
        navigator.clipboard?.writeText(txt).catch(() => {});
      }, payload.reviewText)
      .catch(() => {});

    const tryClickWriteReviewOnCurrentPlace = async (): Promise<boolean> => {
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

      const writeReviewSelectors = [
        'button:has-text("Viết bài đánh giá")',
        'button[aria-label*="Viết bài đánh giá"]',
        'button:has-text("Chỉnh sửa bài đánh giá")',
        'button[aria-label*="Chỉnh sửa bài đánh giá"]',
        'button:has-text("Write a review")',
        'button[aria-label*="Write a review"]',
        'button:has-text("Edit your review")',
      ];
      for (const sel of writeReviewSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(2500);
          return true;
        }
      }
      return false;
    };

    let clickedWriteReview = await tryClickWriteReviewOnCurrentPlace();
    if (!clickedWriteReview) {
      const lowerSpot = `${payload.spotName} ${payload.placeQuery}`.toLowerCase();
      const fallbackQuery =
        lowerSpot.includes('hội an') || lowerSpot.includes('chùa cầu') || lowerSpot.includes('thu bồn') || lowerSpot.includes('sông hoài')
          ? 'Phố cổ Hội An, Quảng Nam, Việt Nam'
          : 'Sun World Ba Na Hills, Đà Nẵng, Việt Nam';
      await openPlaceFromQuery(fallbackQuery);
      clickedWriteReview = await tryClickWriteReviewOnCurrentPlace();
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

