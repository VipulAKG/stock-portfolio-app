const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const notFound = (req, res, next) => {
    next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

// Express 5 forwards rejected promises from async handlers here automatically,
// so controllers don't need their own try/catch blocks.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof ZodError) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: err.issues.map((issue) => ({
                field: issue.path.join('.') || undefined,
                message: issue.message,
            })),
        });
    }

    if (err instanceof AppError) {
        return res.status(err.status).json({ message: err.message });
    }

    // body-parser errors
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Request body is not valid JSON' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Request body too large' });
    }

    // Mongoose / MongoDB errors
    if (err.name === 'ValidationError' && err.errors) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
        });
    }
    if (err.name === 'CastError') {
        return res.status(400).json({ message: `Invalid value for "${err.path}"` });
    }
    if (err.code === 11000) {
        return res.status(409).json({ message: 'A record with that value already exists' });
    }

    // JWT errors that escape the auth middleware
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
    }

    // Anything else is a bug or an infrastructure failure: log it, hide details.
    if (!env.isTest) console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
};

module.exports = { notFound, errorHandler };
