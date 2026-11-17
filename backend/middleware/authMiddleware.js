const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const protect = async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (!/^Bearer$/i.test(scheme || '') || !token) {
        throw new AppError('Not authorized, no token provided', 401);
    }

    let decoded;
    try {
        // Pin the algorithm so a forged token can't downgrade to "none"/other algs.
        decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    } catch {
        throw new AppError('Not authorized, token invalid or expired', 401);
    }

    if (!decoded || !mongoose.isValidObjectId(decoded.id)) {
        throw new AppError('Not authorized, token invalid or expired', 401);
    }

    // password is select:false on the schema, so it is never loaded here.
    const user = await User.findById(decoded.id);
    if (!user) {
        // e.g. account deleted after the token was issued
        throw new AppError('Not authorized, user no longer exists', 401);
    }

    req.user = user;
    next();
};

module.exports = { protect };
