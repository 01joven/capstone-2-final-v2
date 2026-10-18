const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const {
  getDashboard,
  getRecords,
  updateRecord,
  deleteRecord,
  getReservations,
  getReports,
  getCollections,
  getSettlements,
  createSettlement,
  voidSettlement,
  searchReceipts,
  getUsers,
  createUser,
  updateUserRole,
  setUserActive,
  deleteUser,
} = require('../controllers/adminController');
const { createSite, updateSite, getAllMemorials } = require('../controllers/memorialController');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);
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
router.get('/settlements', getSettlements);
router.post('/settlements', createSettlement);
router.delete('/settlements/:id', voidSettlement);
router.get('/receipts/search', searchReceipts);
router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id/role', updateUserRole);
router.put('/users/:id/status', setUserActive);
router.delete('/users/:id', deleteUser);

module.exports = router;
