const express = require('express');
const router = express.Router();
const { getTransactions, addTransaction } = require('../controllers/transactionController');
const { protect } = require('../middleware/authMiddleware');

// Both routes are protected by the JWT middleware
router.route('/')
    .get(protect, getTransactions)
    .post(protect, addTransaction);

module.exports = router;