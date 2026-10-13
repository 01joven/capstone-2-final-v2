const pool = require('../config/db');

const promoteStaff = async () => {
  const email = typeof process.argv[2] === 'string' ? process.argv[2].trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Pass the email address of an existing account: npm run staff:promote -- name@example.com');
  }

  const result = await pool.query(
    "UPDATE users SET role = 'staff', auth_version = auth_version + 1 WHERE LOWER(email) = $1 RETURNING email",
    [email]
  );
  if (result.rows.length === 0) {
    throw new Error('No account has that email. Register or create the account before promoting it.');
  }

  console.log(`Staff access enabled for ${result.rows[0].email}. Sign in again to refresh access.`);
};

promoteStaff()
  .catch((error) => {
    console.error('Staff promotion failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
