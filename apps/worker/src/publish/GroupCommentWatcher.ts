import type { Browser, BrowserContext, Page } from 'playwright-core';
import { FacebookGroupBot, type GroupCommentNotification } from './FacebookGroupBot';

export interface GroupCommentWatcherOptions {
  apiBase: string;
  token: string;
  groupId: string;
  /** How often the open notifications page is read (ms). */
  pollMs?: number;
  /** Reload the page now and then: Facebook's live updates can stall. */
  reloadMs?: number;
  onIngested?: () => void;
  log?: (message: string) => void;
}

/**
 * Replies to Group comments within about a minute instead of waiting for the periodic scan.
 *
 * Groups have no webhook (Meta removed the Groups API in 2024), so this keeps one headless browser on
 * facebook.com/notifications as the Group Bot account. Facebook pushes "X commented" there within
 * seconds and each notification names the post and comment, so only that post is read
 * (`/internal/community/group-comments`) and the usual Community → approval → reply path follows.
 * Notifications only cover posts the bot account wrote, follows or is mentioned in; the periodic
 * scan stays as the fallback for the rest.
 */
export class GroupCommentWatcher {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopped = false;
  private lastReload = 0;
  private failures = 0;
  private readonly seen = new Set<string>();
  private readonly bot = new FacebookGroupBot();

  constructor(private readonly options: GroupCommentWatcherOptions) {}

  async start(): Promise<void> {
    if (!FacebookGroupBot.hasSavedSession(this.bot.getStateFile())) {
      this.log('no Group Bot session; watcher not started');
      return;
    }
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), this.options.pollMs ?? 8_000);
    await this.tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.closeBrowser();
  }

  private log(message: string) {
    (this.options.log ?? ((m: string) => console.log('[group-comment-watch]', m)))(message);
  }

  private async closeBrowser() {
    const browser = this.browser;
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;
    await browser?.close().catch(() => {});
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    await this.closeBrowser();
    this.browser = await this.bot.launchBrowser(true);
    this.context = await this.bot.createContext(this.browser);
    this.page = await this.context.newPage();
    await this.page.goto('https://www.facebook.com/notifications', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await this.page.waitForSelector('a[href*="notif_t="]', { timeout: 15_000 }).catch(() => {});
    this.lastReload = Date.now();
    return this.page;
  }

  private async tick(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const page = await this.ensurePage();
      if (Date.now() - this.lastReload > (this.options.reloadMs ?? 120_000)) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForSelector('a[href*="notif_t="]', { timeout: 15_000 }).catch(() => {});
        this.lastReload = Date.now();
      }
      if (/\/login|checkpoint/i.test(page.url())) {
        throw new Error(`FACEBOOK_GROUP_SESSION_EXPIRED: ${page.url()}`);
      }
      const notifications = await this.bot.readGroupCommentNotifications(page, this.options.groupId);
      const fresh = notifications.filter((n) => !this.seen.has(n.key));
      if (fresh.length) await this.ingest(fresh);
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      this.log(`tick failed (${this.failures}): ${(error as Error).message}`);
      await this.closeBrowser();
      if (this.failures >= 5 && this.timer) {
        // Stop hammering Facebook with a broken session; the periodic scan keeps working.
        clearInterval(this.timer);
        this.timer = setTimeout(() => {
          this.failures = 0;
          this.timer = setInterval(() => void this.tick(), this.options.pollMs ?? 8_000);
        }, 10 * 60_000) as unknown as NodeJS.Timeout;
      }
    } finally {
      this.busy = false;
    }
  }

  /** Reads only the posts the new notifications point at; marks them seen once the API took them. */
  private async ingest(fresh: GroupCommentNotification[]) {
    const postUrls = Array.from(new Set(fresh.map((n) => n.postUrl))).slice(0, 5);
    const res = await fetch(`${this.options.apiBase}/internal/community/group-comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.token}` },
      body: JSON.stringify({ post_urls: postUrls }),
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) throw new Error(`group-comments HTTP ${res.status}`);
    for (const n of fresh) this.seen.add(n.key);
    const body = (await res.json().catch(() => ({}))) as { results?: Array<{ ingested?: number; queued_rag?: number }> };
    const ingested = (body.results ?? []).reduce((sum, r) => sum + (r.ingested ?? 0), 0);
    this.log(`${fresh.length} notification(s) on ${postUrls.length} post(s) → ${ingested} new comment(s)`);
    if (ingested) this.options.onIngested?.();
  }
}
