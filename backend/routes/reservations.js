const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const {
  getUserReservations,
  getPlotReservations,
  createReservation,
  reviewPlotReservation,
} = require('../controllers/reservationController');

const router = express.Router();

router.get('/plots', authMiddleware, getPlotReservations);
router.get('/user-reservations', authMiddleware, getUserReservations);
router.post('/create', authMiddleware, createReservation);
router.post('/plots/:id/review', authMiddleware, requireStaff, reviewPlotReservation);

module.exports = router;
