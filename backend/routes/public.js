const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');
const { getBurialRecords } = require('../controllers/burialController');
const { getPlotReservations } = require('../controllers/reservationController');

const router = express.Router();

// Marks public requests as anonymous so the shared controller applies the
// stricter search minimum and result cap instead of the staff defaults.
const anonymousLookup = (req, res, next) => {
  req.anonymousLookup = true;
  next();
};

// Anonymous lookup for families/visitors. Read-only, no personal data
// (burial responses already exclude birth dates), IP-rate-limited.
const publicLookupLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyFn: (req) => (req.ip ? `ip:${req.ip}` : null),
  message: 'Too many requests. Please slow down and try again later.',
});

router.get('/burials', anonymousLookup, publicLookupLimit, getBurialRecords);
router.get('/plots', anonymousLookup, publicLookupLimit, getPlotReservations);

module.exports = router;
