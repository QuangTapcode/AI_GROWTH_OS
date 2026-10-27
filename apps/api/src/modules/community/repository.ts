import type { Pool, PoolClient } from 'pg';
import type { CommunityMessageRecord, ReceiveMessageInput, CommunityStatus } from './schemas';

export class PgCommunityRepository {
  constructor(private readonly pool: Pool) {}

  async insertMessage(
    workspaceId: string,
    input: ReceiveMessageInput,
    client?: PoolClient,
  ): Promise<CommunityMessageRecord> {
    const db = client ?? this.pool;
    const res = await db.query<CommunityMessageRecord>(
      `INSERT INTO community_messages (
        workspace_id, platform, external_id, author_name, author_contact,
        content, post_url, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'received', $8)
      RETURNING *`,
      [
        workspaceId,
        input.platform,
        input.external_id || null,
        input.author_name,
        input.author_contact || null,
        input.content,
        input.post_url || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return res.rows[0];
  }

  async findById(workspaceId: string, messageId: string): Promise<CommunityMessageRecord | null> {
    const res = await this.pool.query<CommunityMessageRecord>(
      `SELECT * FROM community_messages WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, messageId],
    );
    return res.rows[0] || null;
  }

  async listMessages(
    workspaceId: string,
    filters?: { status?: CommunityStatus; platform?: string; limit?: number },
  ): Promise<CommunityMessageRecord[]> {
    let sql = `SELECT * FROM community_messages WHERE workspace_id = $1`;
    const params: unknown[] = [workspaceId];

    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }
    if (filters?.platform) {
      params.push(filters.platform);
      sql += ` AND platform = $${params.length}`;
    }

    sql += ` ORDER BY received_at DESC LIMIT $${params.length + 1}`;
    params.push(filters?.limit || 50);

    const res = await this.pool.query<CommunityMessageRecord>(sql, params);
    return res.rows;
  }

  async updateTaskLink(
    workspaceId: string,
    messageId: string,
    taskId: string,
    status: CommunityStatus = 'queued',
    client?: PoolClient,
  ): Promise<CommunityMessageRecord | null> {
    const db = client ?? this.pool;
    const res = await db.query<CommunityMessageRecord>(
      `UPDATE community_messages
       SET task_id = $3, status = $4, updated_at = now()
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      [workspaceId, messageId, taskId, status],
    );
    return res.rows[0] || null;
  }

  async updateStatusAndLead(
    workspaceId: string,
    messageId: string,
    status: CommunityStatus,
    leadId?: string,
    client?: PoolClient,
  ): Promise<CommunityMessageRecord | null> {
    const db = client ?? this.pool;
    let sql = `UPDATE community_messages SET status = $3, updated_at = now()`;
    const params: unknown[] = [workspaceId, messageId, status];

    if (leadId) {
      params.push(leadId);
      sql += `, lead_id = $${params.length}`;
    }

    sql += ` WHERE workspace_id = $1 AND id = $2 RETURNING *`;
    const res = await db.query<CommunityMessageRecord>(sql, params);
    return res.rows[0] || null;
  }
}
