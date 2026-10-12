const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getUserReservations, createReservation } = require('../controllers/reservationController');

const router = express.Router();

router.get('/user-reservations', authMiddleware, getUserReservations);
router.post('/create', authMiddleware, createReservation);

module.exports = router;
