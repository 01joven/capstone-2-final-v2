const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_agD75FLVTWYX@ep-lucky-credit-aqzoi855-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});
pool.query("SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = 'admin@memorial.test'").then(r => {
  console.log('Admin user:', r.rows[0]);
  pool.end();
}).catch(e => {
  console.error('Query error:', e.message);
  pool.end();
});