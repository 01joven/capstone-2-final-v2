const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { PGlite } = require('@electric-sql/pglite');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const connectionString = process.env.DATABASE_URL;
const isExampleConnection = (() => {
  if (!connectionString) return true;
  try {
    const url = new URL(connectionString);
    return ['host', 'database'].includes(url.hostname.toLowerCase()) ||
      ['user', 'password'].includes(url.username.toLowerCase()) ||
      ['user', 'password'].includes(url.password.toLowerCase());
  } catch {
    return false;
  }
})();

if (!connectionString || isExampleConnection) {
  const dataDirectory = path.resolve(__dirname, '..', 'data');
  fs.mkdirSync(dataDirectory, { recursive: true });
  const database = new PGlite(dataDirectory);

  module.exports = {
    isLocal: true,
    query: async (...args) => {
      await database.waitReady;
      return database.query(...args);
    },
    exec: async (...args) => {
      await database.waitReady;
      return database.exec(...args);
    },
    connect: async () => {
      await database.waitReady;
      return {
        query: (...args) => database.query(...args),
        release: () => {},
      };
    },
    end: () => database.close(),
  };
} else {
let useSsl = process.env.DATABASE_SSL === 'true';
try {
  useSsl = new URL(connectionString).searchParams.get('sslmode') === 'require' || useSsl;
} catch {
  // The server startup check reports malformed connection strings clearly.
}

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

module.exports = Object.assign(pool, {
  isLocal: false,
  exec: (query) => pool.query(query),
});
}
