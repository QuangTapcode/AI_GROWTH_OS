import { describe, expect, it } from 'vitest';
import { experimentSchema, experimentVerdict, wilson } from '../../src/modules/performance/experiments';

const experiment = { ends_at: '2026-01-01T00:00:00Z', min_exposures: 100 };
describe('fixed-horizon experiment guardrails', () => {
  it('never declares a winner before the fixed horizon, after an early stop, or below the sample floor', () => {
    const rows = [{ variant: 'control', exposures: 1000, conversions: 10 }, { variant: 'treatment', exposures: 1000, conversions: 400 }];
    expect(experimentVerdict({ ...experiment, ends_at: '2099-01-01T00:00:00Z' }, rows).winner).toBeNull();
    expect(experimentVerdict({ ...experiment, stopped_at: '2025-12-31T00:00:00Z' }, rows).status).toBe('stopped_early_no_verdict');
    expect(experimentVerdict(experiment, [{ variant: 'control', exposures: 99, conversions: 0 }, rows[1]]).winner).toBeNull();
  });
  it('requires separated intervals after both groups have sufficient samples', () => {
    expect(experimentVerdict(experiment, [{ variant: 'control', exposures: 200, conversions: 10 },
      { variant: 'treatment', exposures: 200, conversions: 80 }]).winner).toBe('treatment');
    expect(experimentVerdict(experiment, [{ variant: 'control', exposures: 200, conversions: 30 },
      { variant: 'treatment', exposures: 200, conversions: 31 }]).winner).toBeNull();
    expect(wilson(0,0)).toEqual({ low: 0, high: 1 });
  });
  it('rejects identical CTA variants and reversed or unbounded schedules', () => {
    const input = { hypothesis: 'Specific CTA may increase leads', control_cta: 'Ask', treatment_cta: 'Ask',
      starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-08T00:00:00Z' };
    expect(experimentSchema.safeParse(input).success).toBe(false);
    expect(experimentSchema.safeParse({ ...input, treatment_cta: 'Get the guide', ends_at: '2026-09-01T00:00:00Z' }).success).toBe(false);
  });
});
