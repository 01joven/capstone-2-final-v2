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

// Fail closed in production: never fall back to an embedded database on a hosted server.
if (process.env.NODE_ENV === 'production' && (!connectionString || isExampleConnection)) {
  throw new Error('NODE_ENV=production requires a real DATABASE_URL. Refusing to start with the local embedded database.');
}

if (!connectionString || isExampleConnection) {
  // PGLITE_DATA_DIR lets tests run fully in memory (':memory:') so they never
  // touch the developer's local data directory.
  const dataDirectory = process.env.PGLITE_DATA_DIR || path.resolve(__dirname, '..', 'data');
  const inMemory = dataDirectory === ':memory:';
  if (!inMemory) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
  const database = inMemory ? new PGlite() : new PGlite(dataDirectory);

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

  // Certificate verification is on by default. Set DATABASE_SSL_REJECT_UNAUTHORIZED=false
  // only if your provider's certificate cannot be verified (and accept the MITM risk).
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (!useSsl) {
    const message = 'Remote DATABASE_URL does not enable TLS (missing ?sslmode=require and DATABASE_SSL=true).';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${message} Refusing to connect without TLS in production.`);
    }
    console.warn(`Warning: ${message} Connection will be unencrypted.`);
  }

  if (!rejectUnauthorized) {
    console.warn('Warning: DATABASE_SSL_REJECT_UNAUTHORIZED=false disables TLS certificate verification (MITM risk).');
  }

  const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized } : false,
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
