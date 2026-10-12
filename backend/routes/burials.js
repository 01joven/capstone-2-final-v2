const express = require('express');
const { getBurialRecords } = require('../controllers/burialController');

const router = express.Router();

router.get('/', getBurialRecords);

module.exports = router;
