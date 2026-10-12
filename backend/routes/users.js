const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getProfile, updateProfile, completeOnboarding } = require('../controllers/userController');
const {
  requestAdminEmailChange,
  confirmAdminEmailChange,
} = require('../controllers/adminRecoveryController');

const router = express.Router();

router.get('/profile', authMiddleware, getProfile);
router.put('/update', authMiddleware, updateProfile);
router.post('/onboarding-complete', authMiddleware, completeOnboarding);
router.post('/admin/email-change/request', authMiddleware, requestAdminEmailChange);
router.post('/admin/email-change/confirm', authMiddleware, confirmAdminEmailChange);

module.exports = router;
