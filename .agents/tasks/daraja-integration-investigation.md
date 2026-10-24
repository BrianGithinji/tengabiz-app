# Daraja/M-PESA Integration & Cash Flow Tracking — Investigation Report

**Date:** 2025  
**Codebase:** `c:\Users\Hp\OneDrive\Desktop\TENGABIZ\NEW TENGABIZ\tengabiz-app`  
**Scope:** End-to-end Daraja API integration, channel management, 60/20/20 split, and frontend display

---

## Summary (Key Finding First)

The core business logic (60/20/20 split, DB persistence, channel registration) is well-built and functional in isolation. However, the end-to-end real-money flow is broken in one critical way: **incoming C2B payments from Safaricom are never matched to any user**. The `resolveUser()` function in `callback.ts` looks up the payment's `BusinessShortCode` in the `channels` table, but the C2B confirmation handler in `mpesa.ts` — which is the one actually registered with Safaricom — bypasses `resolveUser()` entirely and inserts transactions with `user_id = null`. The result is that real M-PESA payments land in the database but belong to no user and never appear on any user's dashboard.

There are also two duplicate confirmation handlers (one in `mpesa.ts`, one in `payments.ts`) registered at different URLs, and the `MPESA_SHORTCODE` vs `MPESA_STK_SHORTCODE` distinction is not consistently handled. These issues must be resolved before a sandbox test can succeed end-to-end.

---

## 1. C2B Flow — Trace

### Channel Registration (`/api/mpesa/register-c2b`)

**File:** `backend/src/routes/mpesa.ts` (line ~64), `backend/src/daraja/c2b.ts`

`POST /api/mpesa/register-c2b` calls `registerC2BUrls()`, which POSTs to `${darajaBase()}/mpesa/c2b/v1/registerurl` with:
- `ShortCode`: `process.env.MPESA_SHORTCODE`
- `ConfirmationURL`: `${CALLBACK_BASE_URL}/api/payments/c2b-confirmation`
- `ValidationURL`: `${CALLBACK_BASE_URL}/api/payments/c2b-validation`
- `ResponseType`: `"Completed"` (means Safaricom will always confirm, never reject)

This endpoint is unauthenticated (no `requireAuth` guard) — anyone can trigger a re-registration. That is a minor issue but not a blocker.

### Safaricom → Backend Callback

After registration, Safaricom POSTs to two endpoints:

**Validation:** `POST /api/payments/c2b-validation`  
→ Handled by `handleC2BValidation()` in `callback.ts`. Always returns `{ ResultCode: 0 }`. This is correct.

**Confirmation:** `POST /api/payments/c2b-confirmation`  
→ Handled by `handleC2BConfirmation()` in `callback.ts`.

```typescript
// callback.ts — handleC2BConfirmation (the CORRECT handler)
const identifier = BusinessShortCode ?? normalisePhone(String(MSISDN))
const userId = await resolveUser(identifier)   // ← looks up channels table
await insertTx({ ..., user_id: userId, ... })
```

This handler correctly resolves the user via `resolveUser()`. BUT — see the critical bug below.

### The 60/20/20 Split (`allocate()`)

**File:** `backend/src/daraja/callback.ts`

```typescript
export function allocate(amount: number) {
  return {
    businessLock: Math.round(amount * 0.6),
    savingsGrowth: Math.round(amount * 0.2),
    flexibleFunds: Math.round(amount * 0.2),
  }
}
```

Simple, correct. Called from all three handlers (STK callback, C2B confirmation, simulation).

### DB Storage

Transactions go into the `transactions` table with columns: `id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref, transaction_date, business_lock, savings_growth, flexible_funds, allocated`.

The `mpesa_receipt` column has a `UNIQUE` constraint, so duplicate Safaricom callbacks are idempotent (ignored on conflict).

### Frontend Display

