# Stock Portfolio App

Backend REST API for recording stock transactions and tracking holdings, cost basis and profit/loss.
Stack: Node.js (>=20), Express 5, MongoDB (Mongoose), JWT auth, Zod validation.

## Run locally

```bash
cd backend
npm install
cp .env.example .env     # then fill in MONGO_URI and JWT_SECRET
npm run dev              # or: npm start
npm test
```

Generate a JWT secret (min 32 chars):
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Never commit `.env`.** It is git-ignored; use `.env.example` as the template.

## API

All `/api/transactions` and `/api/portfolio` routes need `Authorization: Bearer <token>`.

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | `{ fullName, email, password (8-72 bytes), risk_preference? LOW\|MODERATE\|HIGH }` |
| POST | `/api/auth/login` | `{ email, password }` -> `{ ..., token }` |
| GET | `/api/auth/me` | Current user |
| GET | `/api/transactions` | Paginated list. Query: `page`, `limit` (max 200), `ticker`, `type` |
| POST | `/api/transactions` | `{ tickerSymbol, transactionType: BUY\|SELL, quantity, executionPrice, tradeDate? }` |
| PATCH | `/api/transactions/:id` | Edit any of the fields above |
| DELETE | `/api/transactions/:id` | Delete |
| GET | `/api/portfolio` | Holdings, average cost, realised P/L. Optional `?prices=AAPL:190.5,MSFT:410` adds market value and unrealised P/L |
| GET | `/health` | Liveness + DB status |

Rules enforced by the API:
- A SELL (or an edit/delete) that would leave a ticker with a negative position at any point in time is rejected with `422`.
- `quantity` may be fractional; `quantity` and `executionPrice` must be > 0; `tradeDate` can be back-dated but not in the future.
- Cost basis uses the weighted **average cost** method. Fees and taxes are not modelled.

## Configuration

See `.env.example`. Notable settings: `CORS_ORIGIN` (allowed browser origins), `TRUST_PROXY` (set to `1` behind a reverse proxy so rate limiting sees real client IPs), `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`.
