import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

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

export interface ScanGroupCommentsOptions {
  groupUrl?: string;
  postUrls?: string[];
  maxPosts?: number;
  headless?: boolean;
}

export interface ScannedGroupComment {
  commentKey: string;
  postUrl: string;
  authorName: string;
  text: string;
}

export interface ScannedGroupPostStat {
  postUrl: string;
  externalPostId: string;
  titleSnippet: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
}

export interface ScanGroupCommentsResult {
  success: boolean;
  groupUrl: string;
  scannedPosts: number;
  comments: ScannedGroupComment[];
  postStats: ScannedGroupPostStat[];
  adminNames?: string[];
  groupMemberCount?: number;
  message?: string;
}

export interface LoginInteractiveOptions {
  fresh?: boolean;
  waitForConfirm?: boolean;
  signalFile?: string;
}

const FB_GENERIC_UI_CHROME_NAMES = new Set([
  'tài khoản',
  'tài khoản của bạn',
  'tài khoản cá nhân',
  'tài khoản, trang cá nhân của bạn',
  'tài khoản, trang cá nhân',
  'trang cá nhân',
  'trang cá nhân của bạn',
  'trang cá nhân và quyền truy cập',
  'ảnh đại diện',
  'ảnh đại diện của bạn',
  'chuyển trang cá nhân',
  'xem tất cả trang cá nhân',
  'menu',
  'menu facebook',
  'messenger',
  'thông báo',
  'cài đặt',
  'cài đặt và quyền riêng tư',
  'bạn',
  'trang chủ',
  'nhóm',
  'video',
  'marketplace',
  'quản trị viên',
  'người kiểm duyệt',
  'viết bình luận',
  'trả lời',
  'đăng',
  'thành viên ẩn danh',
  'account',
  'your account',
  'account, your profile',
  'your profile',
  'profile',
  'profiles',
  'profile picture',
  'your profile picture',
  'switch profile',
  'see all profiles',
  'settings',
  'settings & privacy',
  'notifications',
  'home',
  'groups',
  'you',
  'facebook',
  'admin',
  'moderator',
  'write a comment',
  'reply',
  'post',
  'anonymous participant',
]);

export interface SavedSessionMetadata {
  stateFile: string;
  fileExists: boolean;
  hasEnvCookie: boolean;
  ready: boolean;
  hasAuthCookies: boolean;
  usingPageProfile: boolean;
  accountIdMask: string | null;
  updatedAt: string | null;
}

export interface ReplyGroupCommentOptions {
  groupUrl?: string;
  postUrl: string;
  authorName?: string;
  commentSnippet?: string;
  replyText: string;
  headless?: boolean;
}

export interface ReplyGroupCommentResult {
  success: boolean;
  postUrl: string;
  message: string;
}

export interface SendNativeGroupInvitesOptions {
  groupUrl?: string;
  maxInvites?: number;
  excludeNames?: string[];
  headless?: boolean;
}

export interface NativeGroupInvitedPerson {
  name: string;
  profileRef: string;
}

export interface SendNativeGroupInvitesResult {
  success: boolean;
  groupUrl: string;
  invited: NativeGroupInvitedPerson[];
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

