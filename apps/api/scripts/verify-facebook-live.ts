import { getWorkspaceConnectionStatus } from '../src/modules/integrations/stubs';
import { upsertConnection } from '../src/modules/integrations/repository';
import pool from '../src/lib/db';

async function main() {
  console.log('--- TESTING FACEBOOK CONNECTION ---');
  console.log('FACEBOOK_PAGE_ID:', process.env.FACEBOOK_PAGE_ID);
  console.log('INTEGRATION_MODE:', process.env.INTEGRATION_MODE);

  const workspaceId = '10000000-0000-4000-8000-000000000001';

  // 1. Check probe from env
  const status = await getWorkspaceConnectionStatus(workspaceId, 'facebook_page');
  console.log('\nWorkspace Facebook Connection Status:', JSON.stringify(status, null, 2));

  if (status.status === 'connected') {
    console.log('\n>>> SUCCESS! Connected to Facebook Fanpage!');
    
    // 2. Upsert connection in database
    const conn = await upsertConnection({
      workspaceId,
      provider: 'facebook_page',
      accountRef: process.env.FACEBOOK_PAGE_ID!,
      displayName: 'Dịch vụ hỗ trợ du lịch',
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_messaging', 'pages_manage_posts'],
      credentialRef: 'env:FACEBOOK_PAGE_ACCESS_TOKEN',
      status: 'connected',
      verifiedAt: new Date(),
    });
    console.log('\nDatabase integration_connections updated successfully:');
    console.log('Provider:', conn.provider);
    console.log('Account Ref:', conn.account_ref);
    console.log('Display Name:', conn.display_name);
    console.log('Status:', conn.status);
    console.log('Verified At:', conn.verified_at);

    // 3. Ensure channel exists in channels table
    const existing = await pool.query(
      `SELECT id FROM channels WHERE workspace_id = $1 AND platform_name = 'facebook' LIMIT 1`,
      [workspaceId]
    );

    let channelRow;
    if (existing.rows.length === 0) {
      const chanRes = await pool.query(
        `INSERT INTO channels (workspace_id, platform_name, display_name, channel_identifier)
         VALUES ($1, 'facebook', 'Dịch vụ hỗ trợ du lịch', $2)
         RETURNING *`,
        [workspaceId, process.env.FACEBOOK_PAGE_ID]
      );
      channelRow = chanRes.rows[0];
    } else {
      const chanRes = await pool.query(
        `UPDATE channels SET display_name = 'Dịch vụ hỗ trợ du lịch', channel_identifier = $2
         WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, process.env.FACEBOOK_PAGE_ID]
      );
      channelRow = chanRes.rows[0];
    }
    console.log('\nDatabase channels updated:');
    console.log('Channel ID:', channelRow.id);
    console.log('Platform:', channelRow.platform_name);
    console.log('Display Name:', channelRow.display_name);
    console.log('Identifier:', channelRow.channel_identifier);
  } else {
    console.log('\n>>> ERROR: Facebook connection not connected:', status.missing_reason);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
