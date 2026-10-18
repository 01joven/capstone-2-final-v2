const express = require('express');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter, emailFrom } = require('../middleware/rateLimit');
const {
  loginAdmin,
  loginStaff,
  logout,
  requestPasswordReset,
  resetPassword,
} = require('../controllers/authController');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ipKey = (req) => `ip:${req.ip}`;

const loginIpLimit = createRateLimiter({
  windowMs: FIFTEEN_MINUTES, max: 30, keyFn: ipKey,
  message: 'Too many sign-in attempts from this network. Try again later.',
});
const loginAccountLimit = createRateLimiter({
  windowMs: FIFTEEN_MINUTES, max: 10, keyFn: emailFrom,
  message: 'Too many sign-in attempts for this account. Try again in 15 minutes.',
});
const resetRequestIpLimit = createRateLimiter({
  windowMs: ONE_HOUR, max: 20, keyFn: ipKey,
  message: 'Too many password reset requests. Try again later.',
});
const resetRequestAccountLimit = createRateLimiter({
  windowMs: ONE_HOUR, max: 5, keyFn: emailFrom,
  message: 'Too many password reset requests for this account. Try again later.',
});
const resetConfirmIpLimit = createRateLimiter({
  windowMs: FIFTEEN_MINUTES, max: 60, keyFn: ipKey,
  message: 'Too many reset attempts. Try again later.',
});

// The IP limit protects the hosted deployment against brute-force attempts. It is
// skipped outside production: the limiter is in-memory and single-instance, so a
// developer signing in repeatedly from one machine locks only themselves out for 15
// minutes. The per-account limit always applies, locally and in production.
const signIn = process.env.NODE_ENV === 'production'
  ? [loginIpLimit, loginAccountLimit]
  : [loginAccountLimit];

const router = express.Router();

router.post('/admin/login', signIn, loginAdmin);
router.post('/staff/login', signIn, loginStaff);
router.post('/logout', authMiddleware, logout);
router.post('/password-reset/request', resetRequestIpLimit, resetRequestAccountLimit, requestPasswordReset);
router.post('/password-reset/confirm', resetConfirmIpLimit, resetPassword);

module.exports = router;
