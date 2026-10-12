const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const {
  getUserPayments,
  getPendingPayments,
  createPayment,
  verifyPayment,
} = require('../controllers/paymentController');

const router = express.Router();

router.get('/', authMiddleware, getUserPayments);
router.post('/create', authMiddleware, createPayment);
router.get('/admin/pending', authMiddleware, adminMiddleware, getPendingPayments);
router.post('/admin/:id/verify', authMiddleware, adminMiddleware, verifyPayment);

module.exports = router;
