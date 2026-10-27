import type { PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';

interface LeadProposal {
  intent?: string;
  status?: string;
  contact?: {
    email?: string;
    phone?: string;
  };
}

/**
 * Persists a lead from an approved Community artifact into PostgreSQL leads table (TQ-05 / W2).
 */
export async function persistCommunityLead(
  client: PoolClient,
  workspaceId: string,
  artifactId: string,
  actorId: string,
): Promise<string | null> {
  const artifactRow = (
    await client.query<{
      id: string;
      role: string;
      task_id: string;
      payload: {
        result?: {
          lead_proposal?: LeadProposal | null;
          reply?: string;
        };
      };
    }>(
      `SELECT id, role, task_id, payload FROM content_artifacts WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, artifactId],
    )
  ).rows[0];

  if (!artifactRow || artifactRow.role !== 'community') return null;

  const proposal = artifactRow.payload?.result?.lead_proposal;
  if (!proposal) {
    // If no lead proposal was generated (e.g. pure informational reply),
    // still mark any linked community message as replied upon artifact approval.
    if (artifactRow.task_id) {
      await client.query(
        `UPDATE community_messages SET status = 'replied', updated_at = NOW()
         WHERE workspace_id = $1 AND task_id = $2 AND status IN ('received', 'queued')`,
        [workspaceId, artifactRow.task_id],
      );
    }
    return null;
  }

  // Check if community message is linked to this task
  const msgRow = (
    await client.query<{
      id: string;
      author_name: string;
      author_contact: string | null;
      content: string;
    }>(
      `SELECT id, author_name, author_contact, content FROM community_messages WHERE workspace_id = $1 AND task_id = $2 LIMIT 1`,
      [workspaceId, artifactRow.task_id],
    )
  ).rows[0];

  const contactEmail =
    proposal.contact?.email ||
    (msgRow?.author_contact?.includes('@') ? msgRow.author_contact : null) ||
    `community.${artifactId.slice(0, 8)}@tripc.internal`;

  const contactName = msgRow?.author_name || 'Community Member';
  const phoneNumber =
    proposal.contact?.phone ||
    (!msgRow?.author_contact?.includes('@') ? msgRow?.author_contact : null);

  const interestTopic = 'Housing & Community Consultation';
  const notes = `Lead originated from Community inquiry: "${(msgRow?.content || 'Community question').slice(0, 200)}". Reply draft: "${(artifactRow.payload?.result?.reply || '').slice(0, 200)}"`;

  const idempotencyKey = `community-lead-${artifactId}`;
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ contactEmail, contactName, phoneNumber, idempotencyKey }))
    .digest('hex');

  const leadId = randomUUID();

  const insertRes = await client.query<{ lead_id: string }>(
    `INSERT INTO leads (
      lead_id, workspace_id, site_id, idempotency_key, payload_hash,
      contact_email, contact_name, phone_number, interest_topic,
      consent_accepted, consent_policy_version, utm_source, utm_medium,
      utm_campaign, lead_status, lead_owner, notes, context
    ) VALUES (
      $1, $2, 'tripc', $3, $4,
      $5, $6, $7, $8,
      true, 'community-consent-v1', 'community', 'social_comment',
      'expat_inquiry', 'New', $9, $10,
      $11
    ) ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
      SET updated_at = NOW()
    RETURNING lead_id`,
    [
      leadId,
      workspaceId,
      idempotencyKey,
      payloadHash,
      contactEmail,
      contactName,
      phoneNumber,
      interestTopic,
      actorId,
      notes,
      JSON.stringify({
        artifact_id: artifactId,
        task_id: artifactRow.task_id,
        intent: proposal.intent,
      }),
    ],
  );

  const savedLeadId = insertRes.rows[0]?.lead_id || leadId;

  // Link to community message if present
  if (msgRow) {
    await client.query(
      `UPDATE community_messages SET lead_id = $3, status = 'replied', updated_at = NOW() WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, msgRow.id, savedLeadId],
    );
  }

  return savedLeadId;
}
