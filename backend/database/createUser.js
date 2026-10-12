const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const ALLOWED_ROLES = ['user', 'staff', 'admin'];

const createUser = async () => {
  const [, , rawName, rawEmail, rawPassword, rawRole] = process.argv;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const role = typeof rawRole === 'string' && rawRole ? rawRole.trim().toLowerCase() : 'user';

  if (!name || name.length > 100) {
    throw new Error('Usage: npm run user:create -- "Full Name" email@example.com password [user|staff|admin]');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run user:create -- "Full Name" email@example.com password [user|staff|admin]');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error('Role must be one of: user, staff, admin.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, onboarding_completed, auth_version)
       VALUES ($1, $2, $3, $4, TRUE, 0)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role]
    );
    console.log(`Created ${result.rows[0].role} account: ${result.rows[0].name} <${result.rows[0].email}>.`);
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('An account with that email already exists.');
    }
    throw error;
  }
};

createUser()
  .catch((error) => {
    console.error('Account creation failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
