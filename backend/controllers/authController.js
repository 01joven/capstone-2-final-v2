const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendEmail } = require('../services/emailService');

const validateRegistration = (body = {}, role = 'user') => {
  const normalizedName = typeof body.name === 'string' ? body.name.trim() : '';
  const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!normalizedName || !normalizedEmail || typeof body.password !== 'string') {
    return { error: 'All fields are required.' };
  }
  if (normalizedName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { error: 'Enter a valid name and email address.' };
  }
  if (body.password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  return { name: normalizedName, email: normalizedEmail, password: body.password, role };
};

const register = async (req, res) => {
  const credentials = validateRegistration(req.body);
  if (credentials.error) {
    return res.status(400).json({ message: credentials.error });
  }

  try {
    const passwordHash = await bcrypt.hash(credentials.password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, onboarding_completed, role)
       VALUES ($1, $2, $3, FALSE, $4)
       RETURNING id, name, email, onboarding_completed, role`,
      [credentials.name, credentials.email, passwordHash, credentials.role]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, auth_version: user.auth_version },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ token, user: { ...user, is_admin: user.role === 'admin', is_staff: user.role === 'staff' } });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already registered. Please log in instead.' });
    }
    console.error('Register user error:', error);
    return res.status(500).json({ message: 'Unable to create user account.' });
  }
};

const authenticate = (expectedRole) => async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const result = await pool.query(
      'SELECT id, name, email, password_hash, onboarding_completed, role, auth_version FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (expectedRole === 'admin' && user.role !== 'admin') {
      if (user.role === 'staff') {
        return res.status(403).json({ message: 'Please use Staff Access to sign in to this account.' });
      }
      return res.status(403).json({
        message: 'Unauthorized administrator account. Please use an authorized administrator account.',
      });
    }
    if (expectedRole === 'staff' && user.role !== 'staff') {
      if (user.role === 'admin') {
        return res.status(403).json({ message: 'Please use Administrator Access to sign in to this account.' });
      }
      return res.status(403).json({ message: 'This account does not have staff access.' });
    }
    if (expectedRole === 'user' && user.role !== 'user') {
      if (user.role === 'staff') {
        return res.status(403).json({ message: 'Please use Staff Access to sign in to this account.' });
      }
      return res.status(403).json({ message: 'Please use Administrator Access to sign in to this account.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, auth_version: user.auth_version },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        onboarding_completed: user.onboarding_completed,
        role: user.role,
        is_admin: user.role === 'admin',
        is_staff: user.role === 'staff',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const login = authenticate('user');
const loginAdmin = authenticate('admin');
const loginStaff = authenticate('staff');

module.exports = {
  register,
  login,
  loginAdmin,
  loginStaff,
};