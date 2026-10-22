import { query } from '../../lib/db';
import type { ConnectionStatus, IntegrationProvider } from './types';

export interface IntegrationConnectionRow {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  account_ref: string | null;
  display_name: string | null;
  status: ConnectionStatus;
  scopes: string[];
  credential_ref: string | null;
  last_error: string | null;
  verified_at: string | null;
  updated_at: string;
}

export async function getConnection(workspaceId: string, provider: IntegrationProvider): Promise<IntegrationConnectionRow | null> {
  const result = await query<IntegrationConnectionRow>(
    `SELECT id, workspace_id, provider, account_ref, display_name, status, scopes,
            credential_ref, last_error, verified_at, updated_at
       FROM integration_connections
      WHERE workspace_id = $1 AND provider = $2
      ORDER BY updated_at DESC LIMIT 1`,
    [workspaceId, provider],
  );
  return result.rows[0] ?? null;
}

export async function listConnections(workspaceId: string): Promise<IntegrationConnectionRow[]> {
  const result = await query<IntegrationConnectionRow>(
    `SELECT id, workspace_id, provider, account_ref, display_name, status, scopes,
            credential_ref, last_error, verified_at, updated_at
       FROM integration_connections
      WHERE workspace_id = $1 ORDER BY provider, updated_at DESC`,
    [workspaceId],
  );
  return result.rows;
}

export async function upsertConnection(input: {
  workspaceId: string;
  provider: IntegrationProvider;
  accountRef?: string | null;
  displayName?: string | null;
  scopes: string[];
  credentialRef?: string | null;
  status: ConnectionStatus;
  verifiedAt?: string | null;
}): Promise<IntegrationConnectionRow> {
  const result = await query<IntegrationConnectionRow>(
    `INSERT INTO integration_connections
       (workspace_id, provider, account_ref, display_name, status, scopes, credential_ref, verified_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (workspace_id, provider, account_ref)
     DO UPDATE SET display_name = EXCLUDED.display_name, status = EXCLUDED.status,
                   scopes = EXCLUDED.scopes, credential_ref = EXCLUDED.credential_ref,
                   verified_at = EXCLUDED.verified_at, updated_at = NOW()
     RETURNING id, workspace_id, provider, account_ref, display_name, status, scopes,
               credential_ref, last_error, verified_at, updated_at`,
    [input.workspaceId, input.provider, input.accountRef ?? null, input.displayName ?? null,
      input.status, input.scopes, input.credentialRef ?? null, input.verifiedAt ?? null],
  );
  return result.rows[0];
}
