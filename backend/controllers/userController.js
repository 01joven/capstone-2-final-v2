const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, profile_image_url, role, onboarding_completed, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const reservations = await pool.query(
      'SELECT COUNT(*) FROM reservations WHERE user_id = $1',
      [req.user.id]
    );

    const saved = await pool.query(
      'SELECT COUNT(*) FROM saved_items WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      ...result.rows[0],
      is_admin: result.rows[0].role === 'admin',
      is_staff: result.rows[0].role === 'staff',
      stats: {
        reservations: parseInt(reservations.rows[0].count),
        saved: parseInt(saved.rows[0].count),
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateProfile = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const { name, email, password, current_password: currentPassword } = req.body || {};
    if (req.user.role === 'admin' && (email !== undefined || password !== undefined)) {
      return res.status(403).json({
        message: 'Administrator email and password changes must be performed by a trusted system operator.',
      });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
      return res.status(400).json({ message: 'Name must contain 1 to 100 characters.' });
    }
    if (email !== undefined && (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail))) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    const wantsPasswordChange = typeof password === 'string' && password !== '';
    if (wantsPasswordChange && (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 bytes.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const current = await client.query(
      'SELECT id, name, email, password_hash, role, auth_version FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    const user = current.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'User not found.' });
    }

    const changesEmail = normalizedEmail !== undefined && normalizedEmail !== user.email;
    const sensitiveChange = changesEmail || wantsPasswordChange;

    // Changing email or password requires proof of the current password, so a stolen session alone cannot take over the account.
    if (sensitiveChange) {
      if (typeof currentPassword !== 'string' || !currentPassword) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(400).json({ message: 'Enter your current password to change your email or password.' });
      }
      const matches = await bcrypt.compare(currentPassword, user.password_hash);
      if (!matches) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(403).json({ message: 'Current password is incorrect.' });
      }
    }

    const updates = [];
    const values = [];
    if (name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(name.trim());
    }
    if (changesEmail) {
      updates.push(`email = $${values.length + 1}`);
      values.push(normalizedEmail);
    }
    if (wantsPasswordChange) {
      updates.push(`password_hash = $${values.length + 1}`);
      values.push(await bcrypt.hash(password, 12));
    }
    if (sensitiveChange) {
      updates.push('auth_version = auth_version + 1');
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'No fields to update.' });
    }

    values.push(req.user.id);
    const result = await client.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}
       RETURNING id, name, email, profile_image_url, role, auth_version`,
      values
    );
    await client.query('COMMIT');
    transactionStarted = false;

    const updated = result.rows[0];
    const response = { id: updated.id, name: updated.name, email: updated.email, profile_image_url: updated.profile_image_url, role: updated.role };
    if (sensitiveChange) {
      // Existing tokens were invalidated above; return a fresh one so this session keeps working.
      response.token = jwt.sign(
        { id: updated.id, email: updated.email, auth_version: updated.auth_version },
        process.env.JWT_SECRET,
        { expiresIn: '12h', algorithm: 'HS256', issuer: 'memorial-map', audience: 'web' }
      );
    }
    res.json(response);
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    if (client) client.release();
  }
};

const completeOnboarding = async (req, res) => {
  try {
    await pool.query('UPDATE users SET onboarding_completed = TRUE WHERE id = $1', [req.user.id]);
    res.json({ message: 'Onboarding completed.' });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getProfile, updateProfile, completeOnboarding };
