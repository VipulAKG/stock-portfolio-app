const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const { findPositionViolation, describeViolation } = require('../utils/portfolio');

/**
 * Make sure a user's history for one ticker never goes short.
 *  - excludeId: a transaction to ignore (the one being edited / deleted)
 *  - extra:     a transaction to add to the history (the new / edited version)
 * Replaying the whole history (not just "current holdings") means back-dated
 * trades and edits are validated correctly too.
 */
const assertValidPositions = async (userId, tickerSymbol, { excludeId, extra } = {}) => {
    const existing = await Transaction.find({ userId, tickerSymbol }).lean();
    const txs = existing.filter((t) => String(t._id) !== String(excludeId));
    if (extra) txs.push({ ...extra, _id: 'pending', createdAt: new Date() });

    const violation = findPositionViolation(txs);
    if (violation) throw new AppError(describeViolation(violation), 422);
};

// @desc    List the logged-in user's transactions (paginated, newest first)
// @route   GET /api/transactions?page=1&limit=50&ticker=AAPL&type=BUY
exports.getTransactions = async (req, res) => {
    const { page, limit, ticker, type } = req.valid.query;

    const filter = { userId: req.user._id };
    if (ticker) filter.tickerSymbol = ticker;
    if (type) filter.transactionType = type;

    const [data, total] = await Promise.all([
        Transaction.find(filter)
            .sort({ tradeDate: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Transaction.countDocuments(filter),
    ]);

    res.status(200).json({ data, page, limit, total, pages: Math.ceil(total / limit) });
};

// @desc    Add a stock transaction
// @route   POST /api/transactions
exports.addTransaction = async (req, res) => {
    const body = req.valid.body;
    const tx = { ...body, tradeDate: body.tradeDate ?? new Date() };

    if (tx.transactionType === 'SELL') {
        await assertValidPositions(req.user._id, tx.tickerSymbol, { extra: tx });
    }

    const transaction = await Transaction.create({ userId: req.user._id, ...tx });
    res.status(201).json(transaction);
};

// @desc    Edit a transaction
// @route   PATCH /api/transactions/:id
exports.updateTransaction = async (req, res) => {
    const doc = await Transaction.findOne({ _id: req.valid.params.id, userId: req.user._id });
    if (!doc) throw new AppError('Transaction not found', 404);

    const updated = {
        tickerSymbol: doc.tickerSymbol,
        transactionType: doc.transactionType,
        quantity: doc.quantity,
        executionPrice: doc.executionPrice,
        tradeDate: doc.tradeDate ?? doc.createdAt,
        ...req.valid.body,
    };

    // If the ticker changed, the old ticker must still be valid without this trade.
    if (updated.tickerSymbol !== doc.tickerSymbol) {
        await assertValidPositions(req.user._id, doc.tickerSymbol, { excludeId: doc._id });
    }
    await assertValidPositions(req.user._id, updated.tickerSymbol, { excludeId: doc._id, extra: updated });

    Object.assign(doc, req.valid.body);
    await doc.save();
    res.status(200).json(doc);
};

// @desc    Delete a transaction
// @route   DELETE /api/transactions/:id
exports.deleteTransaction = async (req, res) => {
    const doc = await Transaction.findOne({ _id: req.valid.params.id, userId: req.user._id });
    if (!doc) throw new AppError('Transaction not found', 404);

    // Removing a BUY could leave a later SELL without shares behind it.
    await assertValidPositions(req.user._id, doc.tickerSymbol, { excludeId: doc._id });

    await doc.deleteOne();
    res.status(200).json({ message: 'Transaction deleted' });
};
