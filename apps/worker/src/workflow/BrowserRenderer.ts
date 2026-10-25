/**
 * Renders client-side (SPA) pages for URL ingest. Only first-party domains whose
 * pages have no server-rendered text are rendered (INGEST_RENDER_DOMAINS, kept in
 * sync with apps/api/src/modules/research/sourcePolicy.ts). The rendered HTML is
 * sent to AI `knowledge.ingest`, which still enforces the URL allowlist.
 */
export const INGEST_USER_AGENT = process.env.AI_INGEST_USER_AGENT
  || 'AI-Growth-OS-ingest/0.1 (+https://tripc.vn; research source ingest)';

export const RENDER_DOMAINS = (process.env.INGEST_RENDER_DOMAINS ?? 'tripc.ai,tripc.vn')
  .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

export type RenderPage = (url: string) => Promise<string>;

export class RenderError extends Error {
  constructor(public code: string, message: string, public permanent: boolean) { super(message); }
}

export function needsBrowser(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return RENDER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** RFC 9309 subset: the group for our product token (else `*`), longest matching Allow/Disallow wins. */
export function robotsAllows(robots: string, url: string, userAgent = INGEST_USER_AGENT): boolean {
  const token = userAgent.split('/')[0].toLowerCase();
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const field = key.trim().toLowerCase();
    if (field === 'user-agent') {
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && current) {
      if (value) current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  const group = groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a)))
    ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const { pathname, search } = new URL(url);
  const target = pathname + search;
  const matches = group.rules.filter((r) => target.startsWith(r.path.replace(/\*$/, '')));
  if (!matches.length) return true;
  const best = matches.reduce((a, b) => (b.path.length > a.path.length || (b.path.length === a.path.length && b.allow) ? b : a));
  return best.allow;
}

async function checkRobots(url: string): Promise<void> {
  const origin = new URL(url).origin;
  let response: Response;
  try {
    response = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': INGEST_USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new RenderError('ROBOTS_UNAVAILABLE', `robots.txt for ${origin} is unreachable`, false);
  }
  if (response.status >= 500) throw new RenderError('ROBOTS_UNAVAILABLE', `robots.txt returned HTTP ${response.status}`, false);
  if (response.status < 400 && !robotsAllows(await response.text(), url)) {
    throw new RenderError('ROBOTS_DISALLOWED', `robots.txt of ${origin} disallows this URL`, true);
  }
}

/** Headless Edge/Chrome via playwright-core; the browser is installed on the host, never downloaded. */
export const renderWithBrowser: RenderPage = async (url) => {
  await checkRobots(url);
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: process.env.INGEST_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ userAgent: INGEST_USER_AGENT });
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    if (!response || response.status() >= 400) {
      throw new RenderError('URL_FETCH_FAILED', `Page returned HTTP ${response?.status() ?? 'none'}`, (response?.status() ?? 500) < 500);
    }
    // SPAs answer unknown routes with HTTP 200 and a "not found" screen.
    const text = (await page.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ').trim();
    if (text.length < 300 || /\b(page not found|404)\b/i.test(text.slice(0, 200))) {
      throw new RenderError('URL_NOT_FOUND', 'Rendered page has no article content (soft 404)', true);
    }
    // Drop overlays (fixed/sticky banners, notices) and link lists ("related articles", menus)
    // so only the article body reaches ingest.
    await page.evaluate(() => {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const position = getComputedStyle(el).position;
        if (position === 'fixed' || position === 'sticky') el.remove();
      }
      for (const el of Array.from(document.body.querySelectorAll('aside, section, ul, ol, div'))) {
        const text = (el as HTMLElement).innerText?.trim() ?? '';
        if (text.length < 120) continue;
        const linked = Array.from(el.querySelectorAll('a')).reduce((n, a) => n + (a.innerText?.trim().length ?? 0), 0);
        if (linked / text.length > 0.8) el.remove();
      }
    });
    return await page.content();
  } finally {
    await browser.close();
  }
};
