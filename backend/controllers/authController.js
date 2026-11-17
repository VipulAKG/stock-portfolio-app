const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const generateToken = (id) =>
    jwt.sign({ id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpiresIn });

const publicUser = (user) => ({
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    risk_preference: user.risk_preference,
});

// Compared against when the email is unknown, so "no such user" and "wrong
// password" take the same time and can't be told apart by timing.
let dummyHash;
const getDummyHash = () => {
    if (!dummyHash) dummyHash = bcrypt.hashSync('not-a-real-password', env.bcryptRounds);
    return dummyHash;
};

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
    const { fullName, email, password, risk_preference } = req.valid.body;

    let user;
    try {
        user = await User.create({ fullName, email, password, risk_preference });
    } catch (err) {
        // The unique index is the source of truth (no check-then-insert race).
        if (err && err.code === 11000) {
            throw new AppError('An account with this email already exists', 409);
        }
        throw err;
    }

    res.status(201).json({ ...publicUser(user), token: generateToken(user._id) });
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
exports.loginUser = async (req, res) => {
    const { email, password } = req.valid.body;

    const user = await User.findOne({ email }).select('+password');
    const isMatch = user
        ? await user.comparePassword(password)
        : (await bcrypt.compare(password, getDummyHash()), false);

    // Same status and message whether the email or the password was wrong.
    if (!isMatch) throw new AppError('Invalid email or password', 401);

    res.status(200).json({ ...publicUser(user), token: generateToken(user._id) });
};

// @desc    Current user profile
// @route   GET /api/auth/me
exports.getMe = async (req, res) => {
    res.status(200).json(publicUser(req.user));
};
