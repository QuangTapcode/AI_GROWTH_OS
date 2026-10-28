import process from 'node:process';
process.loadEnvFile('.env');
import pool from '../src/lib/db';

async function updatePublishingRecord() {
  const client = await pool.connect();
  try {
    const postFbId = '1381196421750749_122094374949538407';
    
    // Update publishing_jobs
    const pubRes = await client.query(`
      UPDATE publishing_jobs
      SET status = 'published'
      WHERE content_id = '89bbdd8b-80cc-4de3-8ff9-c654513c11e3'
      RETURNING id, status;
    `);

    // Update contents
    const contentRes = await client.query(`
      UPDATE contents
      SET status = 'published'
      WHERE id = '89bbdd8b-80cc-4de3-8ff9-c654513c11e3'
      RETURNING id, status;
    `);

    console.log('✅ Synchronized Facebook Live Post with Database:');
    console.log('Content Updated:', contentRes.rows[0]);
    console.log('Publishing Job Updated:', pubRes.rows[0]);
  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

updatePublishingRecord();
