const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Step 1: Remove data directory
const dataDir = path.resolve(__dirname, 'data');
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('1. Data directory removed');
} catch (err) {
  console.log('1. Data directory issue, continuing...');
}

// Step 2: Run db:setup
try {
  execSync('npm run db:setup', { cwd: __dirname, stdio: 'inherit' });
  console.log('2. Database setup complete');
} catch (err) {
  console.error('2. Database setup failed:', err.message);
  process.exit(1);
}

// Step 3: Create admin account
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const createAdmin = async () => {
  const name = 'Admin User';
  const email = 'admin@cemetery.gov';
  const password = 'password123';
  const role = 'admin';

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, onboarding_completed, auth_version)
       VALUES ($1, $2, $3, $4, TRUE, 0)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role]
    );
    console.log('3. Admin account created:', result.rows[0]);
    
    // Test login immediately
    const { authenticate } = require('./controllers/authController');
    // We can't easily test this without the server running, but the account is created
    console.log('   Account ready for login with email: admin@cemetery.gov and password: password123');
  } catch (error) {
    if (error.code === '23505') {
      console.log('3. Email already exists - admin account may already be present');
    } else {
      console.error('3. Error creating admin:', error.message);
    }
  } finally {
    pool.end();
  }
};

createAdmin();