const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getProfile, updateProfile, completeOnboarding } = require('../controllers/userController');

const router = express.Router();

router.get('/profile', authMiddleware, getProfile);
router.put('/update', authMiddleware, updateProfile);
router.post('/onboarding-complete', authMiddleware, completeOnboarding);

module.exports = router;