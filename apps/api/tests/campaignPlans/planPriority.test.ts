import { describe, expect, it } from 'vitest';
import { planSchema } from '../../src/modules/campaignPlans/schemas';

describe('plan priority from measured KPIs', () => {
  const shape = (planSchema as unknown as { shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }).shape;

  it('accepts what the Growth Lead reports about the measured goal', () => {
    expect(shape.priority.safeParse({ mode: 'reach', reason: 'No traffic is measured yet.' }).success).toBe(true);
    expect(shape.priority.safeParse(null).success).toBe(true);
    expect(shape.kpi_progress.safeParse([{ metric_name: 'leads', target_value: 3, current_value: 0, status: 'behind' }]).success).toBe(true);
    expect(shape.kpi_progress.safeParse([{ metric_name: 'leads', target_value: 3, current_value: null, status: 'not_measured' }]).success).toBe(true);
  });

  it('rejects a priority or status it does not know', () => {
    expect(shape.priority.safeParse({ mode: 'viral', reason: 'x' }).success).toBe(false);
    expect(shape.kpi_progress.safeParse([{ metric_name: 'leads', target_value: 3, current_value: 0, status: 'great' }]).success).toBe(false);
  });
});
