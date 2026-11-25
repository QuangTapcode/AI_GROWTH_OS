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
  /** File name of the topic's video in COMMUNITY_VIDEO_DIR; posted instead of the image when present. */
  videoFile?: string;
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
  /** Read only `postUrls` (a comment notification named them): skip the slow feed walk. */
  onlyPostUrls?: boolean;
}

/** A "someone commented" notification for a post in the Group. */
export interface GroupCommentNotification {
  key: string;
  postId: string;
  postUrl: string;
  commentId: string;
  replyCommentId?: string;
  type: string;
  text: string;
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
  /** The reply was seen in the comment's own thread after posting. */
  verified?: boolean;
  /** The thread already held this reply, so nothing was posted. */
  alreadyReplied?: boolean;
}

/** Lower-case, NFC, single-spaced text for matching Facebook DOM text against stored comments. */
function normalizeForMatch(value: string | null | undefined): string {
  return (value || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
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

  /** The topic video named by the API, inside this host's COMMUNITY_VIDEO_DIR; anything else is ignored. */
  static resolveVideoFile(videoFile: string | undefined, dir = process.env.COMMUNITY_VIDEO_DIR?.trim()): string | null {
    if (!videoFile || !dir || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/.test(videoFile)) return null;
    const file = path.join(path.resolve(dir), videoFile);
    return fs.existsSync(file) ? file : null;
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
    // The worker runs through tsx (esbuild keepNames), which wraps named functions in `__name(...)`.
    // Code passed to page.evaluate runs in the browser, where that helper does not exist, so every
    // evaluate with an inner named function threw and was swallowed (feed scan always found 0 posts).
    await context.addInitScript(`globalThis.__name = globalThis.__name || ((fn) => fn);`);

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

    // The topic's video goes up instead of the image (same as the Fanpage Reel). No video file → image as before.
    const videoPath = FacebookGroupBot.resolveVideoFile(options.videoFile);
    if (options.videoFile && !videoPath) {
      console.warn(`[FacebookGroupBot] Không thấy video ${options.videoFile} trong COMMUNITY_VIDEO_DIR, đăng kèm ảnh.`);
    }

    let tempImagePath: string | null = null;
    if (options.imageUrl && !videoPath) {
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

      if (videoPath) {
        // A video that fails to attach must fail the post: a text-only post would look done but miss the video.
        const inputSelector = 'div[role="dialog"] input[type="file"][accept*="video"]';
        let inputs = await page.$$(inputSelector);
        if (inputs.length === 0) {
          for (const btnSel of [
            'div[role="dialog"] div[aria-label*="Ảnh/video"]',
            'div[role="dialog"] div[aria-label*="Photo/video"]',
          ]) {
            const button = await page.$(btnSel);
            if (!button) continue;
            await button.click();
            await page.waitForTimeout(1200);
            inputs = await page.$$(inputSelector);
            if (inputs.length > 0) break;
          }
        }
        const input = inputs[inputs.length - 1];
        if (!input) {
          throw new Error('FACEBOOK_GROUP_PUBLISH_FAILED: Không tìm thấy chỗ tải video trong hộp thoại đăng bài.');
        }
        await input.setInputFiles(videoPath);
        console.log(`[FacebookGroupBot] Đã chọn video ${path.basename(videoPath)}, đang chờ Facebook tải lên...`);
        await page.waitForSelector('div[role="dialog"] video', { timeout: 60000 }).catch(() => {
          throw new Error('FACEBOOK_GROUP_PUBLISH_FAILED: Facebook không hiện video trong hộp thoại sau 60 giây.');
        });
      }

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
      // "Post" stays disabled while a video uploads; give it up to 3 minutes (the API waits 270 s in all).
      const postDeadline = Date.now() + (videoPath ? 180_000 : 0);
      for (;;) {
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
        if (posted || Date.now() >= postDeadline) break;
        await page.waitForTimeout(2000);
      }

      if (!posted) {
        throw new Error(
          videoPath
            ? 'FACEBOOK_GROUP_PUBLISH_FAILED: Video chưa tải xong sau 3 phút, nút "Đăng" vẫn bị khóa.'
            : 'FACEBOOK_GROUP_PUBLISH_FAILED: Nút "Đăng" bị vô hiệu hóa hoặc không tìm thấy trong hộp thoại.',
        );
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
    // Newest posts first, so a question under a post someone just wrote by hand is found too.
    const feedUrl = groupUrl.includes('?') ? groupUrl : `${groupUrl.replace(/\/+$/, '')}/?sorting_setting=CHRONOLOGICAL`;
    await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await this.assertAuthenticatedPage(context, page, 'quét bài viết Group');

    // Facebook hydrates feed units late and only gives a post's timestamp link its real href on hover.
    // Reading the feed after a fixed short wait found 0 posts, so no group comment was ever scanned.
    const postLinkSelector = 'div[role="feed"] a[href*="/groups/"][href*="/posts/"], div[role="feed"] a[href*="/groups/"][href*="/permalink/"]';
    // The feed is virtualised: units scrolled past are unmounted, so the newest posts must be
    // harvested before each scroll, not read once at the end (that only saw the oldest posts).
    const harvested: string[] = [];
    const harvest = async () => {
      const hrefs = await page
        .evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((a) => (a as HTMLAnchorElement).href.split('?')[0].split('#')[0]), postLinkSelector)
        .catch(() => [] as string[]);
      for (const href of hrefs) if (href && !harvested.includes(href)) harvested.push(href);
    };
    await page.waitForSelector('div[role="feed"] [aria-posinset]', { timeout: 10_000 }).catch(() => {});
    for (let round = 0; round < 5; round++) {
      // Unresolved timestamp links carry href="?__cft__...#?igf" (or "#"); their visible text is
      // obfuscated, so they are found by href. Hovering makes Facebook swap in /groups/<id>/posts/<id>/.
      const pendingLinks = page.locator('div[role="feed"] a[href^="?"], div[role="feed"] a[href="#"], div[role="feed"] a[href*="#?"]');
      const total = Math.min(await pendingLinks.count().catch(() => 0), 40);
      for (let k = 0; k < total; k++) {
        await pendingLinks.nth(k).hover({ timeout: 1000 }).catch(() => {});
      }
      await page.waitForTimeout(400);
      await harvest();
      if (harvested.length >= maxPosts) break;
      await page.evaluate(() => window.scrollBy(0, 700)).catch(() => {});
      await page.waitForTimeout(1500);
    }

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
    for (const href of harvested) {
      const normalizedUrl = FacebookGroupBot.normalizeGroupPostUrl(href);
      if (!feedUrls.includes(normalizedUrl)) feedUrls.push(normalizedUrl);
    }
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

  /** Admins and moderators of the Group, from its members/admins page (ids from /user/<id>/ links). */
  private async collectGroupAdmins(
    page: import('playwright-core').Page,
    groupUrl: string,
  ): Promise<{ ids: Set<string>; names: string[] }> {
    const ids = new Set<string>();
    const names: string[] = [];
    // Admins rarely change; reading their page on every scan cost seconds per reply.
    const cacheFile = path.join(path.dirname(this.stateFile), '.group-admins-cache.json');
    const cacheKey = groupUrl.split('?')[0].replace(/\/+$/, '');
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))[cacheKey] as { at: number; ids: string[]; names: string[] } | undefined;
      if (cached && Date.now() - cached.at < 30 * 60_000 && cached.ids.length) {
        return { ids: new Set(cached.ids), names: cached.names };
      }
    } catch {
      // No cache yet.
    }
    try {
      await page.goto(`${groupUrl.split('?')[0].replace(/\/+$/, '')}/members/admins`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[role="main"] a[href*="/user/"]', { timeout: 8000 }).catch(() => {});
      // The page also lists ordinary members (avatar links): keep only named links whose own row
      // carries the "Quản trị viên" / "Người kiểm duyệt" role label.
      const found = await page.$$eval('[role="main"] a[href*="/user/"]', (links) =>
        links
          .filter((a) => {
            if (!(a.textContent || '').trim()) return false;
            let row: Element | null = a.parentElement;
            for (let depth = 0; row && depth < 8; depth++, row = row.parentElement) {
              const text = row.textContent || '';
              if (text.length > 400) break;
              if (/Quản trị viên|Người kiểm duyệt|Admin|Moderator/i.test(text)) return true;
            }
            return false;
          })
          .map((a) => ({ name: (a.textContent || '').trim(), href: a.getAttribute('href') || '' })),
      );
      for (const { name, href } of found) {
        const id = (href.match(/\/user\/(\d+)/) || [])[1];
        if (id) ids.add(id);
        if (name && name.length <= 80 && !names.includes(name)) names.push(name);
      }
      if (ids.size) {
        let all: Record<string, unknown> = {};
        try {
          all = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        } catch {
          all = {};
        }
        all[cacheKey] = { at: Date.now(), ids: Array.from(ids), names };
        fs.writeFileSync(cacheFile, JSON.stringify(all), 'utf8');
      }
    } catch {
      // Without the list only the logged-in account and visible admin badges are skipped.
    }
    return { ids, names };
  }

  /**
   * Comment notifications for posts of one Group, read from an open facebook.com/notifications page.
   * Facebook pushes these within seconds of a comment, unlike anything the feed shows.
   */
  async readGroupCommentNotifications(page: Page, groupId: string): Promise<GroupCommentNotification[]> {
    const raw = await page
      .$$eval('a[href*="notif_t="]', (links) =>
        links.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent || '').replace(/\s+/g, ' ').trim() })),
      )
      .catch(() => [] as Array<{ href: string; text: string }>);
    const out: GroupCommentNotification[] = [];
    const seen = new Set<string>();
    for (const { href, text } of raw) {
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        continue;
      }
      const type = url.searchParams.get('notif_t') || '';
      if (!type.startsWith('group_comment')) continue;
      if (!url.pathname.includes(`/groups/${groupId}`)) continue;
      const postId = url.searchParams.get('post_id') || (url.pathname.match(/\/(?:posts|permalink)\/(\d+)/) || [])[1] || '';
      const commentId = url.searchParams.get('comment_id') || '';
      if (!postId || !commentId) continue;
      const replyCommentId = url.searchParams.get('reply_comment_id') || undefined;
      const key = `${postId}:${commentId}:${replyCommentId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        postId,
        postUrl: `https://www.facebook.com/groups/${groupId}/posts/${postId}/`,
        commentId,
        replyCommentId,
        type,
        text: text.slice(0, 200),
      });
    }
    return out;
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
      const targetedOnly = options.onlyPostUrls === true && (options.postUrls?.length ?? 0) > 0;
      const { feedUrls, feedStats, groupMemberCount, adminNames } = targetedOnly
        ? { feedUrls: [] as string[], feedStats: new Map<string, ScannedGroupPostStat>(), groupMemberCount: undefined, adminNames: [] as string[] }
        : await this.collectGroupFeedUrlsAndStats(context, page, groupUrl, maxPosts);

      // Who must never be answered: the account the bot runs as and the Group's admins/moderators
      // (other team bots included). Matched by Facebook user id, names are not reliable.
      const selfId = (await context.cookies('https://www.facebook.com').catch(() => []))
        .find((c) => c.name === 'c_user')?.value;
      const { ids: adminIds, names: groupAdminNames } = await this.collectGroupAdmins(page, groupUrl);
      if (selfId) adminIds.add(selfId);

      // Newest feed posts first (that is where new questions are), then known posts from the DB.
      const mergedUrlSet = new Set<string>();
      for (const u of feedUrls) {
        mergedUrlSet.add(u);
      }
      for (const u of options.postUrls ?? []) {
        if (/^https?:\/\//i.test(u)) mergedUrlSet.add(FacebookGroupBot.normalizeGroupPostUrl(u));
      }
      const urls = Array.from(mergedUrlSet).slice(0, maxPosts);

      const comments: ScannedGroupComment[] = [];
      const seenKeys = new Set<string>();
      const statsMap = new Map<string, ScannedGroupPostStat>(feedStats);
      const adminNameLower = new Set(
        [...adminNames, ...groupAdminNames].map((n) => n.trim().toLowerCase()).filter(Boolean),
      );

      for (const postUrl of urls) {
        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(2200);
          await this.assertAuthenticatedPage(context, page, 'đọc bình luận Group');

          await this.expandCommentsOnCurrentPost(page);

          const postStat = await this.extractPostStatsFromContainer(page, postUrl);
          const prevFeedStat = statsMap.get(postStat.postUrl);

          await page.waitForSelector('div[role="dialog"] div[role="article"][aria-label]', { timeout: 5000 }).catch(() => {});
          const rawComments = await page
            .evaluate((adminIdList: string[]) => {
              const admins = new Set(adminIdList);
              // A post URL opens the post in a dialog over an unrelated page: only that dialog's
              // comments belong to this post. Without a dialog the post is the main column.
              // The page behind the dialog shows other people's comments on other content.
              const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
              const scope: ParentNode = dialogs[dialogs.length - 1] || document.querySelector('[role="main"]') || document;
              const articles = Array.from(
                scope.querySelectorAll(
                  'div[role="article"][aria-label*="Bình luận"], div[role="article"][aria-label*="Comment"], div[role="article"][aria-label*="Phản hồi"], div[role="article"][aria-label*="Reply"]',
                ),
              );
              // Only the comment's own elements: replies are nested inside the comment's article and
              // their names, badges and text must not be taken for the asker's.
              const own = (node: Element, selector: string) =>
                Array.from(node.querySelectorAll(selector)).filter((el) => el.closest('div[role="article"]') === node);
              const authorIdOf = (node: Element) => {
                for (const a of own(node, 'a[href]')) {
                  const href = a.getAttribute('href') || '';
                  const m = href.match(/\/user\/(\d+)/) || href.match(/profile\.php\?id=(\d+)/);
                  if (m) return m[1];
                }
                return '';
              };
              const skipText =
                /^(Thích|Like|Trả lời|Phản hồi|Reply|Chia sẻ|Share|Ẩn|Chỉnh sửa|Đã chỉnh sửa|Đã thích|Quản trị viên|Admin|Người kiểm duyệt|Moderator|Tác giả|Author|Người đóng góp hàng đầu|Vừa xong|Just now|\d+\s*(?:giờ|phút|ngày|tuần|năm|h|m|d|w|y))$/i;
              // "Bình luận dưới tên X" / "Comment by X" is a thread's first message; replies say
              // "Phản hồi bình luận của ..." or "X đáp lại phản hồi của ...".
              const isTopLevel = (n: Element) => /^(Bình luận dưới tên|Comment by)/i.test(n.getAttribute('aria-label') || '');
              // Replies are siblings of the comment, not inside it: the thread is the largest
              // ancestor that still holds a single top-level comment.
              const threadOf = (n: Element): Element => {
                let current: Element = n;
                let parent = n.parentElement;
                while (parent && parent !== scope) {
                  const tops = Array.from(parent.querySelectorAll('div[role="article"][aria-label]')).filter(isTopLevel);
                  if (tops.length > 1) break;
                  current = parent;
                  parent = parent.parentElement;
                }
                return current;
              };

              return articles.map((node) => {
                const label = node.getAttribute('aria-label') || '';
                let authorName = '';
                for (const a of own(node, 'a[role="link"]')) {
                  const candidate = (a.textContent || '').trim();
                  if (candidate.length >= 2 && candidate.length <= 80 && !skipText.test(candidate)) {
                    authorName = candidate;
                    break;
                  }
                }
                if (!authorName) {
                  const m = label.match(/dưới tên (.+?) vào /) || label.match(/^Comment by (.+?) /);
                  authorName = (m?.[1] || '').trim() || 'Thành viên Group';
                }
                const authorId = authorIdOf(node);
                const hasAdminBadge = own(node, 'span').some((sp) =>
                  /^(Quản trị viên|Admin|Người kiểm duyệt|Moderator)$/i.test((sp.textContent || '').trim()),
                );
                const bodyParts = own(node, 'div[dir="auto"]')
                  .map((el) => (el.textContent || '').trim())
                  .filter((t) => t.length >= 1 && t !== authorName && !skipText.test(t));
                const text = Array.from(new Set(bodyParts)).join(' ').trim();
                // Answered when someone from the team (admin, moderator, the bot) wrote after it in its thread.
                const thread = threadOf(node);
                const answeredByTeam = Array.from(thread.querySelectorAll('div[role="article"][aria-label]')).some((r) => {
                  if (r === node || !(node.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
                  const id = authorIdOf(r);
                  return Boolean(id && admins.has(id));
                });
                const isReply = !isTopLevel(node);
                return { authorName, authorId, text, hasAdminBadge, answeredByTeam, isReply };
              });
            }, Array.from(adminIds))
            .catch(() => [] as Array<{ authorName: string; authorId: string; text: string; hasAdminBadge: boolean; answeredByTeam: boolean; isReply: boolean }>);

          const postTag = FacebookGroupBot.extractPostIdFromUrl(postUrl);
          let postCommentsFound = 0;

          for (const rc of rawComments) {
            // Short greetings ("hi", "ok") are real questions to answer too; only empty text is skipped.
            if (!rc.text?.trim()) continue;
            postCommentsFound += 1;
            // Skip self-comments authored by the logged-in admin account or explicitly badged Admin/Moderator
            const authorLower = rc.authorName.trim().toLowerCase();
            if (rc.hasAdminBadge || (rc.authorId && adminIds.has(rc.authorId)) || adminNameLower.has(authorLower)) {
              continue;
            }
            // Someone from the team already replied in this comment's thread: nothing left to answer.
            if (rc.answeredByTeam) continue;
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

      const replyText = options.replyText.trim();
      const snippetNeedle = normalizeForMatch(options.commentSnippet).slice(0, 80);
      const authorNeedle = normalizeForMatch(options.authorName);
      if (!snippetNeedle && !authorNeedle) {
        // Without a target the only box left is the top-level one, which is exactly the bug we must avoid.
        return {
          success: false,
          postUrl: options.postUrl,
          message: 'Thiếu nội dung hoặc tên người bình luận nên không xác định được bình luận cần trả lời.',
        };
      }
      const replyPrefix = normalizeForMatch(replyText).slice(0, 48);

      // Marks the target comment (and its own reply-thread replies) with data attributes so the
      // following steps work on exactly that comment. Returns what was found.
      const locateTarget = async () =>
        page.evaluate(
          ({ snippet, author, prefix }) => {
            const norm = (s: string | null | undefined) =>
              (s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
            document.querySelectorAll('[data-agos-target]').forEach((el) => el.removeAttribute('data-agos-target'));
            // The post opens in a dialog over an unrelated page; its comments live in that dialog.
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
            const root: Element = dialogs[dialogs.length - 1] || document.body;
            const articles = Array.from(root.querySelectorAll<HTMLElement>('div[role="article"][aria-label]'));
            const own = (node: Element, selector: string) =>
              Array.from(node.querySelectorAll(selector)).filter((el) => el.closest('div[role="article"]') === node);
            const ownText = (node: Element) => norm(own(node, 'div[dir="auto"]').map((el) => el.textContent || '').join(' '));
            const authorOf = (node: Element) => {
              const link = own(node, 'a[role="link"]').find((a) => {
                const t = (a.textContent || '').trim();
                return t.length >= 2 && t.length <= 80 && !/^(Thích|Like|Trả lời|Phản hồi|Reply|Chia sẻ|Share)$/i.test(t);
              });
              return norm(link?.textContent);
            };
            const isTopLevel = (n: Element) => /^(Bình luận dưới tên|Comment by)/i.test(n.getAttribute('aria-label') || '');
            // Replies sit next to the comment, not inside it: the thread is the largest ancestor
            // that still holds a single top-level comment.
            const threadOf = (n: Element): Element => {
              let current: Element = n;
              let parent = n.parentElement;
              while (parent && parent !== root) {
                if (Array.from(parent.querySelectorAll('div[role="article"][aria-label]')).filter(isTopLevel).length > 1) break;
                current = parent;
                parent = parent.parentElement;
              }
              return current;
            };
            const answeredInThread = (n: Element) =>
              Boolean(prefix) &&
              Array.from(threadOf(n).querySelectorAll('div[role="article"][aria-label]')).some(
                (r) => r !== n && Boolean(n.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) && ownText(r).includes(prefix),
              );

            // The asker's message (a comment or a follow-up reply), matched on its own text and author.
            const matches = articles.filter((art) => {
              if (snippet && !ownText(art).includes(snippet)) return false;
              if (author && authorOf(art) !== author) return false;
              return true;
            });
            if (!matches.length) return { found: false, alreadyReplied: false };
            const open = matches.find((art) => !answeredInThread(art));
            if (!open) return { found: true, alreadyReplied: true };
            open.setAttribute('data-agos-target', 'comment');
            return { found: true, alreadyReplied: false };
          },
          { snippet: snippetNeedle, author: authorNeedle, prefix: replyPrefix },
        )
        .catch(() => ({ found: false, alreadyReplied: false }));

      // Comments load into the post dialog after the page itself: wait and retry before giving up.
      await page.waitForSelector('div[role="dialog"] div[role="article"][aria-label]', { timeout: 8000 }).catch(() => {});
      let target = await locateTarget();
      for (let attempt = 0; attempt < 3 && !target.found; attempt++) {
        await page.waitForTimeout(2000);
        await this.expandCommentsOnCurrentPost(page);
        target = await locateTarget();
      }
      if (!target.found) {
        return {
          success: false,
          postUrl: options.postUrl,
          message: 'Không tìm thấy bình luận cần trả lời trên bài viết Group nên không đăng (tránh đăng thành bình luận mới).',
        };
      }
      if (target.alreadyReplied) {
        return {
          success: true,
          postUrl: options.postUrl,
          verified: true,
          alreadyReplied: true,
          message: 'Bình luận này đã có câu trả lời giống hệt trong thread nên không đăng lại.',
        };
      }

      const targetComment = page.locator('[data-agos-target="comment"]').first();
      await targetComment.scrollIntoViewIfNeeded().catch(() => {});
      // Only an action whose whole text is "Trả lời"/"Reply": "Xem 3 phản hồi" must not be clicked.
      const replyAction = targetComment
        .locator('[role="button"], [role="link"]')
        .filter({ hasText: /^\s*(Trả lời|Phản hồi|Reply)\s*$/i })
        .first();
      if (!(await replyAction.isVisible().catch(() => false))) {
        return {
          success: false,
          postUrl: options.postUrl,
          message: 'Không thấy nút "Trả lời" dưới bình luận cần trả lời nên không đăng.',
        };
      }
      await replyAction.click();
      await page.waitForTimeout(1200);

      // Facebook focuses the reply composer it opens under the comment. The top-level
      // "Viết bình luận công khai" box is never acceptable here.
      const composerLabel = await page
        .evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || !(el.getAttribute('role') === 'textbox' || el.isContentEditable)) return null;
          el.setAttribute('data-agos-composer', 'reply');
          return (el.getAttribute('aria-label') || '').toLowerCase();
        })
        .catch(() => null);
      const looksTopLevel = (label: string) =>
        /bình luận công khai|viết bình luận|write a (public )?comment/.test(label) && !/trả lời|phản hồi|reply/.test(label);
      let composer = page.locator('[data-agos-composer="reply"]').first();
      if (composerLabel === null || looksTopLevel(composerLabel)) {
        const replyBox = page
          .locator(
            'div[role="textbox"][aria-label*="Trả lời"], div[role="textbox"][aria-label*="Phản hồi"], div[role="textbox"][aria-label*="Viết câu trả lời"], div[role="textbox"][aria-label*="Reply"]',
          )
          .last();
        if (!(await replyBox.isVisible().catch(() => false))) {
          return {
            success: false,
            postUrl: options.postUrl,
            message: 'Đã bấm "Trả lời" nhưng không mở được ô trả lời dưới bình luận nên không đăng.',
          };
        }
        composer = replyBox;
      }

      await composer.click();
      await page.keyboard.press('End').catch(() => {});
      await page.keyboard.insertText(replyText);
      await page.waitForTimeout(600);
      await page.keyboard.press('Enter');

      let verified = false;
      // role="alert" also carries Facebook's success toast ("Đã gửi bình luận của bạn"): only an
      // alert that says something went wrong is a refusal, a "sent" toast is an acknowledgement.
      let permissionAlert = '';
      let sentToast = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        await page.waitForTimeout(800);
        const check = await locateTarget();
        if (check.alreadyReplied) {
          verified = true;
          break;
        }
        const alertText = await page
          .$eval('div[role="alert"]', (el) => (el.textContent || '').trim())
          .catch(() => '');
        if (/đã gửi|đã đăng|comment (was )?(sent|posted)|your comment/i.test(alertText)) {
          sentToast = true;
        } else if (alertText && /không thể|lỗi|hạn chế|bị chặn|blocked|error|cannot|couldn't|try again/i.test(alertText)) {
          permissionAlert = alertText;
          break;
        }
      }
      // Enter consumed the text: Facebook accepted it even if the thread has not re-rendered yet.
      // A composer Facebook removed after posting counts as emptied too.
      const composerEmptied =
        sentToast ||
        (await composer.count().catch(() => 0)) === 0 ||
        (await composer.evaluate((el) => !(el.textContent || '').trim()).catch(() => false));

      await this.persistAuthenticatedState(context, page);

      if (!verified && (!composerEmptied || permissionAlert)) {
        return {
          success: false,
          postUrl: options.postUrl,
          message: permissionAlert
            ? `Facebook từ chối đăng câu trả lời: ${permissionAlert}`
            : 'Đã nhập câu trả lời nhưng Facebook chưa nhận (kiểm tra quyền Quản trị viên hoặc bấm Đổi tài khoản Group Bot).',
        };
      }

      return {
        success: true,
        postUrl: options.postUrl,
        verified,
        message: verified
          ? 'Đã trả lời ngay dưới bình luận và xác minh câu trả lời hiển thị trong thread.'
          : 'Đã gửi câu trả lời dưới bình luận; Facebook chưa hiển thị lại thread để xác minh.',
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
