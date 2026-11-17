/**
 * Pure portfolio maths (no database access) so it is easy to test.
 *
 * Method: weighted AVERAGE COST.
 *   BUY  -> quantity and total cost increase.
 *   SELL -> realised P/L = quantity * (sellPrice - averageCostAtThatTime);
 *           remaining cost basis shrinks proportionally.
 * Fees and taxes are not modelled.
 */

// Tolerance for fractional-share floating point noise (0.1 + 0.2 !== 0.3).
const EPS = 1e-9;

const round = (value, dp = 4) => {
    const factor = 10 ** dp;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

const whenOf = (tx) => new Date(tx.tradeDate ?? tx.createdAt).getTime();

/**
 * Chronological order: tradeDate, then BUY before SELL on the same instant
 * (so same-day buy+sell entered in either order is valid), then entry time.
 */
const sortTransactions = (txs) =>
    [...txs].sort((a, b) => {
        const byDate = whenOf(a) - whenOf(b);
        if (byDate !== 0) return byDate;
        if (a.transactionType !== b.transactionType) return a.transactionType === 'BUY' ? -1 : 1;
        const byCreated = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
        if (byCreated !== 0) return byCreated;
        return String(a._id ?? '').localeCompare(String(b._id ?? ''));
    });

const groupByTicker = (txs) => {
    const groups = new Map();
    for (const tx of sortTransactions(txs)) {
        if (!groups.has(tx.tickerSymbol)) groups.set(tx.tickerSymbol, []);
        groups.get(tx.tickerSymbol).push(tx);
    }
    return groups;
};

/**
 * Replays the history and returns the first SELL that would take a position
 * below zero, or null if the history is valid.
 */
const findPositionViolation = (txs) => {
    for (const [tickerSymbol, list] of groupByTicker(txs)) {
        let held = 0;
        for (const tx of list) {
            if (tx.transactionType === 'BUY') {
                held += tx.quantity;
            } else {
                if (tx.quantity > held + EPS) {
                    return {
                        tickerSymbol,
                        tradeDate: new Date(whenOf(tx)),
                        held: round(Math.max(held, 0), 6),
                        attempted: tx.quantity,
                    };
                }
                held -= tx.quantity;
                if (Math.abs(held) < EPS) held = 0;
            }
        }
    }
    return null;
};

const describeViolation = (v) =>
    `Not enough ${v.tickerSymbol} shares: a sale of ${v.attempted} on ` +
    `${v.tradeDate.toISOString().slice(0, 10)} exceeds the ${v.held} held at that time`;

/**
 * @param {Array}  txs     user's transactions (any order)
 * @param {Object} prices  optional { TICKER: currentPrice } for unrealised P/L
 */
const computeHoldings = (txs, prices = {}) => {
    const holdings = [];
    const closed = [];
    let totalInvested = 0;
    let totalRealized = 0;
    let marketValue = 0;
    let pricedCost = 0;
    const unpriced = [];

    for (const [tickerSymbol, list] of groupByTicker(txs)) {
        let quantity = 0;
        let cost = 0;
        let realized = 0;

        for (const tx of list) {
            if (tx.transactionType === 'BUY') {
                quantity += tx.quantity;
                cost += tx.quantity * tx.executionPrice;
            } else {
                const avg = quantity > 0 ? cost / quantity : 0;
                realized += tx.quantity * (tx.executionPrice - avg);
                cost -= tx.quantity * avg;
                quantity -= tx.quantity;
                if (quantity < EPS) {
                    quantity = 0;
                    cost = 0;
                }
            }
        }

        totalRealized += realized;

        if (quantity === 0) {
            closed.push({ tickerSymbol, realizedPL: round(realized, 2) });
            continue;
        }

        const holding = {
            tickerSymbol,
            quantity: round(quantity, 6),
            averageCost: round(cost / quantity, 4),
            totalCost: round(cost, 2),
            realizedPL: round(realized, 2),
        };
        totalInvested += cost;

        const price = prices[tickerSymbol];
        if (price !== undefined) {
            const value = quantity * price;
            holding.currentPrice = price;
            holding.marketValue = round(value, 2);
            holding.unrealizedPL = round(value - cost, 2);
            holding.unrealizedPLPercent = cost > 0 ? round(((value - cost) / cost) * 100, 2) : 0;
            marketValue += value;
            pricedCost += cost;
        } else {
            unpriced.push(tickerSymbol);
        }

        holdings.push(holding);
    }

    const summary = {
        totalInvested: round(totalInvested, 2),
        realizedPL: round(totalRealized, 2),
        openPositions: holdings.length,
    };

    if (Object.keys(prices).length > 0) {
        summary.marketValue = round(marketValue, 2);
        summary.unrealizedPL = round(marketValue - pricedCost, 2);
        summary.totalPL = round(summary.unrealizedPL + totalRealized, 2);
        // true only when every open position had a price supplied
        summary.pricesComplete = unpriced.length === 0;
        if (unpriced.length) summary.unpricedTickers = unpriced;
    }

    return { holdings, closed, summary };
};

module.exports = { sortTransactions, findPositionViolation, describeViolation, computeHoldings, round };
