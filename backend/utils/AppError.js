/**
 * Error with an HTTP status that is safe to show to API clients.
 * Anything that is NOT an AppError is treated as an unexpected 500 and its
 * message is hidden from the client by the global error handler.
 */
class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = 'AppError';
        this.status = status;
    }
}

module.exports = AppError;
