const express = require('express');
const authMiddleware = require('../middleware/auth');
const { authenticatedLimit } = require('../middleware/rateLimit');
const { getBurialRecords } = require('../controllers/burialController');

const router = express.Router();

// Burial records contain personal data, so sign-in is required.
router.get('/', authMiddleware, authenticatedLimit, getBurialRecords);

module.exports = router;
