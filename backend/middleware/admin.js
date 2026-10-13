const pool = require('../config/db');

const adminMiddleware = async (req, res, next) => {
  if (!req.user || !Number.isSafeInteger(req.user.id)) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows[0]?.role !== 'admin') {
      return res.status(403).json({ message: 'Administrator access is required.' });
    }
    return next();
  } catch (error) {
    console.error('Admin authorization error:', error);
    return res.status(500).json({ message: 'Could not verify administrator access.' });
  }
};

module.exports = adminMiddleware;
