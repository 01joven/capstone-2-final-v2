const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const memorialRoutes = require('./routes/memorials');
const reservationRoutes = require('./routes/reservations');
const favoriteRoutes = require('./routes/favorites');
const paymentRoutes = require('./routes/payments');
const burialRoutes = require('./routes/burials');
const adminRoutes = require('./routes/admin');
const staffRoutes = require('./routes/staff');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  pool.query('SELECT 1')
    .then(() => res.json({ status: 'ok', database: 'connected' }))
    .catch((error) => {
      console.error('Health check database error:', error.message);
      res.status(503).json({ status: 'error', database: 'disconnected' });
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/memorials', memorialRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/burials', burialRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/staff', staffRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  }
  console.error('Unhandled request error:', error);
  return res.status(500).json({ message: 'Server error.' });
});

const validateEnvironment = () => {
  if (process.env.DATABASE_URL && !pool.isLocal) {
    let databaseUrl;
    try {
      databaseUrl = new URL(process.env.DATABASE_URL);
    } catch {
      throw new Error('DATABASE_URL is invalid. Use the PostgreSQL connection string from your database provider.');
    }

    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
      throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
    }
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace_with_')) {
    if (!pool.isLocal) {
      throw new Error('JWT_SECRET must be a private random value with at least 32 characters. Set it in backend/.env.');
    }

    const secretPath = path.join(__dirname, 'data', '.jwt_secret');
    try {
      process.env.JWT_SECRET = fs.readFileSync(secretPath, 'utf8').trim();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      try {
        fs.writeFileSync(secretPath, process.env.JWT_SECRET, { flag: 'wx', mode: 0o600 });
      } catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
        process.env.JWT_SECRET = fs.readFileSync(secretPath, 'utf8').trim();
      }
    }

    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('The local JWT secret is invalid. Delete backend/data/.jwt_secret and restart the server.');
    }
  }
};

const { ensureSeedAdmin } = require('./database/seedAdmin');

const startServer = async () => {
  validateEnvironment();
  const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
  await pool.exec(schema);
  await pool.query('SELECT 1');

  const requiredTables = [
    'users',
    'user_registration_codes',
    'admin_recovery_codes',
    'password_reset_codes',
    'memorials',
    'cemeteries',
    'burial_records',
    'reservations',
    'saved_items',
    'payments',
  ];
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [requiredTables]
  );
  const existingTables = new Set(result.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !existingTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Database tables are missing (${missingTables.join(', ')}). Run "npm run db:setup" from the project root.`);
  }

  const adminSeedResult = await ensureSeedAdmin();
  if (adminSeedResult.created) {
    console.log(`Seeded default admin account: ${adminSeedResult.user.email}`);
  }

  const server = app.listen(PORT, () => {
    const databaseType = pool.isLocal ? 'local persistent PostgreSQL' : 'PostgreSQL';
    console.log(`Backend connected to ${databaseType} and listening on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      pool.end().then(() => process.exit(0)).catch((error) => {
        console.error('Database shutdown error:', error);
        process.exit(1);
      });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
};

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error(`Backend startup failed: ${error.message}`);
    await pool.end();
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
