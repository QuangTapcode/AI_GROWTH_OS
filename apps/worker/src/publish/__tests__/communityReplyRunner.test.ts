import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { CommunityReplyRunner } from '../CommunityReplyRunner';

const event = { id: 'evt-1', workspace_id: 'ws-1', payload: { message_id: 'msg-1', recipient: 'psid-1', text: 'Street food stalls open every evening.' } };

function harness(claimed: unknown) {
  const sql: { text: string; params: unknown[] }[] = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    sql.push({ text, params });
    if (text.includes("SET status = 'processing'")) return { rows: claimed ? [claimed] : [] };
    return { rows: [], rowCount: 1 };
  });
  return { pool: { query } as unknown as Pool, sql };
}

describe('CommunityReplyRunner', () => {
  it('sends a queued reply to that person on Messenger, then marks the message replied', async () => {
    const { pool, sql } = harness(event);
    const send = vi.fn(async () => ({ message_id: 'm_reply' }));
    expect(await new CommunityReplyRunner(pool, send).runOnce()).toBe('sent');
    expect(send).toHaveBeenCalledWith('psid-1', 'Street food stalls open every evening.');
    const replied = sql.find((s) => s.text.includes("status = 'replied'"))!;
    expect(replied.params).toEqual(expect.arrayContaining(['ws-1', 'msg-1']));
    expect(sql.some((s) => s.text.includes("status = 'published'"))).toBe(true);
  });

  it('keeps the message unanswered and records the refusal without resending', async () => {
    const { pool, sql } = harness(event);
    const send = vi.fn(async () => { throw new Error('MESSENGER_REFUSED: (#10) outside the 24 hour window'); });
    expect(await new CommunityReplyRunner(pool, send).runOnce()).toBe('failed');
    expect(sql.some((s) => s.text.includes("status = 'replied'"))).toBe(false);
    expect(sql.find((s) => s.text.includes("status = 'failed'"))).toBeTruthy();
  });

  it('is idle without queued replies', async () => {
    const { pool } = harness(undefined);
    expect(await new CommunityReplyRunner(pool, vi.fn()).runOnce()).toBe('idle');
  });
});
