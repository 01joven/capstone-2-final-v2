const pool = require('../config/db');

const changeAdminEmail = async () => {
  const oldEmail = typeof process.argv[2] === 'string' ? process.argv[2].trim().toLowerCase() : '';
  const newEmail = typeof process.argv[3] === 'string' ? process.argv[3].trim().toLowerCase() : '';
  const verified = process.argv[4] === '--verified-authorized';
  if (!verified) {
    throw new Error('Only proceed after offline identity and authorization checks. Confirm with --verified-authorized.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oldEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new Error('Usage: npm run admin:change-email -- old-admin@example.com new-admin@example.com --verified-authorized');
  }
  if (oldEmail === newEmail) throw new Error('The new email must differ from the current email.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 AND role = 'admin' FOR UPDATE",
      [oldEmail]
    );
    if (!admin.rows.length) throw new Error('No administrator account has the current email.');
    const collision = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [newEmail]);
    if (collision.rows.length) throw new Error('The new email is already associated with an account.');
    await client.query(
      'UPDATE users SET email = $1, auth_version = auth_version + 1 WHERE id = $2',
      [newEmail, admin.rows[0].id]
    );
    await client.query('DELETE FROM admin_recovery_codes WHERE email = $1', [oldEmail]);
    await client.query('COMMIT');
    console.log(`Administrator email updated to ${newEmail}; prior sessions have been revoked.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

changeAdminEmail()
  .catch((error) => {
    console.error('Administrator email change failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
