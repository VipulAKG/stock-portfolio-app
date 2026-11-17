const { fakeQuery } = require('./helpers');
const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');

const USER_ID = '507f1f77bcf86cd799439011';
const tokenFor = (id = USER_ID, opts = {}) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h', ...opts });

afterEach(() => mock.restoreAll());

describe('POST /api/auth/register', () => {
    test('rejects short password, bad email and missing name', async () => {
        const res = await request(app).post('/api/auth/register').send({ fullName: '', email: 'nope', password: 'short' });
        assert.equal(res.status, 400);
        const fields = res.body.errors.map((e) => e.field).sort();
        assert.deepEqual(fields, ['email', 'fullName', 'password']);
    });

    test('rejects invalid risk_preference', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ fullName: 'A', email: 'a@b.com', password: 'longenough1', risk_preference: 'YOLO' });
        assert.equal(res.status, 400);
    });

    test('rejects passwords longer than 72 bytes (bcrypt limit)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ fullName: 'A', email: 'a@b.com', password: 'x'.repeat(73) });
        assert.equal(res.status, 400);
    });

    test('creates a user, normalises email, never returns the password', async () => {
        const create = mock.method(User, 'create', async (doc) => ({ _id: USER_ID, ...doc }));
        const res = await request(app)
            .post('/api/auth/register')
            .send({ fullName: '  Alice  ', email: '  Alice@Example.COM ', password: 'longenough1', isAdmin: true });
        assert.equal(res.status, 201);
        assert.equal(res.body.email, 'alice@example.com');
        assert.equal(res.body.fullName, 'Alice');
        assert.equal(res.body.password, undefined);
        assert.ok(res.body.token);
        // unknown fields (mass assignment) are stripped before reaching the model
        assert.equal(create.mock.calls[0].arguments[0].isAdmin, undefined);
    });

    test('duplicate email -> 409 (handled from the unique index, no race)', async () => {
        mock.method(User, 'create', async () => {
            throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
        });
        const res = await request(app)
            .post('/api/auth/register')
            .send({ fullName: 'A', email: 'a@b.com', password: 'longenough1' });
        assert.equal(res.status, 409);
    });

    test('unexpected DB error -> generic 500 with no internals leaked', async () => {
        mock.method(User, 'create', async () => {
            throw new Error('connection string mongodb+srv://secret@host failed');
        });
        const res = await request(app)
            .post('/api/auth/register')
            .send({ fullName: 'A', email: 'a@b.com', password: 'longenough1' });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { message: 'Internal server error' });
    });
});

describe('POST /api/auth/login', () => {
    test('NoSQL injection payloads are rejected before reaching the database', async () => {
        const find = mock.method(User, 'findOne', () => fakeQuery(null));
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: { $ne: null }, password: { $ne: null } });
        assert.equal(res.status, 400);
        assert.equal(find.mock.callCount(), 0);
    });

    test('unknown email and wrong password give the SAME response', async () => {
        const hash = await bcrypt.hash('correct-password', 4);
        mock.method(User, 'findOne', ({ email }) =>
            fakeQuery(email === 'real@x.com' ? { _id: USER_ID, email, comparePassword: (p) => bcrypt.compare(p, hash) } : null)
        );
        const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@x.com', password: 'whatever1' });
        const wrong = await request(app).post('/api/auth/login').send({ email: 'real@x.com', password: 'wrong-password' });
        assert.equal(unknown.status, 401);
        assert.equal(wrong.status, 401);
        assert.deepEqual(unknown.body, wrong.body);
    });

    test('correct credentials return a token', async () => {
        const hash = await bcrypt.hash('correct-password', 4);
        mock.method(User, 'findOne', () =>
            fakeQuery({
                _id: USER_ID,
                fullName: 'Real',
                email: 'real@x.com',
                risk_preference: 'LOW',
                comparePassword: (p) => bcrypt.compare(p, hash),
            })
        );
        const res = await request(app).post('/api/auth/login').send({ email: 'REAL@x.com', password: 'correct-password' });
        assert.equal(res.status, 200);
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        assert.equal(decoded.id, USER_ID);
        assert.equal(res.body.password, undefined);
    });
});

describe('auth middleware (GET /api/auth/me)', () => {
    test('no token -> 401', async () => {
        assert.equal((await request(app).get('/api/auth/me')).status, 401);
    });

    test('garbage token -> 401', async () => {
        const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.token');
        assert.equal(res.status, 401);
    });

    test('token signed with a different secret -> 401', async () => {
        const forged = jwt.sign({ id: USER_ID }, 'some-other-secret-some-other-secret-1');
        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
        assert.equal(res.status, 401);
    });

    test('expired token -> 401', async () => {
        const expired = tokenFor(USER_ID, { expiresIn: -10 });
        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
        assert.equal(res.status, 401);
    });

    test('valid token for a DELETED user -> 401 (previously crashed with 500)', async () => {
        mock.method(User, 'findById', () => fakeQuery(null));
        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor()}`);
        assert.equal(res.status, 401);
    });

    test('valid token + existing user -> 200 profile', async () => {
        mock.method(User, 'findById', () => fakeQuery({ _id: USER_ID, fullName: 'A', email: 'a@b.com', risk_preference: 'LOW' }));
        const res = await request(app).get('/api/auth/me').set('authorization', `bearer ${tokenFor()}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.email, 'a@b.com');
    });
});
