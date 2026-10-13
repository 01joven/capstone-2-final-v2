const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const header = req.header('Authorization');
  const token = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'memorial-map',
      audience: 'web',
    });
    if (!decoded || !Number.isSafeInteger(decoded.id)) {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    const result = await pool.query(
      'SELECT role, auth_version, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    const currentUser = result.rows[0];
    if (!currentUser || Number(decoded.auth_version || 0) !== Number(currentUser.auth_version || 0)) {
      return res.status(401).json({ message: 'Your session is no longer valid. Please sign in again.' });
    }
    if (currentUser.is_active === false) {
      return res.status(401).json({ message: 'This account has been deactivated.' });
    }
    req.user = { ...decoded, role: currentUser.role };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    console.error('Authentication lookup error:', error);
    res.status(500).json({ message: 'Unable to verify the current session.' });
  }
};

module.exports = authMiddleware;
