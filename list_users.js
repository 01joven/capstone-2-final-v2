require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/db');

async function main() {
  try {
    const r = await pool.query(
      "SELECT id, name, email, role, is_active FROM users ORDER BY role, id"
    );
    console.log('All users:', JSON.stringify(r.rows, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    pool.end();
  }
}

main();
