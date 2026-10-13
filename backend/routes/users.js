const express = require('express');
const authMiddleware = require('../middleware/auth');
const { authenticatedLimit } = require('../middleware/rateLimit');
const { getProfile, updateProfile, completeOnboarding } = require('../controllers/userController');

const router = express.Router();

router.get('/profile', authMiddleware, authenticatedLimit, getProfile);
router.put('/update', authMiddleware, authenticatedLimit, updateProfile);
router.post('/onboarding-complete', authMiddleware, authenticatedLimit, completeOnboarding);

module.exports = router;