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
  createUser,
  purgeDemo,
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
router.post('/users', createUser);
router.post('/maintenance/purge-demo', purgeDemo);

module.exports = router;
