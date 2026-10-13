const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');
const { getAllMemorials, getMemorialById } = require('../controllers/memorialController');

const router = express.Router();

const publicListLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyFn: (req) => (req.ip ? `ip:${req.ip}` : null),
  message: 'Too many requests. Please slow down and try again later.',
});

router.get('/', publicListLimit, getAllMemorials);
router.get('/:id', publicListLimit, getMemorialById);

module.exports = router;
