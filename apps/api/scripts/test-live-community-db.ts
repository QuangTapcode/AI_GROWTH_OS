import pool from "../src/lib/db";
import { CommunityService } from "../src/modules/community/service";
import { persistCommunityLead } from "../src/modules/community/leads";
import { createHash, randomUUID } from "node:crypto";

async function main() {
  console.log("🚀 Testing Community Agent End-to-End on Live PostgreSQL Database...");

  const client = await pool.connect();
  try {
    // 1. Lấy hoặc tạo Workspace TripC
    let wsRes = await client.query<{ id: string }>(
      "SELECT id FROM workspaces WHERE id = '10000000-0000-4000-8000-000000000001' LIMIT 1"
    );
    let workspaceId = wsRes.rows[0]?.id;
    if (!workspaceId) {
      const insertedWs = await client.query<{ id: string }>(
        `INSERT INTO workspaces (id, name, slug)
         VALUES ('10000000-0000-4000-8000-000000000001', 'TripC Da Nang', 'tripc')
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING id`
      );
      workspaceId = insertedWs.rows[0].id;
    }
    console.log(`✅ [1/5] Verified Workspace: ${workspaceId}`);

    // 2. Kiểm tra/Tạo User Owner
    let userRes = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE id = 'a0000000-0000-4000-8000-000000000001' LIMIT 1"
    );
    let ownerId = userRes.rows[0]?.id;
    if (!ownerId) {
      const insertedUser = await client.query<{ id: string }>(
        `INSERT INTO users (id, email, full_name, password_hash)
         VALUES ('a0000000-0000-4000-8000-000000000001', 'owner@tripc.vn', 'TripC Owner', 'hash123')
         ON CONFLICT (id) DO NOTHING RETURNING id`
      );
      ownerId = insertedUser.rows[0]?.id || "a0000000-0000-4000-8000-000000000001";
    }

    // Đảm bảo membership
    await client.query(
      `INSERT INTO memberships (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active'`,
      [workspaceId, ownerId]
    );
    console.log(`✅ [2/5] Verified Owner & Membership: ${ownerId}`);

    // 3. Sử dụng CommunityService để tiếp nhận tin nhắn từ Facebook Comment
    const service = new CommunityService(pool);
    const incomingPayload = {
      platform: "facebook_comment" as const,
      external_id: "fb_live_comment_8899",
      author_name: "Linh Nguyen (Expat Nomad)",
      author_contact: "0905123456",
      content: "Chào TripC, cho mình hỏi căn hộ dịch vụ ở An Thượng Đà Nẵng có wifi cáp quang tốc độ cao không? SĐT mình 0905123456, tư vấn giúp mình nhé.",
      post_url: "https://facebook.com/tripc.danang/posts/101589",
      auto_enqueue: false, // Tiếp nhận vào hộp thư trước
    };

    const { message } = await service.receiveMessage(workspaceId, ownerId, incomingPayload);
    console.log(`✅ [3/5] Received Community Message inserted into PostgreSQL:`);
    console.log(`   - Message ID: ${message.id}`);
    console.log(`   - Author: ${message.author_name} (${message.author_contact})`);
    console.log(`   - Platform: ${message.platform}`);
    console.log(`   - Status: ${message.status}`);

    // 4. Mô phỏng quá trình AI sinh phản hồi và tạo Content Artifact
    const taskId = randomUUID();
    const artifactId = randomUUID();

    await client.query(
      `INSERT INTO workflow_tasks (id, workspace_id, role, operation, status)
       VALUES ($1, $2, 'community', 'community.response', 'completed')`,
      [taskId, workspaceId]
    );

    await service.updateMessageStatus(workspaceId, message.id, {
      status: "queued",
    });
    await client.query(
      "UPDATE community_messages SET task_id = $1 WHERE id = $2",
      [taskId, message.id]
    );

    // Tạo artifact mô phỏng phản hồi từ Gemini 2.5 Flash
    const artifactPayload = {
      result: {
        reply: "Khu An Thượng có các quán cà phê với internet cáp quang tốc độ cao trên 100 Mbps và các không gian làm việc chung chuyên dụng như Enouvo Space và DNC.",
        lead_proposal: {
          intent: "request_information",
          status: "proposed",
          contact: {
            phone: "0905123456",
            email: "linh.nomad@gmail.com",
          },
        },
      },
    };

    const contentHash = createHash("sha256")
      .update(JSON.stringify(artifactPayload))
      .digest("hex");

    await client.query(
      `INSERT INTO content_artifacts (
        id, workspace_id, role, operation, task_id, title,
        artifact_type, payload, version, content_hash
      ) VALUES (
        $1, $2, 'community', 'community.response', $3, 'Phản hồi tư vấn An Thượng',
        'community_reply', $4, 1, $5
      )`,
      [artifactId, workspaceId, taskId, JSON.stringify(artifactPayload), contentHash]
    );
    console.log(`✅ [4/5] Created Community Response Artifact: ${artifactId}`);

    // 5. Kiểm tra Lead Persistence: Phê duyệt và lưu Lead trực tiếp vào bảng `leads`
    const persistedLeadId = await persistCommunityLead(client, workspaceId, artifactId, ownerId);
    console.log(`✅ [5/5] Lead Persisted into PostgreSQL 'leads' table:`);
    console.log(`   - Lead ID: ${persistedLeadId}`);

    // Truy vấn kiểm tra lại dữ liệu thật trong DB
    const leadRow = (
      await client.query(
        "SELECT lead_id, contact_name, phone_number, contact_email, utm_source, lead_status, captured_at FROM leads WHERE lead_id = $1",
        [persistedLeadId]
      )
    ).rows[0];
    console.log("   - Lead Record in PostgreSQL:", leadRow);

    const updatedMsg = (
      await client.query(
        "SELECT id, status, task_id, lead_id FROM community_messages WHERE id = $1",
        [message.id]
      )
    ).rows[0];
    console.log("   - Updated Community Message in PostgreSQL:", updatedMsg);

    console.log("\n🎉 FULL END-TO-END TEST ON REAL POSTGRESQL DATABASE: 100% SUCCESS!");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
