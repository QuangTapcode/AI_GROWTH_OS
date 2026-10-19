/**
 * Tests for RecoveryDrill — independent, mock-based (preparation for MY-08).
 * Run: npm test (vitest)
 */

import { describe, it, expect } from 'vitest';
import { RecoveryDrill } from '../RecoveryDrill';

describe('RecoveryDrill', () => {
  const drill = new RecoveryDrill();

  it('should requeue job after kill/restart when budget remains', () => {
    const result = drill.simulateKillRestart({ id: 'job_1', providerCalls: 1, maxCalls: 2, leaseExpired: true });
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('REQUEUED');
  });

  it('should NOT requeue when budget exhausted', () => {
    const result = drill.simulateKillRestart({ id: 'job_1', providerCalls: 2, maxCalls: 2, leaseExpired: true });
    expect(result.passed).toBe(false);
    expect(result.evidence).toContain('NOT requeued');
  });

  it('should not create duplicate when CMS confirms post exists', () => {
    const result = drill.simulatePublishTimeout(true);
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('No duplicate post created');
  });

  it('should fail fast on revoked connector', () => {
    const result = drill.simulateRevokedConnector('revoked');
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('FAIL FAST');
  });

  it('should allow retry on temporary unavailable connector', () => {
    const result = drill.simulateRevokedConnector('unavailable');
    expect(result.passed).toBe(false); // Not revoked, so no fail-fast
    expect(result.evidence).toContain('Retry allowed');
  });

  it('should exclude revoked source from RAG', () => {
    const result = drill.simulateRevokedSource('revoked');
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('EXCLUDED from RAG');
  });

  it('should allow approved source in RAG', () => {
    const result = drill.simulateRevokedSource('approved');
    expect(result.passed).toBe(false);
    expect(result.evidence).toContain('Source allowed in RAG');
  });

  it('should enforce retry cap', () => {
    const result = drill.simulateRetryCap(2, 2);
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('FAILED');
  });

  it('should still allow retry under cap', () => {
    const result = drill.simulateRetryCap(1, 2);
    expect(result.passed).toBe(false);
    expect(result.evidence).toContain('within retry budget');
  });

  it('should enforce exactly-once side effect', () => {
    const seen = new Set<string>();
    const first = drill.simulateExactlyOnceSideEffect('key_1', seen);
    expect(first.passed).toBe(true);
    expect(first.evidence).toContain('NEW');

    const second = drill.simulateExactlyOnceSideEffect('key_1', seen);
    expect(second.passed).toBe(false);
    expect(second.evidence).toContain('DUPLICATE');
  });

  it('should run all drills and return results', () => {
    const results = drill.runAllDrills();
    expect(results).toHaveLength(6);
    for (const r of results) {
      expect(r.scenario).toBeDefined();
      expect(r.passed).toBeDefined();
      expect(r.evidence).toBeDefined();
      expect(r.timestamp).toBeInstanceOf(Date);
    }
  });
});