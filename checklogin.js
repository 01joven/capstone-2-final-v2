// Diagnostic script: credentials live in backend/.env — never hardcode secrets in source.
require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Add it to backend/.env before running this script.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main() {
  const users = await pool.query("SELECT id, name, email, role, is_active FROM users");
  console.log('Users in DB:');
  console.log(users.rows);

  const codes = await pool.query("SELECT id, user_id, code_hash, attempts, created_at, expires_at, used_at FROM password_reset_codes ORDER BY id DESC LIMIT 10");
  console.log('\nRecent password reset codes:');
  console.log(codes.rows);

  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
