const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireStaff = require('../middleware/staff');
const { authenticatedLimit } = require('../middleware/rateLimit');
const {
  createSubmission,
  getMySubmissions,
  getAllSubmissions,
  reviewSubmission,
} = require('../controllers/submissionController');

const router = express.Router();

router.post('/', authMiddleware, authenticatedLimit, createSubmission);
router.get('/mine', authMiddleware, authenticatedLimit, getMySubmissions);
router.get('/all', authMiddleware, requireStaff, authenticatedLimit, getAllSubmissions);
router.post('/:id/review', authMiddleware, requireStaff, authenticatedLimit, reviewSubmission);

module.exports = router;
