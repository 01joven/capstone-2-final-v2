const pool = require('../config/db');

const promoteAdmin = async () => {
  const email = typeof process.argv[2] === 'string' ? process.argv[2].trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Pass the email address of an existing account: npm run admin:promote -- name@example.com');
  }

  const result = await pool.query(
    "UPDATE users SET role = 'admin' WHERE LOWER(email) = $1 RETURNING email",
    [email]
  );
  if (result.rows.length === 0) {
    throw new Error('No account has that email. Register the account before promoting it.');
  }

  console.log(`Administrator access enabled for ${result.rows[0].email}. Sign in again to refresh your access.`);
};

promoteAdmin()
  .catch((error) => {
    console.error('Administrator promotion failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
