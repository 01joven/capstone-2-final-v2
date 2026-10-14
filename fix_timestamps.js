require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/db');

async function main() {
  const client = await pool.connect();
  try {
    console.log('Converting timestamp columns to WITH TIME ZONE...');
    await client.query('BEGIN');

    // Convert all timestamp columns to timestamptz (WITH TIME ZONE)
    // The stored values are in +08:00 (Manila), so we interpret them as that timezone
    await client.query(`
      ALTER TABLE password_reset_codes
        ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Manila',
        ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'Asia/Manila',
        ALTER COLUMN used_at TYPE TIMESTAMPTZ USING used_at AT TIME ZONE 'Asia/Manila'
    `);

    await client.query('COMMIT');
    console.log('Done! Verifying...');

    // Verify
    const schema = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'password_reset_codes' ORDER BY ordinal_position"
    );
    console.log('Updated schema:', JSON.stringify(schema.rows, null, 2));

    // Check values now
    const vals = await pool.query(
      "SELECT id, created_at, expires_at, used_at FROM password_reset_codes WHERE user_id = 15 ORDER BY created_at DESC LIMIT 3"
    );
    console.log('Updated values:', JSON.stringify(vals.rows, null, 2));

    // Rate limit count
    const rate = await pool.query(
      "SELECT COUNT(*)::int AS total FROM password_reset_codes WHERE user_id = 15 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'"
    );
    console.log('Rate limit count now:', rate.rows[0].total, '/ 5 max');
  } catch(e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error:', e.message);
  } finally {
    client.release();
    pool.end();
  }
}

main();
