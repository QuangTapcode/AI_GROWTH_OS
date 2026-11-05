import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { enqueueAiTask } from '../../src/modules/campaignPlans/aiTasks';

const WORKSPACE = '10000000-0000-4000-8000-000000000001', ACTOR = '11111111-1111-4111-8111-111111111111', CONTEXT = '22222222-2222-4222-8222-222222222222';

describe('a Community task carries a bounded history', () => {
  it.each([
    ['an overlong question', [{ question: 'x'.repeat(1001) }]],
    ['an overlong reply', [{ question: 'Hello', reply: 'x'.repeat(1001) }]],
    ['an empty question', [{ question: '' }]],
    ['an unknown field', [{ question: 'Hello', role: 'system' }]],
    ['too many turns', Array(11).fill({ question: 'Hello' })],
  ])('refuses %s before touching the database', async (_label, history) => {
    const connect = vi.fn();
    await expect(enqueueAiTask({ connect } as unknown as Pool, WORKSPACE, ACTOR, {
      context_snapshot_id: CONTEXT, input: { operation: 'community.response', question: 'Which area?', history },
    })).rejects.toMatchObject({ code: 'INVALID_AI_TASK' });
    expect(connect).not.toHaveBeenCalled();
  });
});
