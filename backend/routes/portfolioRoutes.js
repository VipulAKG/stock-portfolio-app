const express = require('express');
const router = express.Router();
const { getPortfolio } = require('../controllers/portfolioController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { portfolioQuery } = require('../validators/schemas');

router.get('/', protect, validate({ query: portfolioQuery }), getPortfolio);

module.exports = router;
