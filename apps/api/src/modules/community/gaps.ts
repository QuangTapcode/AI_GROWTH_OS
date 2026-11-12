/**
 * Questions the Community bot could not answer, and the sources that would let it answer them next time.
 *
 * A reply that fell back for lack of a grounded answer lists its question here (same question, however typed, once).
 * A periodic cycle turns an open question into an English topic, looks for pages on the open reference wikis
 * (Research source policy), and queues the relevant ones as URL sources. They are ingested as usual and wait for the
 * owner's approval; once one is approved the question counts as resolved, and asking it again unanswered reopens it.
 */
export type GapStatus = 'open' | 'proposed' | 'resolved' | 'no_source';
export type ProposedSource = { source_id: string; url: string; title: string };
export type Gap = {
  id: string;
  workspace_id: string;
  key: string;
  question: string;
  ask_count: number;
  status: GapStatus;
  topic: string | null;
  proposed: ProposedSource[];
  last_asked_at: number;
  last_checked_at: number | null;
  reopened: number;
};
export interface GapStore {
  upsertAsked(workspaceId: string, key: string, question: string, now: number): Promise<Gap>;
  save(gap: Gap): Promise<void>;
  list(workspaceId: string): Promise<Gap[]>;
  sourceStatuses(sourceIds: string[]): Promise<Map<string, string>>;
  knownUrls(workspaceId: string, urls: string[]): Promise<Set<string>>;
  /** Of these addresses, the sources still waiting for the owner's review, by address → source id. */
  pendingSources(workspaceId: string, urls: string[]): Promise<Map<string, string>>;
}
export type GapDeps = {
  /** English search phrases for the question: the whole question first, then each part it asks about
   *  ("Pho", "Da Nang cuisine"); null when none can be made. */
  topicOf(question: string): Promise<string | string[] | null>;
  searchWiki(site: string, query: string): Promise<{ title: string; url: string }[]>;
  createSource(workspaceId: string, title: string, url: string): Promise<{ id: string }>;
};

const unaccent = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** The same question typed with other spacing, case or punctuation gets the same key. */
export function gapKey(question: string): string {
  return unaccent(question.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Reference wikis searched for a gap; both are on the Research source policy (open licence, ingestable). */
export const GAP_WIKIS = ['en.wikivoyage.org', 'en.wikipedia.org'] as const;
const MAX_SOURCES_PER_GAP = 3;
const GAPS_PER_CYCLE = 2;
const RETRY_NO_SOURCE_MS = 7 * 24 * 3600_000;
// Words every travel page shares; a title must match the question on something more specific.
const GENERIC = new Set(['tourist', 'tourism', 'travel', 'traveller', 'destination', 'destinations', 'guide', 'vietnam', 'viet', 'nam',
  'how', 'get', 'getting', 'there', 'things', 'to', 'do', 'best', 'time', 'visit', 'visiting', 'city', 'information', 'info',
  'attractions', 'sightseeing', 'what', 'the', 'a', 'an', 'of', 'in', 'and', 'for', 'tips', 'trip', 'tour', 'tours', 'area']);

// The business's own prices, policies and services are on no public wiki.
const ABOUT_THE_BUSINESS = /\btrip\s?c\b/i;

const words = (text: string) => new Set(gapKey(text).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w)));

const pairs = (text: string) => {
  const list = gapKey(text).split(' ').filter(Boolean);
  return new Set(list.slice(1).map((w, i) => `${list[i]} ${w}`));
};

// What kind of place a page is, not which one: "Chàm Islands" is about Cham, "Thanh Khê district" about Thanh Khê.
const KIND_OF_PLACE = new Set(['island', 'islands', 'province', 'district', 'ward', 'commune', 'town', 'vietnamese']);

/** A page is relevant when most of its title is something the topic names (a place, a dish, an event).
 *  Sharing one name is not enough: "Da Nang Hospital" is not about pho in Da Nang, "Lê Ngọc Hân" not about Ngoc Son.
 *  A short word alone ("da", "an", "ha") is part of many names, so Da Lat is not Da Nang: it counts only within a pair. */
