const pool = require('./config/db');

pool.query('SELECT id, name, email, role FROM users', [], (err, res) => {
  if (err) {
    console.error('Query error:', err.message);
  } else {
    console.log('Users:', res.rows);
  }
  pool.end();
});