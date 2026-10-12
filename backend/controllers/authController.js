const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendEmail } = require('../services/emailService');

const PASSWORD_RESET_MESSAGE = 'If an account exists for that email, a password reset code will be sent.';

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

const requestPasswordReset = async (req, res) => {
  const email = typeof (req.body || {}).email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  let client;
  let resetCodeId;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const accountResult = await client.query(
      `SELECT id, name, email FROM users
       WHERE LOWER(email) = $1 AND role IN ('user', 'staff', 'admin')
       FOR UPDATE`,
      [email]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ message: PASSWORD_RESET_MESSAGE });
    }

    const cooldownResult = await client.query(
      `SELECT id FROM password_reset_codes
       WHERE user_id = $1 AND used_at IS NULL
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
       ORDER BY created_at DESC LIMIT 1`,
      [account.id]
    );
    if (cooldownResult.rows.length > 0) {
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ message: PASSWORD_RESET_MESSAGE });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    await client.query(
      `UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND used_at IS NULL`,
      [account.id]
    );
    const codeResult = await client.query(
      `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
       RETURNING id`,
      [account.id, codeHash]
    );
    resetCodeId = codeResult.rows[0].id;
    await client.query('COMMIT');
    transactionStarted = false;
    client.release();
    client = null;

    try {
      const emailResult = await sendEmail({
        to: account.email,
        subject: 'Your password reset code',
        text: `Hello ${account.name},\n\nYour password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
        html: `<p>Hello ${escapeHtml(account.name)},</p><p>Your password reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
      });
      if (emailResult?.error) throw new Error(`Password reset email was rejected: ${emailResult.error.message}`);
    } catch (emailError) {
      await pool.query(
        'UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [resetCodeId]
      );
      console.error('Password reset email delivery error:', emailError);
      return res.status(503).json({ message: 'Password recovery email could not be sent. Please contact the system operator.' });
    }

    return res.json({ message: PASSWORD_RESET_MESSAGE });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Password reset request rollback error:', rollbackError);
      });
    }
    console.error('Password reset request error:', error);
    return res.status(500).json({ message: 'Unable to process the password reset request.' });
  } finally {
    if (client) client.release();
  }
};

const resetPassword = async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const newPassword = body.new_password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code) ||
      typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ message: 'Enter a valid email, six-digit code, and a password of at least 8 characters and no more than 72 bytes.' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const accountResult = await client.query(
      `SELECT id, role FROM users
       WHERE LOWER(email) = $1 AND role IN ('user', 'staff', 'admin')
       FOR UPDATE`,
      [email]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'The reset code is invalid or expired. Request a new code and try again.' });
    }

    const resetResult = await client.query(
      `SELECT id, code_hash, attempts, expires_at
       FROM password_reset_codes
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1 FOR UPDATE`,
      [account.id]
    );
    const reset = resetResult.rows[0];
    if (!reset || Number(reset.attempts) >= 5 || new Date(reset.expires_at).getTime() <= Date.now()) {
      if (reset) {
        await client.query(
          'UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
          [reset.id]
        );
      }
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(400).json({ message: 'The reset code is invalid or expired. Request a new code and try again.' });
    }

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const submittedHash = Buffer.from(codeHash, 'hex');
    const expectedHash = Buffer.from(reset.code_hash, 'hex');
    const codeMatches = submittedHash.length === expectedHash.length &&
      crypto.timingSafeEqual(submittedHash, expectedHash);
    if (!codeMatches) {
      const attempts = Number(reset.attempts) + 1;
      await client.query(
        `UPDATE password_reset_codes
         SET attempts = $1, used_at = CASE WHEN $1 >= 5 THEN CURRENT_TIMESTAMP ELSE used_at END
         WHERE id = $2`,
        [attempts, reset.id]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(400).json({
        message: attempts >= 5
          ? 'Too many incorrect attempts. Request a new reset code.'
          : 'The reset code is invalid or expired. Request a new code and try again.',
      });
    }

    if (account.role === 'admin' && newPassword.length < 12) {
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(400).json({ message: 'Administrator passwords must be at least 12 characters.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await client.query(
      `UPDATE users SET password_hash = $1, auth_version = auth_version + 1
       WHERE id = $2`,
      [passwordHash, account.id]
    );
    await client.query(
      'UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [reset.id]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Password reset rollback error:', rollbackError);
      });
    }
    console.error('Password reset error:', error);
    return res.status(500).json({ message: 'Unable to reset the password.' });
  } finally {
    if (client) client.release();
  }
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

module.exports = {
  register,
  login,
  loginAdmin,
  loginStaff,
  requestPasswordReset,
  resetPassword,
};