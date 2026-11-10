import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';

export interface GroupPostOptions {
  groupUrl?: string;
  title: string;
  body: string;
  discussionPrompt?: string;
  hashtags?: string[];
  imageUrl?: string;
  headless?: boolean;
}

export interface GroupPostResult {
  success: boolean;
  groupUrl: string;
  postTitle: string;
  publishedAt: string;
  postUrl?: string;
  externalPostId?: string;
  message?: string;
}

export interface DeleteGroupPostOptions {
  groupUrl?: string;
  postUrl?: string;
  titleSnippet?: string;
  headless?: boolean;
}

export interface DeleteGroupPostResult {
  success: boolean;
  groupUrl: string;
  postUrl?: string;
  alreadyDeleted?: boolean;
  message: string;
}

export class FacebookGroupBot {
  private readonly stateFile: string;
  private readonly browserChannel: string;

  static resolveStateFile(customStateFile?: string): string {
    return (
      customStateFile ||
      process.env.FB_SESSION_FILE ||
      path.resolve(__dirname, '../../.fb-session.json')
    );
  }

  static hasSavedSession(customStateFile?: string): boolean {
    return (
      fs.existsSync(FacebookGroupBot.resolveStateFile(customStateFile)) ||
      Boolean(process.env.FB_ADMIN_COOKIE?.trim())
    );
  }

  static getSessionStatusSync(customStateFile?: string): {
    stateFile: string;
    fileExists: boolean;
    hasEnvCookie: boolean;
    ready: boolean;
  } {
    const stateFile = FacebookGroupBot.resolveStateFile(customStateFile);
    const fileExists = fs.existsSync(stateFile);
    const hasEnvCookie = Boolean(process.env.FB_ADMIN_COOKIE?.trim());
    return {
      stateFile,
      fileExists,
      hasEnvCookie,
      ready: fileExists || hasEnvCookie,
    };
  }

  static buildPostText(options: GroupPostOptions): string {
    const bodyTrimmed = (options.body || '').trim();
    const hasCommunityHeader = /\[(CẨM NANG CỘNG ĐỒNG|VIETNAM PLAYBOOK)\]/i.test(bodyTrimmed);
    const hasPromptInBody =
      bodyTrimmed.includes('💬') ||
      (Boolean(options.discussionPrompt?.trim()) && bodyTrimmed.includes(options.discussionPrompt!.trim()));
    const hasHashtagInBody = /(^|\s)#[\p{L}\w-]+/u.test(bodyTrimmed);

    const parts: string[] = [];
    if (!hasCommunityHeader) {
      parts.push(`🇻🇳 [CẨM NANG CỘNG ĐỒNG] ${options.title}`);
      parts.push('');
    }
    if (bodyTrimmed) {
      parts.push(bodyTrimmed);
    }
    if (!hasPromptInBody) {
      parts.push('');
      parts.push(
        options.discussionPrompt?.trim()
          ? `💬 ${options.discussionPrompt.trim()}`
          : '💬 Cùng chia sẻ góc nhìn và trải nghiệm của bạn nhé!',
      );
    }
    if (!hasHashtagInBody) {
      parts.push('');
      parts.push(
        options.hashtags && options.hashtags.length > 0
          ? options.hashtags.join(' ')
          : '#CongDongDuLich #DichVuHoTroDuLich #ExploreVietnam',
      );
    }
    return parts.join('\n').trim();
  }

  constructor(customStateFile?: string) {
    this.stateFile = FacebookGroupBot.resolveStateFile(customStateFile);
    this.browserChannel = process.env.FB_BROWSER_CHANNEL || 'msedge';
  }

  getStateFile(): string {
    return this.stateFile;
  }