export function relevantToTopic(topic: string, title: string): boolean {
  const wanted = words(topic);
  const wantedPairs = pairs(topic);
  const tokens = gapKey(title).split(' ').filter((t) => t.length > 1 && !GENERIC.has(t) && !KIND_OF_PLACE.has(t));
  // The title's names: a short syllable joins the next one ("Da Nang", "Ha Noi", "Le Pho" are one name each).
  // Every name counts, numbers too, so "Pho 79", "Lê Phổ" and "Da Nang Hospital" are not about pho in Da Nang.
  const names: boolean[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].length <= 2 && i + 1 < tokens.length) {
      names.push(wantedPairs.has(`${tokens[i]} ${tokens[i + 1]}`));
      i++;
    } else {
      names.push(tokens[i].length >= 3 && wanted.has(tokens[i]));
    }
  }
  return names.filter(Boolean).length * 2 > names.length;
}

/** The question names something in `part`: one of its words, or a two-syllable name like "Da Nang". */
function namedIn(question: string, part: string): boolean {
  const asked = new Set(gapKey(question).split(' '));
  const askedPairs = pairs(question);
  return [...words(part)].some((w) => w.length >= 3 && asked.has(w)) || [...pairs(part)].some((p) => askedPairs.has(p));
}

/** A wiki page's address as linked from the search and as it may already be stored (wiki/Hội_An is wiki/Hoi_An). */
function addressesOf(url: string): string[] {
  const match = url.match(/^(https:\/\/[^/]+\/wiki\/)(.+)$/);
  if (!match) return [url];
  let name: string;
  try { name = decodeURIComponent(match[2]); } catch { return [url]; }
  const plain = `${match[1]}${encodeURIComponent(unaccent(name)).replace(/%2F/g, '/')}`;
  return [...new Set([url, plain, `${match[1]}${encodeURIComponent(name).replace(/%2F/g, '/')}`])];
}

/** The wikis' search matches every word, so naming the country keeps out songs and albums ("Rainy Day People"). */
const inVietnam = (topic: string) => (/\bviet\s?nam\b/i.test(gapKey(topic)) ? topic : `${topic} Vietnam`);

export class KnowledgeGaps {
  constructor(private readonly store: GapStore, private readonly deps: GapDeps) {}

  /** Looks for sources for the most asked open questions; returns how many questions it worked on. */
  async runCycle(workspaceId: string, now = Date.now()): Promise<number> {
    const due = (await this.store.list(workspaceId))
      .filter((g) => g.status === 'open' || (g.status === 'no_source' && now - (g.last_checked_at ?? 0) >= RETRY_NO_SOURCE_MS))
      .sort((a, b) => b.ask_count - a.ask_count)
      .slice(0, GAPS_PER_CYCLE);
    for (const gap of due) await this.search(gap, now);
    return due.length;
  }

  private async search(gap: Gap, now: number) {
    const raw = await this.deps.topicOf(gap.question);
    const all = [...new Set((Array.isArray(raw) ? raw : [raw]).map((q) => q?.trim()).filter((q): q is string => Boolean(q)))];
    // The small model sometimes adds places the customer never named ("Hoi An" for pho in Da Nang): a part is kept
    // only when the question itself names it.
    const queries = all.filter((q, i) => i === 0 || namedIn(gap.question, q));
    const topic = queries[0] ?? null;
    const candidates: { title: string; url: string; site: string }[] = [];
    // Each part of the question is searched on its own: "pho in Da Nang" also looks for "Pho". Pages already in
    // the sources did not answer it, so they are skipped below and the search goes on to the next pages.
    if (topic && !ABOUT_THE_BUSINESS.test(`${gap.question} ${queries.join(' ')}`)) {
      for (const query of queries) {
        for (const site of GAP_WIKIS) {
          for (const hit of await this.deps.searchWiki(site, inVietnam(query)).catch(() => [])) {
            if (relevantToTopic(query, hit.title) && !candidates.some((c) => c.url === hit.url)) candidates.push({ ...hit, site });
          }
        }
      }
    }
    const addresses = candidates.flatMap((c) => addressesOf(c.url));
    const known = await this.store.knownUrls(gap.workspace_id, addresses);
    const pending = await this.store.pendingSources(gap.workspace_id, addresses);
    const proposed: ProposedSource[] = [];
    // A page already approved did not answer this question; one still waiting for review (proposed for another
    // question) may, so it is linked here too instead of being skipped.
    for (const c of candidates) {
      if (proposed.length >= MAX_SOURCES_PER_GAP) break;
      const waiting = addressesOf(c.url).map((u) => pending.get(u)).find(Boolean);
      if (waiting && !gap.proposed.some((p) => p.source_id === waiting)) {
        proposed.push({ source_id: waiting, url: c.url, title: `${c.title} (${c.site})` });
      }
    }
    for (const c of candidates.filter((c) => !addressesOf(c.url).some((u) => known.has(u))).slice(0, MAX_SOURCES_PER_GAP - proposed.length)) {
      const title = `${c.title} (${c.site})`;
      const { id } = await this.deps.createSource(gap.workspace_id, title, c.url);
      proposed.push({ source_id: id, url: c.url, title });
    }
    await this.store.save({ ...gap, topic, proposed: [...gap.proposed, ...proposed], last_checked_at: now,
      status: proposed.length ? 'proposed' : 'no_source' });
  }

