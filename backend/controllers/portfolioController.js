const Transaction = require('../models/Transaction');
const { computeHoldings } = require('../utils/portfolio');

// @desc    Current holdings, cost basis and P/L for the logged-in user
// @route   GET /api/portfolio?prices=AAPL:190.5,MSFT:410
//          `prices` is optional; when given, market value and unrealised P/L
//          are included for the tickers supplied.
exports.getPortfolio = async (req, res) => {
    const txs = await Transaction.find({ userId: req.user._id }).lean();
    res.status(200).json(computeHoldings(txs, req.valid.query.prices));
};
