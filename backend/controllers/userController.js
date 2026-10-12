const bcrypt = require('bcryptjs');
const pool = require('../config/db');

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
  try {
    const { name, email, password } = req.body || {};
    if (req.user.role === 'admin' && (email !== undefined || password !== undefined)) {
      return res.status(403).json({
        message: 'Administrator email and password changes require the verified Account Security flow.',
      });
    }
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ message: 'Name must contain 1 to 100 characters.' });
      }
      updates.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }
    if (email !== undefined) {
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }
      updates.push(`email = $${paramCount++}`);
      values.push(normalizedEmail);
    }
    if (password !== undefined && password !== '') {
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    values.push(req.user.id);
    let result;
    try {
      result = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, name, email, profile_image_url, role`,
        values
      );
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Email already registered.' });
      }
      throw error;
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error.' });
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
