const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendVerificationCode } = require('../services/emailService');

const VERIFICATION_CODE_TTL_MINUTES = 10;
const VERIFICATION_CODE_RESEND_SECONDS = 60;
const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
const VERIFICATION_CODE_IP_LIMIT = 5;
const VERIFICATION_CODE_IP_WINDOW_MS = 60 * 60 * 1000;
const userCodeRequestsByIp = new Map();

const hashVerificationCode = (purpose, email, code) => crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(`${purpose}:${email}:${code}`)
  .digest('hex');

const validateRegistration = (body = {}) => {
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
  return { name: normalizedName, email: normalizedEmail, password: body.password };
};

const allowVerificationRequest = (requestMap, ip) => {
  const now = Date.now();
  for (const [requestIp, requests] of requestMap) {
    const recentRequests = requests.filter((requestedAt) => now - requestedAt < VERIFICATION_CODE_IP_WINDOW_MS);
    if (recentRequests.length === 0) requestMap.delete(requestIp);
    else requestMap.set(requestIp, recentRequests);
  }

  const recentIpRequests = requestMap.get(ip) || [];
  if (recentIpRequests.length >= VERIFICATION_CODE_IP_LIMIT) return false;
  requestMap.set(ip, [...recentIpRequests, now]);
  return true;
};

const validateEmailService = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, SMTP_PASS } = process.env;
  const appPassword = (SMTP_APP_PASSWORD || SMTP_PASS || '').trim();
  const port = Number(SMTP_PORT);
  return SMTP_HOST && SMTP_PORT && SMTP_USER && appPassword &&
    Number.isSafeInteger(port) && port > 0 && port <= 65535;
};

const getVerificationRequestIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

const sendUserRegistrationCode = async (req, res) => {
  const credentials = validateRegistration(req.body);
  if (credentials.error) {
    return res.status(400).json({ message: credentials.error });
  }
  const clientIp = getVerificationRequestIp(req);
  if (!allowVerificationRequest(userCodeRequestsByIp, clientIp)) {
    return res.status(429).json({ message: 'Too many code requests. Try again in about an hour.' });
  }
  if (!validateEmailService()) {
    return res.status(503).json({ message: 'Email verification is not configured. Set valid Gmail SMTP settings in backend/.env and restart the backend.' });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  let client;
  let transactionStarted = false;
  try {
    const passwordHash = await bcrypt.hash(credentials.password, 10);
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [credentials.email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'Email already registered. Please log in instead.' });
    }

    const previousCode = await client.query(
      'SELECT last_sent_at FROM user_registration_codes WHERE email = $1 FOR UPDATE',
      [credentials.email]
    );
    if (previousCode.rows.length > 0) {
      const secondsSinceLastSend = (Date.now() - new Date(previousCode.rows[0].last_sent_at).getTime()) / 1000;
      if (secondsSinceLastSend < VERIFICATION_CODE_RESEND_SECONDS) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(429).json({
          message: `Please wait ${Math.ceil(VERIFICATION_CODE_RESEND_SECONDS - secondsSinceLastSend)} seconds before requesting another code.`,
        });
      }
    }

    await client.query(
      `INSERT INTO user_registration_codes (email, name, password_hash, code_hash, expires_at, last_sent_at, attempts)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '${VERIFICATION_CODE_TTL_MINUTES} minutes', CURRENT_TIMESTAMP, 0)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           last_sent_at = EXCLUDED.last_sent_at,
           attempts = 0`,
      [credentials.email, credentials.name, passwordHash, hashVerificationCode('user-registration', credentials.email, code)]
    );
    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('User verification code rollback error:', rollbackError);
      });
    }
    console.error('Prepare user verification email error:', error);
    return res.status(500).json({ message: 'Unable to prepare the verification email.' });
  } finally {
    if (client) client.release();
  }

  try {
    await sendVerificationCode(credentials.email, code, 'user registration');
    return res.json({ message: 'Verification code sent. Check your inbox and spam folder. The code expires in 10 minutes.' });
  } catch (error) {
    await pool.query(
      'DELETE FROM user_registration_codes WHERE email = $1 AND code_hash = $2',
      [credentials.email, hashVerificationCode('user-registration', credentials.email, code)]
    ).catch((cleanupError) => {
      console.error('Failed to invalidate unsent user verification code:', cleanupError);
    });
    console.error('Send user verification email error:', error.message);
    return res.status(503).json({
      message: 'Could not send the verification email. Check the Gmail SMTP settings and App Password in backend/.env, then restart the backend.',
    });
  }
};

