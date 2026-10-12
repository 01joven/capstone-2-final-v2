const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const {
  getUserPayments,
  getPendingPayments,
  createPayment,
  verifyPayment,
} = require('../controllers/paymentController');

const router = express.Router();

router.get('/', authMiddleware, getUserPayments);
router.post('/create', authMiddleware, createPayment);
router.get('/admin/pending', authMiddleware, requireStaff, getPendingPayments);
router.post('/admin/:id/verify', authMiddleware, requireStaff, verifyPayment);

module.exports = router;
