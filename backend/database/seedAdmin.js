const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const DEFAULT_ADMIN = {
  name: 'Admin User',
  email: 'admin@cemetery.gov',
  password: 'password123',
};

const ensureSeedAdmin = async ({
  name = DEFAULT_ADMIN.name,
  email = DEFAULT_ADMIN.email,
  password = DEFAULT_ADMIN.password,
} = {}) => {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : DEFAULT_ADMIN.email;
  const normalizedName = typeof name === 'string' ? name.trim() : DEFAULT_ADMIN.name;
  const normalizedPassword = typeof password === 'string' ? password : DEFAULT_ADMIN.password;

  if (!pool.isLocal && process.env.SEED_ADMIN !== 'true') {
    return { created: false, reason: 'non-local environment' };
  }

  if (normalizedPassword.length < 8) {
    throw new Error('Seed admin password must be at least 8 characters long.');
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = $2 LIMIT 1',
    [normalizedEmail, 'admin']
  );

  if (existing.rows.length > 0) {
    return { created: false, reason: 'already exists', email: normalizedEmail };
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, onboarding_completed, auth_version)
     VALUES ($1, $2, $3, 'admin', TRUE, 0)
     RETURNING id, name, email, role`,
    [normalizedName, normalizedEmail, passwordHash]
  );

  return {
    created: true,
    email: normalizedEmail,
    user: result.rows[0],
  };
};

const main = async () => {
  const result = await ensureSeedAdmin();

  if (result.created) {
    console.log(`Seeded admin account: ${result.user.name} <${result.user.email}>.`);
    console.log(`Login with email: ${result.user.email}`);
    console.log(`Password: ${DEFAULT_ADMIN.password}`);
    return;
  }

  if (result.reason === 'already exists') {
    console.log(`Admin account already exists for ${result.email}.`);
    return;
  }

  console.log('Local admin seed is disabled for this environment.');
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Admin seed failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { DEFAULT_ADMIN, ensureSeedAdmin };
