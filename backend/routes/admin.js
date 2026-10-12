const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const {
  getDashboard,
  getRecords,
  createRecord,
  updateRecord,
  getReservations,
  getReports,
  getUsers,
} = require('../controllers/adminController');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);
router.get('/dashboard', getDashboard);
router.get('/records', getRecords);
router.post('/records', createRecord);
router.put('/records/:id', updateRecord);
router.get('/reservations', getReservations);
router.get('/reports', getReports);
router.get('/users', getUsers);

module.exports = router;
