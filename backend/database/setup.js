const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const setupDatabase = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.exec(schema);
  console.log('Database tables and reference data are ready.');
};

setupDatabase()
  .catch((error) => {
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
