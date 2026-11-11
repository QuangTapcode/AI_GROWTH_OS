export const METRIC_NAMES = ['qualified_visits', 'leads', 'clicks', 'impressions', 'sessions', 'pageviews', 'ad_spend', 'ad_clicks', 'ad_impressions', 'ad_ctr', 'ctr', 'cvr', 'cpl'] as const;
export const METRIC_ALIASES: Record<string, string> = { leads_generated: 'leads', search_clicks: 'clicks', search_impressions: 'impressions' };
export function canonicalMetric(name: string) { return METRIC_ALIASES[name] ?? name; }