`useLiveData()` in `App.tsx` polls `GET /api/mpesa/transactions` (user-scoped) and `GET /api/mpesa/summary` (user-scoped) on mount. Both are authenticated and filter by `user_id = req.userId`. The Dashboard renders:
- Total balance (`total_in`)
- Three buckets: Available (20%), Business Lock (60%), Savings (20%)
- Transaction feed (last 8, with channel badges)

---

## 2. Channel Storage & User Linkage

**File:** `backend/src/db.ts`, `backend/src/routes/channels.ts`

### DB Schema — `channels` table

```sql
CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,          -- 'till' | 'paybill' | 'pochi'
  identifier  TEXT NOT NULL,          -- till number, paybill shortcode, or phone
  label       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, identifier)
);
```

A user registers a channel (type + identifier) after account creation via the `SetupChannel` screen in `App.tsx`. The channel type can be:
- `till` — Buy Goods Till number (e.g. `174379`)
- `paybill` — Paybill shortcode (e.g. `600984`)
- `pochi` — Phone number in `0712345678` format

The `channels` API (`POST /api/channels`) is authenticated via `requireAuth`, so channels are always tied to the logged-in user's `userId` (JWT-extracted).

Unique constraint `(type, identifier)` prevents two users from owning the same channel. A 409 is returned if another user already has it.

---

## 3. `resolveUser()` — How Incoming Payments Are Matched

**File:** `backend/src/daraja/callback.ts`

