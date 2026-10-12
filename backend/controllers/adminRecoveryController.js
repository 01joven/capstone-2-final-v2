const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendVerificationCode } = require('../services/emailService');

const CODE_TTL_MINUTES = 10;
const CODE_RESEND_SECONDS = 60;
const CODE_MAX_ATTEMPTS = 5;
const IP_LIMIT = 5;
const IP_WINDOW_MS = 60 * 60 * 1000;
const requestsByIp = new Map();

const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validSmtp = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, SMTP_PASS } = process.env;
  const appPassword = (SMTP_APP_PASSWORD || SMTP_PASS || '').trim();
  const port = Number(SMTP_PORT);
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && appPassword) &&
    Number.isSafeInteger(port) && port > 0 && port <= 65535;
};
const requestIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const allowRequest = (ip) => {
  const now = Date.now();
  for (const [key, timestamps] of requestsByIp) {
    const recent = timestamps.filter((timestamp) => now - timestamp < IP_WINDOW_MS);
    if (recent.length) requestsByIp.set(key, recent);
    else requestsByIp.delete(key);
  }
  const recent = requestsByIp.get(ip) || [];
  if (recent.length >= IP_LIMIT) return false;
  requestsByIp.set(ip, [...recent, now]);
  return true;
};
const makeCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const hashCode = (purpose, email, code) => crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(`${purpose}:${email}:${code}`)
  .digest('hex');
const codeMatches = (storedHash, purpose, email, code) => {
  const expected = Buffer.from(storedHash, 'hex');
  const submitted = Buffer.from(hashCode(purpose, email, code), 'hex');
  return expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);
};
const sendCodes = async (messages, hashes) => {
  try {
    for (const message of messages) {
      await sendVerificationCode(message.email, message.code, message.label);
    }
    return true;
  } catch (error) {
    for (const item of hashes) {
      await pool.query(
        'DELETE FROM admin_recovery_codes WHERE email = $1 AND purpose = $2 AND code_hash = $3',
        [item.email, item.purpose, item.hash]
      ).catch((cleanupError) => console.error('Failed to invalidate unsent administrator code:', cleanupError));
    }
    console.error('Send administrator verification email error:', error.message);
    return false;
  }
};
const cooldownResponse = async (client, email, purpose) => {
  const existing = await client.query(
    'SELECT last_sent_at FROM admin_recovery_codes WHERE email = $1 AND purpose = $2 FOR UPDATE',
    [email, purpose]
  );
  if (!existing.rows.length) return null;
  const remaining = CODE_RESEND_SECONDS -
    (Date.now() - new Date(existing.rows[0].last_sent_at).getTime()) / 1000;
  return remaining > 0 ? Math.ceil(remaining) : null;
};
const saveCode = (client, email, purpose, code, pendingEmail = null) => client.query(
  `INSERT INTO admin_recovery_codes
     (email, purpose, code_hash, expires_at, last_sent_at, attempts, pending_email)
   VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '${CODE_TTL_MINUTES} minutes', CURRENT_TIMESTAMP, 0, $4)
   ON CONFLICT (email, purpose) DO UPDATE SET
     code_hash = EXCLUDED.code_hash,
     expires_at = EXCLUDED.expires_at,
     last_sent_at = EXCLUDED.last_sent_at,
     attempts = 0,
     pending_email = EXCLUDED.pending_email`,
  [email, purpose, hashCode(purpose, email, code), pendingEmail]
);

const requestAdminPasswordReset = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ message: 'Enter a valid administrator email address.' });
  if (!allowRequest(requestIp(req))) return res.status(429).json({ message: 'Too many recovery requests. Try again in about an hour.' });
  if (!validSmtp()) {
    return res.status(503).json({ message: 'Email verification is not configured. Set valid Gmail SMTP settings in backend/.env and restart the backend.' });
  }

  const code = makeCode();
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const admin = await client.query("SELECT id FROM users WHERE LOWER(email) = $1 AND role = 'admin'", [email]);
    if (!admin.rows.length) {
      await client.query('COMMIT');
      return res.json({ message: 'If this is an administrator account, a recovery code has been sent to its registered email.' });
    }

    const cooldown = await cooldownResponse(client, email, 'admin-password-reset');
    if (cooldown) {
      await client.query('COMMIT');
      return res.json({ message: 'If this is an administrator account, a recovery code has been sent to its registered email. The code expires in 10 minutes.' });
    }
    await saveCode(client, email, 'admin-password-reset', code);
    await client.query('COMMIT');
    const hash = hashCode('admin-password-reset', email, code);
    if (!await sendCodes(
      [{ email, code, label: 'administrator password recovery' }],
      [{ email, purpose: 'admin-password-reset', hash }]
    )) {
      return res.status(503).json({ message: 'Could not send the recovery email. Check the Gmail SMTP settings and App Password in backend/.env.' });
    }
    return res.json({ message: 'If this is an administrator account, a recovery code has been sent to its registered email. The code expires in 10 minutes.' });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('Request administrator password recovery error:', error);
    return res.status(500).json({ message: 'Unable to prepare administrator recovery.' });
  } finally {
    client?.release();
  }
};

const resetAdminPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const password = req.body?.new_password;
  if (!validEmail(email) || !/^\d{6}$/.test(code) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Enter the registered email, 6-digit code, and a password of at least 8 characters.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const account = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 AND role = 'admin' FOR UPDATE",
      [email]
    );
    const challenge = await client.query(
      `SELECT code_hash, expires_at, attempts FROM admin_recovery_codes
       WHERE email = $1 AND purpose = 'admin-password-reset' FOR UPDATE`,
      [email]
    );
    const stored = challenge.rows[0];
    if (!account.rows.length || !stored) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'The recovery code is invalid or expired. Request a new code.' });
    }
    if (new Date(stored.expires_at).getTime() <= Date.now()) {
      await client.query('DELETE FROM admin_recovery_codes WHERE email = $1 AND purpose = $2', [email, 'admin-password-reset']);
      await client.query('COMMIT');
      return res.status(410).json({ message: 'The recovery code expired. Request a new code.' });
    }
    if (stored.attempts >= CODE_MAX_ATTEMPTS) {
      await client.query('DELETE FROM admin_recovery_codes WHERE email = $1 AND purpose = $2', [email, 'admin-password-reset']);
      await client.query('COMMIT');
      return res.status(429).json({ message: 'Too many incorrect codes. Request a new recovery code.' });
    }
    if (!codeMatches(stored.code_hash, 'admin-password-reset', email, code)) {
      const attempts = stored.attempts + 1;
      if (attempts >= CODE_MAX_ATTEMPTS) {
        await client.query('DELETE FROM admin_recovery_codes WHERE email = $1 AND purpose = $2', [email, 'admin-password-reset']);
        await client.query('COMMIT');
        return res.status(429).json({ message: 'Too many incorrect codes. Request a new recovery code.' });
      }
      await client.query(
        "UPDATE admin_recovery_codes SET attempts = $1 WHERE email = $2 AND purpose = 'admin-password-reset'",
        [attempts, email]
      );
      await client.query('COMMIT');
      return res.status(400).json({ message: 'The recovery code is incorrect.' });
    }
    await client.query(
      'UPDATE users SET password_hash = $1, auth_version = auth_version + 1 WHERE id = $2',
      [passwordHash, account.rows[0].id]
    );
    await client.query('DELETE FROM admin_recovery_codes WHERE email = $1', [email]);
    await client.query('COMMIT');
    return res.json({ message: 'Administrator password changed. Sign in using the new password.' });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('Reset administrator password error:', error);
    return res.status(500).json({ message: 'Unable to reset administrator password.' });
  } finally {
    client?.release();
  }
};

const requestAdminEmailChange = async (req, res) => {
  const newEmail = normalizeEmail(req.body?.new_email);
  const password = req.body?.current_password;
  if (!validEmail(newEmail) || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Enter a valid new email and your current password.' });
  }
  if (!validSmtp()) {
    return res.status(503).json({ message: 'Email verification is not configured. Set valid Gmail SMTP settings in backend/.env and restart the backend.' });
  }
  if (!allowRequest(requestIp(req))) return res.status(429).json({ message: 'Too many recovery requests. Try again in about an hour.' });

  const oldCode = makeCode();
  const newCode = makeCode();
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const accountResult = await client.query(
      "SELECT id, LOWER(email) AS email, password_hash FROM users WHERE id = $1 AND role = 'admin' FOR UPDATE",
      [req.user.id]
    );
    const account = accountResult.rows[0];
    if (!account || !await bcrypt.compare(password, account.password_hash)) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    if (newEmail === account.email.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'The new email must be different from the current email.' });
    }
    const collision = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [newEmail]);
    if (collision.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'That email is already associated with an account.' });
    }
    const oldCooldown = await cooldownResponse(client, account.email, 'admin-email-change-old');
    const newCooldown = await cooldownResponse(client, newEmail, 'admin-email-change-new');
    if (oldCooldown || newCooldown) {
      await client.query('ROLLBACK');
      const cooldown = Math.max(oldCooldown || 0, newCooldown || 0);
      return res.status(429).json({ message: `Please wait ${cooldown} seconds before requesting new codes.` });
    }
    await saveCode(client, account.email, 'admin-email-change-old', oldCode, newEmail);
    await saveCode(client, newEmail, 'admin-email-change-new', newCode, account.email);
    await client.query('COMMIT');
    const oldHash = hashCode('admin-email-change-old', account.email, oldCode);
    const newHash = hashCode('admin-email-change-new', newEmail, newCode);
    if (!await sendCodes(
      [
        { email: account.email, code: oldCode, label: 'administrator email change confirmation' },
        { email: newEmail, code: newCode, label: 'administrator new email verification' },
      ],
      [
        { email: account.email, purpose: 'admin-email-change-old', hash: oldHash },
        { email: newEmail, purpose: 'admin-email-change-new', hash: newHash },
      ]
    )) {
      return res.status(503).json({ message: 'Could not send both verification emails. Check the Gmail SMTP settings and request new codes.' });
    }
    return res.json({ message: 'Verification codes were sent to both the current and new email addresses. They expire in 10 minutes.' });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('Request administrator email change error:', error);
    return res.status(500).json({ message: 'Unable to prepare administrator email change.' });
  } finally {
    client?.release();
  }
};

