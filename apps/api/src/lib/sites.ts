/**
 * Site registry — derive site → workspace SERVER-SIDE (không tin body) W1-MY-04/05.
 * Deployments list their public sites in PUBLIC_SITES_JSON; without it the synthetic
 * fixtures of EXAMPLES.md apply. resolveSite is the seam for a database-backed registry.
 */
import { z } from 'zod';

export interface SiteRecord {
  site_id: string;
  workspace_id: string;
  organization_id: string;
  timezone: string;
  status: 'active' | 'suspended';
}

export const FIXTURE_SITES: Record<string, SiteRecord> = {
  'tripc-pilot': {
    site_id: 'tripc-pilot',
    workspace_id: '10000000-0000-4000-8000-000000000001',
    organization_id: '10000000-0000-4000-8000-000000000000',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'active',
  },
  'other-site': {
    site_id: 'other-site',
    workspace_id: '20000000-0000-4000-8000-000000000001',
    organization_id: '20000000-0000-4000-8000-000000000000',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'active',
  },
  'suspended-site': {
    site_id: 'suspended-site',
    workspace_id: '30000000-0000-4000-8000-000000000001',
    organization_id: '30000000-0000-4000-8000-000000000000',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'suspended',
  },
};

const configuredSites = z.array(z.object({
  site_id: z.string().min(1).max(100),
  workspace_id: z.string().uuid(),
  organization_id: z.string().uuid().optional(),
  timezone: z.string().min(1),
  status: z.enum(['active', 'suspended']),
}).strict());

function sites(): Record<string, SiteRecord> {
  const raw = process.env.PUBLIC_SITES_JSON;
  if (!raw) return FIXTURE_SITES;
  try {
    const parsed = configuredSites.parse(JSON.parse(raw));
    return Object.fromEntries(parsed.map((site) => [site.site_id, { ...site, organization_id: site.organization_id ?? site.workspace_id }]));
  } catch (error) {
    // A broken list must not silently put the test sites on a real deployment.
    console.error('PUBLIC_SITES_JSON is invalid; no public site is available', error);
    return {};
  }
}

export function resolveSite(siteId: string): SiteRecord | null {
  return sites()[siteId] ?? null;
}
/** Active public site of a workspace (server-side registry; the site id is never taken from a client). */
export function siteForWorkspace(workspaceId: string): SiteRecord | null {
  return Object.values(sites()).find((s) => s.workspace_id === workspaceId && s.status === 'active') ?? null;
}
