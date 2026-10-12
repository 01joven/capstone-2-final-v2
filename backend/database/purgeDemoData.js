const pool = require('../config/db');

const DEMO_EMAIL_PATTERN = '%@memorialmap.demo';

const countOf = async (db, text, params = []) => {
  const result = await db.query(text, params);
  return Number(result.rows[0]?.count || 0);
};

const collectCounts = async (db) => ({
  demo_burial_records: await countOf(db, 'SELECT COUNT(*) FROM burial_records WHERE is_demo = TRUE'),
  demo_users: await countOf(db, 'SELECT COUNT(*) FROM users WHERE LOWER(email) LIKE $1', [DEMO_EMAIL_PATTERN]),
  demo_user_reservations: await countOf(
    db,
    `SELECT COUNT(*) FROM reservations r
     JOIN users u ON u.id = r.user_id
     WHERE LOWER(u.email) LIKE $1`,
    [DEMO_EMAIL_PATTERN]
  ),
  demo_user_saved_items: await countOf(
    db,
    `SELECT COUNT(*) FROM saved_items s
     JOIN users u ON u.id = s.user_id
     WHERE LOWER(u.email) LIKE $1`,
    [DEMO_EMAIL_PATTERN]
  ),
  user_registration_codes: await countOf(
    db,
    'SELECT COUNT(*) FROM user_registration_codes WHERE LOWER(email) LIKE $1',
    [DEMO_EMAIL_PATTERN]
  ),
  admin_recovery_codes: await countOf(
    db,
    'SELECT COUNT(*) FROM admin_recovery_codes WHERE LOWER(email) LIKE $1',
    [DEMO_EMAIL_PATTERN]
  ),
});

// Removes demo seed content so the system runs on real data only.
// The memorial site catalog is intentionally left untouched because
// reservations reference it and there is no memorial creation UI yet.
const purgeDemoData = async (db = pool, { confirm = false } = {}) => {
  const preview = await collectCounts(db);
  if (!confirm) {
    return { confirmed: false, preview };
  }

  const client = await db.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('DELETE FROM burial_records WHERE is_demo = TRUE');
    await client.query('DELETE FROM user_registration_codes WHERE LOWER(email) LIKE $1', [DEMO_EMAIL_PATTERN]);
    await client.query('DELETE FROM admin_recovery_codes WHERE LOWER(email) LIKE $1', [DEMO_EMAIL_PATTERN]);
    await client.query('DELETE FROM users WHERE LOWER(email) LIKE $1', [DEMO_EMAIL_PATTERN]);
    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw error;
  } finally {
    if (client.release) client.release();
  }

  const remaining = {
    burial_records: await countOf(db, 'SELECT COUNT(*) FROM burial_records'),
    users: await countOf(db, 'SELECT COUNT(*) FROM users'),
  };
  return { confirmed: true, deleted: preview, remaining };
};

if (require.main === module) {
  const confirm = process.argv.includes('--confirm');
  purgeDemoData(pool, { confirm })
    .then((result) => {
      if (!result.confirmed) {
        console.log('Dry run: nothing was deleted. Re-run with --confirm to delete this demo content:');
        console.log(JSON.stringify(result.preview, null, 2));
        process.exitCode = 1;
        return;
      }
      console.log('Demo data removed:');
      console.log(JSON.stringify(result.deleted, null, 2));
      console.log(`Remaining: ${result.remaining.burial_records} burial records, ${result.remaining.users} users.`);
    })
    .catch((error) => {
      console.error('Demo data purge failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { purgeDemoData };
