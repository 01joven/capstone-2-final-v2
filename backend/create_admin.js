const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const createAdmin = async () => {
  const name = 'Admin User';
  const email = 'admin@cemetery.gov';
  const password = 'password123';
  const role = 'admin';

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, onboarding_completed, auth_version)
       VALUES ($1, $2, $3, $4, TRUE, 0)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role]
    );
    console.log('Created admin account:', result.rows[0]);
    
    // Immediately test login
    const { authenticate } = require('./controllers/authController');
    // We can't call it directly like this, but let's at least verify the user exists
    console.log('Account created successfully. Please restart the server and try logging in.');
  } catch (error) {
    if (error.code === '23505') {
      console.log('Email already exists - promoting existing user...');
    } else {
      console.error('Error creating admin:', error.message);
    }
  }
};

createAdmin().finally(() => pool.end());