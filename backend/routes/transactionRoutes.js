const express = require('express');
const router = express.Router();
const {
    getTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
} = require('../controllers/transactionController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
    idParams,
    createTransactionSchema,
    updateTransactionSchema,
    listTransactionsQuery,
} = require('../validators/schemas');

// Every transaction route requires a valid JWT.
router.use(protect);

router
    .route('/')
    .get(validate({ query: listTransactionsQuery }), getTransactions)
    .post(validate({ body: createTransactionSchema }), addTransaction);

router
    .route('/:id')
    .patch(validate({ params: idParams, body: updateTransactionSchema }), updateTransaction)
    .delete(validate({ params: idParams }), deleteTransaction);

module.exports = router;
