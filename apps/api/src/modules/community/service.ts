import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors';
import { enqueueAiTask } from '../campaignPlans/aiTasks';
import { PgCommunityRepository } from './repository';
import {
  receiveMessageInputSchema,
  updateMessageStatusSchema,
  type ReceiveMessageInput,
  type UpdateMessageStatusInput,
  type CommunityMessageRecord,
} from './schemas';

export class CommunityService {
  private readonly repo: PgCommunityRepository;

  constructor(private readonly pool: Pool) {
    this.repo = new PgCommunityRepository(pool);
  }

  async processPendingMessages(
    workspaceId: string,
    actorId: string,
    snapshotId: string,
    limit = 10,
  ): Promise<number> {
    return processReceivedCommunityMessages(this.pool, workspaceId, actorId, snapshotId, limit);
  }

  async receiveMessage(
    workspaceId: string,
    actorId: string,
    rawInput: unknown,
  ): Promise<{ message: CommunityMessageRecord; task_id?: string }> {
    const parsed = receiveMessageInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Invalid community message payload', parsed.error.format());
    }
    const input: ReceiveMessageInput = parsed.data;

    // 1. Lưu bản ghi tin nhắn vào hộp thư
    const message = await this.repo.insertMessage(workspaceId, input);

    // 2. Nếu auto_enqueue được bật (mặc định), tự động đưa vào hàng đợi AI
    if (input.auto_enqueue !== false) {
      const contextRes = await this.pool.query<{ snapshot_id: string }>(
        `SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1 AND current = true LIMIT 1`,
        [workspaceId],
      );
      const snapshotId = contextRes.rows[0]?.snapshot_id;
      if (snapshotId) {
        const taskId = randomUUID();
        await enqueueAiTask(this.pool, workspaceId, actorId, {
          task_id: taskId,
          context_snapshot_id: snapshotId,
          input: {
            operation: 'community.response',
            question: input.content,
          },
        });

        const updated = await this.repo.updateTaskLink(workspaceId, message.id, taskId, 'queued');
        return { message: updated || message, task_id: taskId };
      }
    }

    return { message };
  }

  async listMessages(
    workspaceId: string,
    filters?: { status?: any; platform?: string; limit?: number },
  ): Promise<CommunityMessageRecord[]> {
    return this.repo.listMessages(workspaceId, filters);
  }

  async getMessage(workspaceId: string, messageId: string): Promise<CommunityMessageRecord> {
    const msg = await this.repo.findById(workspaceId, messageId);
    if (!msg) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Community message not found');
    }
    return msg;
  }

  async updateMessageStatus(
    workspaceId: string,
    messageId: string,
    rawInput: unknown,
  ): Promise<CommunityMessageRecord> {
    const parsed = updateMessageStatusSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Invalid message status payload', parsed.error.format());
    }
    const input: UpdateMessageStatusInput = parsed.data;

    const existing = await this.repo.findById(workspaceId, messageId);
    if (!existing) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Community message not found');
    }

    const updated = await this.repo.updateStatusAndLead(
      workspaceId,
      messageId,
      input.status,
      input.lead_id,
    );
    if (!updated) {
      throw new AppError(500, 'UPDATE_FAILED', 'Failed to update community message');
    }
    return updated;
  }
}

/**
 * Autopilot helper: enqueues pending received community messages into workflow_tasks.
 */
export async function processReceivedCommunityMessages(
  pool: Pool,
  workspaceId: string,
  actorId: string,
  snapshotId: string,
  limit = 10,
): Promise<number> {
  const pending = (
    await pool.query<{ id: string; content: string }>(
      `SELECT id, content FROM community_messages
       WHERE workspace_id = $1 AND status = 'received' AND task_id IS NULL
       ORDER BY received_at ASC LIMIT $2`,
      [workspaceId, limit],
    )
  ).rows;

  let enqueued = 0;
  for (const msg of pending) {
    const taskId = randomUUID();
    await enqueueAiTask(pool, workspaceId, actorId, {
      task_id: taskId,
      context_snapshot_id: snapshotId,
      input: {
        operation: 'community.response',
        question: msg.content,
      },
    });
    await pool.query(
      `UPDATE community_messages SET task_id = $1, status = 'queued', updated_at = now() WHERE workspace_id = $2 AND id = $3`,
      [taskId, workspaceId, msg.id],
    );
    enqueued++;
  }
  return enqueued;
}
