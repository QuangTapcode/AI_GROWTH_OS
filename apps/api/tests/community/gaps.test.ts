import { describe, expect, it } from 'vitest';
import { KnowledgeGaps, type Gap, type GapStore } from '../../src/modules/community/gaps';

const WS = 'ws-1';
const HOUR = 3600_000;

class MemoryGaps implements GapStore {
  gaps: Gap[] = [];
  sources = new Map<string, { url: string; status: string }>();
  async upsertAsked(workspaceId: string, key: string, question: string, now: number) {
    let gap = this.gaps.find((g) => g.workspace_id === workspaceId && g.key === key);
    if (!gap) {
      gap = { id: `g${this.gaps.length + 1}`, workspace_id: workspaceId, key, question, ask_count: 0, status: 'open', topic: null,
        proposed: [], last_asked_at: now, last_checked_at: null, reopened: 0 };
      this.gaps.push(gap);
    }
    gap.ask_count += 1;
    gap.last_asked_at = now;
    return { ...gap };
  }
  async save(gap: Gap) { this.gaps[this.gaps.findIndex((g) => g.id === gap.id)] = { ...gap }; }
  async list(workspaceId: string) { return this.gaps.filter((g) => g.workspace_id === workspaceId).map((g) => ({ ...g })); }
  async sourceStatuses(ids: string[]) { return new Map(ids.map((id) => [id, this.sources.get(id)?.status ?? 'missing'])); }
  async knownUrls(_ws: string, urls: string[]) { return new Set(urls.filter((u) => [...this.sources.values()].some((s) => s.url === u))); }
  async pendingSources(_ws: string, urls: string[]) {
    return new Map([...this.sources].filter(([, s]) => urls.includes(s.url) && s.status === 'needs_review').map(([id, s]) => [s.url, id]));
  }
}

const noSearch = { topicOf: async () => null, searchWiki: async () => [], createSource: async () => ({ id: 'x' }) };

