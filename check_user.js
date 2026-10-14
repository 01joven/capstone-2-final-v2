require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/db');

async function main() {
  try {
    // Check if user exists
    const r = await pool.query(
      "SELECT id, email, role FROM users WHERE email = $1",
      ['romelpremacio@gmail.com']
    );
    console.log('User found:', JSON.stringify(r.rows));

    // Check recent codes
    if (r.rows.length > 0) {
      const userId = r.rows[0].id;
      const codes = await pool.query(
        'SELECT id, created_at, expires_at, used_at, attempts FROM password_reset_codes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
        [userId]
      );
      console.log('Recent codes:', JSON.stringify(codes.rows, null, 2));

      // Check rate limit count
      const rate = await pool.query(
        "SELECT COUNT(*)::int AS total FROM password_reset_codes WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'",
        [userId]
      );
      console.log('Codes in last hour (rate limit check):', rate.rows[0].total, '/ 5 max');
    }
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    pool.end();
  }
}

main();
