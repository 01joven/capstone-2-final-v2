const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const { authenticatedLimit } = require('../middleware/rateLimit');
const {
  getUserReservations,
  getPlotReservations,
  createReservation,
  reviewPlotReservation,
  cancelReservation,
} = require('../controllers/reservationController');

const router = express.Router();

router.get('/plots', authMiddleware, authenticatedLimit, getPlotReservations);
router.get('/user-reservations', authMiddleware, authenticatedLimit, getUserReservations);
router.post('/create', authMiddleware, authenticatedLimit, createReservation);
router.post('/:id/cancel', authMiddleware, authenticatedLimit, cancelReservation);
router.post('/plots/:id/review', authMiddleware, requireStaff, authenticatedLimit, reviewPlotReservation);

module.exports = router;
