const express = require('express');
const { getAllMemorials, getMemorialById } = require('../controllers/memorialController');

const router = express.Router();

router.get('/', getAllMemorials);
router.get('/:id', getMemorialById);

module.exports = router;
