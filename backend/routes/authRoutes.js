const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiters');
const { registerSchema, loginSchema } = require('../validators/schemas');

router.post('/register', registerLimiter, validate({ body: registerSchema }), registerUser);
router.post('/login', loginLimiter, validate({ body: loginSchema }), loginUser);
router.get('/me', protect, getMe);

module.exports = router;
