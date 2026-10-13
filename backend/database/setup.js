const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const setupDatabase = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.exec(schema);
  // Best-effort: validate NOT VALID constraints added by schema.sql so new
  // installs enforce checks on all rows. Warns (does not fail) if legacy
  // rows violate constraints.
  for (const name of ['users_role_check', 'reservations_status_check', 'payments_status_check']) {
    try {
      const table = name.split('_')[0] === 'users' ? 'users'
        : name.startsWith('reservations') ? 'reservations' : 'payments';
      await pool.query(`ALTER TABLE ${table} VALIDATE CONSTRAINT ${name}`);
    } catch (error) {
      console.warn(`Could not validate constraint ${name}: ${error.message}`);
    }
  }
  console.log('Database tables and reference data are ready.');
};

setupDatabase()
  .catch((error) => {
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
