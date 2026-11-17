const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeHoldings, findPositionViolation } = require('../utils/portfolio');

let n = 0;
const tx = (tickerSymbol, transactionType, quantity, executionPrice, date) => ({
    _id: `id${++n}`,
    tickerSymbol,
    transactionType,
    quantity,
    executionPrice,
    tradeDate: new Date(date),
    createdAt: new Date(`2026-11-${String(10 + (n % 10)).padStart(2, '0')}`),
});

describe('computeHoldings (average cost)', () => {
    test('weighted average cost across multiple buys', () => {
        const { holdings, summary } = computeHoldings([
            tx('AAPL', 'BUY', 10, 100, '2026-01-01'),
            tx('AAPL', 'BUY', 10, 200, '2026-02-01'),
        ]);
        assert.equal(holdings.length, 1);
        assert.equal(holdings[0].quantity, 20);
        assert.equal(holdings[0].averageCost, 150);
        assert.equal(holdings[0].totalCost, 3000);
        assert.equal(summary.totalInvested, 3000);
    });

    test('partial sell realises P/L and keeps average cost', () => {
        const { holdings, summary } = computeHoldings([
            tx('AAPL', 'BUY', 10, 100, '2026-01-01'),
            tx('AAPL', 'BUY', 10, 200, '2026-02-01'),
            tx('AAPL', 'SELL', 5, 180, '2026-03-01'),
        ]);
        assert.equal(holdings[0].quantity, 15);
        assert.equal(holdings[0].averageCost, 150);
        assert.equal(holdings[0].realizedPL, 150); // 5 * (180 - 150)
        assert.equal(summary.realizedPL, 150);
        assert.equal(summary.totalInvested, 2250);
    });

    test('fully closed position moves to "closed" with its realised P/L', () => {
        const { holdings, closed, summary } = computeHoldings([
            tx('TSLA', 'BUY', 4, 100, '2026-01-01'),
            tx('TSLA', 'SELL', 4, 90, '2026-02-01'),
        ]);
        assert.equal(holdings.length, 0);
        assert.deepEqual(closed, [{ tickerSymbol: 'TSLA', realizedPL: -40 }]);
        assert.equal(summary.realizedPL, -40);
        assert.equal(summary.openPositions, 0);
    });

    test('unrealised P/L and totals when prices are supplied', () => {
        const { holdings, summary } = computeHoldings(
            [tx('AAPL', 'BUY', 10, 100, '2026-01-01'), tx('MSFT', 'BUY', 2, 300, '2026-01-02')],
            { AAPL: 120, MSFT: 290 }
        );
        const aapl = holdings.find((h) => h.tickerSymbol === 'AAPL');
        assert.equal(aapl.marketValue, 1200);
        assert.equal(aapl.unrealizedPL, 200);
        assert.equal(aapl.unrealizedPLPercent, 20);
        assert.equal(summary.marketValue, 1780);
        assert.equal(summary.unrealizedPL, 180); // +200 - 20
        assert.equal(summary.pricesComplete, true);
    });

    test('flags tickers that had no price supplied', () => {
        const { summary } = computeHoldings(
            [tx('AAPL', 'BUY', 1, 100, '2026-01-01'), tx('MSFT', 'BUY', 1, 100, '2026-01-01')],
            { AAPL: 110 }
        );
        assert.equal(summary.pricesComplete, false);
        assert.deepEqual(summary.unpricedTickers, ['MSFT']);
    });

    test('no price fields when no prices are given', () => {
        const { summary, holdings } = computeHoldings([tx('AAPL', 'BUY', 1, 100, '2026-01-01')]);
        assert.equal(summary.marketValue, undefined);
        assert.equal(holdings[0].marketValue, undefined);
    });

    test('order of input does not matter (replayed chronologically)', () => {
        const a = tx('AAPL', 'BUY', 10, 100, '2026-01-01');
        const b = tx('AAPL', 'SELL', 4, 150, '2026-02-01');
        assert.deepEqual(computeHoldings([a, b]), computeHoldings([b, a]));
    });

    test('fractional shares work', () => {
        const { holdings } = computeHoldings([
            tx('BTC', 'BUY', 0.1, 100, '2026-01-01'),
            tx('BTC', 'BUY', 0.2, 100, '2026-01-02'),
            tx('BTC', 'SELL', 0.3, 110, '2026-01-03'),
        ]);
        assert.equal(holdings.length, 0); // 0.1 + 0.2 - 0.3 is treated as exactly zero
    });
});

describe('findPositionViolation (sell guard)', () => {
    test('null for a valid history', () => {
        assert.equal(
            findPositionViolation([tx('AAPL', 'BUY', 10, 1, '2026-01-01'), tx('AAPL', 'SELL', 10, 1, '2026-01-02')]),
            null
        );
    });

    test('detects selling shares you never owned', () => {
        const v = findPositionViolation([tx('AAPL', 'SELL', 1, 1, '2026-01-01')]);
        assert.equal(v.tickerSymbol, 'AAPL');
        assert.equal(v.held, 0);
    });

    test('detects overselling', () => {
        const v = findPositionViolation([tx('AAPL', 'BUY', 5, 1, '2026-01-01'), tx('AAPL', 'SELL', 6, 1, '2026-01-02')]);
        assert.equal(v.held, 5);
        assert.equal(v.attempted, 6);
    });

    test('a back-dated SELL before the BUY is invalid', () => {
        const v = findPositionViolation([tx('AAPL', 'BUY', 5, 1, '2026-02-01'), tx('AAPL', 'SELL', 5, 1, '2026-01-01')]);
        assert.ok(v);
    });

    test('same-day BUY and SELL is valid regardless of entry order', () => {
        const sell = tx('AAPL', 'SELL', 5, 1, '2026-01-01');
        const buy = tx('AAPL', 'BUY', 5, 1, '2026-01-01');
        assert.equal(findPositionViolation([sell, buy]), null);
    });

    test('tickers are tracked independently', () => {
        const v = findPositionViolation([tx('AAPL', 'BUY', 10, 1, '2026-01-01'), tx('MSFT', 'SELL', 1, 1, '2026-01-02')]);
        assert.equal(v.tickerSymbol, 'MSFT');
    });

    test('removing a BUY that a later SELL depends on is caught', () => {
        const history = [tx('AAPL', 'SELL', 3, 1, '2026-02-01')]; // the BUY was removed
        assert.ok(findPositionViolation(history));
    });
});
