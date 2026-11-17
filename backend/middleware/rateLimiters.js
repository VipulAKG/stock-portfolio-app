const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const tooMany = (message) => ({ message });

// Broad protection for the whole API.
const apiLimiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    limit: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Too many requests, please try again later'),
});

// Brute-force protection: only FAILED logins count towards the limit.
const loginLimiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    limit: env.rateLimit.loginMax,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Too many failed login attempts, please try again later'),
});

// Stops bulk account creation.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: env.rateLimit.registerMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Too many accounts created from this IP, please try again later'),
});

module.exports = { apiLimiter, loginLimiter, registerLimiter };
