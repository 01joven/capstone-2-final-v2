const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_agD75FLVTWYX@ep-lucky-credit-aqzoi855-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function main() {
  const users = await pool.query("SELECT id, name, email, role, is_active FROM users");
  console.log('Users in DB:');
  console.log(users.rows);

  const codes = await pool.query("SELECT id, user_id, code_hash, attempts, created_at, expires_at, used_at FROM password_reset_codes ORDER BY id DESC LIMIT 10");
  console.log('\nRecent password reset codes:');
  console.log(codes.rows);

  pool.end();
}
main().catch(e => { console.error(e); pool.end(); });