const { z } = require('zod');

const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH'];
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- shared building blocks ----------
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParams = z.object({ id: objectId });

// Letters, digits and . & ^ = - cover tickers like AAPL, BRK.B, RELIANCE.NS, M&M, BAJAJ-AUTO
const tickerSymbol = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9.&^=-]{1,20}$/, 'Invalid ticker symbol');

const tradeDate = z
    .string()
    .trim()
    .pipe(z.coerce.date({ error: 'tradeDate must be a valid date (e.g. 2026-11-17)' }))
    .refine((d) => d.getTime() <= Date.now() + DAY_MS, 'tradeDate cannot be in the future');

// ---------- auth ----------
const passwordRule = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    // bcrypt only uses the first 72 BYTES, so reject anything longer up front
    .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes');

const registerSchema = z.object({
    fullName: z.string().trim().min(1, 'fullName is required').max(100),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('Invalid email address')),
    password: passwordRule,
    risk_preference: z.enum(RISK_LEVELS).optional(),
});

const loginSchema = z.object({
    email: z.string().trim().toLowerCase().min(1, 'email is required').max(254),
    password: z.string().min(1, 'password is required').max(200),
});

// ---------- transactions ----------
const transactionFields = z.object({
    tickerSymbol,
    transactionType: z.enum(['BUY', 'SELL']),
    quantity: z.number().positive('quantity must be greater than 0').max(1e9),
    executionPrice: z.number().positive('executionPrice must be greater than 0').max(1e9),
    tradeDate,
});

const createTransactionSchema = transactionFields.extend({ tradeDate: tradeDate.optional() });

const updateTransactionSchema = transactionFields
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, 'Provide at least one field to update');

const listTransactionsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    ticker: tickerSymbol.optional(),
    type: z.enum(['BUY', 'SELL']).optional(),
});

// ---------- portfolio ----------
// ?prices=AAPL:190.5,MSFT:410  -> { AAPL: 190.5, MSFT: 410 }
const portfolioQuery = z.object({
    prices: z
        .string()
        .max(2000)
        .optional()
        .transform((raw, ctx) => {
            if (!raw) return {};
            const map = {};
            for (const pair of raw.split(',')) {
                const [symbol, value, ...rest] = pair.split(':');
                const price = Number(value);
                const parsedSymbol = tickerSymbol.safeParse(symbol);
                if (rest.length || !parsedSymbol.success || value === undefined || value.trim() === '' || !Number.isFinite(price) || price <= 0) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'prices must look like AAPL:190.5,MSFT:410 (positive numbers)',
                    });
                    return z.NEVER;
                }
                map[parsedSymbol.data] = price;
            }
            return map;
        }),
});

module.exports = {
    idParams,
    registerSchema,
    loginSchema,
    createTransactionSchema,
    updateTransactionSchema,
    listTransactionsQuery,
    portfolioQuery,
};
