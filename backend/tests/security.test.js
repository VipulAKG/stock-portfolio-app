require('./helpers');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

describe('security & error handling', () => {
    test('helmet headers are set and x-powered-by is hidden', async () => {
        const res = await request(app).get('/');
        assert.equal(res.status, 200);
        assert.equal(res.headers['x-powered-by'], undefined);
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });

    test('CORS: allowed origin is echoed, unknown origin gets no CORS header', async () => {
        const ok = await request(app).get('/').set('Origin', 'http://localhost:5173');
        assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
        const bad = await request(app).get('/').set('Origin', 'https://evil.example');
        assert.equal(bad.headers['access-control-allow-origin'], undefined);
    });

    test('malformed JSON -> clean 400', async () => {
        const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
        assert.equal(res.status, 400);
        assert.equal(res.body.message, 'Request body is not valid JSON');
    });

    test('oversized body -> 413', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'x'.repeat(20000) });
        assert.equal(res.status, 413);
    });

    test('unknown route -> JSON 404', async () => {
        const res = await request(app).get('/api/nope');
        assert.equal(res.status, 404);
        assert.ok(res.body.message);
    });

    test('/health reports degraded (503) when the database is not connected', async () => {
        const res = await request(app).get('/health');
        assert.equal(res.status, 503);
        assert.equal(res.body.db, false);
    });
});