const confirmAdminEmailChange = async (req, res) => {
  const oldCode = typeof req.body?.current_email_code === 'string' ? req.body.current_email_code.trim() : '';
  const newCode = typeof req.body?.new_email_code === 'string' ? req.body.new_email_code.trim() : '';
  if (!/^\d{6}$/.test(oldCode) || !/^\d{6}$/.test(newCode)) {
    return res.status(400).json({ message: 'Enter both 6-digit verification codes.' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const accountResult = await client.query(
      "SELECT id, email FROM users WHERE id = $1 AND role = 'admin' FOR UPDATE",
      [req.user.id]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Administrator account not found.' });
    }
    const oldEmail = account.email.toLowerCase();
    const challenges = await client.query(
      `SELECT email, purpose, code_hash, expires_at, attempts, pending_email
       FROM admin_recovery_codes
       WHERE (email = $1 AND purpose = 'admin-email-change-old')
          OR (purpose = 'admin-email-change-new' AND pending_email = $1)
       FOR UPDATE`,
      [oldEmail]
    );
    const oldChallenge = challenges.rows.find((row) => row.purpose === 'admin-email-change-old');
    const newChallenge = challenges.rows.find((row) => row.purpose === 'admin-email-change-new');
    if (!oldChallenge || !newChallenge || oldChallenge.pending_email !== newChallenge.email) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'The email-change codes are missing or expired. Request new codes.' });
    }
    const now = Date.now();
    if ([oldChallenge, newChallenge].some((challenge) => new Date(challenge.expires_at).getTime() <= now)) {
      await client.query(
        'DELETE FROM admin_recovery_codes WHERE (email = $1 AND purpose = $2) OR (email = $3 AND purpose = $4)',
        [oldEmail, 'admin-email-change-old', newChallenge.email, 'admin-email-change-new']
      );
      await client.query('COMMIT');
      return res.status(410).json({ message: 'The email-change codes expired. Request new codes.' });
    }
    if ([oldChallenge, newChallenge].some((challenge) => challenge.attempts >= CODE_MAX_ATTEMPTS)) {
      await client.query(
        'DELETE FROM admin_recovery_codes WHERE (email = $1 AND purpose = $2) OR (email = $3 AND purpose = $4)',
        [oldEmail, 'admin-email-change-old', newChallenge.email, 'admin-email-change-new']
      );
      await client.query('COMMIT');
      return res.status(429).json({ message: 'Too many incorrect codes. Request new codes.' });
    }

    const validOld = codeMatches(oldChallenge.code_hash, oldChallenge.purpose, oldEmail, oldCode);
    const validNew = codeMatches(newChallenge.code_hash, newChallenge.purpose, newChallenge.email, newCode);
    if (!validOld || !validNew) {
      for (const challenge of [oldChallenge, newChallenge]) {
        const submitted = challenge.purpose === 'admin-email-change-old' ? oldCode : newCode;
        if (!codeMatches(challenge.code_hash, challenge.purpose, challenge.email, submitted)) {
          const nextAttempts = challenge.attempts + 1;
          if (nextAttempts >= CODE_MAX_ATTEMPTS) {
            await client.query(
              'DELETE FROM admin_recovery_codes WHERE (email = $1 AND purpose = $2) OR (email = $3 AND purpose = $4)',
              [oldEmail, 'admin-email-change-old', newChallenge.email, 'admin-email-change-new']
            );
            await client.query('COMMIT');
            return res.status(429).json({ message: 'Too many incorrect codes. Request new codes.' });
          }
          await client.query(
            'UPDATE admin_recovery_codes SET attempts = $1 WHERE email = $2 AND purpose = $3',
            [nextAttempts, challenge.email, challenge.purpose]
          );
        }
      }
      await client.query('COMMIT');
      return res.status(400).json({ message: 'One or both verification codes are incorrect.' });
    }

    const collision = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [newChallenge.email]);
    if (collision.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'That email is already associated with an account.' });
    }
    await client.query('UPDATE users SET email = $1 WHERE id = $2', [newChallenge.email, account.id]);
    await client.query(
      'DELETE FROM admin_recovery_codes WHERE (email = $1 AND purpose = $2) OR (email = $3 AND purpose = $4)',
      [oldEmail, 'admin-email-change-old', newChallenge.email, 'admin-email-change-new']
    );
    await client.query('COMMIT');
    return res.json({ message: 'Administrator email updated after both addresses were verified.', email: newChallenge.email });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      return res.status(409).json({ message: 'That email is already associated with an account.' });
    }
    console.error('Confirm administrator email change error:', error);
    return res.status(500).json({ message: 'Unable to confirm administrator email change.' });
  } finally {
    client?.release();
  }
};

module.exports = {
  requestAdminPasswordReset,
  resetAdminPassword,
  requestAdminEmailChange,
  confirmAdminEmailChange,
};