  static hasAuthCookiesInFile(filePath: string): boolean {
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as {
        cookies?: Array<{ name?: string; value?: string; domain?: string; expires?: number }>;
      };
      const nowSec = Math.floor(Date.now() / 1000);
      const fbCookies = (parsed.cookies ?? []).filter(
        (c) =>
          (!c.domain || c.domain.toLowerCase().includes('facebook.com')) &&
          (!c.expires || c.expires < 0 || c.expires > nowSec),
      );
      const cUser = fbCookies.find((c) => c.name === 'c_user')?.value?.trim() || '';
      const xs = fbCookies.find((c) => c.name === 'xs')?.value?.trim() || '';
      return Boolean(cUser && xs);
    } catch {
      return false;
    }
  }

  static hasSavedSession(customStateFile?: string): boolean {
    return FacebookGroupBot.getSessionStatusSync(customStateFile).ready;
  }

  static getSessionStatusSync(customStateFile?: string): SavedSessionMetadata {
    const stateFile = FacebookGroupBot.resolveStateFile(customStateFile);
    const fileExists = fs.existsSync(stateFile);
    const hasEnvCookie = Boolean(process.env.FB_ADMIN_COOKIE?.trim());
    let hasAuthCookies = false;
    let usingPageProfile = false;
    let accountIdMask: string | null = null;
    let updatedAt: string | null = null;

    if (fileExists) {
      try {
        updatedAt = fs.statSync(stateFile).mtime.toISOString();
        const raw = fs.readFileSync(stateFile, 'utf8');
        const parsed = JSON.parse(raw) as {
          cookies?: Array<{ name?: string; value?: string; domain?: string; expires?: number }>;
        };
        const nowSec = Math.floor(Date.now() / 1000);
        const fbCookies = (parsed.cookies ?? []).filter(
          (c) =>
            (!c.domain || c.domain.toLowerCase().includes('facebook.com')) &&
            (!c.expires || c.expires < 0 || c.expires > nowSec),
        );
        const cUser = fbCookies.find((c) => c.name === 'c_user')?.value?.trim() || '';
        const xs = fbCookies.find((c) => c.name === 'xs')?.value?.trim() || '';
        const iUser = fbCookies.find((c) => c.name === 'i_user')?.value?.trim() || '';
        hasAuthCookies = Boolean(cUser && xs);
        if (hasAuthCookies) {
          usingPageProfile = Boolean(iUser && iUser !== cUser);
          const activeId = iUser || cUser;
          if (activeId) {
            accountIdMask = activeId.length > 4 ? `***${activeId.slice(-4)}` : `***${activeId}`;
          }
        }
      } catch {
        // Ignore malformed state file when computing non-secret metadata
      }
    }

    if (!hasAuthCookies && hasEnvCookie) {
      hasAuthCookies = true;
    }

    return {
      stateFile,
      fileExists,
      hasEnvCookie,
      ready: hasAuthCookies,
      hasAuthCookies,
      usingPageProfile,
      accountIdMask,
      updatedAt,
    };
  }

  /**
   * Filters out Facebook UI chrome labels (e.g. "Tài khoản, trang cá nhân của bạn",
   * "Your profile", "Menu Facebook") and extracts the real Profile/Page display name.
   */
  static sanitizeAccountDisplayName(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let candidate = String(raw).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!candidate) return null;

    const prefixes = [
      /^(?:tài khoản|account)\s*[,:\-–|]\s*/i,
      /^(?:trang cá nhân của bạn|your profile|tài khoản của bạn|your account|tài khoản của|account of|profile of)\s*[:,.\-–|]*\s*/i,
      /^(?:bình luận dưới tên|commenting as|đang tương tác với tư cách|interacting as|đang đăng với tư cách|posting as)\s*[:,.\-–|]*\s*/i,
      /^(?:ảnh đại diện(?: của)?|profile picture(?: of)?)\s*[:,.\-–|]*\s*/i,
    ];

    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const rx of prefixes) {
        const next = candidate.replace(rx, '').trim();
        if (next !== candidate) {
          candidate = next;
          changed = true;
        }
      }
      if (!changed) break;
    }

    candidate = candidate.replace(/^[\s"'`“”‘’:,.\-|]+|[\s"'`“”‘’:,.\-|]+$/g, '').trim();
    if (candidate.length < 2 || candidate.length > 80) return null;
    if (/^[\d\s*._\-+]+$/.test(candidate)) return null;

    const lower = candidate.toLowerCase();
    if (FB_GENERIC_UI_CHROME_NAMES.has(lower)) return null;
    if (
      /^(?:tài khoản|account|trang cá nhân|your profile|profile)(?:[\s,:\-–|]+(?:của bạn|cá nhân|trang cá nhân|your profile|profile|account))+$/i.test(
        lower,
      )
    ) {
      return null;
    }

    return candidate;
  }

  /**
   * Parse localized Facebook reaction/comment/share counters such as "15", "1,2K",
   * "1,2 triệu", "32 bình luận", "4 lượt chia sẻ", or "Bạn và 4 người khác".
   */
  static parseFacebookMetricCount(raw: string | number | null | undefined): number {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
    }
    const text = String(raw || '')
      .replace(/\u00A0/g, ' ')
      .trim()
      .toLowerCase();
    if (!text) return 0;

    // 1. "Bạn và 4 người khác" / "You and 4 others" -> 1 + 4 = 5
    const plusOthers = text.match(/(?:bạn và|you and)\s+(\d+(?:[.,]\d+)?)\s*(?:người khác|others?)/i);
    if (plusOthers?.[1]) {
      const n = Number.parseInt(plusOthers[1].replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? n + 1 : 0;
    }

    // 2. Named others e.g. "Minh, Lan và 12 người khác" / "Minh and 12 others" -> listed + N
    const namedOthers = text.match(/^([^,]+(?:,\s*[^,]+)*)\s+(?:và|and)\s+(\d+(?:[.,]\d+)?)\s*(?:người khác|others?)/i);
    if (namedOthers?.[2]) {
      const namesCount = namedOthers[1].split(',').map((s) => s.trim()).filter(Boolean).length;
      const n = Number.parseInt(namedOthers[2].replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? namesCount + n : namesCount;
    }

    // 3. Abbreviated magnitude (1,2K / 1.5K / 2,4 triệu / 1,2 nghìn / 1.1M)
    const unitMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(triệu|trieu|m|nghìn|nghin|k)\b/i);
    if (unitMatch?.[1] && unitMatch[2]) {
      const num = Number.parseFloat(unitMatch[1].replace(',', '.'));
      if (!Number.isFinite(num)) return 0;
      const unit = unitMatch[2].toLowerCase();
      const mult = unit === 'm' || unit.startsWith('tri') ? 1_000_000 : 1_000;
      return Math.round(num * mult);
    }

    // 4. Plain integer with optional thousands separators (e.g., "1.234", "1,234", "15 bình luận")
    const numMatch = text.match(/(\d[\d.,\s]*)/);
    if (numMatch?.[1]) {
      const cleaned = numMatch[1].trim().replace(/[.,\s](?=\d{3}(?:\D|$))/g, '');
      const parsed = Number.parseInt(cleaned.replace(/[^\d]/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
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
      args.push('--start-maximized', '--window-size=1280,860');
    }
    return await chromium.launch({
      channel: this.browserChannel,
      headless,
      args,
    });
  }

  clearSession(): { removed: boolean; stateFile: string } {
    let removed = false;
    for (const candidate of [this.stateFile, `${this.stateFile}.pending.tmp`]) {
      if (fs.existsSync(candidate)) {
        try {
          fs.unlinkSync(candidate);
          removed = true;
        } catch {
          // Ignore file removal error if locked
        }
      }
    }
    return { removed, stateFile: this.stateFile };
  }

  async createContext(
    browser: Browser,
    options?: { fullViewport?: boolean; fresh?: boolean },
  ): Promise<BrowserContext> {
    const fresh = options?.fresh === true;
    const hasState = !fresh && FacebookGroupBot.hasAuthCookiesInFile(this.stateFile);
    const context = await browser.newContext({
      storageState: hasState ? this.stateFile : undefined,
      viewport: options?.fullViewport ? null : { width: 1280, height: 850 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    });

    // Check if FB_ADMIN_COOKIE is provided in environment and not already loaded
    const envCookie = !fresh ? process.env.FB_ADMIN_COOKIE : undefined;
    if (envCookie && !hasState) {
      const parsed = FacebookGroupBot.parseCookiesFromHeader(envCookie);
      if (parsed.length > 0) {
        await context.addCookies(parsed);
      }
    }

    return context;
  }

  private async getLiveAuthCookieStatus(context: BrowserContext): Promise<{
    authenticated: boolean;
    cUser: string;
    xs: string;
    iUser: string;
  }> {
    const cookies = await context.cookies('https://www.facebook.com').catch(() => []);
    const nowSec = Math.floor(Date.now() / 1000);
    const activeCookies = cookies.filter((c) => !c.expires || c.expires < 0 || c.expires > nowSec);
    const cUser = activeCookies.find((c) => c.name === 'c_user')?.value?.trim() || '';
    const xs = activeCookies.find((c) => c.name === 'xs')?.value?.trim() || '';
    const iUser = activeCookies.find((c) => c.name === 'i_user')?.value?.trim() || '';
    return {
      authenticated: Boolean(cUser && xs),
      cUser,
      xs,
      iUser,
    };
  }

  private async assertAuthenticatedPage(
    context: BrowserContext,
    page: Page,
    contextLabel = 'thao tác Group',
  ): Promise<void> {
    const cur = page.url();
    if (
      cur.includes('/login') ||
      cur.includes('/checkpoint') ||
      cur.includes('/two_step') ||
      cur.includes('/recover')
    ) {
      throw new Error(
        `FACEBOOK_GROUP_SESSION_MISSING: Phiên đăng nhập Facebook đã hết hạn hoặc bị yêu cầu xác minh khi ${contextLabel}. Vui lòng đăng nhập lại Group Bot.`,
      );
    }
    const loginFormVisible = await page
      .$('input#email, input[name="email"], input[type="password"]')
      .catch(() => null);
    if (loginFormVisible) {
      throw new Error(
        `FACEBOOK_GROUP_SESSION_MISSING: Facebook đang yêu cầu đăng nhập lại khi ${contextLabel}. Vui lòng mở Edge đăng nhập lại Group Bot.`,
      );
    }
    const authCookies = await this.getLiveAuthCookieStatus(context);
    if (!authCookies.authenticated) {
      throw new Error(
        `FACEBOOK_GROUP_SESSION_MISSING: Thiếu cookie xác thực Facebook (c_user/xs) khi ${contextLabel}. Vui lòng đăng nhập lại Group Bot.`,
      );
    }
  }

  /**
   * Persist browser storageState ONLY when the live context is genuinely authenticated
   * (contains valid `c_user` + `xs` and is not on a login/checkpoint page). Never overwrites
   * `.fb-session.json` with logged-out cookies.
   */
  private async persistAuthenticatedState(context: BrowserContext, page?: Page): Promise<boolean> {
    if (page && !page.isClosed()) {
      const cur = page.url();
      if (
        cur.includes('/login') ||
        cur.includes('/checkpoint') ||
        cur.includes('/two_step') ||
        cur.includes('/recover')
      ) {
        console.warn('[FacebookGroupBot] Bỏ qua lưu .fb-session.json vì trang đang ở /login hoặc /checkpoint.');
        return false;
      }
      const loginFormVisible = await page
        .$('input#email, input[name="email"], input[type="password"]')
        .catch(() => null);
      if (loginFormVisible) {
        console.warn('[FacebookGroupBot] Bỏ qua lưu .fb-session.json vì trang hiển thị form đăng nhập.');
        return false;
      }
    }

    const authCookies = await this.getLiveAuthCookieStatus(context);
    if (!authCookies.authenticated) {
      console.warn('[FacebookGroupBot] Bỏ qua lưu .fb-session.json vì thiếu cookie xác thực Facebook (c_user/xs).');
      return false;
    }

    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const tmpFile = `${this.stateFile}.saving.tmp`;
    try {
      await context.storageState({ path: tmpFile });
      if (!FacebookGroupBot.hasAuthCookiesInFile(tmpFile)) {
        console.warn('[FacebookGroupBot] File phiên tạm không chứa cookie xác thực (c_user/xs); giữ nguyên .fb-session.json.');
        return false;
      }
      fs.copyFileSync(tmpFile, this.stateFile);
      return true;
    } finally {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  /**
   * Check if session has active Facebook authentication
   */
  async checkSession(): Promise<{
    isLoggedIn: boolean;
    detail?: string;
    usingPageProfile?: boolean;
    accountIdMask?: string | null;
    adminName?: string | null;
  }> {
    const meta = FacebookGroupBot.getSessionStatusSync(this.stateFile);
    if (!meta.hasAuthCookies && !meta.hasEnvCookie) {
      return {
        isLoggedIn: false,
        detail: meta.fileExists
          ? 'Tệp phiên .fb-session.json thiếu cookie đăng nhập Facebook (c_user/xs) hoặc đã hết hạn. Vui lòng đăng nhập lại Group Bot.'
          : 'Chưa tìm thấy tệp phiên .fb-session.json hoặc FB_ADMIN_COOKIE. Hãy mở Edge đăng nhập Group Bot.',
      };
    }

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

      const cookieStatus = await this.getLiveAuthCookieStatus(context);
      if (!cookieStatus.authenticated) {
        return {
          isLoggedIn: false,
          detail: 'Không còn cookie xác thực Facebook hợp lệ (c_user/xs) trong trình duyệt. Vui lòng đăng nhập lại Group Bot.',
        };
      }

      // Check for elements that only exist when logged in
      const loggedInIndicator = await page.$(
        'svg[aria-label*="Trang cá nhân của bạn"], div[aria-label*="Tài khoản của bạn"], [aria-label*="Menu Facebook"], [aria-label*="Messenger"], [role="navigation"]'
      );

      if (loggedInIndicator) {
        const names = await this.extractActiveAccountNames(page).catch(() => []);
        const adminName = names[0] ?? null;
        return {
          isLoggedIn: true,
          usingPageProfile: meta.usingPageProfile,
          accountIdMask: meta.accountIdMask,
          ...(adminName ? { adminName } : {}),
          detail: meta.usingPageProfile
            ? `Đã xác nhận phiên Facebook hợp lệ (đang bật Trang/Profile quản trị${adminName ? ` "${adminName}"` : ''}${meta.accountIdMask ? ` ${meta.accountIdMask}` : ''}).`
            : `Đã xác nhận phiên đăng nhập Facebook hợp lệ${adminName ? ` (${adminName}${meta.accountIdMask ? ` • ${meta.accountIdMask}` : ''})` : meta.accountIdMask ? ` (${meta.accountIdMask})` : ''}.`,
        };
      }

      const fallbackNames = await this.extractActiveAccountNames(page).catch(() => []);
      const fallbackAdmin = fallbackNames[0] ?? null;
      return {
        isLoggedIn: true,
        usingPageProfile: meta.usingPageProfile,
        accountIdMask: meta.accountIdMask,
        ...(fallbackAdmin ? { adminName: fallbackAdmin } : {}),
        detail: `Đã xác nhận cookie phiên Facebook (${meta.accountIdMask ?? 'FB'}) tại ${url}`,
      };
    } catch (err) {
      return { isLoggedIn: false, detail: (err as Error).message };
    } finally {
      await browser.close();
    }
  }

  /**
   * Opens an interactive headed browser for the Administrator to log in or switch Facebook account / Page profile.
   * When waitForConfirm=true, Edge remains open until signalFile appears OR user manually closes Edge,
   * snapshotting every cookie / "Switch Profile" (`i_user`) transition into a staging state file.
   */
  async loginInteractive(
    groupUrl = 'https://www.facebook.com/groups/1134282109069209',
    options: LoginInteractiveOptions = {},
  ): Promise<{
    success: boolean;
    message: string;
    stateFile?: string;
    usingPageProfile?: boolean;
    accountIdMask?: string | null;
    adminName?: string | null;
  }> {
    const fresh = options.fresh ?? false;
    const waitForConfirm = options.waitForConfirm ?? false;
    const signalFile = options.signalFile;
    const pendingStateFile = `${this.stateFile}.pending.tmp`;

    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    if (fs.existsSync(pendingStateFile)) {
      try {
        fs.unlinkSync(pendingStateFile);
      } catch {}
    }
    if (signalFile && fs.existsSync(signalFile)) {
      try {
        fs.unlinkSync(signalFile);
      } catch {}
    }

    console.log(
      fresh
        ? '[FacebookGroupBot] Đang mở Edge sạch (chế độ đổi tài khoản Group Bot)...'
        : '[FacebookGroupBot] Đang mở trình duyệt để Quản trị viên đăng nhập...',
    );

    const browser = await this.launchBrowser(false);
    let disconnected = false;
    let capturedAdminName: string | null = null;
    browser.on('disconnected', () => {
      disconnected = true;
    });

    try {
      const context = await this.createContext(browser, { fullViewport: true, fresh });
      const page = await context.newPage();
      await page.goto(fresh ? 'https://www.facebook.com/login' : 'https://www.facebook.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.bringToFront().catch(() => {});

      console.log('👉 Vui lòng đăng nhập tài khoản Quản trị viên trên cửa sổ Edge.');
      if (waitForConfirm) {
        console.log(
          signalFile
            ? '👉 Sau khi đăng nhập xong, bạn có thể chuyển Profile/Page ("Chuyển trang cá nhân") ngay trên Edge rồi bấm nút "✅ Đã đổi xong trên Edge — Lưu & Đóng Edge" trên web (hoặc đóng cửa sổ Edge).'
            : '👉 Sau khi đăng nhập & bấm Chuyển trang cá nhân (Profile/Page) xong trên Edge, HÃY ĐÓNG CỬA SỔ EDGE để lưu hoàn tất phiên mới vào .fb-session.json!',
        );
      }

      const maxWaitMs = waitForConfirm ? 600_000 : 180_000;
      const startedAt = Date.now();
      let firstAuthAt: number | null = null;
      let navigatedToGroup = false;
      let lastCapturedSig = '';
      let hasCapturedValidState = false;

      const inspectAuth = async () => {
        if (disconnected || !browser.isConnected()) return { alive: false, authenticated: false, sig: '' };
        const activePages = context.pages().filter((p) => !p.isClosed());
        if (activePages.length === 0) return { alive: false, authenticated: false, sig: '' };
        const activePage = activePages[activePages.length - 1];
        let url = '';
        let hasLoginInputs = false;
        try {
          url = activePage.url();
          hasLoginInputs = Boolean(
            await activePage.$('input[name="email"], input[type="password"]'),
          );
        } catch {
          return { alive: !disconnected && browser.isConnected(), authenticated: false, sig: '' };
        }
        const cookies = await context.cookies('https://www.facebook.com').catch(() => []);
        const cUser = cookies.find((c) => c.name === 'c_user')?.value?.trim() || '';
        const xs = cookies.find((c) => c.name === 'xs')?.value?.trim() || '';
        const iUser = cookies.find((c) => c.name === 'i_user')?.value?.trim() || '';
        const blockedUrl =
          url.includes('/login') ||
          url.includes('/checkpoint') ||
          url.includes('/two_step') ||
          url.includes('/recover');
        const authenticated =
          Boolean(cUser && xs) &&
          !blockedUrl &&
          !hasLoginInputs &&
          url.includes('facebook.com');
        const sig = authenticated ? `${cUser}:${iUser}:${xs.slice(0, 8)}` : '';
        return { alive: true, authenticated, sig, activePage, url };
      };

      while (Date.now() - startedAt < maxWaitMs) {
        if (signalFile && fs.existsSync(signalFile)) {
          const checkFinal = await inspectAuth().catch(() => ({
            alive: false,
            authenticated: false,
            sig: '',
            activePage: undefined,
          }));
          if (checkFinal.alive && checkFinal.authenticated) {
            if (checkFinal.activePage) {
              const names = await this.extractActiveAccountNames(checkFinal.activePage).catch(() => []);
              if (names[0]) capturedAdminName = names[0];
            }
            await context.storageState({ path: pendingStateFile }).catch(() => {});
            hasCapturedValidState = FacebookGroupBot.hasAuthCookiesInFile(pendingStateFile);
          }
          break;
        }

        const state = await inspectAuth();
        if (!state.alive) {
          break;
        }

        if (state.authenticated) {
          if (firstAuthAt === null) {
            firstAuthAt = Date.now();
          }

          if (state.sig !== lastCapturedSig) {
            await context.storageState({ path: pendingStateFile }).catch(() => {});
            if (FacebookGroupBot.hasAuthCookiesInFile(pendingStateFile)) {
              lastCapturedSig = state.sig;
              hasCapturedValidState = true;
            }
            if (state.activePage) {
              const names = await this.extractActiveAccountNames(state.activePage).catch(() => []);
              if (names[0]) capturedAdminName = names[0];
            }
          }

          if (
            !navigatedToGroup &&
            Date.now() - firstAuthAt >= 1800 &&
            groupUrl &&
            /^https:\/\/(www\.|m\.)?facebook\.com\/groups\//i.test(groupUrl) &&
            state.activePage &&
            !state.url?.includes('/groups/')
          ) {
            navigatedToGroup = true;
            await state.activePage.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await state.activePage.bringToFront().catch(() => {});
            const postNavAuth = await inspectAuth().catch(() => ({
              alive: false,
              authenticated: false,
              sig: '',
              activePage: undefined,
            }));
            if (postNavAuth.authenticated) {
              if (postNavAuth.activePage) {
                const names = await this.extractActiveAccountNames(postNavAuth.activePage).catch(() => []);
                if (names[0]) capturedAdminName = names[0];
              }
              await context.storageState({ path: pendingStateFile }).catch(() => {});
              if (FacebookGroupBot.hasAuthCookiesInFile(pendingStateFile)) {
                hasCapturedValidState = true;
              }
            }
          }

          if (!waitForConfirm && Date.now() - firstAuthAt >= 2800 && hasCapturedValidState) {
            if (state.activePage && !capturedAdminName) {
              const names = await this.extractActiveAccountNames(state.activePage).catch(() => []);
              if (names[0]) capturedAdminName = names[0];
            }
            break;
          }
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (hasCapturedValidState && FacebookGroupBot.hasAuthCookiesInFile(pendingStateFile)) {
        fs.copyFileSync(pendingStateFile, this.stateFile);
        try {
          fs.unlinkSync(pendingStateFile);
        } catch {}
        if (signalFile && fs.existsSync(signalFile)) {
          try {
            fs.unlinkSync(signalFile);
          } catch {}
        }
        const savedMeta = FacebookGroupBot.getSessionStatusSync(this.stateFile);
        console.log('✅ Đăng nhập thành công! Phiên đã được lưu vào:', this.stateFile);
        return {
          success: true,
          stateFile: this.stateFile,
          usingPageProfile: savedMeta.usingPageProfile,
          accountIdMask: savedMeta.accountIdMask,
          ...(capturedAdminName ? { adminName: capturedAdminName } : {}),
          message: savedMeta.usingPageProfile
            ? `Đã lưu phiên Quản trị viên (Trang/Profile ${savedMeta.accountIdMask ?? ''}) vào ${this.stateFile}`
            : `Đăng nhập Quản trị viên thành công (${savedMeta.accountIdMask ?? 'FB'}). Đã lưu session vào ${this.stateFile}`,
        };
      }

      return {
        success: false,
        message: 'Chưa phát hiện đăng nhập Facebook hoàn tất trước khi hết thời gian hoặc đóng cửa sổ Edge.',
      };
    } catch (err) {
      if (FacebookGroupBot.hasAuthCookiesInFile(pendingStateFile)) {
        fs.copyFileSync(pendingStateFile, this.stateFile);
        try {
          fs.unlinkSync(pendingStateFile);
        } catch {}
        const savedMeta = FacebookGroupBot.getSessionStatusSync(this.stateFile);
        return {
          success: true,
          stateFile: this.stateFile,
          usingPageProfile: savedMeta.usingPageProfile,
          accountIdMask: savedMeta.accountIdMask,
          ...(capturedAdminName ? { adminName: capturedAdminName } : {}),
          message: `Đã lưu phiên đăng nhập mới nhất vào ${this.stateFile}`,
        };
      }
      return { success: false, message: `Quá thời gian hoặc lỗi: ${(err as Error).message}` };
    } finally {
      if (signalFile && fs.existsSync(signalFile)) {
        try {
          fs.unlinkSync(signalFile);
        } catch {}
      }
      if (fs.existsSync(pendingStateFile)) {
        try {
          fs.unlinkSync(pendingStateFile);
        } catch {}
      }
      await browser.close().catch(() => {});
    }
  }

  /**
   * Automatically publish a post to the Facebook Group using the Administrator session.
   */
  async postToGroup(options: GroupPostOptions): Promise<GroupPostResult> {
    const groupUrl = options.groupUrl || 'https://www.facebook.com/groups/1134282109069209';
    const headless = options.headless !== undefined ? options.headless : true;

    // Check if valid session cookies or env cookie exist — fail closed, never silently fallback to Fanpage
    const hasSession = FacebookGroupBot.hasSavedSession(this.stateFile);
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

      await this.assertAuthenticatedPage(context, page, 'đăng bài lên Group');

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

      // Save latest authenticated session state safely (never overwrite with logged-out cookies)
      await this.persistAuthenticatedState(context, page);

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

    const hasSession = FacebookGroupBot.hasSavedSession(this.stateFile);
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
        await this.assertAuthenticatedPage(context, page, 'thu hồi bài viết');
        outcome = await tryDeleteOnCurrentPage(options.titleSnippet);
      }

      if (outcome === 'not_found') {
        console.log(`[FacebookGroupBot] Đang tìm bài trên trang Group để thu hồi: ${groupUrl}`);
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await this.assertAuthenticatedPage(context, page, 'thu hồi bài viết trên Group');
        outcome = await tryDeleteOnCurrentPage(options.titleSnippet);
      }

      await this.persistAuthenticatedState(context, page);

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

  private static normalizeGroupPostUrl(rawHref: string): string {
    try {
      const u = new URL(rawHref);
      u.search = '';
      u.hash = '';
      return u.toString().replace(/\/$/, '') + '/';
    } catch {
      return rawHref.split('?')[0].split('#')[0];
    }
  }

  private static extractPostIdFromUrl(postUrl: string): string {
    const match = postUrl.match(/\/(?:posts|permalink)\/(\d+)/);
    return match?.[1] || createHash('sha1').update(postUrl).digest('hex').slice(0, 10);
  }

  private async extractActiveAccountNames(page: import('playwright-core').Page): Promise<string[]> {
    const rawCandidates = await page
      .evaluate(() => {
        const out: string[] = [];
        const add = (val?: string | null) => {
          const s = (val || '').replace(/\s+/g, ' ').trim();
          if (s && s.length >= 2 && s.length <= 120) out.push(s);
        };

        const contextSelectors = [
          '[aria-label*="Bình luận dưới tên"]',
          '[aria-label*="Commenting as"]',
          '[aria-label*="Đang tương tác với tư cách"]',
          '[aria-label*="Interacting as"]',
          '[role="navigation"] a[href*="/me/"] span',
          '[role="banner"] a[href*="/me/"] span',
          '[role="main"] a[href*="/me/"] span',
          'a[href*="/me/"]',
          'a[href*="facebook.com/profile.php"] span',
          '[role="banner"] [aria-label*="Trang cá nhân"] img',
          '[role="banner"] [aria-label*="Your profile"] img',
          '[role="banner"] [aria-label*="Tài khoản"] img',
          '[role="banner"] svg image',
          '[role="banner"] [aria-label*="Trang cá nhân của bạn"]',
          '[role="banner"] [aria-label*="Your profile"]',
        ];

        for (const sel of contextSelectors) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            add(el.getAttribute('aria-label'));
            add(el.getAttribute('alt'));
            if (el.children.length <= 2) {
              add(el.textContent);
            }
          }
        }
        return Array.from(new Set(out));
      })
      .catch(() => []);

    const cleaned: string[] = [];
    for (const raw of rawCandidates) {
      const sanitized = FacebookGroupBot.sanitizeAccountDisplayName(raw);
      if (sanitized && !cleaned.includes(sanitized)) {
        cleaned.push(sanitized);
      }
    }
    return cleaned;
  }

  private async extractGroupHeaderMemberCount(page: import('playwright-core').Page): Promise<number | undefined> {
    const rawText = await page
      .evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/members"], span, div'));
        for (const el of links) {
          if (el.children.length > 3) continue;
          const t = (el.textContent || '').trim();
          if (/\d+(?:[.,]\d+)?\s*(?:k|m|triệu|nghìn)?\s*(?:thành viên|members)\b/i.test(t) && t.length <= 60) {
            return t;
          }
        }
        return '';
      })
      .catch(() => '');
    if (!rawText) return undefined;
    const count = FacebookGroupBot.parseFacebookMetricCount(rawText);
    return count > 0 ? count : undefined;
  }

  private async extractPostStatsFromContainer(
    page: import('playwright-core').Page,
    postUrl: string,
  ): Promise<ScannedGroupPostStat> {
    const raw = await page
      .evaluate(() => {
        const root =
          document.querySelector('div[role="dialog"]') ||
          document.querySelector('div[role="main"]') ||
          document.body;

        const isInsideComment = (el: Element): boolean => {
          const article = el.closest('div[role="article"]');
          if (!article) return false;
          const lbl = article.getAttribute('aria-label') || '';
          return /bình luận|comment|phản hồi|reply/i.test(lbl);
        };

        const titleEl = Array.from(root.querySelectorAll('[data-ad-preview="message"], div[dir="auto"]')).find(
          (el) => !isInsideComment(el) && (el.textContent || '').trim().length >= 10,
        );
        const titleSnippet = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);

        const reactionCandidates: string[] = [];
        const commentCandidates: string[] = [];
        const shareCandidates: string[] = [];

        const nodes = Array.from(
          root.querySelectorAll('span[aria-label], div[aria-label], a[aria-label], div[role="button"], span, a'),
        );
        for (const el of nodes) {
          if (isInsideComment(el)) continue;
          const aria = (el.getAttribute('aria-label') || '').trim();
          const text = el.children.length <= 2 ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';

          if (aria) {
            if (/(?:tất cả cảm xúc|bày tỏ cảm xúc|người đã bày tỏ|thích:|like:|reactions?:)/i.test(aria) && /\d/.test(aria)) {
              reactionCandidates.push(aria);
            }
            if (/\d.*\b(?:bình luận|comments?)\b/i.test(aria)) {
              commentCandidates.push(aria);
            }
            if (/\d.*\b(?:lượt chia sẻ|chia sẻ|shares?)\b/i.test(aria)) {
              shareCandidates.push(aria);
            }
          }

          if (text && text.length <= 64) {
            if (/^(\d[\d.,\s]*(?:k|m|triệu|nghìn)?)\s*(?:bình luận|comments?)$/i.test(text)) {
              commentCandidates.push(text);
            } else if (/^(\d[\d.,\s]*(?:k|m|triệu|nghìn)?)\s*(?:lượt chia sẻ|chia sẻ|shares?)$/i.test(text)) {
              shareCandidates.push(text);
            } else if (
              /^(?:bạn và \d+ người khác|you and \d+ others?)$/i.test(text) ||
              (/^(\d+(?:[.,]\d+)?\s*(?:k|m|triệu|nghìn)?)$/i.test(text) &&
                Boolean(
                  el.closest('[aria-label*="cảm xúc"], [aria-label*="react"]') ||
                    el.parentElement?.querySelector('img, svg') ||
                    el.closest('span[role="toolbar"]'),
                ))
            ) {
              reactionCandidates.push(text);
            }
          }
        }

        return {
          titleSnippet,
          reactionCandidates: Array.from(new Set(reactionCandidates)),
          commentCandidates: Array.from(new Set(commentCandidates)),
          shareCandidates: Array.from(new Set(shareCandidates)),
        };
      })
      .catch(() => ({
        titleSnippet: '',
        reactionCandidates: [] as string[],
        commentCandidates: [] as string[],
        shareCandidates: [] as string[],
      }));

    const likesCount = raw.reactionCandidates.reduce(
      (max, c) => Math.max(max, FacebookGroupBot.parseFacebookMetricCount(c)),
      0,
    );
    const commentsCount = raw.commentCandidates.reduce(
      (max, c) => Math.max(max, FacebookGroupBot.parseFacebookMetricCount(c)),
      0,
    );
    const sharesCount = raw.shareCandidates.reduce(
      (max, c) => Math.max(max, FacebookGroupBot.parseFacebookMetricCount(c)),
      0,
    );

    const normalizedUrl = FacebookGroupBot.normalizeGroupPostUrl(postUrl);
    return {
      postUrl: normalizedUrl,
      externalPostId: FacebookGroupBot.extractPostIdFromUrl(normalizedUrl),
      titleSnippet: raw.titleSnippet,
      likesCount,
      commentsCount,
      sharesCount,
    };
  }

  private async collectGroupFeedUrlsAndStats(
    context: BrowserContext,
    page: Page,
    groupUrl: string,
    maxPosts: number,
  ): Promise<{ feedUrls: string[]; feedStats: Map<string, ScannedGroupPostStat>; groupMemberCount?: number; adminNames: string[] }> {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await this.assertAuthenticatedPage(context, page, 'quét bài viết Group');

    // Light scroll so top 5-8 posts hydrate reaction/comment bars
    await page.evaluate(() => window.scrollBy(0, 650)).catch(() => {});
    await page.waitForTimeout(1200);

    const [groupMemberCount, adminNames, rawCards] = await Promise.all([
      this.extractGroupHeaderMemberCount(page),
      this.extractActiveAccountNames(page),
      page
        .evaluate(() => {
          const anchors = Array.from(
            document.querySelectorAll(
              'div[role="feed"] a[href*="/groups/"][href*="/posts/"], div[role="feed"] a[href*="/groups/"][href*="/permalink/"]',
            ),
          ) as HTMLAnchorElement[];

          const cardMap = new Map<
            string,
            {
              rawHref: string;
              titleSnippet: string;
              reactionCandidates: string[];
              commentCandidates: string[];
              shareCandidates: string[];
            }
          >();

          for (const anchor of anchors) {
            const cleanHref = anchor.href.split('?')[0].split('#')[0];
            if (!cleanHref || cardMap.has(cleanHref)) continue;

            const card =
              anchor.closest('div[data-pagelet^="FeedUnit"]') ||
              anchor.closest('div[role="article"]') ||
              anchor.closest('div[aria-posinset]');
            if (!card) {
              cardMap.set(cleanHref, {
                rawHref: cleanHref,
                titleSnippet: '',
                reactionCandidates: [],
                commentCandidates: [],
                shareCandidates: [],
              });
              continue;
            }

            const isInsideComment = (el: Element): boolean => {
              const art = el.closest('div[role="article"]');
              if (!art || art === card) return false;
              const lbl = art.getAttribute('aria-label') || '';
              return /bình luận|comment|phản hồi|reply/i.test(lbl);
            };

            const titleEl = Array.from(card.querySelectorAll('[data-ad-preview="message"], div[dir="auto"]')).find(
              (el) => !isInsideComment(el) && (el.textContent || '').trim().length >= 10,
            );
            const titleSnippet = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);

            const reactionCandidates: string[] = [];
            const commentCandidates: string[] = [];
            const shareCandidates: string[] = [];

            const nodes = Array.from(
              card.querySelectorAll('span[aria-label], div[aria-label], a[aria-label], div[role="button"], span, a'),
            );
            for (const el of nodes) {
              if (isInsideComment(el)) continue;
              const aria = (el.getAttribute('aria-label') || '').trim();
              const text = el.children.length <= 2 ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';

              if (aria) {
                if (/(?:tất cả cảm xúc|bày tỏ cảm xúc|người đã bày tỏ|thích:|like:|reactions?:)/i.test(aria) && /\d/.test(aria)) {
                  reactionCandidates.push(aria);
                }
                if (/\d.*\b(?:bình luận|comments?)\b/i.test(aria)) {
                  commentCandidates.push(aria);
                }
                if (/\d.*\b(?:lượt chia sẻ|chia sẻ|shares?)\b/i.test(aria)) {
                  shareCandidates.push(aria);
                }
              }

              if (text && text.length <= 64) {
                if (/^(\d[\d.,\s]*(?:k|m|triệu|nghìn)?)\s*(?:bình luận|comments?)$/i.test(text)) {
                  commentCandidates.push(text);
                } else if (/^(\d[\d.,\s]*(?:k|m|triệu|nghìn)?)\s*(?:lượt chia sẻ|chia sẻ|shares?)$/i.test(text)) {
                  shareCandidates.push(text);
                } else if (
                  /^(?:bạn và \d+ người khác|you and \d+ others?)$/i.test(text) ||
                  (/^(\d+(?:[.,]\d+)?\s*(?:k|m|triệu|nghìn)?)$/i.test(text) &&
                    Boolean(
                      el.closest('[aria-label*="cảm xúc"], [aria-label*="react"]') ||
                        el.parentElement?.querySelector('img, svg') ||
                        el.closest('span[role="toolbar"]'),
                    ))
                ) {
                  reactionCandidates.push(text);
                }
              }
            }

            cardMap.set(cleanHref, {
              rawHref: cleanHref,
              titleSnippet,
              reactionCandidates: Array.from(new Set(reactionCandidates)),
              commentCandidates: Array.from(new Set(commentCandidates)),
              shareCandidates: Array.from(new Set(shareCandidates)),
            });
          }

          return Array.from(cardMap.values());
        })
        .catch(() => []),
    ]);

    const feedStats = new Map<string, ScannedGroupPostStat>();
    const feedUrls: string[] = [];
    for (const card of rawCards) {
      const normalizedUrl = FacebookGroupBot.normalizeGroupPostUrl(card.rawHref);
      if (!feedUrls.includes(normalizedUrl)) {
        feedUrls.push(normalizedUrl);
      }
      const stat: ScannedGroupPostStat = {
        postUrl: normalizedUrl,
        externalPostId: FacebookGroupBot.extractPostIdFromUrl(normalizedUrl),
        titleSnippet: card.titleSnippet,
        likesCount: card.reactionCandidates.reduce(
          (max, c) => Math.max(max, FacebookGroupBot.parseFacebookMetricCount(c)),
          0,
        ),
        commentsCount: card.commentCandidates.reduce(
          (max, c) => Math.max(max, FacebookGroupBot.parseFacebookMetricCount(c)),
          0,
        ),
        sharesCount: card.shareCandidates.reduce(
          (max, c) => Math.max(max, FacebookGroupBot.parseFacebookMetricCount(c)),
          0,
        ),
      };
      feedStats.set(normalizedUrl, stat);
    }

    return {
      feedUrls: feedUrls.slice(0, maxPosts),
      feedStats,
      groupMemberCount,
      adminNames,
    };
  }

  private async expandCommentsOnCurrentPost(page: import('playwright-core').Page): Promise<void> {
    // Switch "Phù hợp nhất" / "Most relevant" filter to "Tất cả bình luận" / "All comments" if present
    const filterSelectors = [
      'div[role="dialog"] [role="button"]:has-text("Phù hợp nhất")',
      'div[role="dialog"] [role="button"]:has-text("Most relevant")',
      '[role="button"]:has-text("Phù hợp nhất")',
      '[role="button"]:has-text("Most relevant")',
    ];
    for (const sel of filterSelectors) {
      const btn = await page.$(sel).catch(() => null);
      if (btn && (await btn.isVisible().catch(() => false))) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(800);
        const allOpt = await page
          .$(
            'div[role="menuitem"]:has-text("Tất cả bình luận"), div[role="menuitem"]:has-text("All comments"), div[role="menuitem"]:has-text("Mới nhất"), div[role="menuitem"]:has-text("Newest")',
          )
          .catch(() => null);
        if (allOpt) {
          await allOpt.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(1400);
        }
        break;
      }
    }

    // Expand collapsed comment threads (up to 2 clicks to stay bounded)
    for (let i = 0; i < 2; i++) {
      const expandBtn = await page
        .$(
          '[role="button"]:has-text("Xem thêm bình luận"), [role="button"]:has-text("View more comments"), [role="button"]:has-text("Xem bình luận trước"), [role="button"]:has-text("View previous comments")',
        )
        .catch(() => null);
      if (!expandBtn || !(await expandBtn.isVisible().catch(() => false))) break;
      await expandBtn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  /**
   * Scans comments and engagement stats (Likes, Comments, Shares) from recent Group posts via Playwright.
   */
  async scanGroupComments(options: ScanGroupCommentsOptions): Promise<ScanGroupCommentsResult> {
    const groupUrl = options.groupUrl || 'https://www.facebook.com/groups/1134282109069209';
    const maxPosts = Math.min(Math.max(1, options.maxPosts ?? 5), 10);
    const headless = options.headless !== undefined ? options.headless : true;

    const hasSession = FacebookGroupBot.hasSavedSession(this.stateFile);
    if (!hasSession) {
      throw new Error(
        'FACEBOOK_GROUP_SESSION_MISSING: Chưa tìm thấy phiên đăng nhập Quản trị viên Group Facebook.'
      );
    }

    const browser = await this.launchBrowser(headless);
    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();

      // Always collect Group feed URLs, member count & baseline engagement cards first
      const { feedUrls, feedStats, groupMemberCount, adminNames } = await this.collectGroupFeedUrlsAndStats(
        context,
        page,
        groupUrl,
        maxPosts,
      );

      const mergedUrlSet = new Set<string>();
      for (const u of options.postUrls ?? []) {
        if (/^https?:\/\//i.test(u)) mergedUrlSet.add(FacebookGroupBot.normalizeGroupPostUrl(u));
      }
      for (const u of feedUrls) {
        mergedUrlSet.add(u);
      }
      const urls = Array.from(mergedUrlSet).slice(0, maxPosts);

      const comments: ScannedGroupComment[] = [];
      const seenKeys = new Set<string>();
      const statsMap = new Map<string, ScannedGroupPostStat>(feedStats);
      const adminNameLower = new Set(adminNames.map((n) => n.trim().toLowerCase()).filter(Boolean));

      for (const postUrl of urls) {
        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(2200);
          await this.assertAuthenticatedPage(context, page, 'đọc bình luận Group');

          await this.expandCommentsOnCurrentPost(page);

          const postStat = await this.extractPostStatsFromContainer(page, postUrl);
          const prevFeedStat = statsMap.get(postStat.postUrl);

          const rawComments = await page.$$eval(
            'div[role="article"][aria-label*="Bình luận"], div[role="article"][aria-label*="Comment"], div[role="article"][aria-label*="Phản hồi"], div[role="article"][aria-label*="Reply"]',
            (nodes) =>
              nodes.map((node) => {
                const links = Array.from(node.querySelectorAll('a[role="link"]'));
                let authorName = '';
                for (const a of links) {
                  const candidate = (a.textContent || '').trim();
                  if (
                    candidate.length >= 2 &&
                    candidate.length <= 80 &&
                    !/^(Thích|Like|Trả lời|Phản hồi|Reply|Chia sẻ|Share|Vừa xong|Just now|\d+\s*(?:giờ|phút|ngày|tuần|năm|h|m|d|w|y))$/i.test(
                      candidate,
                    )
                  ) {
                    authorName = candidate;
                    break;
                  }
                }
                if (!authorName) {
                  const strong = node.querySelector('a span, strong');
                  authorName = (strong?.textContent || '').trim() || 'Thành viên Group';
                }

                const nodeText = node.textContent || '';
                const hasAdminBadge = Array.from(node.querySelectorAll('span')).some((sp) =>
                  /^(Quản trị viên|Admin|Người kiểm duyệt|Moderator)$/i.test((sp.textContent || '').trim()),
                );

                const textEls = Array.from(node.querySelectorAll('div[dir="auto"]'));
                const bodyParts = textEls
                  .map((el) => (el.textContent || '').trim())
                  .filter(
                    (t) =>
                      t.length >= 3 &&
                      t !== authorName &&
                      !/^(Thích|Like|Trả lời|Phản hồi|Reply|Chia sẻ|Share|Ẩn|Chỉnh sửa|Đã thích|Quản trị viên|Admin|Người kiểm duyệt|Moderator|Tác giả|Author|Người đóng góp hàng đầu|Vừa xong|Just now|\d+\s*(?:giờ|phút|ngày|tuần|h|m|d|w))$/i.test(
                        t,
                      ),
                  );
                const text = Array.from(new Set(bodyParts)).join(' ').trim();
                return { authorName, text, hasAdminBadge, hasLabel: Boolean(nodeText) };
              }),
          ).catch(() => []);

          const postTag = FacebookGroupBot.extractPostIdFromUrl(postUrl);
          let postCommentsFound = 0;

          for (const rc of rawComments) {
            if (!rc.text || rc.text.length < 3) continue;
            postCommentsFound += 1;
            // Skip self-comments authored by the logged-in admin account or explicitly badged Admin/Moderator
            const authorLower = rc.authorName.trim().toLowerCase();
            if (rc.hasAdminBadge || adminNameLower.has(authorLower)) {
              continue;
            }
            const digest = createHash('sha1')
              .update(`${postTag}|${authorLower}|${rc.text.slice(0, 180).toLowerCase()}`)
              .digest('hex')
              .slice(0, 16);
            const commentKey = `grpcmt:${postTag}:${digest}`;
            if (seenKeys.has(commentKey)) continue;
            seenKeys.add(commentKey);
            comments.push({
              commentKey,
              postUrl,
              authorName: rc.authorName.slice(0, 180),
              text: rc.text.slice(0, 2000),
            });
          }

          statsMap.set(postStat.postUrl, {
            postUrl: postStat.postUrl,
            externalPostId: postStat.externalPostId,
            titleSnippet: postStat.titleSnippet || prevFeedStat?.titleSnippet || '',
            likesCount: Math.max(postStat.likesCount, prevFeedStat?.likesCount ?? 0),
            commentsCount: Math.max(postStat.commentsCount, prevFeedStat?.commentsCount ?? 0, postCommentsFound),
            sharesCount: Math.max(postStat.sharesCount, prevFeedStat?.sharesCount ?? 0),
          });
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('FACEBOOK_GROUP_SESSION_MISSING')) {
            throw err;
          }
        }
      }

      await this.persistAuthenticatedState(context, page);

      return {
        success: true,
        groupUrl,
        scannedPosts: urls.length,
        comments,
        postStats: Array.from(statsMap.values()),
        adminNames,
        groupMemberCount,
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Scrapes post engagement metrics (Likes, Comments, Shares) and Group member count via Playwright.
   */
  async scrapeGroupPostStats(options: ScanGroupCommentsOptions): Promise<ScanGroupCommentsResult> {
    return await this.scanGroupComments({
      ...options,
      maxPosts: Math.min(Math.max(1, options.maxPosts ?? 8), 10),
    });
  }

  /**
   * Posts a reply to a Facebook Group post or specific comment thread using the Admin session.
   * Verifies that the submitted reply actually appears outside the composer box (never false-succeeds).
   */
  async replyToGroupComment(options: ReplyGroupCommentOptions): Promise<ReplyGroupCommentResult> {
    const headless = options.headless !== undefined ? options.headless : true;
    const hasSession = FacebookGroupBot.hasSavedSession(this.stateFile);
    if (!hasSession) {
      throw new Error('FACEBOOK_GROUP_SESSION_MISSING: Chưa có phiên đăng nhập Group Bot.');
    }
    if (!options.replyText?.trim()) {
      return { success: false, postUrl: options.postUrl, message: 'Nội dung trả lời bình luận đang trống.' };
    }

    const browser = await this.launchBrowser(headless);
    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();
      await page.goto(options.postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
      await this.assertAuthenticatedPage(context, page, 'trả lời bình luận Group');

      await this.expandCommentsOnCurrentPost(page);

      let focusedBox = false;
      const needle = options.commentSnippet?.trim().slice(0, 80).toLowerCase() || '';
      const authorNeedle = options.authorName?.trim().toLowerCase() || '';
      if (needle || authorNeedle) {
        const commentArticles = await page.$$(
          'div[role="article"][aria-label*="Bình luận"], div[role="article"][aria-label*="Comment"], div[role="article"][aria-label*="Phản hồi"], div[role="article"][aria-label*="Reply"]',
        );
        for (const art of commentArticles) {
          const txt = (await art.innerText().catch(() => '')).toLowerCase();
          const matched = (needle && txt.includes(needle)) || (!needle && authorNeedle && txt.includes(authorNeedle));
          if (matched) {
            await art.scrollIntoViewIfNeeded().catch(() => {});
            const replyBtn = await art.$(
              '[role="button"]:has-text("Trả lời"), [role="button"]:has-text("Phản hồi"), [role="button"]:has-text("Reply")',
            );
            if (replyBtn && (await replyBtn.isVisible().catch(() => false))) {
              await replyBtn.click().catch(() => {});
              await page.waitForTimeout(1000);
              focusedBox = true;
              break;
            }
          }
        }
      }

      const replyBoxSelectors = [
        'div[role="dialog"] div[role="textbox"][aria-label*="Viết câu trả lời"]',
        'div[role="dialog"] div[role="textbox"][aria-label*="Trả lời"]',
        'div[role="dialog"] div[role="textbox"][aria-label*="Phản hồi"]',
        'div[role="dialog"] div[role="textbox"][aria-label*="Reply"]',
        'div[role="textbox"][aria-label*="Viết câu trả lời"]',
        'div[role="textbox"][aria-label*="Trả lời"]',
        'div[role="textbox"][aria-label*="Phản hồi"]',
        'div[role="textbox"][aria-label*="Reply"]',
      ];
      const generalBoxSelectors = [
        'div[role="dialog"] div[role="textbox"][aria-label*="Viết bình luận"]',
        'div[role="dialog"] div[role="textbox"][aria-label*="Bình luận"]',
        'div[role="dialog"] div[role="textbox"][aria-label*="Write a comment"]',
        'div[role="textbox"][aria-label*="Viết bình luận"]',
        'div[role="textbox"][aria-label*="Write a comment"]',
        'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
      ];

      let targetBox: import('playwright-core').ElementHandle<SVGElement | HTMLElement> | null = null;
      if (focusedBox) {
        for (const sel of replyBoxSelectors) {
          const boxes = await page.$$(sel);
          if (boxes.length > 0) {
            targetBox = boxes[boxes.length - 1];
            break;
          }
        }
        if (!targetBox) {
          const activeElHandle = await page.evaluateHandle(() => {
            const el = document.activeElement as HTMLElement | null;
            return el && (el.getAttribute('role') === 'textbox' || el.isContentEditable) ? el : null;
          });
          targetBox = activeElHandle.asElement() as import('playwright-core').ElementHandle<HTMLElement> | null;
        }
      }
      if (!targetBox) {
        for (const sel of [...replyBoxSelectors, ...generalBoxSelectors]) {
          const boxes = await page.$$(sel);
          if (boxes.length > 0) {
            targetBox = boxes[boxes.length - 1];
            break;
          }
        }
      }

      if (!targetBox) {
        const blockedHint = await page
          .evaluate(() => {
            const body = document.body?.innerText || '';
            if (/Tham gia nhóm|Join group/i.test(body)) {
              return 'Tài khoản Facebook hiện tại chưa tham gia hoặc không phải Quản trị viên Group nên không có ô bình luận.';
            }
            return '';
          })
          .catch(() => '');
        return {
          success: false,
          postUrl: options.postUrl,
          message:
            blockedHint ||
            'Không tìm thấy ô nhập bình luận trên bài viết Group (kiểm tra tài khoản Group Bot đã là Quản trị viên/Thành viên Group chưa).',
        };
      }

      const verifyPrefix = options.replyText.trim().replace(/\s+/g, ' ').slice(0, 36).toLowerCase();
      const countRenderedMatches = async (): Promise<number> =>
        page
          .evaluate((prefix) => {
            if (!prefix) return 0;
            const els = Array.from(document.querySelectorAll('div[role="article"] div[dir="auto"], div[dir="auto"]'));
            let matches = 0;
            for (const el of els) {
              if (el.closest('div[role="textbox"]')) continue;
              const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
              if (txt.includes(prefix)) matches += 1;
            }
            return matches;
          }, verifyPrefix)
          .catch(() => 0);

      const beforeMatches = await countRenderedMatches();

      await targetBox.scrollIntoViewIfNeeded().catch(() => {});
      await targetBox.click();
      await page.keyboard.insertText(options.replyText.trim());
      await page.waitForTimeout(600);
      await page.keyboard.press('Enter');

      let verified = false;
      let permissionAlert = '';
      for (let attempt = 0; attempt < 7; attempt++) {
        await page.waitForTimeout(750);
        const afterMatches = await countRenderedMatches();
        if (afterMatches > beforeMatches) {
          verified = true;
          break;
        }
        permissionAlert = await page
          .$eval('div[role="alert"]', (el) => (el.textContent || '').trim())
          .catch(() => '');
        if (permissionAlert && /không thể|lỗi|hạn chế|blocked|error|cannot/i.test(permissionAlert)) {
          break;
        }

        // On attempt 2, if text still sits in textbox, try clicking the send button icon
        if (attempt === 2) {
          const sendBtn = await page.$(
            'div[aria-label="Bình luận"][role="button"]:not([aria-disabled="true"]), div[aria-label="Comment"][role="button"]:not([aria-disabled="true"]), div[aria-label*="Gửi"][role="button"]:not([aria-disabled="true"])',
          );
          if (sendBtn && (await sendBtn.isVisible().catch(() => false))) {
            await sendBtn.click().catch(() => {});
          }
        }
      }

      await this.persistAuthenticatedState(context, page);

      if (!verified) {
        return {
          success: false,
          postUrl: options.postUrl,
          message: permissionAlert
            ? `Facebook từ chối đăng bình luận: ${permissionAlert}`
            : 'Đã nhập nội dung nhưng bình luận chưa xuất hiện trên bài viết Group (kiểm tra quyền Quản trị viên hoặc bấm Đổi tài khoản Group Bot).',
        };
      }

      return {
        success: true,
        postUrl: options.postUrl,
        message: 'Đã gửi và xác minh bình luận trả lời hiển thị công khai trên Group Facebook.',
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Clicks real Facebook Group "Mời / Invite" controls for suggested / interested friends — never force-adding members.
   * Respects caller's excludeNames & hard caps at 15 per invocation.
   */
  async sendNativeGroupInvites(options: SendNativeGroupInvitesOptions): Promise<SendNativeGroupInvitesResult> {
    const groupUrl = options.groupUrl || 'https://www.facebook.com/groups/1134282109069209';
    const maxInvites = Math.min(Math.max(1, options.maxInvites ?? 5), 15);
    const excludeSet = new Set((options.excludeNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean));
    const headless = options.headless !== undefined ? options.headless : true;

    const hasSession = FacebookGroupBot.hasSavedSession(this.stateFile);
    if (!hasSession) {
      throw new Error('FACEBOOK_GROUP_SESSION_MISSING: Chưa có phiên đăng nhập Group Bot.');
    }

    const browser = await this.launchBrowser(headless);
    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      await this.assertAuthenticatedPage(context, page, 'mời thành viên vào Group');

      const inviteTriggerSelectors = [
        'div[role="main"] div[role="button"][aria-label="Mời"]',
        'div[role="main"] div[role="button"][aria-label="Invite"]',
        'div[role="button"][aria-label*="Mời bạn bè"]',
        'div[role="button"][aria-label*="Invite"]',
        'div[role="button"]:has-text("+ Mời")',
        'div[role="button"]:has-text("Mời")',
        'div[role="button"]:has-text("Invite")',
      ];

      let openedDialog = false;
      for (const sel of inviteTriggerSelectors) {
        const btns = await page.$$(sel);
        for (const btn of btns) {
          const text = ((await btn.innerText().catch(() => '')) || '').trim();
          const label = ((await btn.getAttribute('aria-label')) || '').trim();
          if (!/^(\+?\s*)?(Mời|Invite)(\s+bạn bè|\s+friends)?$/i.test(text) && !/^(Mời|Invite)/i.test(label)) {
            continue;
          }
          await btn.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(1500);

          const menuFriendItem = await page.$(
            'div[role="menuitem"]:has-text("Mời bạn bè trên Facebook"), div[role="menuitem"]:has-text("Invite Facebook friends"), div[role="menuitem"]:has-text("Mời")'
          );
          if (menuFriendItem) {
            await menuFriendItem.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1500);
          }

          const dlg = await page.$('div[role="dialog"]');
          if (dlg) {
            openedDialog = true;
            break;
          }
        }
        if (openedDialog) break;
      }

      if (!openedDialog) {
        return {
          success: true,
          groupUrl,
          invited: [],
          message: 'Không mở được hộp thoại "Mời" trên giao diện Facebook Group lúc này (hoặc không có nút Mời khả dụng).',
        };
      }

      const invited: NativeGroupInvitedPerson[] = [];
      const rowButtons = await page.$$('div[role="dialog"] div[role="button"], div[role="dialog"] button');
      for (const btn of rowButtons) {
        if (invited.length >= maxInvites) break;
        const btnText = ((await btn.innerText().catch(() => '')) || '').trim();
        const ariaDisabled = await btn.getAttribute('aria-disabled');
        if (!/^(Mời|Invite)$/i.test(btnText) || ariaDisabled === 'true') continue;

        const rowInfo = await btn.evaluate((el) => {
          const row = el.closest('div[role="listitem"], div[data-visualcompletion="ignore-dynamic"], div') || el.parentElement;
          const rowText = (row?.textContent || '').replace(/\b(Mời|Invite)\b/gi, '').trim();
          const link = row?.querySelector('a[href*="facebook.com"]') as HTMLAnchorElement | null;
          return {
            name: rowText.split('\n')[0]?.trim() || '',
            href: link?.href || '',
          };
        }).catch(() => ({ name: '', href: '' }));

        const displayName = rowInfo.name.slice(0, 120) || `Bạn Facebook #${invited.length + 1}`;
        if (excludeSet.has(displayName.toLowerCase())) continue;

        await btn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
        excludeSet.add(displayName.toLowerCase());
        invited.push({
          name: displayName,
          profileRef: rowInfo.href ? rowInfo.href.split('?')[0].slice(0, 220) : `fb_invite:${displayName.toLowerCase()}`,
        });
      }

      await this.persistAuthenticatedState(context, page);

      return {
        success: true,
        groupUrl,
        invited,
        message:
          invited.length > 0
            ? `Đã bấm nút Mời (Invite) thật trên Group Facebook cho ${invited.length} người.`
            : 'Hộp thoại Mời không có gợi ý mới khả dụng (hoặc tất cả đã được mời trước đó).',
      };
    } finally {
      await browser.close();
    }
  }
}
