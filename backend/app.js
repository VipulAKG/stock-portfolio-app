const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const env = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (env.trustProxy > 0) app.set('trust proxy', env.trustProxy);

// ---- security & parsing middleware ----
app.use(helmet());
app.use(
    cors({
        origin: (origin, callback) => {
            // No Origin header = curl / Postman / server-to-server: allow.
            if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
            return callback(null, false);
        },
    })
);
app.use(express.json({ limit: '10kb' }));
app.use('/api', apiLimiter);

// ---- routes ----
app.get('/', (req, res) => res.send('Stock Portfolio API is running...'));

app.get('/health', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({ status: dbConnected ? 'ok' : 'degraded', db: dbConnected });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));
app.use('/api/portfolio', require('./routes/portfolioRoutes'));

// ---- errors (must be last) ----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
