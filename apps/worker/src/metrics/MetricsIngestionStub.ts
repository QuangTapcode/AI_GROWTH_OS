/**
 * Metrics ingestion stub — GA4/GSC/Meta read-only (preparation for MY-06/MY-07).
 *
 * Independent of other pending tasks. Per MY-02 connector spike:
 * - FB/IG/GA4/GSC/Meta Ads are 'missing' (no real credentials).
 * - This stub returns 'insufficient_data' with proper labels instead of faking numbers.
 * - When TQ-06 connector authorization is ready, replace with real adapter.
 */

export interface MetricsSnapshot {
  workspaceId: string;
  source: 'ga4' | 'gsc' | 'meta_ads';
  metric: string;
  value: number | null;
  dataStatus: 'active' | 'insufficient_data';
  retrievedAt: Date;
  missingReason?: string;
}

export interface MetricsIngestionResult {
  snapshots: MetricsSnapshot[];
  allMissing: boolean;
  missingReason?: string;
}

export class MetricsIngestionStub {
  private configuredSources = new Set<string>(); // workspaceId + source combos that are configured

  /**
   * Mark a connector as configured for a workspace (when TQ-06 provides real credentials).
   */
  configureSource(workspaceId: string, source: 'ga4' | 'gsc' | 'meta_ads') {
    this.configuredSources.add(`${workspaceId}:${source}`);
  }

  isConfigured(workspaceId: string, source: 'ga4' | 'gsc' | 'meta_ads'): boolean {
    return this.configuredSources.has(`${workspaceId}:${source}`);
  }

  /**
   * Ingest metrics for a workspace. Returns snapshots with dataStatus.
   * Missing data is labeled 'insufficient_data' — never faked.
   */
  async ingest(workspaceId: string, sources: ('ga4' | 'gsc' | 'meta_ads')[]): Promise<MetricsIngestionResult> {
    const snapshots: MetricsSnapshot[] = [];

    for (const source of sources) {
      if (!this.isConfigured(workspaceId, source)) {
        snapshots.push({
          workspaceId,
          source,
          metric: 'sessions', // placeholder metric
          value: null,
          dataStatus: 'insufficient_data',
          retrievedAt: new Date(),
          missingReason: `Connector ${source} not configured or credentials missing`,
        });
        continue;
      }

      // When configured (future real adapter), fetch real data here.
      // For now, return insufficient_data to avoid fake numbers.
      snapshots.push({
        workspaceId,
        source,
        metric: 'sessions',
        value: null,
        dataStatus: 'insufficient_data',
        retrievedAt: new Date(),
        missingReason: 'Live connector not yet wired; awaiting TQ-06 connector authorization',
      });
    }

    const allMissing = snapshots.every((s) => s.dataStatus === 'insufficient_data');

    return {
      snapshots,
      allMissing,
      missingReason: allMissing ? 'No metrics connectors configured for this workspace' : undefined,
    };
  }

  /**
   * Create feedback event when metrics are synced.
   * Event payload is ready for MY-07 feedback event system.
   */
  buildMetricsSyncedEvent(workspaceId: string, snapshots: MetricsSnapshot[]) {
    return {
      eventType: 'metrics_synced' as const,
      workspaceId,
      payload: {
        sources: snapshots.map((s) => ({ source: s.source, dataStatus: s.dataStatus })),
        retrievedAt: new Date().toISOString(),
      },
      dedupKey: `metrics_synced:${workspaceId}:${new Date().toISOString().slice(0, 13)}`, // hourly dedup
    };
  }
}

export const metricsIngestionStub = new MetricsIngestionStub();