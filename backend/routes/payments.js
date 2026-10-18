const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const { authenticatedLimit } = require('../middleware/rateLimit');
const {
  getUserPayments,
  recordCashPayment,
  getPaymentReceipt,
} = require('../controllers/paymentController');

const router = express.Router();

router.get('/', authMiddleware, authenticatedLimit, getUserPayments);
router.post('/record-cash', authMiddleware, requireStaff, authenticatedLimit, recordCashPayment);
router.get('/:id/receipt', authMiddleware, authenticatedLimit, getPaymentReceipt);

module.exports = router;
