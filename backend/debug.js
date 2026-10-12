const pool = require('./config/db');

pool.query(
  'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
  ['admin@cemetery.gov'],
  (err, res) => {
    if (err) {
      console.error('Query error:', err);
      pool.end();
      return;
    }
    console.log('User found:', res.rows.length > 0);
    if (res.rows.length > 0) {
      console.log('Role:', res.rows[0].role);
      console.log('Password hash exists:', !!res.rows[0].password_hash);
      console.log('Password hash length:', res.rows[0].password_hash ? res.rows[0].password_hash.length : 'N/A');
    }
    pool.end();
  }
);