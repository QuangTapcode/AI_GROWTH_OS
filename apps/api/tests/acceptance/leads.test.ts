import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryAnalyticsSink } from '../../src/lib/analytics';
import { InMemoryLeadRepository } from '../../src/modules/leads/repository';
import { submitLead } from '../../src/modules/leads/service';

/**
 * AC-COM-02, AC-COM-03 and AC-SEO-03 in DU-01. `it.fails` marks a requirement not met yet; the name after GAP is in
 * docs/reports/AGENT-ACCEPTANCE-2026-11-04.md. Fixing the gap fails the marker, so it is removed with the fix.
 */
const BODY = { email: 'visitor@example.test', name: 'Visitor', interest_topic: 'housing', consent: { accepted: true, policy_version: 'v1' },
  context: { utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'da-nang-living' } };

function deps() {
  return { repo: new InMemoryLeadRepository(), analytics: new MemoryAnalyticsSink() };
}

async function submit(d: ReturnType<typeof deps>, key: string, body: unknown = BODY) {
  return submitLead(d, { siteId: 'tripc-pilot', idempotencyKey: key, body });
}

async function stored(d: ReturnType<typeof deps>, id: string) {
  return (await d.repo.withTransaction((tx) => tx.findByKey('tripc-pilot', id)))!;
}

describe('AC-COM-02: a lead is not counted twice', () => {
  it('the same submission sent again is one lead', async () => {
    const d = deps();
    const first = await submit(d, 'lead-key-0001');
    const again = await submit(d, 'lead-key-0001');
    expect(first.kind).toBe('created');
    expect(again).toMatchObject({ kind: 'duplicate', deduplicated: true });
    if (first.kind === 'created' && again.kind === 'duplicate') expect(again.submission_id).toBe(first.submission_id);
  });

  it('another form with the same address is marked as a returning contact', async () => {
    const d = deps();
    await submit(d, 'lead-key-0001');
    await submit(d, 'lead-key-0002');
    expect((await stored(d, 'lead-key-0002')).notes).toMatch(/Returning contact/);
  });
});

describe('AC-COM-03: sales can pick a lead up', () => {
  it('a lead records its id, source and New status', async () => {
    const d = deps();
    await submit(d, 'lead-key-0001');
    const lead = await stored(d, 'lead-key-0001');
    expect(lead.id).toBeTruthy();
    expect(lead).toMatchObject({ utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'da-nang-living', lead_status: 'New' });
  });

  // GAP-COM-5: every form lead is stored with lead_owner null. Assigning takes a PATCH that no screen makes.
  it.fails('a lead has someone responsible for it', async () => {
    const d = deps();
    await submit(d, 'lead-key-0001');
    expect((await stored(d, 'lead-key-0001')).lead_owner).toBeTruthy();
  });

  // GAP-COM-5: the admin site has no page listing leads or customer messages.
  it.fails('the admin site has a page for leads', () => {
    expect(existsSync(resolve('../web/src/app/leads/page.tsx'))).toBe(true);
  });

  // GAP-COM-6: M11 ends in a person replying from the inbox; messages are only reachable through the API.
  it.fails('the admin site has an inbox for customer messages', () => {
    expect(existsSync(resolve('../web/src/app/community/page.tsx'))).toBe(true);
  });
});

describe('AC-SEO-03 and M08: a reviewer can correct a draft', () => {
  const artifactRoute = 'src/app/v1/workspaces/[workspace_id]/artifacts/[artifact_id]/route.ts';

  it('an artifact can be read', () => {
    expect(readFileSync(resolve(artifactRoute), 'utf8')).toMatch(/export async function GET/);
  });

  // GAP-SEO-6: a draft can only be approved or rejected, so "an edit makes a new version and voids the approval" has nothing to act on.
  it.fails('an edit to a draft has a route, which makes a new version', () => {
    expect(readFileSync(resolve(artifactRoute), 'utf8')).toMatch(/export async function (PATCH|PUT)/);
  });
});
