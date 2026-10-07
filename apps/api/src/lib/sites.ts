/**
 * Site registry — derive site → workspace SERVER-SIDE (không tin body) W1-MY-04/05.
 * Fixture synthetic theo EXAMPLES.md; record thật sẽ do core đọc từ DB khi
 * migrations W1-BE-01 sẵn sàng — interface resolveSite là seam.
 */
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
    timezone: 'Asia/Bang_Chi_Minh',
    status: 'active',
  },
  'other-site': {
    site_id: 'other-site',
    workspace_id: '20000000-0000-4000-8000-000000000001',
    organization_id: '20000000-0000-4000-8000-000000000000',
    timezone: 'Asia/Bang_Chi_Minh',
    status: 'active',
  },
  'suspended-site': {
    site_id: 'suspended-site',
    workspace_id: '30000000-0000-4000-8000-000000000001',
    organization_id: '30000000-0000-4000-8000-000000000000',
    timezone: 'Asia/Bang_Chi_Minh',
    status: 'suspended',
  },
};

export function resolveSite(siteId: string): SiteRecord | null {
  return FIXTURE_SITES[siteId] ?? null;
}