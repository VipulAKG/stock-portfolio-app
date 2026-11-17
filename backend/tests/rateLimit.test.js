require('./helpers');
process.env.LOGIN_RATE_LIMIT_MAX = '3'; // set before the app (and limiter) loads
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { fakeQuery } = require('./helpers');

test('repeated failed logins are throttled with 429', async (t) => {
    t.mock.method(User, 'findOne', () => fakeQuery(null));
    const statuses = [];
    for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrong-password' });
        statuses.push(res.status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});
