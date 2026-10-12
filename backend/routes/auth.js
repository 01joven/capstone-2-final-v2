const express = require('express');
const {
  register,
  login,
  loginAdmin,
  loginStaff,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', loginAdmin);
router.post('/staff/login', loginStaff);

module.exports = router;