  async recordUnanswered(workspaceId: string, question: string, now = Date.now()): Promise<Gap | null> {
    const text = question.replace(/\s+/g, ' ').trim();
    const key = gapKey(text);
    if (!key) return null;
    const gap = await this.store.upsertAsked(workspaceId, key, text, now);
    if (gap.status !== 'resolved') return gap;
    // Its sources were approved yet the bot still could not answer: look again.
    const reopened = { ...gap, status: 'open' as const, reopened: gap.reopened + 1, last_checked_at: null };
    await this.store.save(reopened);
    return reopened;
  }

  /** A proposed question is resolved as soon as the owner approves one of its sources. */
  async refresh(workspaceId: string): Promise<void> {
    const proposed = (await this.store.list(workspaceId)).filter((g) => g.status === 'proposed');
    if (!proposed.length) return;
    const statuses = await this.store.sourceStatuses(proposed.flatMap((g) => g.proposed.map((p) => p.source_id)));
    for (const gap of proposed) {
      if (gap.proposed.some((p) => statuses.get(p.source_id) === 'approved')) await this.store.save({ ...gap, status: 'resolved' });
    }
  }
}

type Queryable = { query: <R = any>(text: string, params?: unknown[]) => Promise<{ rows: R[] }> };
type GapRow = Omit<Gap, 'last_asked_at' | 'last_checked_at'> & { last_asked_at: Date; last_checked_at: Date | null };
const fromRow = (r: GapRow): Gap => ({ ...r, proposed: Array.isArray(r.proposed) ? r.proposed : [],
  last_asked_at: new Date(r.last_asked_at).getTime(), last_checked_at: r.last_checked_at ? new Date(r.last_checked_at).getTime() : null });

/** community_knowledge_gaps (migration 023). */
export class PgGapStore implements GapStore {
  constructor(private readonly db: Queryable) {}

  async upsertAsked(workspaceId: string, key: string, question: string, now: number) {
    const row = (await this.db.query<GapRow>(
      `INSERT INTO community_knowledge_gaps (workspace_id, key, question, ask_count, last_asked_at)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (workspace_id, key) DO UPDATE SET ask_count = community_knowledge_gaps.ask_count + 1,
         last_asked_at = EXCLUDED.last_asked_at, updated_at = now()
       RETURNING *`, [workspaceId, key, question, new Date(now)])).rows[0];
    return fromRow(row);
  }
  async save(gap: Gap) {
    await this.db.query(
      `UPDATE community_knowledge_gaps SET status = $2, topic = $3, proposed = $4::jsonb, reopened = $5, last_checked_at = $6, updated_at = now()
        WHERE id = $1`,
      [gap.id, gap.status, gap.topic, JSON.stringify(gap.proposed), gap.reopened, gap.last_checked_at ? new Date(gap.last_checked_at) : null]);
  }
  async list(workspaceId: string) {
    return (await this.db.query<GapRow>(
      `SELECT * FROM community_knowledge_gaps WHERE workspace_id = $1 ORDER BY (status = 'resolved'), ask_count DESC, last_asked_at DESC LIMIT 200`,
      [workspaceId])).rows.map(fromRow);
  }
  async sourceStatuses(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = (await this.db.query<{ id: string; status: string }>(
      `SELECT id::text, status FROM sources WHERE id::text = ANY($1::text[]) AND deleted_at IS NULL`, [ids])).rows;
    return new Map(rows.map((r) => [r.id, r.status]));
  }
  async knownUrls(workspaceId: string, urls: string[]) {
    if (!urls.length) return new Set<string>();
    const rows = (await this.db.query<{ url: string }>(
      `SELECT COALESCE(source_url, url_or_blob) AS url FROM sources
        WHERE workspace_id = $1 AND deleted_at IS NULL AND COALESCE(source_url, url_or_blob) = ANY($2::text[])`, [workspaceId, urls])).rows;
    return new Set(rows.map((r) => r.url));
  }

