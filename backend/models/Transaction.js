const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    tickerSymbol: { 
        type: String, 
        required: true,
        uppercase: true 
    },
    transactionType: { 
        type: String, 
        enum: ['BUY', 'SELL'], 
        required: true 
    },
    quantity: { 
        type: Number, 
        required: true,
        min: 1 
    },
    executionPrice: { 
        type: Number, 
        required: true,
        min: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);