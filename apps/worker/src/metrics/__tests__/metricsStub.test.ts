/**
 * Tests for MetricsIngestionStub — independent, mock-based (preparation for MY-06/MY-07).
 * Run: npm test (vitest)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsIngestionStub } from '../MetricsIngestionStub';

describe('MetricsIngestionStub', () => {
  let stub: MetricsIngestionStub;

  beforeEach(() => {
    stub = new MetricsIngestionStub();
  });

  it('should return insufficient_data for unconfigured sources', async () => {
    const result = await stub.ingest('ws_1', ['ga4', 'gsc']);
    expect(result.allMissing).toBe(true);
    expect(result.snapshots).toHaveLength(2);
    for (const snap of result.snapshots) {
      expect(snap.dataStatus).toBe('insufficient_data');
      expect(snap.value).toBeNull();
      expect(snap.missingReason).toContain('not configured');
    }
  });

  it('should return missing reason when all missing', async () => {
    const result = await stub.ingest('ws_1', ['ga4']);
    expect(result.missingReason).toContain('No metrics connectors configured');
  });

  it('should track configured sources', () => {
    expect(stub.isConfigured('ws_1', 'ga4')).toBe(false);
    stub.configureSource('ws_1', 'ga4');
    expect(stub.isConfigured('ws_1', 'ga4')).toBe(true);
    expect(stub.isConfigured('ws_1', 'gsc')).toBe(false);
    expect(stub.isConfigured('ws_2', 'ga4')).toBe(false);
  });

  it('should build metrics synced event with dedup key', async () => {
    const result = await stub.ingest('ws_1', ['ga4', 'gsc']);
    const event = stub.buildMetricsSyncedEvent('ws_1', result.snapshots);
    expect(event.eventType).toBe('metrics_synced');
    expect(event.workspaceId).toBe('ws_1');
    expect(event.dedupKey).toContain('metrics_synced:ws_1:');
    expect(event.payload.sources).toHaveLength(2);
  });

  it('should never fake numbers', async () => {
    const result = await stub.ingest('ws_1', ['meta_ads']);
    for (const snap of result.snapshots) {
      expect(snap.value).toBeNull();
      expect(snap.dataStatus).toBe('insufficient_data');
    }
  });
});