  /**
   * Parse Cookie string (e.g. c_user=...; xs=...) into Playwright cookie objects
   */
  static parseCookiesFromHeader(cookieHeader: string, domain = '.facebook.com') {
    return cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return null;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        return {
          name,
          value,
          domain,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax' as const,
        };
      })
      .filter(Boolean) as {
      name: string;
      value: string;
      domain: string;
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'Lax';
    }[];
  }

  async launchBrowser(headless = true): Promise<Browser> {
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-features=Translate,OptimizationHints',
    ];
    if (!headless) {
      args.push('--start-maximized');
    }
    return await chromium.launch({
      channel: this.browserChannel,
      headless,
      args,
    });
  }

  async createContext(browser: Browser, options?: { fullViewport?: boolean }): Promise<BrowserContext> {
    const hasState = fs.existsSync(this.stateFile);
    const context = await browser.newContext({
      storageState: hasState ? this.stateFile : undefined,
      viewport: options?.fullViewport ? null : { width: 1280, height: 850 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    });

    // Check if FB_ADMIN_COOKIE is provided in environment and not already loaded
    const envCookie = process.env.FB_ADMIN_COOKIE;
    if (envCookie && !hasState) {
      const parsed = FacebookGroupBot.parseCookiesFromHeader(envCookie);
      if (parsed.length > 0) {
        await context.addCookies(parsed);
      }
    }

    return context;
  }

  /**
   * Check if session has active Facebook authentication
   */
  async checkSession(): Promise<{ isLoggedIn: boolean; detail?: string }> {
    const browser = await this.launchBrowser(true);
    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      if (url.includes('/login') || url.includes('/checkpoint')) {
        return { isLoggedIn: false, detail: 'URL chuyển hướng về trang đăng nhập hoặc checkpoint.' };
      }

      const hasLoginForm = await page.$('input#email, input[name="email"], input[type="password"]');
      if (hasLoginForm) {
        return { isLoggedIn: false, detail: 'Facebook đang ở trạng thái chưa đăng nhập (xuất hiện form email/password).' };
      }

      // Check for elements that only exist when logged in
      const loggedInIndicator = await page.$(
        'svg[aria-label*="Trang cá nhân của bạn"], div[aria-label*="Tài khoản của bạn"], [aria-label*="Menu Facebook"], [aria-label*="Messenger"], [role="navigation"]'
      );

      if (loggedInIndicator) {
        return { isLoggedIn: true, detail: 'Đã xác nhận phiên đăng nhập Facebook hợp lệ.' };
      }

      return { isLoggedIn: !hasLoginForm && !url.includes('login'), detail: `URL hiện tại: ${url}` };
    } catch (err) {
      return { isLoggedIn: false, detail: (err as Error).message };
    } finally {
      await browser.close();
    }
  }

  /**
   * Opens an interactive headed browser for the Administrator to log in once.
   */
  async loginInteractive(
    groupUrl = 'https://www.facebook.com/groups/1134282109069209',
  ): Promise<{ success: boolean; message: string; stateFile?: string }> {
    console.log('[FacebookGroupBot] Đang mở trình duyệt để Quản trị viên đăng nhập...');
    const browser = await this.launchBrowser(false);
    try {
      const context = await this.createContext(browser, { fullViewport: true });
      const page = await context.newPage();
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.bringToFront().catch(() => {});

      console.log('👉 Vui lòng đăng nhập tài khoản Quản trị viên trên cửa sổ trình duyệt.');
      console.log('👉 Sau khi đăng nhập vào Facebook, hệ thống sẽ tự động lưu phiên vào:', this.stateFile);

      // Wait up to 180 seconds for user to log in and leave login/checkpoint screens
      await page.waitForFunction(
        () => {
          const url = window.location.href;
          const hasLoginInputs = Boolean(document.querySelector('input[name="email"], input[type="password"]'));
          return (
            !url.includes('/login') &&
            !url.includes('/checkpoint') &&
            !url.includes('/two_step') &&
            !hasLoginInputs &&
            url.includes('facebook.com')
          );
        },
        undefined,
        { timeout: 180000 }
      );

      if (groupUrl && /^https:\/\/(www\.|m\.)?facebook\.com\/groups\//i.test(groupUrl)) {
        try {
          await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2500);
        } catch {
          await page.waitForTimeout(2500);
        }
      } else {
        await page.waitForTimeout(2500);
      }

      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      await context.storageState({ path: this.stateFile });
      console.log('✅ Đăng nhập thành công! Phiên đã được lưu vào:', this.stateFile);
      return {
        success: true,
        stateFile: this.stateFile,
        message: `Đăng nhập Quản trị viên thành công. Đã lưu session vào ${this.stateFile}`,
      };
    } catch (err) {
      return { success: false, message: `Quá thời gian hoặc lỗi: ${(err as Error).message}` };
    } finally {
      await browser.close();
    }
  }

  /**
   * Automatically publish a post to the Facebook Group using the Administrator session.
   */
  async postToGroup(options: GroupPostOptions): Promise<GroupPostResult> {
    const groupUrl = options.groupUrl || 'https://www.facebook.com/groups/1134282109069209';
    const headless = options.headless !== undefined ? options.headless : true;

    // Check if session file or env cookie exists — fail closed, never silently fallback to Fanpage
    const hasSession = fs.existsSync(this.stateFile) || Boolean(process.env.FB_ADMIN_COOKIE?.trim());
    if (!hasSession) {
      throw new Error(
        'FACEBOOK_GROUP_SESSION_MISSING: Chưa tìm thấy phiên đăng nhập Quản trị viên Group Facebook (.fb-session.json hoặc FB_ADMIN_COOKIE). Vui lòng mở cửa sổ đăng nhập Group Bot 1 lần trước khi đăng.'
      );
    }

    const fullText = FacebookGroupBot.buildPostText(options);

    let tempImagePath: string | null = null;
    if (options.imageUrl) {
      try {
        const res = await fetch(options.imageUrl);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          tempImagePath = path.join(os.tmpdir(), `fb_group_img_${Date.now()}.jpg`);
          fs.writeFileSync(tempImagePath, buffer);
        }
      } catch (err) {
        console.warn('[FacebookGroupBot] Không thể tải ảnh, tiếp tục đăng văn bản:', (err as Error).message);
      }
    }

    const browser = await this.launchBrowser(headless);
    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();
      console.log(`[FacebookGroupBot] Đang truy cập Group Facebook: ${groupUrl}`);
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      const loginFormVisible = await page.$('input#email, input[name="email"], input[type="password"]');
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint') || loginFormVisible) {
        throw new Error(
          'FACEBOOK_GROUP_SESSION_MISSING: Phiên đăng nhập Facebook đã hết hạn hoặc bị yêu cầu xác minh. Vui lòng đăng nhập lại Group Bot.'
        );
      }

      // Look for the "Write something..." / "Bạn viết gì đi..." trigger
      const postBoxSelectors = [
        'div[role="button"]:has-text("Bạn viết gì đi")',
        'div[role="button"]:has-text("Viết gì đó")',
        'div[role="button"]:has-text("Write something")',
        'div[role="button"]:has-text("Tạo bài viết")',
        'span:has-text("Bạn viết gì đi")',
        'span:has-text("Write something")',
      ];

      let triggerFound = false;
      for (const sel of postBoxSelectors) {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          triggerFound = true;
          break;
        }
      }

      if (!triggerFound) {
        const genericTrigger = await page.$('div[role="main"] div[role="button"][tabindex="0"]');
        if (genericTrigger) {
          await genericTrigger.click();
          triggerFound = true;
        }
      }

      if (!triggerFound) {
        throw new Error(
          'FACEBOOK_GROUP_PUBLISH_FAILED: Không tìm thấy ô đăng bài trong Group Facebook. Vui lòng kiểm tra tài khoản đã tham gia/quản trị Group này chưa.'
        );
      }

      console.log('[FacebookGroupBot] Đã mở hộp thoại soạn bài viết...');
      await page.waitForTimeout(2000);

      const editorSelector = 'div[role="dialog"] div[role="textbox"], div[role="dialog"] div[contenteditable="true"]';
      await page.waitForSelector(editorSelector, { timeout: 15000 });
      const editor = await page.$(editorSelector);
      if (!editor) {
        throw new Error('FACEBOOK_GROUP_PUBLISH_FAILED: Không tìm thấy ô soạn thảo trong hộp thoại Facebook.');
      }

      await editor.click();
      await page.keyboard.insertText(fullText);
      console.log('[FacebookGroupBot] Đã điền xong nội dung bài viết.');
      await page.waitForTimeout(1500);

      // Attach image strictly inside the composer dialog (never match cover-photo inputs outside div[role="dialog"])
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        try {
          let dialogFileInputs = await page.$$('div[role="dialog"] input[type="file"][accept*="image"]');
          if (dialogFileInputs.length === 0) {
            const photoButtonSelectors = [
              'div[role="dialog"] div[aria-label*="Ảnh/video"]',
              'div[role="dialog"] div[aria-label*="Photo/video"]',
              'div[role="dialog"] [role="button"][aria-label*="Ảnh"]',
              'div[role="dialog"] [role="button"][aria-label*="Photo"]',
            ];
            for (const btnSel of photoButtonSelectors) {
              const photoButton = await page.$(btnSel);
              if (photoButton) {
                await photoButton.click();
                await page.waitForTimeout(1200);
                dialogFileInputs = await page.$$('div[role="dialog"] input[type="file"][accept*="image"]');
                if (dialogFileInputs.length > 0) break;
              }
            }
          }

          const targetFileInput = dialogFileInputs[dialogFileInputs.length - 1];
          if (targetFileInput) {
            await targetFileInput.setInputFiles(tempImagePath);
            console.log('[FacebookGroupBot] Đã chọn ảnh trong hộp thoại bài viết, đang chờ tải lên...');
            await page
              .waitForSelector('div[role="dialog"] img[src^="blob:"], div[role="dialog"] img[src*="scontent"]', {
                timeout: 12000,
              })
              .catch(() => {});
            await page.waitForTimeout(1500);
            console.log('[FacebookGroupBot] Đã tải ảnh lên hộp thoại bài viết.');
          } else {
            console.warn('[FacebookGroupBot] Không tìm thấy input tải ảnh bên trong hộp thoại đăng bài.');
          }
        } catch (imgErr) {
          console.warn('[FacebookGroupBot] Lỗi khi đính kèm ảnh:', (imgErr as Error).message);
        }
      }

      // Click Post ("Đăng")
      const postBtnSelectors = [
        'div[role="dialog"] div[aria-label="Đăng"]',
        'div[role="dialog"] div[aria-label="Post"]',
        'div[role="dialog"] [role="button"]:has-text("Đăng")',
        'div[role="dialog"] [role="button"]:has-text("Post")',
      ];

      let posted = false;
      for (const sel of postBtnSelectors) {
        const btn = await page.$(sel);
        if (btn) {
          const isDisabled = await btn.getAttribute('aria-disabled');
          if (isDisabled !== 'true') {
            await btn.click();
            posted = true;
            console.log('[FacebookGroupBot] Đã bấm nút "Đăng bài"!');
            break;
          }
        }
      }

      if (!posted) {
        throw new Error('FACEBOOK_GROUP_PUBLISH_FAILED: Nút "Đăng" bị vô hiệu hóa hoặc không tìm thấy trong hộp thoại.');
      }

      // Confirm submission: wait for composer dialog to close rather than guessing after a static sleep
      try {
        await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { state: 'detached', timeout: 20000 });
      } catch {
        const dialogAlert = await page.$eval('div[role="dialog"] [role="alert"]', (el) => el.textContent?.trim() || '').catch(() => '');
        throw new Error(
          dialogAlert
            ? `FACEBOOK_GROUP_PUBLISH_FAILED: Facebook không đóng hộp thoại đăng bài (${dialogAlert}).`
            : 'FACEBOOK_GROUP_PUBLISH_FAILED: Hộp thoại đăng bài không đóng sau 20 giây — chưa xác nhận bài đã lên Group.'
        );
      }

      const afterPostUrl = page.url();
      if (afterPostUrl.includes('/login') || afterPostUrl.includes('/checkpoint')) {
        throw new Error('FACEBOOK_GROUP_SESSION_MISSING: Facebook yêu cầu xác minh sau khi bấm Đăng.');
      }

      await page.waitForTimeout(2000);

      // Try extracting newly created post permalink from the Group feed
      let postUrl: string | undefined;
      let externalPostId: string | undefined;
      try {
        const extracted = await page.$eval(
          'div[role="feed"] a[href*="/groups/"][href*="/posts/"], div[role="feed"] a[href*="/groups/"][href*="/permalink/"]',
          (el) => (el as HTMLAnchorElement).href,
        );
        if (extracted) {
          const parsedUrl = new URL(extracted);
          parsedUrl.search = '';
          postUrl = parsedUrl.toString();
          const match = postUrl.match(/\/(?:posts|permalink)\/(\d+)/);
          externalPostId = match?.[1] || postUrl;
        }
      } catch {
        // Optional permalink extraction if feed markup differs
      }

      // Save latest session state
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      await context.storageState({ path: this.stateFile });

      return {
        success: true,
        groupUrl,
        postUrl,
        externalPostId,
        postTitle: options.title,
        publishedAt: new Date().toISOString(),
        message: 'Đã đăng bài thành công vào Group Facebook qua tài khoản Quản trị viên!',
      };
    } finally {
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        try {
          fs.unlinkSync(tempImagePath);
        } catch {}
      }
      await browser.close();
    }
  }

  /**
   * Retract (delete) a post from the Facebook Group using the Administrator session.
   */
  async deleteGroupPost(options: DeleteGroupPostOptions): Promise<DeleteGroupPostResult> {
    const groupUrl = options.groupUrl || 'https://www.facebook.com/groups/1134282109069209';
    const headless = options.headless !== undefined ? options.headless : true;

    const hasSession = fs.existsSync(this.stateFile) || Boolean(process.env.FB_ADMIN_COOKIE?.trim());
    if (!hasSession) {
      throw new Error(
        'FACEBOOK_GROUP_SESSION_MISSING: Chưa tìm thấy phiên đăng nhập Quản trị viên Group Facebook (.fb-session.json hoặc FB_ADMIN_COOKIE).'
      );
    }

    const browser = await this.launchBrowser(headless);
    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();

      const tryDeleteOnCurrentPage = async (snippet?: string): Promise<'deleted' | 'unavailable' | 'not_found'> => {
        await page.waitForTimeout(2500);
        const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        if (
          /Nội dung này hiện không khả dụng|This content isn't available|Trang này không hiển thị/i.test(bodyText)
        ) {
          return 'unavailable';
        }

        const dialog = await page.$('div[role="dialog"]');
        const articles = await page.$$('div[role="article"]');
        let targetArticle = articles[0] ?? null;

        if (snippet && snippet.trim()) {
          const needle = snippet.trim().toLowerCase();
          for (const art of articles) {
            const txt = (await art.innerText().catch(() => '')).toLowerCase();
            if (txt.includes(needle)) {
              targetArticle = art;
              break;
            }
          }
          if (!targetArticle && articles.length > 0 && !page.url().includes('/posts/') && !page.url().includes('/permalink/')) {
            return 'not_found';
          }
        }

        const menuSelectors = [
          '[aria-label*="Hành động cho bài viết này"]',
          '[aria-label*="Actions for this post"]',
          '[aria-label*="Tùy chọn khác"]',
          '[aria-label*="More options"]',
          'div[role="button"][aria-haspopup="menu"]',
        ];

        let menuOpened = false;
        const scopes = [dialog, targetArticle, page].filter(Boolean) as NonNullable<typeof dialog>[];
        for (const scope of scopes) {
          for (const sel of menuSelectors) {
            const btns = await scope.$$(sel);
            for (const btn of btns) {
              const visible = await btn.isVisible().catch(() => false);
              if (!visible) continue;
              const label = ((await btn.getAttribute('aria-label')) || '').toLowerCase();
              if (
                label.includes('tài khoản') ||
                label.includes('account') ||
                label.includes('thông báo') ||
                label.includes('notification') ||
                label.includes('messenger') ||
                label.includes('menu facebook')
              ) {
                continue;
              }
              await btn.click({ force: true, timeout: 5000 }).catch(() => {});
              await page.waitForTimeout(1200);
              const menuVisible = await page.$('div[role="menu"], div[role="menuitem"]');
              if (menuVisible) {
                menuOpened = true;
                break;
              }
            }
            if (menuOpened) break;
          }
          if (menuOpened) break;
        }

        if (!menuOpened) {
          return 'not_found';
        }

        const deleteMenuSelectors = [
          'div[role="menuitem"]:has-text("Gỡ bài viết")',
          'div[role="menuitem"]:has-text("Remove post")',
          'div[role="menuitem"]:has-text("Xóa bài viết")',
          'div[role="menuitem"]:has-text("Delete post")',
          'div[role="menuitem"]:has-text("Chuyển vào thùng rác")',
          'div[role="menuitem"]:has-text("Move to trash")',
          'span:has-text("Gỡ bài viết")',
          'span:has-text("Remove post")',
          'span:has-text("Xóa bài viết")',
          'span:has-text("Delete post")',
          'span:has-text("Chuyển vào thùng rác")',
          'span:has-text("Move to trash")',
        ];

        let clickedDeleteItem = false;
        for (const sel of deleteMenuSelectors) {
          const item = await page.$(sel);
          if (item && (await item.isVisible().catch(() => false))) {
            await item.click({ force: true, timeout: 5000 });
            clickedDeleteItem = true;
            break;
          }
        }

        if (!clickedDeleteItem) {
          const menuItemsText = await page.$$eval('div[role="menuitem"]', (els) =>
            els.map((e) => e.textContent?.trim() || '').filter(Boolean)
          ).catch(() => []);
          console.log('[FacebookGroupBot] Các mục trong menu bài viết:', menuItemsText);
          await page.keyboard.press('Escape').catch(() => {});
          return 'not_found';
        }

        await page.waitForTimeout(1500);

        const confirmSelectors = [
          'div[role="dialog"] div[aria-label="Gỡ"]',
          'div[role="dialog"] div[aria-label="Remove"]',
          'div[role="dialog"] div[aria-label="Xóa"]',
          'div[role="dialog"] div[aria-label="Delete"]',
          'div[role="dialog"] div[aria-label="Xác nhận"]',
          'div[role="dialog"] div[aria-label="Confirm"]',
          'div[role="dialog"] [role="button"]:has-text("Gỡ")',
          'div[role="dialog"] [role="button"]:has-text("Remove")',
          'div[role="dialog"] [role="button"]:has-text("Xóa")',
          'div[role="dialog"] [role="button"]:has-text("Delete")',
          'div[role="dialog"] [role="button"]:has-text("Xác nhận")',
          'div[role="dialog"] [role="button"]:has-text("Confirm")',
        ];

        for (const sel of confirmSelectors) {
          const confirmBtns = await page.$$(sel);
          const confirmBtn = confirmBtns[confirmBtns.length - 1];
          if (confirmBtn && (await confirmBtn.isVisible().catch(() => false))) {
            await confirmBtn.click({ force: true, timeout: 5000 });
            await page.waitForTimeout(3000);
            return 'deleted';
          }
        }

        return 'not_found';
      };

      let outcome: 'deleted' | 'unavailable' | 'not_found' = 'not_found';

      if (options.postUrl && /^https?:\/\/(www\.|m\.)?facebook\.com\/groups\//i.test(options.postUrl)) {
        console.log(`[FacebookGroupBot] Đang mở bài viết cần thu hồi: ${options.postUrl}`);
        await page.goto(options.postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const cur = page.url();
        if (cur.includes('/login') || cur.includes('/checkpoint')) {
          throw new Error('FACEBOOK_GROUP_SESSION_MISSING: Phiên đăng nhập Facebook đã hết hạn.');
        }
        outcome = await tryDeleteOnCurrentPage(options.titleSnippet);
      }

      if (outcome === 'not_found') {
        console.log(`[FacebookGroupBot] Đang tìm bài trên trang Group để thu hồi: ${groupUrl}`);
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const cur = page.url();
        if (cur.includes('/login') || cur.includes('/checkpoint')) {
          throw new Error('FACEBOOK_GROUP_SESSION_MISSING: Phiên đăng nhập Facebook đã hết hạn.');
        }
        outcome = await tryDeleteOnCurrentPage(options.titleSnippet);
      }

      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      await context.storageState({ path: this.stateFile });

      if (outcome === 'deleted') {
        return {
          success: true,
          groupUrl,
          postUrl: options.postUrl,
          message: 'Đã thu hồi (xóa) bài đăng nhầm khỏi Group Facebook thành công!',
        };
      }
      if (outcome === 'unavailable') {
        return {
          success: true,
          groupUrl,
          postUrl: options.postUrl,
          alreadyDeleted: true,
          message: 'Bài viết đã không còn tồn tại trên Group Facebook (đã được gỡ trước đó).',
        };
      }

      return {
        success: false,
        groupUrl,
        postUrl: options.postUrl,
        message: 'Không tìm thấy nút Xóa bài viết trên Group Facebook. Vui lòng kiểm tra lại quyền Quản trị viên hoặc link bài viết.',
      };
    } finally {
      await browser.close();
    }
  }
}
