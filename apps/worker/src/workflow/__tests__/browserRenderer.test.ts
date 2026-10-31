import { describe, expect, it } from 'vitest';
import { needsBrowser, robotsAllows } from '../BrowserRenderer';

const UA = 'AI-Growth-OS-ingest/0.1 (+https://tripc.vn; research source ingest)';

describe('browser ingest helpers', () => {
  it('renders only first-party client-side domains', () => {
    expect(needsBrowser('https://tripc.ai/blog/apartment-viewing-checklist-vietnam')).toBe(true);
    expect(needsBrowser('https://en.wikivoyage.org/wiki/Da_Nang')).toBe(false);
    expect(needsBrowser('https://eviltripc.ai/x')).toBe(false);
  });

  it('follows robots.txt groups and longest-match rules', () => {
    const robots = 'User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/public\n';
    expect(robotsAllows(robots, 'https://tripc.ai/blog/x', UA)).toBe(true);
    expect(robotsAllows(robots, 'https://tripc.ai/private/notes', UA)).toBe(false);
    expect(robotsAllows(robots, 'https://tripc.ai/private/public/page', UA)).toBe(true);
    expect(robotsAllows('User-agent: AI-Growth-OS-ingest\nDisallow: /\n\nUser-agent: *\nAllow: /\n', 'https://tripc.ai/blog', UA)).toBe(false);
    expect(robotsAllows('', 'https://tripc.ai/blog', UA)).toBe(true);
  });
});
