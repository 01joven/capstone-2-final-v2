const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getSavedItems, addSavedItem, removeSavedItem } = require('../controllers/favoriteController');

const router = express.Router();

router.get('/', authMiddleware, getSavedItems);
router.post('/add', authMiddleware, addSavedItem);
router.delete('/remove/:id', authMiddleware, removeSavedItem);

module.exports = router;