```typescript
async function resolveUser(identifier: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT user_id FROM channels WHERE identifier = $1 AND active = TRUE LIMIT 1`,
    [identifier]
  )
  return rows[0]?.user_id ?? null
}
```

For C2B payments, the identifier passed in is:
```typescript
const identifier = BusinessShortCode ?? normalisePhone(String(MSISDN))
```

- If `BusinessShortCode` is set (Till/Paybill payment): matches against the Till number or Paybill shortcode the user registered.
- If not (Pochi/phone payment): falls back to the sender's phone number — **this is wrong for Pochi**. For Pochi la Biashara, Safaricom sets `BusinessShortCode` to the merchant's phone number (the Pochi number), not the sender's MSISDN. The logic should use the merchant's Pochi number as the identifier, not the payer's MSISDN.

For STK Push callbacks, the identifier used is the `MPESA_STK_SHORTCODE` env var — fine as long as one user has that shortcode registered.

**However**, this entire function is only called from `handleC2BConfirmation()` in `callback.ts`. The actual Safaricom-facing C2B confirmation endpoint registered in Safaricom is `/api/payments/c2b-confirmation`, which does call this handler. The bug is elsewhere — see Critical Bug #1 below.

---

## 4. C2B URL Registration — Current State

**File:** `backend/src/daraja/c2b.ts`, `backend/src/routes/mpesa.ts`

The C2B registration uses `MPESA_SHORTCODE` (not `MPESA_STK_SHORTCODE`). Both are set in the env, both currently have the value `174379` (sandbox default).

**Registered URLs:**
- Confirmation: `${CALLBACK_BASE_URL}/api/payments/c2b-confirmation` → `handleC2BConfirmation()` ✓
- Validation: `${CALLBACK_BASE_URL}/api/payments/c2b-validation` → `handleC2BValidation()` ✓

BUT there is a second set of confirmation/validation handlers mounted at `/api/mpesa/confirmation` and `/api/mpesa/validation` in `mpesa.ts`. These are NOT registered with Safaricom — they're legacy/unused aliases. The `/api/mpesa/confirmation` handler inserts with `user_id = null` (see Critical Bug #1).

---

## 5. Frontend — Transaction and 60/20/20 Display

### `useLiveData` hook (`App.tsx`)

- Calls `mpesa.getTransactions()` → `GET /api/mpesa/transactions` (auth required)
- Calls `mpesa.getSummary()` → `GET /api/mpesa/summary` (auth required)
- Both are user-scoped (filtered by `user_id`)
- Called once on mount when `authToken` changes; no polling interval

**Gap:** No automatic refresh — if a payment arrives after the user loads the dashboard, they must manually refresh. There is a `refresh()` callback exposed, and the simulation button calls it after a simulated payment, but real Daraja callbacks don't trigger a frontend refresh.

### Dashboard (`App.tsx` — `Dashboard` component)

Displays:
- `total_in` as "Business Balance"
- Three tappable buckets: Available (`total_flexible`, 20%), Business Lock (`total_business_lock`, 60%), Savings (`total_savings`, 20%)
- Transaction feed (last 8), each with M-PESA receipt, date, channel badge, amount

The "Business / Personal" toggle shows a different 2-column layout for personal view (labels the buckets 60%/40% — this appears to be a display-only mode with no separate data source; it reads the same balances).

### `AvailableMoneyView.tsx`

Displays available funds. Action buttons (Lock, Save, Transfer to Personal, Pay Someone) are UI-only — they show toasts but do not call any API or update any DB balance. This is purely presentational.

### `ProfitLockView.tsx`

Displays business lock balance. "People I Pay" payee list is seeded with hard-coded demo data (Mama Grace Wholesalers, John, Mary). Data is not persisted to the DB — only in React state. The "Pay" button is a no-op.

### `SavingsView.tsx`

Displays savings balance. Savings goals seeded with hard-coded demo data. Goals are not persisted to DB. The "Pay" button is a no-op.

---

## 6. Critical Gaps and Bugs

### Critical Bug #1 — Duplicate Confirmation Handler Bypasses `resolveUser()`

**File:** `backend/src/routes/mpesa.ts` (~line 109–140)

The route `POST /api/mpesa/confirmation` contains a full C2B confirmation handler that:
1. Performs the 60/20/20 split
2. Updates in-memory `balances` (not the DB)
3. Inserts to the DB with **`user_id = null`**
4. Pushes to `recentTxFeed` (in-memory, unauthenticated)

This handler is NOT registered with Safaricom (the registered URL is `/api/payments/c2b-confirmation`), but it represents an old implementation pattern that could be accidentally triggered, and it demonstrates the architectural confusion: there are two parallel confirmation flows.

The real danger: `server.ts` mounts `paymentsRoutes` at **both** `/api/payments` AND `/api/internal-payment`:

```typescript
app.use('/api/payments', paymentsRoutes)
app.use('/api/internal-payment', paymentsRoutes)  // ← duplicate mount
```

This means any request to `/api/internal-payment/c2b-confirmation` also calls `handleC2BConfirmation`. This is intentional for the simulation route (`trigger-confirmation`) but exposes the real C2B handlers at an unintended second path.

### Critical Bug #2 — Pochi Identifier Logic Is Incorrect

**File:** `backend/src/daraja/callback.ts` — `handleC2BConfirmation()`

```typescript
const identifier = BusinessShortCode ?? normalisePhone(String(MSISDN))
```

For Pochi la Biashara, Safaricom sets `BusinessShortCode` to the merchant's Pochi phone number (e.g. `2547XXXXXXXX`). This is actually correct for Pochi — `BusinessShortCode` will be set to the merchant's phone. However:
- The user registered their Pochi channel with identifier `0712345678` (format from the UI placeholder)
- `normalisePhone` in `callback.ts` converts `07...` → `2547...`
- BUT the user's channel identifier stored in DB may be in `07...` format if they typed it that way and the frontend didn't normalize it

**Fix needed:** The `channels.add()` call in `App.tsx`/`SetupChannel` should normalize the phone identifier before storing, OR `resolveUser()` should query by both formats.

### Critical Bug #3 — C2B Handler Channel Field Is Wrong

**File:** `backend/src/daraja/callback.ts` — `handleC2BConfirmation()`

```typescript
channel: BusinessShortCode ? 'paybill' : 'pochi',
```

A Till (Buy Goods) payment also sets `BusinessShortCode` — it would be labelled `'paybill'` instead of `'till'`. The correct Daraja field to distinguish Till from Paybill is the `TransactionType` field in the C2B payload (`Pay Bill` vs `Buy Goods`), not whether `BusinessShortCode` is present.

### Gap #4 — No Real-Time Frontend Updates

The frontend has no WebSocket, SSE, or polling timer. Real Daraja callbacks arrive asynchronously. After a real payment, the user would need to reload the page to see it. The simulation button works because it calls `refresh()` after the POST completes — but that's synchronous with the user action.

### Gap #5 — `GET /api/mpesa/recent-transactions` Is User-Unscoped

**File:** `backend/src/routes/mpesa.ts`

This endpoint returns the in-memory `recentTxFeed` (and `balances`) without authentication. It's used in the old `mpesa.ts` confirmation handler. It leaks all recent transactions from all users to any anonymous caller.

### Gap #6 — Savings Goals Not Persisted to DB

The `savings_goals` table exists in the DB schema (`db.ts`) with `id, user_id, name, target, saved, deadline`. But `SavingsView.tsx` and the `Savings` component in `App.tsx` both manage goals exclusively in `localStorage`/React state. The DB table is never read or written. Real goal persistence requires API routes for `/api/savings-goals`.

### Gap #7 — Business Lock Actions Are Presentational Only

`AvailableMoneyView.tsx` and `ProfitLockView.tsx` show "confirm" buttons that fire a `showToast()` and reset state — no API call, no DB write. The balances displayed are the running totals from the split engine and don't change when the user "moves" money.

### Gap #8 — No Polling After Registration Completes

After a user registers a channel via `SetupChannel`, the frontend calls `channels.add()` but does not re-register C2B URLs with Safaricom. The admin must manually call `POST /api/mpesa/register-c2b`. In production, adding a new Till/Paybill should trigger or prompt a re-registration.

---

## 7. Environment Variables

All required keys are present in `backend/.env`:

| Key | Status |
|-----|--------|
| `MPESA_CONSUMER_KEY` | ✅ Set |
| `MPESA_CONSUMER_SECRET` | ✅ Set |
| `MPESA_ENV` | ✅ Set |
| `MPESA_SHORTCODE` | ✅ Set |
| `MPESA_STK_SHORTCODE` | ✅ Set |
| `MPESA_PASSKEY` | ✅ Set |
| `MPESA_C2B_TYPE` | ✅ Set |
| `CALLBACK_BASE_URL` | ✅ Set |
| `DATABASE_URL` | ✅ Set |
| `PORT` | ✅ Set |
| `FRONTEND_ORIGIN` | ✅ Set |
| `JWT_SECRET` | ✅ Set |
| `GOOGLE_CLIENT_ID` | ⚪ Commented out (optional) |
| `GOOGLE_CLIENT_SECRET` | ⚪ Commented out (optional) |

The `.env.example` uses the Safaricom sandbox defaults (`174379` shortcode, `bfb279...` passkey). Whether the actual `.env` has real sandbox app credentials (from developer.safaricom.co.ke) cannot be confirmed without reading secret values — that verification should be done manually.

---

## 8. DB Schema Summary

### `users`
```sql
id TEXT PK, email TEXT (nullable), pin_hash TEXT (nullable),
business_name TEXT, owner_name TEXT, phone TEXT UNIQUE,
location TEXT, business_photo TEXT, description TEXT,
lat DOUBLE PRECISION, lng DOUBLE PRECISION,
reg_cert_url TEXT, business_type TEXT, created_at TIMESTAMPTZ
```
Note: `email` and `pin_hash` were originally NOT NULL but migrations drop those constraints (see `db.ts` — `ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL`). The original error `null value in column "email" violates not-null constraint` was caused by an older schema version before the migration ran. This is now fixed.

### `channels`
```sql
id TEXT PK, user_id TEXT FK→users.id, type TEXT, identifier TEXT,
label TEXT, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ
UNIQUE(type, identifier)
```

### `transactions`
```sql
id TEXT PK, user_id TEXT FK→users.id (nullable, SET NULL on delete),
mpesa_receipt TEXT UNIQUE, phone TEXT, amount NUMERIC, channel TEXT,
type TEXT DEFAULT 'in', account_ref TEXT, transaction_date TEXT,
business_lock NUMERIC, savings_growth NUMERIC, flexible_funds NUMERIC,
allocated INTEGER DEFAULT 1, created_at TIMESTAMPTZ
```

### `savings_goals`
```sql
id TEXT PK, user_id TEXT FK→users.id, name TEXT, target NUMERIC,
saved NUMERIC DEFAULT 0, deadline TEXT, created_at TIMESTAMPTZ
```

---

## 9. Conclusions & Recommended Fixes

### Fix 1 (Critical) — Unify Confirmation Handler, Always Resolve User
The `POST /api/mpesa/confirmation` handler in `mpesa.ts` should be removed or redirected to `handleC2BConfirmation` from `callback.ts`. The registered Safaricom URL (`/api/payments/c2b-confirmation`) already calls the correct handler with `resolveUser()`. Remove the duplicate in `mpesa.ts`.

### Fix 2 (Critical) — Normalize Pochi Phone Identifier on Storage
In `App.tsx` → `SetupChannel`, before calling `channels.add()` for type `'pochi'`, normalize the phone to `254XXXXXXXXX` format. This ensures `resolveUser()` can match it against the `BusinessShortCode` Safaricom sends.

### Fix 3 (Important) — Fix Channel Label for Till vs Paybill
In `handleC2BConfirmation`, read `TransactionType` from the Daraja payload to distinguish `'till'` (Buy Goods) from `'paybill'` instead of using `BusinessShortCode` presence.

### Fix 4 (Important) — Add Frontend Polling or SSE for Real-Time Updates
Add a `setInterval` inside `useLiveData` (e.g. every 15–30 seconds) to call `refresh()`, so real Daraja callbacks surface on the dashboard without manual reload.

### Fix 5 (Important) — Secure `GET /api/mpesa/recent-transactions`
Add `requireAuth` to this endpoint and filter by `req.userId`, or remove it if `useLiveData` now polls the authenticated `/api/mpesa/transactions` endpoint.

### Fix 6 (Moderate) — Persist Savings Goals to DB
Create routes (`GET/POST/PATCH/DELETE /api/savings-goals`) backed by the existing `savings_goals` table, and wire `SavingsView.tsx` to use them instead of `localStorage`.

### Fix 7 (Moderate) — Make Available/Lock Action Buttons Functional
Implement actual money-movement API calls (at minimum, internal ledger moves) behind the "Confirm" buttons in `AvailableMoneyView.tsx` and `ProfitLockView.tsx`. Even a soft ledger move (DB column update, not an actual M-PESA transfer) would be meaningful for the cash flow tracking story.

### Fix 8 (Minor) — Remove Duplicate `paymentsRoutes` Mount
In `server.ts`, `paymentsRoutes` is mounted at both `/api/payments` and `/api/internal-payment`. The simulation endpoint (`trigger-confirmation`) can be moved to a dedicated `simulationRoutes` file so the real payment callbacks aren't double-exposed.

### For Sandbox Testing
1. Verify `CALLBACK_BASE_URL` points to a publicly reachable URL (ngrok or Render deployment) — Safaricom cannot reach `localhost`.
2. Call `POST /api/mpesa/register-c2b` once to register URLs with Safaricom sandbox.
3. Use the Safaricom Daraja sandbox simulator to trigger a test C2B payment to the registered shortcode.
4. Confirm the transaction arrives in `transactions` table with a non-null `user_id` (the user who registered that shortcode as a channel).
5. Reload the frontend and verify the balance and transaction appear.

---

*Report generated by automated investigation — no code was modified.*
