import pool from '../src/lib/db';
import { CommunityService } from '../src/modules/community/service';
import { persistCommunityLead } from '../src/modules/community/leads';
import { createHash, randomUUID } from 'node:crypto';

const pageId = process.env.FACEBOOK_PAGE_ID || '1381196421750749';
const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const workspaceId = '10000000-0000-4000-8000-000000000001';
const actorId = 'a0000000-0000-4000-8000-000000000001';

if (!pageToken) {
  console.error('Missing FACEBOOK_PAGE_ACCESS_TOKEN');
  process.exit(1);
}

const seenMessageIds = new Set<string>();

async function sendMessengerReply(recipientId: string, text: string) {
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageToken}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  });
  const data = await res.json();
  return data;
}

function generateSmartReply(query: string, senderName: string): { reply: string; intent: string } {
  const q = query.toLowerCase();

  if (q.includes('liên chiểu') || q.includes('lien chieu') || q.includes('xuân thiều') || q.includes('mikazuki')) {
    return {
      reply: `Dạ chào bạn ${senderName}! Khu vực Liên Chiểu gần vịnh Đà Nẵng và biển Xuân Thiều có không gian rất thoáng và giá phòng cực kỳ tiết kiệm (300k - 500k/đêm).\n\nTripC gợi ý bạn:\n1. Bay Homestay (đường Nguyễn Tất Thành view biển trực diện)\n2. Homestay Gió Biển (gần bãi tắm Xuân Thiều, có bếp tự nấu ăn)\n3. Khu tổ hợp nghỉ dưỡng & tắm khoáng nóng Danang Mikazuki Resorts.\n\nBạn dự kiến đi mấy người và ở mấy đêm để mình kiểm tra phòng trống giúp bạn nhé ạ!`,
      intent: 'lien_chieu_homestay',
    };
  }

  if (q.includes('mỹ khê') || q.includes('my khe') || q.includes('an thượng') || q.includes('biển')) {
    return {
      reply: `Dạ chào bạn ${senderName}! Khu vực biển Mỹ Khê và phố Tây An Thượng là trung tâm sầm uất nhất Đà Nẵng, rất nhiều quán cà phê đẹp và quán hải sản ngon.\n\nHomestay nổi bật tại đây có Dunu Homestay (phong cách mộc mạc), Hanigo Homestay (xinh xắn, giá rẻ 350k/đêm), hoặc các khách sạn Sala Danang, Belle Maison có hồ bơi vô cực view biển. Bạn dự kiến mức kinh phí tầm bao nhiêu để bên mình lọc căn phù hợp nhất ạ?`,
      intent: 'my_khe_homestay',
    };
  }

  if (q.includes('giá') || q.includes('bao nhiêu') || q.includes('chi phí') || q.includes('tiền')) {
    return {
      reply: `Dạ chào bạn ${senderName}! Mức giá homestay tại Đà Nẵng dao động như sau ạ:\n- Phòng đơn/đôi tiêu chuẩn: 300.000đ - 450.000đ/đêm\n- Căn hộ dịch vụ/Studio có bếp riêng: 500.000đ - 750.000đ/đêm\n- Nguyên căn cho gia đình/nhóm bạn (4 - 8 người): 1.200.000đ - 2.000.000đ/đêm.\nBạn cho mình xin số lượng người và ngày đi để mình báo giá ưu đãi chính xác nhé!`,
      intent: 'price_inquiry',
    };
  }

  return {
    reply: `Dạ chào bạn ${senderName}! Cảm ơn bạn đã nhắn tin cho Dịch vụ hỗ trợ du lịch (AI Growth OS). Bên mình chuyên hỗ trợ tư vấn đặt phòng homestay, khách sạn, tour du lịch và các địa điểm ăn uống tại Đà Nẵng hoàn toàn miễn phí. Bạn cần tư vấn khu vực nào (gần biển Mỹ Khê, trung tâm sông Hàn hay quận Liên Chiểu) cứ nhắn cho mình nhé!`,
    intent: 'general_inquiry',
  };
}

async function pollOnce() {
  try {
    const url = `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=id,messages{id,message,from,created_time}&access_token=${pageToken}`;
    const res = await fetch(url);
    const data = await res.json();

    const conversations = data.data || [];
    for (const conv of conversations) {
      const messages = conv.messages?.data || [];
      for (const msg of messages) {
        // Only process messages from user (not from the page itself)
        if (msg.from?.id === pageId) {
          seenMessageIds.add(msg.id);
          continue;
        }

        if (seenMessageIds.has(msg.id)) continue;

        seenMessageIds.add(msg.id);
        const senderName = msg.from?.name || 'Khách hàng';
        const senderId = msg.from?.id;
        const content = msg.message;

        console.log(`\n🔔 [TIN NHẮN MỚI TỪ MESSENGER]`);
        console.log(`👤 Người gửi: ${senderName} (ID: ${senderId})`);
        console.log(`💬 Nội dung: "${content}"`);

        // Generate response
        const { reply, intent } = generateSmartReply(content, senderName);

        // Send reply directly back to user on Messenger
        const sendResult = await sendMessengerReply(senderId, reply);
        console.log(`🚀 Đã gửi phản hồi vào Messenger: Message ID = ${sendResult.message_id}`);

        // Ingest into Database
        const service = new CommunityService(pool);
        const received = await service.receiveMessage(workspaceId, actorId, {
          platform: 'facebook_message',
          external_id: msg.id,
          author_name: senderName,
          content,
          auto_enqueue: false,
        });

        // Insert workflow_task and artifact
        const client = await pool.connect();
        try {
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

          const artifactPayload = {
            result: {
              reply,
              lead_proposal: {
                intent,
                status: 'proposed',
                contact: { name: senderName, psid: senderId },
                notes: `Tin nhắn Messenger: "${content}"`,
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
              $1, $2, 'community', 'community.response', $3, $4,
              'community_response', $5, 1, $6
            )`,
            [artifactId, workspaceId, taskId, `Tư vấn Messenger cho ${senderName}`, JSON.stringify(artifactPayload), contentHash]
          );

          const leadId = await persistCommunityLead(client, workspaceId, artifactId, actorId);
          await client.query(
            `UPDATE community_messages SET status = 'replied', lead_id = $2 WHERE id = $1`,
            [received.message.id, leadId]
          );
          console.log(`✅ Đã lưu CSDL & tạo Lead CRM (ID: ${leadId})`);
        } finally {
          client.release();
        }
      }
    }
  } catch (err: any) {
    // transient network error, ignore
  }
}

async function start() {
  console.log('🤖 AI GROWTH OS — TỰ ĐỘNG PHẢN HỒI MESSENGER 24/7 ĐÃ KHỞI CHẠY!');
  console.log('📡 Đang lắng nghe tin nhắn từ Fanpage Dịch vụ hỗ trợ du lịch (ID: 1381196421750749)...');

  // Pre-seed seen messages
  try {
    const url = `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=id,messages{id,message,from,created_time}&access_token=${pageToken}`;
    const res = await fetch(url);
    const data = await res.json();
    for (const conv of data.data || []) {
      for (const msg of conv.messages?.data || []) {
        seenMessageIds.add(msg.id);
      }
    }
  } catch {}

  while (true) {
    await pollOnce();
    await new Promise((r) => setTimeout(r, 4000)); // poll every 4s
  }
}

start();
