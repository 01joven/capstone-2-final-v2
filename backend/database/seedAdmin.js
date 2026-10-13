const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// No default password is stored in the code. Seeding requires ADMIN_SEED_PASSWORD
// (at least 12 characters) in backend/.env, and only runs on the local database
// or when SEED_ADMIN=true is set explicitly.
const DEFAULT_ADMIN = {
  name: 'Admin User',
  email: (process.env.ADMIN_SEED_EMAIL || 'admin@cemetery.gov').trim().toLowerCase(),
};

const ensureSeedAdmin = async ({
  name = DEFAULT_ADMIN.name,
  email = DEFAULT_ADMIN.email,
  password = process.env.ADMIN_SEED_PASSWORD,
} = {}) => {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : DEFAULT_ADMIN.email;
  const normalizedName = typeof name === 'string' ? name.trim() : DEFAULT_ADMIN.name;

  if (!pool.isLocal && process.env.SEED_ADMIN !== 'true') {
    return { created: false, reason: 'non-local environment' };
  }

  if (typeof password !== 'string' || password.length < 12) {
    return { created: false, reason: 'missing password' };
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = $2 LIMIT 1',
    [normalizedEmail, 'admin']
  );

  if (existing.rows.length > 0) {
    return { created: false, reason: 'already exists', email: normalizedEmail };
  }

  const passwordHash = await bcrypt.hash(password, 12);
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
    console.log(`Seeded admin account: ${result.user.name} <${result.user.email}> using the password from ADMIN_SEED_PASSWORD.`);
    return;
  }
  if (result.reason === 'already exists') {
    console.log(`Admin account already exists for ${result.email}.`);
    return;
  }
  if (result.reason === 'missing password') {
    console.log('Set ADMIN_SEED_PASSWORD (at least 12 characters) in backend/.env to seed an admin account.');
    return;
  }
  console.log('Admin seed is disabled for this environment.');
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