  async pendingSources(workspaceId: string, urls: string[]) {
    if (!urls.length) return new Map<string, string>();
    const rows = (await this.db.query<{ url: string; id: string }>(
      `SELECT COALESCE(source_url, url_or_blob) AS url, id FROM sources
        WHERE workspace_id = $1 AND deleted_at IS NULL AND status IN ('imported', 'ingesting', 'needs_review')
          AND COALESCE(source_url, url_or_blob) = ANY($2::text[])`, [workspaceId, urls])).rows;
    return new Map(rows.map((r) => [r.url, r.id]));
  }
}

/** Called when a Community reply fell back for lack of a grounded answer. Never fails the reply. */
export async function recordUnansweredQuestion(db: Queryable, workspaceId: string, question: string | null | undefined) {
  if (!question?.trim()) return;
  const noSearch: GapDeps = { topicOf: async () => null, searchWiki: async () => [], createSource: async () => ({ id: '' }) };
  await new KnowledgeGaps(new PgGapStore(db), noSearch).recordUnanswered(workspaceId, question);
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
const USER_AGENT = process.env.AI_INGEST_USER_AGENT || 'AI-Growth-OS-ingest/0.1 (+https://tripc.vn; community knowledge gaps)';

/** MediaWiki's search API (Wikivoyage, Wikipedia): no scraping and no search-engine CAPTCHA. */
export function mediaWikiSearch(fetchImpl: Fetch = fetch): GapDeps['searchWiki'] {
  return async (site, query) => {
    const url = new URL(`https://${site}/w/api.php`);
    for (const [k, v] of Object.entries({ action: 'query', list: 'search', srsearch: query, srlimit: '10', format: 'json' })) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { query?: { search?: { title?: unknown }[] } };
    return (body.query?.search ?? [])
      .filter((r): r is { title: string } => typeof r.title === 'string' && r.title.trim().length > 0)
      .map((r) => ({ title: r.title, url: `https://${site}/wiki/${encodeURIComponent(r.title.replace(/ /g, '_')).replace(/%2F/g, '/')}` }));
  };
}

const TOPIC_PROMPT = 'You turn a Vietnamese or English traveller question into an English web search query. Keep Vietnamese place names, '
  + 'written without accents (Cù Lao Chàm = Cu Lao Cham, Hội An = Hoi An, Huế = Hue). '
  + 'Line 1: the whole question as a query of 3 to 8 words. Then up to 3 more lines, one for each separate thing the '
  + 'question names (a dish, a place, a service, a document), 1 to 3 words each; put the dish or service alone on its own line. '
  + 'Never add a place, district or name the question does not contain. Only the lines, nothing else.\n'
  + 'Example. Question: "Mua sim 4G ở sân bay Tân Sơn Nhất chỗ nào?"\n'
  + 'Where to buy a 4G SIM card at Tan Son Nhat airport\nSIM card\nTan Son Nhat International Airport';
const MAX_QUERIES = 4;

/** A local Ollama model (free, no quota) writes the search phrase; null when it is not reachable. */
export function ollamaTopic(baseUrl: string, fetchImpl: Fetch = fetch, model = process.env.COMMUNITY_GAP_MODEL || 'qwen3:4b-instruct'): GapDeps['topicOf'] {
  return async (question) => {
    try {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ model, stream: false, options: { temperature: 0 },
          messages: [{ role: 'system', content: TOPIC_PROMPT }, { role: 'user', content: question.slice(0, 500) }] }),
      });
      if (!res.ok) return null;
      const text = ((await res.json()) as { message?: { content?: unknown } }).message?.content;
      if (typeof text !== 'string') return null;
      const lines: string[] = [];
      for (const raw of text.split('\n')) {
        const line = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').replace(/^["'“”]+|["'“”.]+$/g, '').trim().slice(0, 120);
        if (line && !lines.some((l) => l.toLowerCase() === line.toLowerCase())) lines.push(line);
      }
      return lines.length ? lines.slice(0, MAX_QUERIES) : null;
    } catch {
      return null;
    }
  };
}

/** The production cycle: Postgres, the host's Ollama, the wikis' search APIs, and the usual source ingest. */
export async function defaultKnowledgeGaps(db: Queryable) {
  const { createSource } = await import('../sources/repository');
  return new KnowledgeGaps(new PgGapStore(db), {
    topicOf: ollamaTopic(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'),
    searchWiki: mediaWikiSearch(),
    createSource: async (workspaceId, title, url) =>
      createSource(workspaceId, { title: title.slice(0, 255), kind: 'url', url_or_blob: url, category: 'locations' }),
  });
}
