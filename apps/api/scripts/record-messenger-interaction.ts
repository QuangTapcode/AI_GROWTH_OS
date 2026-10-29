import pool from '../src/lib/db';
import { CommunityService } from '../src/modules/community/service';
import { persistCommunityLead } from '../src/modules/community/leads';
import { createHash, randomUUID } from 'node:crypto';

async function main() {
  console.log('--- SAVING REAL MESSENGER INTERACTION TO DATABASE ---');
  const workspaceId = '10000000-0000-4000-8000-000000000001';
  const actorId = 'a0000000-0000-4000-8000-000000000001';

  const service = new CommunityService(pool);
  const client = await pool.connect();

  try {
    const received = await service.receiveMessage(workspaceId, actorId, {
      platform: 'facebook_message',
      external_id: 'm_VMv-oVHrpOJRX-i_jbm_NQmeDxR4zWy-erWxJEy-m28BhckqJ-nFEATGE7-jsgdLr95f9ZdIo46q3e1jdPQCaA',
      author_name: 'Nhok Con (Facebook Messenger)',
      content: 'hi ạ',
      auto_enqueue: false,
    });
    console.log(`✅ Lưu thành công tin nhắn Messenger của Nhok Con vào CSDL: ID = ${received.message.id}`);

    // Create workflow_task
    const taskId = randomUUID();
    await client.query(
      `INSERT INTO workflow_tasks (id, workspace_id, role, operation, status)
       VALUES ($1, $2, 'community', 'community.response', 'completed')`,
      [taskId, workspaceId]
    );

    await client.query(
      `UPDATE community_messages SET task_id = $1 WHERE id = $2`,
      [taskId, received.message.id]
    );

    const replyText = 'Chào bạn Nhok Con! Dạ bên mình là Dịch vụ hỗ trợ du lịch (kết nối trực tiếp từ AI Growth OS). Bạn đang tìm homestay hay phòng khách sạn ở khu vực nào tại Đà Nẵng để mình tư vấn chi tiết cho bạn nhé ạ! 😊';

    const artifactPayload = {
      result: {
        reply: replyText,
        lead_proposal: {
          intent: 'homestay_booking_inquiry',
          status: 'proposed',
          contact: {
            name: 'Nhok Con',
            facebook_psid: '28809874815335513',
          },
          notes: 'Khách hàng nhắn tin Messenger hỏi thăm dịch vụ homestay/khách sạn.',
        },
      },
    };

    const contentHash = createHash('sha256')
      .update(JSON.stringify(artifactPayload))
      .digest('hex');

    const artifactId = randomUUID();
    await client.query(
      `INSERT INTO content_artifacts (
        id, workspace_id, role, operation, task_id, title,
        artifact_type, payload, version, content_hash
      ) VALUES (
        $1, $2, 'community', 'community.response', $3, 'Phản hồi Messenger cho Nhok Con',
        'community_response', $4, 1, $5
      )`,
      [artifactId, workspaceId, taskId, JSON.stringify(artifactPayload), contentHash]
    );

    // Persist lead
    const leadId = await persistCommunityLead(client, workspaceId, artifactId, actorId);
    console.log(`🎯 Lead ID created in CRM: ${leadId}`);

    // Update community message status to replied
    await client.query(
      `UPDATE community_messages SET status = 'replied', lead_id = $2 WHERE id = $1`,
      [received.message.id, leadId]
    );
    console.log('✅ Updated community_messages status = replied');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
