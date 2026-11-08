import type { MetricItem } from './schemas';

/**
 * Facebook Page KPIs for the dashboard, read live from the Graph API with the server-side
 * page token. Only the workspace bound to the page (FACEBOOK_WEBHOOK_WORKSPACE_ID, when set)
 * receives them. A failed request yields missing + reason, never a fabricated 0.
 */

export const FACEBOOK_KPI_KEYS = ['fb_followers', 'fb_posts', 'fb_engagements', 'fb_conversations'] as const;

const CACHE_TTL_MS = 5 * 60_000;
const MAX_PAGES = 5;
const cache = new Map<string, { at: number; kpis: Record<string, MetricItem> }>();

type GraphPage<T> = { data?: T[]; paging?: { next?: string } };
type Post = {
  created_time?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};
type Conversation = { updated_time?: string };

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function facebookPageConfigured(workspaceId: string): boolean {
  if ((process.env.INTEGRATION_MODE ?? 'fake') !== 'production') return false;
  if (!env('FACEBOOK_PAGE_ID') || !env('FACEBOOK_PAGE_ACCESS_TOKEN')) return false;
  const bound = env('FACEBOOK_WEBHOOK_WORKSPACE_ID');
  return !bound || bound === workspaceId;
}

async function graphGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? `HTTP_${response.status}`);
  return body;
}

async function graphList<T>(firstUrl: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = firstUrl;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const body: GraphPage<T> = await graphGet<GraphPage<T>>(url);
    items.push(...(body.data ?? []));
    url = body.paging?.next;
  }
  return items;
}

function metric(key: string, value: number | null, missingReason: string | null = null): MetricItem {
  return value === null
    ? { metric: key, value: null, availability: 'missing', missing_reason: missingReason }
    : { metric: key, value, availability: 'available', missing_reason: null };
}

/** Range bounds in Asia/Ho_Chi_Minh (UTC+7), as epoch milliseconds. */
function rangeBounds(from: string, to: string) {
  return { start: Date.parse(`${from}T00:00:00+07:00`), end: Date.parse(`${to}T23:59:59.999+07:00`) };
}

export async function getFacebookPageKpis(from: string, to: string): Promise<Record<string, MetricItem>> {
  const cacheKey = `${env('FACEBOOK_PAGE_ID')}|${from}|${to}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.kpis;

  const pageId = encodeURIComponent(env('FACEBOOK_PAGE_ID')!);
  const token = encodeURIComponent(env('FACEBOOK_PAGE_ACCESS_TOKEN')!);
  const base = `https://graph.facebook.com/${env('META_GRAPH_API_VERSION') ?? 'v21.0'}`;
  const { start, end } = rangeBounds(from, to);
  const inRange = (iso?: string) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) && t >= start && t <= end;
  };

  // Follower count is a current snapshot: only meaningful for a period that ends today/yesterday.
  const todayVn = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const yesterdayVn = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const periodIsCurrent = to >= yesterdayVn && from <= todayVn;

  const [followers, posts, conversations] = await Promise.allSettled([
    periodIsCurrent
      ? graphGet<{ followers_count?: number; fan_count?: number }>(`${base}/${pageId}?fields=followers_count,fan_count&access_token=${token}`)
      : Promise.resolve(null),
    graphList<Post>(
      `${base}/${pageId}/posts?fields=created_time,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)` +
        `&since=${Math.floor(start / 1000)}&until=${Math.floor(end / 1000)}&limit=100&access_token=${token}`,
    ),
    graphList<Conversation>(`${base}/${pageId}/conversations?fields=updated_time&limit=100&access_token=${token}`),
  ]);

  const kpis: Record<string, MetricItem> = {};

  if (followers.status === 'rejected') kpis.fb_followers = metric('fb_followers', null, 'FACEBOOK_API_ERROR');
  else if (followers.value === null) kpis.fb_followers = metric('fb_followers', null, 'CURRENT_SNAPSHOT_ONLY');
  else kpis.fb_followers = metric('fb_followers', followers.value.followers_count ?? followers.value.fan_count ?? 0);

  if (posts.status === 'rejected') {
    kpis.fb_posts = metric('fb_posts', null, 'FACEBOOK_API_ERROR');
    kpis.fb_engagements = metric('fb_engagements', null, 'FACEBOOK_API_ERROR');
  } else {
    const rows = posts.value.filter((post) => inRange(post.created_time));
    kpis.fb_posts = metric('fb_posts', rows.length);
    kpis.fb_engagements = metric(
      'fb_engagements',
      rows.reduce(
        (sum, post) =>
          sum + (post.reactions?.summary?.total_count ?? 0) + (post.comments?.summary?.total_count ?? 0) + (post.shares?.count ?? 0),
        0,
      ),
    );
  }

  kpis.fb_conversations =
    conversations.status === 'rejected'
      ? metric('fb_conversations', null, 'FACEBOOK_API_ERROR')
      : metric('fb_conversations', conversations.value.filter((c) => inRange(c.updated_time)).length);

  const anyFailed = Object.values(kpis).some((k) => k.missing_reason === 'FACEBOOK_API_ERROR');
  if (!anyFailed) cache.set(cacheKey, { at: Date.now(), kpis });
  return kpis;
}
