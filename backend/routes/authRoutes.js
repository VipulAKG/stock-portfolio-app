const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');

// Register a new user (POST /api/auth/register)
router.post('/register', registerUser);

// Login a user (POST /api/auth/login)
router.post('/login', loginUser);

module.exports = router;