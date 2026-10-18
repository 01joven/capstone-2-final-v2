const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const {
  getDashboard,
  getRecords,
  updateRecord,
  deleteRecord,
  getReservations,
  getReports,
  getCollections,
} = require('../controllers/adminController');
const { createSite, updateSite, getAllMemorials } = require('../controllers/memorialController');

const router = express.Router();

// Staff console: operational endpoints shared with administrators.
// User management and account security remain administrator-only
// under /api/admin.
router.use(authMiddleware, requireStaff);
router.get('/dashboard', getDashboard);
router.get('/records', getRecords);
// Records are created only by approving a submission (POST /records removed).
router.put('/records/:id', updateRecord);
router.delete('/records/:id', deleteRecord);
router.get('/sites', getAllMemorials);
router.post('/sites', createSite);
router.put('/sites/:id', updateSite);
router.get('/reservations', getReservations);
router.get('/reports', getReports);
router.get('/collections', getCollections);

module.exports = router;
