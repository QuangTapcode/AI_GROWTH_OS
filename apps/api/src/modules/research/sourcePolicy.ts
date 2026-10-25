/**
 * Which web pages Research may ingest as page text, and under which reuse terms.
 *
 * Only open-license references and official tourism portals are ingested. Every
 * other search result is kept as a trend signal (query/rank/title/URL only).
 * The AI service enforces the same domains through AI_INGEST_URL_ALLOWLIST and
 * also checks robots.txt before fetching.
 */
export type SourcePolicy = {
  domain: string;
  license: string;
  attribution: string;
  category: 'locations' | 'services' | 'audience' | 'content';
};

export const OPEN_SOURCE_POLICY: readonly SourcePolicy[] = [
  // First-party content: TripC's own Playbook. These pages render client-side, so the worker
  // renders them in a browser (apps/worker INGEST_RENDER_DOMAINS).
  { domain: 'tripc.ai', license: 'TripC first-party content', attribution: 'TripC', category: 'content' },
  { domain: 'tripc.vn', license: 'TripC first-party content', attribution: 'TripC', category: 'content' },
  { domain: 'en.wikivoyage.org', license: 'CC BY-SA 4.0', attribution: 'Wikivoyage contributors', category: 'locations' },
  { domain: 'en.wikipedia.org', license: 'CC BY-SA 4.0', attribution: 'Wikipedia contributors', category: 'locations' },
  {
    domain: 'danangfantasticity.com',
    license: 'Official tourism portal; short excerpts for internal research with attribution',
    attribution: 'Da Nang Fantasticity, Da Nang Department of Tourism',
    category: 'locations',
  },
  {
    domain: 'vietnam.travel',
    license: 'Official tourism portal; short excerpts for internal research with attribution',
    attribution: 'Vietnam National Authority of Tourism',
    category: 'locations',
  },
];

export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function policyFor(url: string): SourcePolicy | null {
  const host = hostOf(url);
  if (!host) return null;
  return OPEN_SOURCE_POLICY.find((p) => host === p.domain || host.endsWith(`.${p.domain}`)) ?? null;
}

/** Open reference pages for a location, so open sources exist even when search ranks only blogs. */
export function referenceUrls(location: string): string[] {
  const title = encodeURIComponent(location.trim().replace(/\s+/g, '_'));
  if (!title) return [];
  return [`https://en.wikivoyage.org/wiki/${title}`, `https://en.wikipedia.org/wiki/${title}`];
}
