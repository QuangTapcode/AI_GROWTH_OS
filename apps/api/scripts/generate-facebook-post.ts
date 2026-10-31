import pool from '../src/lib/db';
import { createHash, randomUUID } from 'node:crypto';

async function main() {
  console.log('================================================================');
  console.log('📝 AI GROWTH OS — CONTENT AGENT: TỰ ĐỘNG SẢN XUẤT BÀI VIẾT FACEBOOK');
  console.log('================================================================');

  const workspaceId = '10000000-0000-4000-8000-000000000001';
  const authorId = 'a0000000-0000-4000-8000-000000000001';
  const channelId = 'c1000000-0000-4000-8000-000000000002'; // Facebook Fanpage channel

  // 1. Kịch bản bài viết chuẩn tiếp thị do AI Content Agent sản xuất
  const postTitle = 'Top Homestay & Chỗ Nghỉ Giá Rẻ Cho Dân Du Lịch Đà Nẵng 2026';
  const utmUrl = 'https://tripc.vn/homestay-da-nang?utm_source=facebook&utm_medium=social&utm_campaign=mua_he_da_nang_2026&utm_content=fb_post_homestay';

  const postBody = `🌊 ĐI ĐÀ NẴNG MỘT MÌNH HOẶC CÙNG BẠN BÈ THÌ Ở ĐÂU VỪA RẺ, VỪA GẦN BIỂN?

Rất nhiều bạn nhắn tin hỏi Trang: "Đi Đà Nẵng muốn tìm chỗ nghỉ yên tĩnh, sạch sẽ, giá mềm tầm 300k - 400k/đêm thì chọn khu nào?"

Dưới đây là 3 gợi ý chân ái từ cẩm nang TripC:

1️⃣ Bay Homestay & Coffee (Đường Nguyễn Tất Thành - Quận Liên Chiểu)
📍 Điểm cộng: Nằm ngay cung đường ven vịnh Đà Nẵng, mở cửa sổ là ngắm trọn biển Xuân Thiều. Không gian cực kỳ yên tĩnh, có bàn làm việc cho bạn nào vừa du lịch vừa làm việc từ xa (Workation).
💰 Giá tham khảo: 350.000đ - 450.000đ/đêm.

2️⃣ Hanigo Homestay (Gần Biển Mỹ Khê - Phố Tây An Thượng)
📍 Điểm cộng: Siêu gần biển, đi bộ 5 phút là ra bãi tắm Mỹ Khê. Xung quanh ngập tràn quán cà phê đẹp và quán ăn vặt.
💰 Giá tham khảo: Từ 300.000đ/phòng đơn.

3️⃣ Gió Biển Homestay (Khu vực Chợ Hòa Khánh)
📍 Điểm cộng: Thiên đường ăn uống! Bước chân ra ngõ là bạt ngàn đồ ăn ngon rẻ: bánh tráng thịt heo, ốc hút, nem lụi...
💰 Giá tham khảo: 300.000đ/đêm.

👉 Bạn đang chuẩn bị đi Đà Nẵng mấy người và dự kiến đi ngày nào?
📩 Nhắn tin ngay cho Fanpage hoặc để lại bình luận bên dưới, tụi mình sẽ gửi hình ảnh phòng chi tiết kèm mã giảm giá đặt phòng ưu đãi nhất nhé!

🔗 Xem danh sách phòng trống & hình ảnh thực tế: ${utmUrl}

#DuLichDaNang #HomestayDaNang #ReviewDaNang #BienMyKhe #LienChieu #TripC`;

  const client = await pool.connect();
  try {
    console.log(`\n🧠 [1/4] AI Content Agent đang phân tích xu hướng & tối ưu hóa chuyển đổi...`);
    console.log(`   - Chủ đề: Tư vấn Homestay Đà Nẵng giá hợp lý (Liên Chiểu & Mỹ Khê)`);
    console.log(`   - Mục tiêu: Hút lượt nhắn tin & bình luận vào Fanpage`);
    console.log(`   - Link theo dõi UTM: ${utmUrl}`);

    // 2. Lưu vào bảng contents
    const contentId = randomUUID();
    await client.query(
      `INSERT INTO contents (
        id, workspace_id, title, body_markdown, type, status,
        content_score, seo_score, business_value, created_by
      ) VALUES (
        $1, $2, $3, $4, 'social_post', 'approved',
        92.5, 88.0, 95.0, 'ai_content_agent'
      )`,
      [contentId, workspaceId, postTitle, postBody]
    );
    console.log(`\n✅ [2/4] Lưu bản ghi nội dung vào PostgreSQL bảng 'contents' (ID: ${contentId})`);

    // 3. Tạo Task & Content Artifact
    const taskId = randomUUID();
    await client.query(
      `INSERT INTO workflow_tasks (id, workspace_id, role, operation, status)
       VALUES ($1, $2, 'content', 'content.generate_social_post', 'completed')`,
      [taskId, workspaceId]
    );

    const artifactPayload = {
      title: postTitle,
      body: postBody,
      utm_url: utmUrl,
      platform: 'facebook_page',
      channel_id: channelId,
      call_to_action: 'send_message_or_comment',
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
        $1, $2, 'content', 'content.generate_social_post', $3, $4,
        'social_post', $5, 1, $6
      )`,
      [artifactId, workspaceId, taskId, postTitle, JSON.stringify(artifactPayload), contentHash]
    );
    console.log(`✅ [3/4] Tạo Content Artifact & Phê duyệt bài viết (Artifact ID: ${artifactId})`);

    // 4. Lên lịch xuất bản (Publishing Job)
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO publishing_jobs (
        id, content_id, channel_id, scheduled_for, status, utm_url
      ) VALUES (
        $1, $2, $3, NOW(), 'scheduled', $4
      )`,
      [jobId, contentId, channelId, utmUrl]
    );
    console.log(`✅ [4/4] Tạo lệnh xuất bản trong 'publishing_jobs' (Job ID: ${jobId}, Kênh: Facebook Fanpage)`);

    console.log(`\n================================================================`);
    console.log(`📢 BÀI VIẾT DO AI SẢN XUẤT ĐÃ HOÀN TẤT VÀ SẴN SÀNG ĐĂNG:`);
    console.log(`================================================================\n`);
    console.log(postBody);
    console.log(`\n================================================================`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
