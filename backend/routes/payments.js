const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const { authenticatedLimit } = require('../middleware/rateLimit');
const {
  getUserPayments,
  getPendingPayments,
  recordCashPayment,
  createPayment,
  verifyPayment,
  getPaymentReceipt,
} = require('../controllers/paymentController');

const router = express.Router();

router.get('/', authMiddleware, authenticatedLimit, getUserPayments);
router.post('/create', authMiddleware, authenticatedLimit, createPayment);
router.post('/record-cash', authMiddleware, requireStaff, authenticatedLimit, recordCashPayment);
router.get('/admin/pending', authMiddleware, requireStaff, authenticatedLimit, getPendingPayments);
router.post('/admin/:id/verify', authMiddleware, requireStaff, authenticatedLimit, verifyPayment);
router.get('/:id/receipt', authMiddleware, authenticatedLimit, getPaymentReceipt);

module.exports = router;
