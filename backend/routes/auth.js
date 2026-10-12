const express = require('express');
const {
  register,
  sendUserRegistrationCode,
  login,
  loginAdmin,
} = require('../controllers/authController');
const {
  requestAdminPasswordReset,
  resetAdminPassword,
} = require('../controllers/adminRecoveryController');

const router = express.Router();

router.post('/register', register);
router.post('/register-code', sendUserRegistrationCode);
router.post('/login', login);
router.post('/admin/login', loginAdmin);
router.post('/admin/recovery/request', requestAdminPasswordReset);
router.post('/admin/recovery/reset', resetAdminPassword);

module.exports = router;
