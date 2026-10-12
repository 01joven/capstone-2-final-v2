const pool = require('../config/db');

const STAFF_ROLES = ['admin', 'staff'];

const requireStaff = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!STAFF_ROLES.includes(result.rows[0]?.role)) {
      return res.status(403).json({ message: 'Staff access is required.' });
    }
    return next();
  } catch (error) {
    console.error('Staff authorization error:', error);
    return res.status(500).json({ message: 'Could not verify staff access.' });
  }
};

module.exports = requireStaff;
