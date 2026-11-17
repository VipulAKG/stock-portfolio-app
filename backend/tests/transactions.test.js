const { fakeQuery } = require('./helpers');
const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const USER_ID = '507f1f77bcf86cd799439011';
const TX_ID = '607f1f77bcf86cd799439022';
const auth = () => ({
    Authorization: `Bearer ${jwt.sign({ id: USER_ID }, process.env.JWT_SECRET, { algorithm: 'HS256' })}`,
});

const stored = (type, quantity, date, extra = {}) => ({
    _id: extra._id || `id-${Math.random()}`,
    userId: USER_ID,
    tickerSymbol: 'AAPL',
    transactionType: type,
    quantity,
    executionPrice: 100,
    tradeDate: new Date(date),
    createdAt: new Date(date),
    ...extra,
});

beforeEach(() => {
    mock.method(User, 'findById', () => fakeQuery({ _id: USER_ID }));
});
afterEach(() => mock.restoreAll());

describe('access control', () => {
    test('every transaction / portfolio route requires a token', async () => {
        for (const [method, path] of [
            ['get', '/api/transactions'],
            ['post', '/api/transactions'],
            ['patch', `/api/transactions/${TX_ID}`],
            ['delete', `/api/transactions/${TX_ID}`],
            ['get', '/api/portfolio'],
        ]) {
            const res = await request(app)[method](path);
            assert.equal(res.status, 401, `${method} ${path}`);
        }
    });
});

describe('POST /api/transactions', () => {
    const valid = { tickerSymbol: 'aapl', transactionType: 'BUY', quantity: 10, executionPrice: 150.5 };

    test('validates input', async () => {
        for (const bad of [
            {},
            { ...valid, quantity: 0 },
            { ...valid, quantity: -3 },
            { ...valid, executionPrice: 0 },
            { ...valid, quantity: '10' },
            { ...valid, transactionType: 'HOLD' },
            { ...valid, transactionType: undefined }, // no silent default to BUY any more
            { ...valid, tickerSymbol: 'AAPL; DROP' },
            { ...valid, tradeDate: 'not-a-date' },
            { ...valid, tradeDate: '2099-01-01' },
            { ...valid, tickerSymbol: { $ne: null } },
        ]) {
            const res = await request(app).post('/api/transactions').set(auth()).send(bad);
            assert.equal(res.status, 400, JSON.stringify(bad));
        }
    });

    test('accepts fractional quantity and an explicit price of 0.01', async () => {
        mock.method(Transaction, 'create', async (d) => d);
        const res = await request(app).post('/api/transactions').set(auth()).send({ ...valid, quantity: 0.25, executionPrice: 0.01 });
        assert.equal(res.status, 201);
    });

    test('BUY: uppercases ticker, binds to the logged-in user, ignores client userId', async () => {
        const create = mock.method(Transaction, 'create', async (d) => ({ _id: TX_ID, ...d }));
        const res = await request(app)
            .post('/api/transactions')
            .set(auth())
            .send({ ...valid, userId: '000000000000000000000000' });
        assert.equal(res.status, 201);
        const arg = create.mock.calls[0].arguments[0];
        assert.equal(arg.tickerSymbol, 'AAPL');
        assert.equal(String(arg.userId), USER_ID);
        assert.ok(arg.tradeDate instanceof Date);
    });

    test('SELL more than held -> 422 and nothing is saved', async () => {
        mock.method(Transaction, 'find', () => fakeQuery([stored('BUY', 5, '2026-01-01')]));
        const create = mock.method(Transaction, 'create', async (d) => d);
        const res = await request(app)
            .post('/api/transactions')
            .set(auth())
            .send({ ...valid, transactionType: 'SELL', quantity: 6, tradeDate: '2026-02-01' });
        assert.equal(res.status, 422);
        assert.match(res.body.message, /Not enough AAPL/);
        assert.equal(create.mock.callCount(), 0);
    });

    test('SELL within holdings -> 201', async () => {
        mock.method(Transaction, 'find', () => fakeQuery([stored('BUY', 5, '2026-01-01')]));
        mock.method(Transaction, 'create', async (d) => d);
        const res = await request(app)
            .post('/api/transactions')
            .set(auth())
            .send({ ...valid, transactionType: 'SELL', quantity: 5, tradeDate: '2026-02-01' });
        assert.equal(res.status, 201);
    });

    test('back-dated SELL from before the BUY -> 422', async () => {
        mock.method(Transaction, 'find', () => fakeQuery([stored('BUY', 5, '2026-03-01')]));
        const res = await request(app)
            .post('/api/transactions')
            .set(auth())
            .send({ ...valid, transactionType: 'SELL', quantity: 1, tradeDate: '2026-01-01' });
        assert.equal(res.status, 422);
    });
});

