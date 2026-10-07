/**
 * Analytics sink (W1-MY-04): event chỉ chứa allowlist field —
 * KHÔNG email/name/PII. Ghi event SAU khi transaction commit thành công;
 * commit fail → không có event nào (test.assert).
 */
export interface AnalyticsEvent {
  name: string;
  params: Record<string, unknown>;
}

export interface AnalyticsSink {
  record(event: AnalyticsEvent): Promise<void>;
}

export class MemoryAnalyticsSink implements AnalyticsSink {
  readonly events: AnalyticsEvent[] = [];

  async record(event: AnalyticsEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}

/** Field bị cấm trong mọi param analytics (guard có test). */
export const ANALYTICS_FORBIDDEN_KEYS = ['email', 'name', 'phone', 'visitor_email', 'full_name'] as const;

export function assertNoPiiInParams(params: Record<string, unknown>): void {
  for (const key of Object.keys(params)) {
    if ((ANALYTICS_FORBIDDEN_KEYS as readonly string[]).includes(key.toLowerCase())) {
      throw new Error(`ANALYTICS_PII_FIELD_FORBIDDEN:${key}`);
    }
  }
}