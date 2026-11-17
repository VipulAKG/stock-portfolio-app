// Must be required BEFORE anything that loads config/env.js
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stock-portfolio-test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.BCRYPT_ROUNDS = '4';

// Minimal stand-in for a Mongoose Query: chainable and awaitable.
const fakeQuery = (result) => {
    const q = {
        select: () => q,
        sort: () => q,
        skip: () => q,
        limit: () => q,
        lean: () => q,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return q;
};

module.exports = { fakeQuery };
