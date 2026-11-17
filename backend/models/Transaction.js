const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        tickerSymbol: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            maxlength: 20,
        },
        transactionType: {
            type: String,
            enum: ['BUY', 'SELL'],
            required: true,
        },
        // Fractional shares are allowed; must be strictly positive.
        quantity: {
            type: Number,
            required: true,
            validate: {
                validator: (v) => Number.isFinite(v) && v > 0,
                message: 'quantity must be greater than 0',
            },
        },
        executionPrice: {
            type: Number,
            required: true,
            validate: {
                validator: (v) => Number.isFinite(v) && v > 0,
                message: 'executionPrice must be greater than 0',
            },
        },
        // When the trade actually happened (may be back-dated). createdAt is
        // when the record was entered.
        tradeDate: { type: Date, required: true, default: Date.now },
    },
    { timestamps: true }
);

// Supports the per-user list, per-ticker position checks and chronological replay.
transactionSchema.index({ userId: 1, tickerSymbol: 1, tradeDate: 1 });
transactionSchema.index({ userId: 1, tradeDate: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
