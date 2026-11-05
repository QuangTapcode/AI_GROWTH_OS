import { describe, expect, it } from 'vitest';
import { isAutoApprovable } from '../../src/modules/campaignPlans/automation';

const row = (result: Record<string, unknown>) => ({
  id: 'artifact', title: 'Post', artifact_type: 'ai_result', evidence: [{ chunk_id: 'c1' }],
  payload: { result: { status: 'draft', synthetic: false, missing_facts: [], ...result } },
}) as unknown as Parameters<typeof isAutoApprovable>[0];

describe('what the autopilot may approve by itself', () => {
  const lead = { status: 'insufficient_data', lead_proposal: { intent: 'request_information' } };
  const asRole = (role: string, result: Record<string, unknown>, evidence: unknown[] = [{ chunk_id: 'c1' }]) =>
    ({ ...row(result), role, evidence }) as unknown as Parameters<typeof isAutoApprovable>[0];

  it('answers a grounded question from someone who is also a lead', () => {
    expect(isAutoApprovable(asRole('community', { ...lead, missing_facts: ['verified_lead_owner_and_consent'] }))).toBe(true);
  });

  it('never approves a lead whose question has no grounded answer', () => {
    expect(isAutoApprovable(asRole('community', { ...lead, missing_facts: ['grounded_answer', 'verified_lead_owner_and_consent'] }))).toBe(false);
    expect(isAutoApprovable(asRole('community', { ...lead, missing_facts: ['verified_lead_owner_and_consent'] }, []))).toBe(false);
  });

  it('accepts a Performance report on measured numbers, which has no source quotes to cite', () => {
    expect(isAutoApprovable(asRole('performance', { input_artifact_refs: [{ artifact_id: 'metrics' }] }, []))).toBe(true);
    expect(isAutoApprovable(asRole('performance', {}, []))).toBe(false);
    expect(isAutoApprovable(asRole('content', { input_artifact_refs: [{ artifact_id: 'article' }] }, []))).toBe(false);
  });

  it('approves a grounded draft with nothing missing', () => {
    expect(isAutoApprovable(row({}))).toBe(true);
  });

  it('leaves a draft carrying an AI illustration to a person', () => {
    expect(isAutoApprovable(row({ generated_image: { url: 'https://media.example.test/generated/gen.webp' } }))).toBe(false);
  });

  it('treats a draft whose illustration was skipped like any other', () => {
    expect(isAutoApprovable(row({ generated_image: null }))).toBe(true);
  });

  it('leaves an article too short for the public site to a person', () => {
    expect(isAutoApprovable(row({ status: 'insufficient_data', missing_facts: ['article_too_short'] }))).toBe(false);
  });
});
