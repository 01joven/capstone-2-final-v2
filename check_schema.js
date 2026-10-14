require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/db');

async function main() {
  try {
    // Check column type
    const schema = await pool.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'password_reset_codes' ORDER BY ordinal_position"
    );
    console.log('Table schema:', JSON.stringify(schema.rows, null, 2));

    // Raw timestamp comparison
    const raw = await pool.query(
      "SELECT id, created_at, created_at AT TIME ZONE 'UTC' AS utc_created, CURRENT_TIMESTAMP AS db_now, (created_at AT TIME ZONE 'UTC') > (CURRENT_TIMESTAMP - INTERVAL '1 hour') AS in_window_utc FROM password_reset_codes WHERE user_id = 15 ORDER BY created_at DESC"
    );
    console.log('\nRaw comparison:', JSON.stringify(raw.rows, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    pool.end();
  }
}

main();