const register = async (req, res) => {
  const credentials = validateRegistration(req.body);
  if (credentials.error) {
    return res.status(400).json({ message: credentials.error });
  }
  const verificationCode = typeof (req.body || {}).verification_code === 'string'
    ? req.body.verification_code.trim()
    : '';
  if (!/^\d{6}$/.test(verificationCode)) {
    return res.status(400).json({ message: 'Enter the 6-digit email verification code.' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const verification = await client.query(
      `SELECT name, password_hash, code_hash, expires_at, attempts
       FROM user_registration_codes WHERE email = $1 FOR UPDATE`,
      [credentials.email]
    );
    const storedCode = verification.rows[0];
    if (!storedCode) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'Request a verification code for this email before creating your account.' });
    }
    if (new Date(storedCode.expires_at).getTime() <= Date.now()) {
      await client.query('DELETE FROM user_registration_codes WHERE email = $1', [credentials.email]);
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(410).json({ message: 'The verification code expired. Request a new code.' });
    }
    if (storedCode.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
      await client.query('DELETE FROM user_registration_codes WHERE email = $1', [credentials.email]);
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(429).json({ message: 'Too many incorrect codes. Request a new verification code.' });
    }

    const expectedHash = Buffer.from(storedCode.code_hash, 'hex');
    const submittedHash = Buffer.from(hashVerificationCode('user-registration', credentials.email, verificationCode), 'hex');
    if (expectedHash.length !== submittedHash.length || !crypto.timingSafeEqual(expectedHash, submittedHash)) {
      const nextAttempts = storedCode.attempts + 1;
      if (nextAttempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
        await client.query('DELETE FROM user_registration_codes WHERE email = $1', [credentials.email]);
        await client.query('COMMIT');
        transactionStarted = false;
        return res.status(429).json({ message: 'Too many incorrect codes. Request a new verification code.' });
      }
      await client.query('UPDATE user_registration_codes SET attempts = $1 WHERE email = $2', [nextAttempts, credentials.email]);
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(400).json({ message: 'The verification code is incorrect.' });
    }
    if (credentials.name !== storedCode.name || !await bcrypt.compare(credentials.password, storedCode.password_hash)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'The registration details changed. Request a new verification code.' });
    }

    let result;
    try {
      result = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, onboarding_completed`,
        [storedCode.name, credentials.email, storedCode.password_hash]
      );
    } catch (error) {
      if (error.code === '23505') {
        await client.query('DELETE FROM user_registration_codes WHERE email = $1', [credentials.email]);
        await client.query('COMMIT');
        transactionStarted = false;
        return res.status(409).json({ message: 'Email already registered. Please log in instead.' });
      }
      throw error;
    }

    await client.query('DELETE FROM user_registration_codes WHERE email = $1', [credentials.email]);
    await client.query('COMMIT');
    transactionStarted = false;
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, auth_version: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.status(201).json({ token, user: { ...user, is_admin: false } });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('User registration rollback error:', rollbackError);
      });
    }
    console.error('Register user error:', error);
    return res.status(500).json({ message: 'Unable to create user account.' });
  } finally {
    if (client) client.release();
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
      return res.status(403).json({
        message: 'Unauthorized administrator account. Please use an authorized administrator account.',
      });
    }
    if (expectedRole === 'user' && user.role !== 'user') {
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
        is_admin: user.role === 'admin',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const login = authenticate('user');
const loginAdmin = authenticate('admin');

module.exports = {
  register,
  sendUserRegistrationCode,
  login,
  loginAdmin,
};
