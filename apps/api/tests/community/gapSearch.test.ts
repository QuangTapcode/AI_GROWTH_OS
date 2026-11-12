import { describe, expect, it } from 'vitest';
import { mediaWikiSearch, ollamaTopic, relevantToTopic } from '../../src/modules/community/gaps';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('gap search helpers', () => {
  it("searches a wiki with MediaWiki's own search API and returns page titles with their URLs", async () => {
    let asked = '';
    const search = mediaWikiSearch(async (url) => { asked = String(url); return json({ query: { search: [{ title: 'Chàm Islands' }, { title: 'Hoi An' }] } }); });
    expect(await search('en.wikivoyage.org', 'Cu Lao Cham')).toEqual([
      { title: 'Chàm Islands', url: 'https://en.wikivoyage.org/wiki/Ch%C3%A0m_Islands' },
      { title: 'Hoi An', url: 'https://en.wikivoyage.org/wiki/Hoi_An' }]);
    expect(asked).toContain('https://en.wikivoyage.org/w/api.php?');
    expect(asked).toContain('srsearch=Cu+Lao+Cham');
  });

  it('reads the full search phrase and each part of the question from the model, one per line', async () => {
    const topic = ollamaTopic('http://ollama:11434', async () => json({ message: { content: '"Best pho restaurants in Da Nang"\n- Pho\n2. Da Nang cuisine\n\nPho\n' } }));
    expect(await topic('Gợi ý các quán phở ngon tại Đà Nẵng')).toEqual(['Best pho restaurants in Da Nang', 'Pho', 'Da Nang cuisine']);
  });

  it('asks the local model for a short English search phrase, and gives up quietly when it cannot', async () => {
    const topic = ollamaTopic('http://ollama:11434', async () => json({ message: { content: '"Cu Lao Cham how to get there"\n' } }));
    expect(await topic('Cù Lao Chàm đi thế nào')).toEqual(['Cu Lao Cham how to get there']);
    const down = ollamaTopic('http://ollama:11434', async () => { throw new Error('ECONNREFUSED'); });
    expect(await down('Cù Lao Chàm đi thế nào')).toBeNull();
  });
});

describe('which wiki pages fit a search phrase', () => {
  it.each([
    ['Pho Da Nang', 'Da Nang'],
    ['Pho', 'Phở'],
    ['Da Nang cuisine', 'Vietnamese cuisine'],
    ['Cu Lao Cham tourist destinations', 'Chàm Islands'],
    ['Hoi An area', 'Hội An (city)'],
    ['Ngũ Hành Sơn', 'Ngũ Hành Sơn, Da Nang'],
    ['Ha Noi', 'Hà Nội'],
  ])('%s fits %s', (query, title) => {
    expect(relevantToTopic(query, title)).toBe(true);
  });

  // Seen on the real wikis on 2026-11-11: a page that only shares a place name is about something else.
  it.each([
    ['Pho Da Nang', 'Da Nang International Airport'],
    ['Pho Da Nang', 'Da Nang Hospital'],
    ['Pho Da Nang', 'Hải Châu, Da Nang'],
    ['Hoi An area', 'Hội An Old Town'],
    ['Ngoc Son district', 'Lê Ngọc Hân'],
    ['Ngoc Son district', 'Battle of Ngọc Hồi-Đống Đa'],
    ['current temperature in Da Nang', 'Da Lat'],
    ['Pho', 'Pho 79'],
    ['Pho', 'Lê Phổ'],
  ])('%s does not fit %s', (query, title) => {
    expect(relevantToTopic(query, title)).toBe(false);
  });
});
