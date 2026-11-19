import { describe, expect, it } from 'vitest';
import { conversationHistory, HISTORY_WINDOW_MINUTES } from '../../src/modules/community/service';

function fakePool(rows: { content: string; reply: string | null }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    pool: { query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows } as never; } },
  };
}

describe('conversationHistory', () => {
  it('reads only the sender\'s own recent questions in a group, oldest first and without repeats', async () => {
    const { pool, calls } = fakePool([
      { content: 'Khi nào thì nên đi du lịch', reply: 'Tùy khu vực…' },
      { content: 'Đà Nẵng hôm nay bao nhiêu độ?', reply: '25°C' },
      { content: 'Đà Nẵng hôm nay bao nhiêu độ?', reply: '25°C' },
    ]);
    const history = await conversationHistory(pool as never, 'ws', 'telegram_message', '-1004331968854', 'msg');
    expect(history.map((t) => t.question)).toEqual(['Đà Nẵng hôm nay bao nhiêu độ?', 'Khi nào thì nên đi du lịch']);
    const { sql, params } = calls[0];
    expect(sql).toContain("m.metadata->>'sender_id' = cur.sender_id");
    expect(sql).toContain('m.task_id IS NOT NULL');
    expect(params[4]).toBe(HISTORY_WINDOW_MINUTES.group);
  });

  it('gives a private chat a longer window', async () => {
    const { pool, calls } = fakePool([]);
    await conversationHistory(pool as never, 'ws', 'telegram_message', '7046352715', 'msg');
    expect(calls[0].params[4]).toBe(HISTORY_WINDOW_MINUTES.private);
  });
});
