require('dotenv').config();

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
    throw new Error(
        `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values.'
    );
}

if (process.env.JWT_SECRET.length < 32) {
    throw new Error(
        'JWT_SECRET must be at least 32 characters. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
}

const int = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
    nodeEnv,
    isProd: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: int(process.env.PORT, 5000),
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
    // Comma-separated list of allowed browser origins. Requests without an
    // Origin header (curl, Postman, server-to-server) are always allowed.
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    // Number of reverse-proxy hops in front of the app (Render/Heroku/nginx = 1).
    trustProxy: int(process.env.TRUST_PROXY, 0),
    rateLimit: {
        windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
        max: int(process.env.RATE_LIMIT_MAX, 300),
        loginMax: int(process.env.LOGIN_RATE_LIMIT_MAX, 10),
        registerMax: int(process.env.REGISTER_RATE_LIMIT_MAX, 20),
    },
};
