require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/db');
const crypto = require('crypto');

const hashResetCode = (code) => crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(code)
  .digest('hex');

async function test() {
  const userId = Number(process.env.TEST_USER_ID || 15);
  const code = process.env.TEST_RESET_CODE || '777888';

  // 1. Insert a code with CURRENT_TIMESTAMP + INTERVAL '10 minutes'
  await pool.query("UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1", [userId]);
  await pool.query("INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '10 minutes')", [userId, hashResetCode(code)]);
  console.log('Inserted test code:', code);

  // 2. Query with the new SQL condition
  const resetResult = await pool.query(
    `SELECT id, code_hash, attempts, (expires_at > CURRENT_TIMESTAMP) AS is_valid
     FROM password_reset_codes
     WHERE user_id = $1 AND used_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );
  const reset = resetResult.rows[0];
  console.log('Reset record:', { id: reset.id, is_valid: reset.is_valid, attempts: reset.attempts });

  // 3. Verify hash
  const submittedHash = Buffer.from(hashResetCode(code), 'hex');
  const expectedHash = Buffer.from(reset.code_hash, 'hex');
  const codeMatches = submittedHash.length === expectedHash.length && crypto.timingSafeEqual(submittedHash, expectedHash);
  console.log('Code matches?', codeMatches);

  if (reset.is_valid && codeMatches) {
    console.log('SUCCESS! Verification passed without any timezone issue!');
  } else {
    console.error('FAILED!');
  }

  pool.end();
}
test().catch(e => { console.error(e); pool.end(); });
