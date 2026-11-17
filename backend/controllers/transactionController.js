const Transaction = require('../models/Transaction');

// @desc    Get all transactions for logged-in user
// @route   GET /api/transactions
exports.getTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user._id });
        res.status(200).json(transactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Add a new stock transaction
// @route   POST /api/transactions
exports.addTransaction = async (req, res) => {
    try {
        const { tickerSymbol, quantity, executionPrice, transactionType } = req.body;

        if (!tickerSymbol || !quantity || !executionPrice) {
            return res.status(400).json({ message: 'Please add all required stock fields' });
        }

        const transaction = await Transaction.create({
            userId: req.user._id,
            tickerSymbol: tickerSymbol.toUpperCase(),
            quantity,
            executionPrice,
            transactionType: transactionType || 'BUY'
        });

        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};