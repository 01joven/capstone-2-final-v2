const express = require('express');
const {
  register,
  login,
  loginAdmin,
  loginStaff,
  requestPasswordReset,
  resetPassword,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', loginAdmin);
router.post('/staff/login', loginStaff);
router.post('/password-reset/request', requestPasswordReset);
router.post('/password-reset/confirm', resetPassword);

module.exports = router;