const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const {
  getDashboard,
  getRecords,
  createRecord,
  updateRecord,
  getReservations,
  getReports,
} = require('../controllers/adminController');

const router = express.Router();

// Staff console: operational endpoints shared with administrators.
// User management and account security remain administrator-only
// under /api/admin.
router.use(authMiddleware, requireStaff);
router.get('/dashboard', getDashboard);
router.get('/records', getRecords);
router.post('/records', createRecord);
router.put('/records/:id', updateRecord);
router.get('/reservations', getReservations);
router.get('/reports', getReports);

module.exports = router;