describe('KnowledgeGaps', () => {
  it('lists a question the bot could not answer once, however it was typed, and counts each time it is asked', async () => {
    const store = new MemoryGaps();
    const gaps = new KnowledgeGaps(store, noSearch);
    await gaps.recordUnanswered(WS, 'Cù Lao Chàm đi thế nào?', 0);
    await gaps.recordUnanswered(WS, '  cù lao chàm  đi thế nào ', HOUR);
    await gaps.recordUnanswered(WS, 'Tết Nguyên Đán đi du lịch có ổn không', HOUR);
    const list = await store.list(WS);
    expect(list).toHaveLength(2);
    expect(list.find((g) => g.question.startsWith('Cù Lao'))).toMatchObject({ ask_count: 2, status: 'open' });
  });

  it('finds pages about the question on the open wikis, skips unrelated and known ones, and queues them for review', async () => {
    const store = new MemoryGaps();
    store.sources.set('old', { url: 'https://en.wikivoyage.org/wiki/Hoi_An', status: 'approved' });
    const created: string[] = [];
    const searched: string[] = [];
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => 'Cu Lao Cham tourist destinations',
      searchWiki: async (site, query) => {
        searched.push(`${site}:${query}`);
        return site === 'en.wikivoyage.org'
          ? [{ title: 'Chàm Islands', url: 'https://en.wikivoyage.org/wiki/Ch%C3%A0m_Islands' },
             { title: 'Ho Chi Minh City', url: 'https://en.wikivoyage.org/wiki/Ho_Chi_Minh_City' },
             { title: 'Hoi An', url: 'https://en.wikivoyage.org/wiki/Hoi_An' }]
          : [{ title: 'Tourism in Vietnam', url: 'https://en.wikipedia.org/wiki/Tourism_in_Vietnam' }];
      },
      createSource: async (_ws, title, url) => { created.push(`${title} ${url}`); return { id: `s${created.length}` }; },
    });
    await gaps.recordUnanswered(WS, 'Cù Lao Chàm đi thế nào', 0);
    expect(await gaps.runCycle(WS, HOUR)).toBe(1);
    expect(searched).toEqual(['en.wikivoyage.org:Cu Lao Cham tourist destinations Vietnam', 'en.wikipedia.org:Cu Lao Cham tourist destinations Vietnam']);
    expect(created).toEqual(['Chàm Islands (en.wikivoyage.org) https://en.wikivoyage.org/wiki/Ch%C3%A0m_Islands']);
    expect((await store.list(WS))[0]).toMatchObject({ status: 'proposed', topic: 'Cu Lao Cham tourist destinations',
      proposed: [{ source_id: 's1', title: 'Chàm Islands (en.wikivoyage.org)' }] });
    // Already handled: the next cycle does not search the same question again.
    expect(await gaps.runCycle(WS, 2 * HOUR)).toBe(0);
  });

  it('only searches pages about Vietnam, and a short shared word like "da" is no match', async () => {
    const store = new MemoryGaps();
    const searched: string[] = [];
    const created: string[] = [];
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => 'current temperature in Da Nang',
      searchWiki: async (_site, query) => { searched.push(query); return [{ title: 'Da Lat', url: 'https://en.wikipedia.org/wiki/Da_Lat' }]; },
      createSource: async (_ws, title) => { created.push(title); return { id: 's1' }; },
    });
    await gaps.recordUnanswered(WS, 'bot ơi đà năng nay bao nhiêu độ v', 0);
    await gaps.runCycle(WS, HOUR);
    expect(searched.every((q) => q.endsWith(' Vietnam'))).toBe(true);
    expect(created).toEqual([]);
    expect((await store.list(WS))[0].status).toBe('no_source');
  });

  it('splits the question into its parts, and keeps looking past pages already in the sources', async () => {
    const store = new MemoryGaps();
    for (const url of ['https://en.wikivoyage.org/wiki/Da_Nang', 'https://en.wikivoyage.org/wiki/Hoi_An', 'https://en.wikipedia.org/wiki/Da_Nang']) {
      store.sources.set(url, { url, status: 'approved' });
    }
    const searched: string[] = [];
    const created: string[] = [];
    const page = (site: string, title: string) => ({ title, url: `https://${site}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` });
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => ['Best pho restaurants in Da Nang', 'Pho', 'Da Nang cuisine'],
      searchWiki: async (site, query) => {
        searched.push(`${site}:${query}`);
        if (query.startsWith('Best pho')) return site === 'en.wikivoyage.org' ? [page(site, 'Da Nang'), page(site, 'Hoi An')] : [];
        if (query.startsWith('Pho')) return site === 'en.wikipedia.org' ? [page(site, 'Phở')] : [];
        return site === 'en.wikipedia.org' ? [page(site, 'Da Nang'), page(site, 'Vietnamese cuisine')] : [];
      },
      createSource: async (_ws, title) => { created.push(title); return { id: `s${created.length}` }; },
    });
    await gaps.recordUnanswered(WS, 'Gợi ý các quán phở ngon tại Đà Nẵng', 0);
    await gaps.runCycle(WS, HOUR);

    expect(searched).toEqual(['Best pho restaurants in Da Nang', 'Pho', 'Da Nang cuisine']
      .flatMap((q) => [`en.wikivoyage.org:${q} Vietnam`, `en.wikipedia.org:${q} Vietnam`]));
    // Da Nang and Hoi An are already sources and still did not answer it: new pages are proposed instead.
    expect(created).toEqual(['Phở (en.wikipedia.org)', 'Vietnamese cuisine (en.wikipedia.org)']);
    expect((await store.list(WS))[0]).toMatchObject({ status: 'proposed', topic: 'Best pho restaurants in Da Nang' });
  });

  it('ignores parts the model made up, and knows a page it already has under another spelling of its address', async () => {
    const store = new MemoryGaps();
    store.sources.set('hoi-an', { url: 'https://en.wikipedia.org/wiki/Hoi_An', status: 'approved' });
    const searched: string[] = [];
    const created: string[] = [];
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => ['Places to eat pho in Da Nang', 'Hoi An', 'Hue', 'Pho'],
      searchWiki: async (site, query) => {
        searched.push(query);
        return site === 'en.wikipedia.org'
          ? [{ title: 'Hội An', url: 'https://en.wikipedia.org/wiki/H%E1%BB%99i_An' }, { title: 'Pho', url: 'https://en.wikipedia.org/wiki/Pho' }]
          : [];
      },
      createSource: async (_ws, title) => { created.push(title); return { id: `s${created.length}` }; },
    });
    await gaps.recordUnanswered(WS, 'Gợi ý địa điểm ăn phở tại đà nẵng vậy bot', 0);
    await gaps.runCycle(WS, HOUR);

    expect([...new Set(searched)]).toEqual(['Places to eat pho in Da Nang Vietnam', 'Pho Vietnam']);
    expect(created).toEqual(['Pho (en.wikipedia.org)']);
  });

  it('links a page another question already proposed, instead of saying no source covers it', async () => {
    const store = new MemoryGaps();
    store.sources.set('pho', { url: 'https://en.wikipedia.org/wiki/Pho', status: 'needs_review' });
    const created: string[] = [];
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => ['Places to eat pho in Da Nang', 'Pho'],
      searchWiki: async (site) => (site === 'en.wikipedia.org' ? [{ title: 'Pho', url: 'https://en.wikipedia.org/wiki/Pho' }] : []),
      createSource: async (_ws, title) => { created.push(title); return { id: 'new' }; },
    });
    await gaps.recordUnanswered(WS, 'Gợi ý địa điểm ăn phở tại đà nẵng vậy bot', 0);
    await gaps.runCycle(WS, HOUR);

    expect(created).toEqual([]);
    expect((await store.list(WS))[0]).toMatchObject({ status: 'proposed', proposed: [{ source_id: 'pho', url: 'https://en.wikipedia.org/wiki/Pho' }] });
  });

  it('counts a question as answered once the owner approves one of its sources, and reopens it if it is still unanswered', async () => {
    const store = new MemoryGaps();
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => 'Tet Lunar New Year travel Vietnam',
      searchWiki: async (site) => site === 'en.wikipedia.org' ? [{ title: 'Tết', url: 'https://en.wikipedia.org/wiki/T%E1%BA%BFt' }] : [],
      createSource: async () => ({ id: 'tet' }),
    });
    await gaps.recordUnanswered(WS, 'Tết Nguyên Đán đi du lịch có ổn không', 0);
    await gaps.runCycle(WS, HOUR);
    store.sources.set('tet', { url: 'https://en.wikipedia.org/wiki/T%E1%BA%BFt', status: 'needs_review' });
    await gaps.refresh(WS);
    expect((await store.list(WS))[0].status).toBe('proposed');
    store.sources.set('tet', { url: 'https://en.wikipedia.org/wiki/T%E1%BA%BFt', status: 'approved' });
    await gaps.refresh(WS);
    expect((await store.list(WS))[0].status).toBe('resolved');
    await gaps.recordUnanswered(WS, 'Tết Nguyên Đán đi du lịch có ổn không', 5 * HOUR);
    expect((await store.list(WS))[0]).toMatchObject({ status: 'open', reopened: 1, ask_count: 2 });
  });

  it('marks a question no open source covers, so the owner can answer it, and tries again a week later', async () => {
    const store = new MemoryGaps();
    let searches = 0;
    const gaps = new KnowledgeGaps(store, {
      topicOf: async () => 'TripC refund policy',
      searchWiki: async () => { searches++; return [{ title: 'Refund', url: 'https://en.wikipedia.org/wiki/Refund' }]; },
      createSource: async () => ({ id: 'never' }),
    });
    await gaps.recordUnanswered(WS, 'TripC hoàn tiền thế nào', 0);
    await gaps.runCycle(WS, HOUR);
    expect((await store.list(WS))[0].status).toBe('no_source');
    expect(await gaps.runCycle(WS, 2 * HOUR)).toBe(0);
    expect(await gaps.runCycle(WS, HOUR + 8 * 24 * HOUR)).toBe(1);
    // A question about the business itself is never looked up on a public wiki: only the owner can answer it.
    expect(searches).toBe(0);
  });
});
