require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/db');

async function main() {
  try {
    // Check DB current timestamp
    const t = await pool.query("SELECT CURRENT_TIMESTAMP AS db_now, NOW() AS db_now2");
    console.log('DB Current time:', JSON.stringify(t.rows[0]));

    // How many codes are in "last 1 hour" according to DB?
    const r = await pool.query(
      "SELECT id, created_at, created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour' AS in_window FROM password_reset_codes WHERE user_id = 15 ORDER BY created_at DESC"
    );
    console.log('Code window check:', JSON.stringify(r.rows, null, 2));

    // What does count query return?
    const c = await pool.query(
      "SELECT COUNT(*)::int AS total FROM password_reset_codes WHERE user_id = 15 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'"
    );
    console.log('Rate limit count:', c.rows[0].total);
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    pool.end();
  }
}

main();