describe('GET /api/transactions', () => {
    test('paginates and scopes the query to the logged-in user', async () => {
        const find = mock.method(Transaction, 'find', () => fakeQuery([stored('BUY', 1, '2026-01-01')]));
        mock.method(Transaction, 'countDocuments', () => fakeQuery(120));
        const res = await request(app).get('/api/transactions?page=2&limit=50&ticker=aapl').set(auth());
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 120);
        assert.equal(res.body.pages, 3);
        assert.equal(res.body.page, 2);
        const filter = find.mock.calls[0].arguments[0];
        assert.equal(String(filter.userId), USER_ID);
        assert.equal(filter.tickerSymbol, 'AAPL');
    });

    test('rejects absurd page sizes', async () => {
        const res = await request(app).get('/api/transactions?limit=100000').set(auth());
        assert.equal(res.status, 400);
    });
});

describe('PATCH / DELETE /api/transactions/:id', () => {
    test('malformed id -> 400', async () => {
        const res = await request(app).delete('/api/transactions/not-an-id').set(auth());
        assert.equal(res.status, 400);
    });

    test('someone else\'s / missing transaction -> 404', async () => {
        mock.method(Transaction, 'findOne', () => fakeQuery(null));
        const res = await request(app).delete(`/api/transactions/${TX_ID}`).set(auth());
        assert.equal(res.status, 404);
    });

    test('PATCH with an empty body -> 400', async () => {
        const res = await request(app).patch(`/api/transactions/${TX_ID}`).set(auth()).send({});
        assert.equal(res.status, 400);
    });

    test('deleting a BUY that a later SELL depends on -> 422', async () => {
        const buy = stored('BUY', 5, '2026-01-01', { _id: TX_ID });
        const sell = stored('SELL', 5, '2026-02-01', { _id: 'sell1' });
        mock.method(Transaction, 'findOne', () => fakeQuery({ ...buy, deleteOne: async () => {} }));
        mock.method(Transaction, 'find', () => fakeQuery([buy, sell]));
        const res = await request(app).delete(`/api/transactions/${TX_ID}`).set(auth());
        assert.equal(res.status, 422);
    });

    test('deleting a transaction nothing depends on -> 200', async () => {
        const buy = stored('BUY', 5, '2026-01-01', { _id: TX_ID });
        let deleted = false;
        mock.method(Transaction, 'findOne', () => fakeQuery({ ...buy, deleteOne: async () => (deleted = true) }));
        mock.method(Transaction, 'find', () => fakeQuery([buy]));
        const res = await request(app).delete(`/api/transactions/${TX_ID}`).set(auth());
        assert.equal(res.status, 200);
        assert.equal(deleted, true);
    });

    test('editing a SELL up beyond holdings -> 422', async () => {
        const buy = stored('BUY', 5, '2026-01-01', { _id: 'b1' });
        const sell = stored('SELL', 3, '2026-02-01', { _id: TX_ID });
        mock.method(Transaction, 'findOne', () => fakeQuery({ ...sell, save: async () => {} }));
        mock.method(Transaction, 'find', () => fakeQuery([buy, sell]));
        const res = await request(app).patch(`/api/transactions/${TX_ID}`).set(auth()).send({ quantity: 9 });
        assert.equal(res.status, 422);
    });

    test('editing a price (no position impact) -> 200', async () => {
        const buy = stored('BUY', 5, '2026-01-01', { _id: TX_ID });
        let saved = false;
        mock.method(Transaction, 'findOne', () => fakeQuery({ ...buy, save: async () => (saved = true) }));
        mock.method(Transaction, 'find', () => fakeQuery([buy]));
        const res = await request(app).patch(`/api/transactions/${TX_ID}`).set(auth()).send({ executionPrice: 120 });
        assert.equal(res.status, 200);
        assert.equal(saved, true);
    });
});

describe('GET /api/portfolio', () => {
    test('returns holdings and P/L, with optional prices', async () => {
        mock.method(Transaction, 'find', () =>
            fakeQuery([stored('BUY', 10, '2026-01-01'), stored('SELL', 4, '2026-02-01', { executionPrice: 150 })])
        );
        const res = await request(app).get('/api/portfolio?prices=aapl:130').set(auth());
        assert.equal(res.status, 200);
        assert.equal(res.body.holdings[0].quantity, 6);
        assert.equal(res.body.summary.realizedPL, 200);
        assert.equal(res.body.holdings[0].unrealizedPL, 180);
    });

    test('malformed prices parameter -> 400', async () => {
        for (const bad of ['AAPL', 'AAPL:abc', 'AAPL:-5', 'AAPL:1:2', ':5']) {
            const res = await request(app).get(`/api/portfolio?prices=${bad}`).set(auth());
            assert.equal(res.status, 400, bad);
        }
    });
});
