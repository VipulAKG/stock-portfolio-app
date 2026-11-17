const env = require('./config/env'); // validates required env vars (fails fast)
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');

const start = async () => {
    try {
        await connectDB();
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1); // don't run an API that can't reach its database
    }

    const server = app.listen(env.port, () => {
        console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
    });

    const shutdown = (signal) => {
        console.log(`${signal} received, shutting down...`);
        server.close(async () => {
            await mongoose.connection.close();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref(); // force exit if stuck
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
};

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

start();
