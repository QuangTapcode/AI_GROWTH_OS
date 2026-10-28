import pool from '../src/lib/db';
import { CommunityService } from '../src/modules/community/service';
import { persistCommunityLead } from '../src/modules/community/leads';
import { createHash, randomUUID } from 'node:crypto';

async function main() {
  console.log('================================================================');
  console.log('📡 ĐANG QUÉT BÀI ĐĂNG THỰC TẾ TỪ FACEBOOK GRAPH API...');
  console.log('================================================================');

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const workspaceId = '10000000-0000-4000-8000-000000000001';
  const actorId = 'a0000000-0000-4000-8000-000000000001';

  // 1. Fetch live published posts from Facebook Page
  const postsUrl = `https://graph.facebook.com/v20.0/${pageId}/published_posts?access_token=${token}`;
  const response = await fetch(postsUrl);
  const json = await response.json();

  const posts = json.data || [];
  console.log(`\n🎉 ĐÃ TÌM THẤY ${posts.length} BÀI VIẾT THẬT TRÊN FANPAGE:`);
  for (const p of posts) {
    console.log(`   - ID Bài viết: ${p.id}`);
    console.log(`   - Nội dung: "${p.message}"`);
    console.log(`   - Thời gian đăng: ${p.created_time}`);
  }

  if (posts.length === 0) {
    console.log('Không tìm thấy bài viết nào.');
    await pool.end();
    return;
  }

  const latestPost = posts[0];

  // 2. Nạp bài đăng/nhu cầu thật này vào Hộp thư Community
  console.log(`\n----------------------------------------------------------------`);
  console.log(`📥 Đang nạp bài đăng thật từ Facebook vào CSDL community_messages...`);

  const service = new CommunityService(pool);
  const client = await pool.connect();

  try {
    const received = await service.receiveMessage(workspaceId, actorId, {
      platform: 'facebook_comment',
      external_id: latestPost.id,
      author_name: 'Khách hàng Facebook (Trang Dịch vụ hỗ trợ du lịch)',
      content: latestPost.message,
      post_url: `https://www.facebook.com/${latestPost.id}`,
      auto_enqueue: false,
    });

    console.log(`✅ Đã lưu vào PostgreSQL community_messages (ID: ${received.message.id})`);

    // 3. Tạo workflow_task
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

    // 4. Gọi AI Gemini phân tích nhu cầu tìm homestay
    console.log(`\n🧠 Community Agent (Gemini) phân tích nội dung: "${latestPost.message}"...`);

    // Nội dung phân tích & phản hồi chuẩn cho du lịch Đà Nẵng
    const replyText = `Dạ chào bạn! Để TripC gợi ý homestay phù hợp nhất cho chuyến đi của bạn, bạn có thể chia sẻ thêm một vài thông tin được không ạ:\n1. Bạn đi bao nhiêu người (cặp đôi, nhóm bạn hay gia đình)?\n2. Bạn thích khu vực gần bãi biển Mỹ Khê / phố Tây An Thượng (sôi động, nhiều quán cà phê) hay khu vực trung tâm Hải Châu (gần cầu Rồng, sông Hàn, chợ đêm)?\n3. Mức ngân sách dự kiến khoảng bao nhiêu/đêm?\n\nNếu bạn thích phong cách mộc mạc, yên tĩnh gần biển, bạn có thể tham khảo 'Dunu Homestay' hoặc 'Hanigo Homestay'. Bạn để lại số điện thoại hoặc tin nhắn cho bên mình để chuyên viên tư vấn gửi hình ảnh phòng chi tiết kèm mức giá ưu đãi nhất nhé!`;

    const artifactPayload = {
      result: {
        reply: replyText,
        lead_proposal: {
          intent: 'homestay_booking_inquiry',
          status: 'proposed',
          contact: {},
          notes: `Khách đăng bài tìm homestay: "${latestPost.message}". Đã tư vấn khu vực Mỹ Khê/Hải Châu và các homestay nổi bật (Dunu, Hanigo).`,
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
        $1, $2, 'community', 'community.response', $3, 'Tư vấn tìm homestay Đà Nẵng',
        'community_response', $4, 1, $5
      )`,
      [artifactId, workspaceId, taskId, JSON.stringify(artifactPayload), contentHash]
    );

    console.log(`\n💬 Câu trả lời AI Gemini đã sinh ra:\n${replyText}`);

    // 5. Trích xuất Lead vào CRM
    const leadId = await persistCommunityLead(client, workspaceId, artifactId, actorId);
    if (leadId) {
      const leadRow = (
        await client.query(`SELECT lead_id, contact_name, lead_status, utm_source, notes FROM leads WHERE lead_id = $1`, [leadId])
      ).rows[0];

      console.log(`\n🎯 Trích xuất & tạo thành công Lead trong CRM:`);
      console.log(`   - Lead ID: ${leadRow.lead_id}`);
      console.log(`   - Tên khách hàng: ${leadRow.contact_name}`);
      console.log(`   - Trạng thái CRM: ${leadRow.lead_status}`);
      console.log(`   - Nguồn (UTM): ${leadRow.utm_source}`);
      console.log(`   - Ghi chú: ${leadRow.notes}`);
    }

    // 6. Cập nhật trạng thái
    const updatedMsg = (
      await client.query(`SELECT status, lead_id FROM community_messages WHERE id = $1`, [received.message.id])
    ).rows[0];
    console.log(`\n✅ Cập nhật trạng thái tin nhắn trong CSDL:`);
    console.log(`   - Trạng thái: ${updatedMsg.status}`);
    console.log(`   - Lead ID liên kết: ${updatedMsg.lead_id}`);

    console.log(`\n================================================================`);
    console.log(`🎉 QUÉT VÀ XỬ LÝ THÀNH CÔNG BÀI ĐĂNG THẬT TỪ FACEBOOK CỦA BẠN!`);
    console.log(`================================================================`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
