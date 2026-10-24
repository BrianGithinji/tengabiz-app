# Implementation Plan — Daraja M-PESA Integration Fixes

**Codebase:** `c:\Users\Hp\OneDrive\Desktop\TENGABIZ\NEW TENGABIZ\tengabiz-app`
**Source of truth:** Investigation report at `.agents/tasks/daraja-integration-investigation.md`
**Goal:** Real M-PESA C2B payments (Till, Paybill, Pochi la Biashara) are correctly matched to
users, persisted with the 60/20/20 split, and displayed on the dashboard.

---

## Pre-flight check

Before starting any fix, verify the backend compiles cleanly:

```
cd backend && npx tsc --noEmit
```

All fixes below must leave `npx tsc --noEmit` passing (zero errors).

---

- [ ] 1. **Fix 1 — Remove the duplicate C2B confirmation handler in `mpesa.ts` (CRITICAL)**

  **Why:** `router.post('/confirmation', ...)` (~line 109) is a legacy handler that runs the
  60/20/20 split but inserts transactions with `user_id = null` and stores balances only in
  memory. It is NOT the URL registered with Safaricom (that is `/api/payments/c2b-confirmation`),
  but its presence creates architectural confusion and the unauthenticated `GET /recent-transactions`
  endpoint it feeds leaks all transactions to anonymous callers.

  **File:** `backend/src/routes/mpesa.ts`

  **Exact changes:**

  1. Delete the `RecentTx` interface (lines ~15–23):
     ```typescript
     // DELETE this entire block:
     export interface RecentTx {
       id: string
       transId: string
       phone: string
       amount: number
       businessLock: number
       savings: number
       available: number
       timestamp: string
     }
     ```

  2. Delete the `recentTxFeed` array and `pushToFeed` function (lines ~24–27):
     ```typescript
     // DELETE:
     const recentTxFeed: RecentTx[] = []
     export function pushToFeed(tx: RecentTx) {
       recentTxFeed.unshift(tx)
       if (recentTxFeed.length > 50) recentTxFeed.pop()
     }
     ```

  3. Delete the `balances` in-memory object (lines ~29–30):
     ```typescript
     // DELETE:
     const balances = { businessLock: 0, savings: 0, available: 0 }
     ```

  4. Delete the `import { randomUUID } from 'crypto'` line — it is only used by the removed
     handler. (If the TypeScript compiler warns it is still used elsewhere in the file, keep it.)

  5. Delete the entire `router.post('/confirmation', ...)` handler block (lines ~109–146):
     ```typescript
     // DELETE from:
     // POST /api/mpesa/confirmation  — primary 60/20/20 split engine hook
     router.post('/confirmation', async (req, res) => {
       ...
     })
     // TO the closing })
     ```

  6. Delete the `router.get('/recent-transactions', ...)` handler (lines ~148–150):
     ```typescript
     // DELETE:
     router.get('/recent-transactions', (_req, res) => {
       res.json({ balances, transactions: recentTxFeed })
     })
     ```

  7. Remove `allocate` from the import of `'../daraja/callback.js'` since it is no longer
     used in this file after the handler is removed. The import line currently reads:
     ```typescript
     import {
       handleTransactionResult,
       handleTransactionTimeout,
       allocate,
     } from '../daraja/callback.js'
     ```
     Change it to:
     ```typescript
     import {
       handleTransactionResult,
       handleTransactionTimeout,
     } from '../daraja/callback.js'
     ```

  **Keep:** The `router.post('/validation', ...)` alias at line ~105 — it stays.

  **Verify:** `cd backend && npx tsc --noEmit` — zero TypeScript errors.

---

- [ ] 2. **Fix 2 — Normalize Pochi phone identifier on channel registration (CRITICAL)**

  **Why:** When a user types their Pochi number as `0712345678`, it is stored as-is in the DB.
  Safaricom sends the merchant's Pochi number as `254712345678` in `BusinessShortCode`.
  `resolveUser()` does an exact-match query, so `0712345678 ≠ 254712345678` and the user is
  never matched — the transaction lands with `user_id = null`.

  **Files:** `src/App.tsx` — two locations:

  ### Location A — `SetupChannel` component, `handleSubmit` function (~line 45)

  **Current code (around line 50–55):**
  ```typescript
  if (form.identifier.trim()) {
    await channels.add({ type: form.type, identifier: form.identifier.trim(), label: form.label || undefined })
  }
  ```

  **Replace with:**
  ```typescript
  if (form.identifier.trim()) {
    let identifier = form.identifier.trim()
    if (form.type === 'pochi') {
      const digits = identifier.replace(/\D/g, '')
      if (digits.startsWith('0')) {
        identifier = `254${digits.slice(1)}`
      } else if (digits.startsWith('7') || digits.startsWith('1')) {
        identifier = `254${digits}`
      } else {
        identifier = digits
      }
    }
    await channels.add({ type: form.type, identifier, label: form.label || undefined })
  }
  ```

  ### Location B — `Settings` component, `handleAdd` function (~line 1255)

  **Current code (around line 1257–1262):**
  ```typescript
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      const ch = await channels.add(form)
  ```

  **Replace the `channels.add(form)` call with normalization before add:**
  ```typescript
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      let identifier = form.identifier.trim()
      if (form.type === 'pochi') {
        const digits = identifier.replace(/\D/g, '')
        if (digits.startsWith('0')) {
          identifier = `254${digits.slice(1)}`
        } else if (digits.startsWith('7') || digits.startsWith('1')) {
          identifier = `254${digits}`
        } else {
          identifier = digits
        }
      }
      const ch = await channels.add({ ...form, identifier })
  ```

  **Verify:** `pnpm run build` (or `npx vite build`) from the workspace root — zero TypeScript/build
  errors. Also manually: type `0712345678` in the Pochi field in SetupChannel; confirm the value
  passed to `channels.add` is `254712345678` (add a `console.log(identifier)` temporarily if needed).

---

- [ ] 3. **Fix 3 — Fix channel label for Till vs Paybill in C2B confirmation (IMPORTANT)**

  **Why:** A Buy Goods (Till) payment also sets `BusinessShortCode` in the Daraja payload. The
  current code labels any payment with a `BusinessShortCode` as `'paybill'`, so Till payments are
  mislabelled. The correct discriminator is the `TransactionType` field (`'Buy Goods'` vs
  `'Pay Bill'`).

  **File:** `backend/src/daraja/callback.ts` — `handleC2BConfirmation` function (~line 79)

  **Current code:**
  ```typescript
  const { TransID, TransAmount, MSISDN, BillRefNumber, TransTime, BusinessShortCode } = req.body
  ```
  and:
  ```typescript
  channel: BusinessShortCode ? 'paybill' : 'pochi', type: 'in',
  ```

  **Change 1 — add `TransactionType` to destructuring:**
  ```typescript
  const { TransID, TransAmount, MSISDN, BillRefNumber, TransTime, BusinessShortCode, TransactionType } = req.body
  ```

  **Change 2 — fix channel assignment in the `insertTx` call:**
  ```typescript
  // OLD:
  channel: BusinessShortCode ? 'paybill' : 'pochi', type: 'in',

  // NEW:
  channel: TransactionType === 'Buy Goods' ? 'till' : BusinessShortCode ? 'paybill' : 'pochi', type: 'in',
  ```

  **Verify:** `cd backend && npx tsc --noEmit` — zero errors.

---

- [ ] 4. **Fix 4 — Add 30-second polling to `useLiveData` for real-time updates (IMPORTANT)**

  **Why:** Real Daraja callbacks arrive asynchronously after the user has already loaded the
  dashboard. Without polling, the user must reload the page to see a new payment. The `refresh()`
  callback already exists — it just needs to be called on a timer.

  **File:** `src/App.tsx` — `useLiveData` hook, inside the `useEffect` that fires on `authToken`
  change (~lines 165–210).

  **Current `useEffect` return / cleanup (end of the effect, ~line 207):**
  ```typescript
    return () => { active = false }
  }, [authToken])
  ```

  **Replace the entire `useEffect` body** with the following (the initial fetch logic stays the
  same; only the cleanup and the interval are new):

  ```typescript
  useEffect(() => {
    let active = true

    setTransactions([])
    setSummary({
      total_in: 0, total_business_lock: 0, total_savings: 0, total_flexible: 0, tx_count: 0,
    })

    if (!authToken) {
      setTransactions([])
      setSummary({
        total_in: 0, total_business_lock: 0, total_savings: 0, total_flexible: 0, tx_count: 0,
      })
      setError(null)
      setLoading(false)
      return () => { active = false }
    }

    setLoading(true)
    setError(null)

    Promise.all([mpesa.getTransactions(), mpesa.getSummary()])
      .then(([txs, sum]) => {
        if (!active) return
        setTransactions(txs)
        setSummary(sum)
      })
      .catch((err: unknown) => {
        if (!active) return
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    // Poll every 30 seconds so real Daraja callbacks surface without a page reload
    const intervalId = setInterval(() => {
      if (!active) return
      Promise.all([mpesa.getTransactions(), mpesa.getSummary()])
        .then(([txs, sum]) => {
          if (!active) return
          setTransactions(txs)
          setSummary(sum)
        })
        .catch((err: unknown) => {
          // Silent poll failure — don't show an error banner for background refreshes
          console.warn('[useLiveData poll]', err)
        })
    }, 30_000)

    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [authToken])
  ```

  **Verify:** `pnpm run build` — zero errors. In the browser, open DevTools Network tab; confirm
  `GET /api/mpesa/transactions` and `GET /api/mpesa/summary` fire once on load and then again
  every ~30 seconds.

---

- [ ] 5. **Fix 5 — Replace unauthenticated `GET /recent-transactions` with authenticated DB query (IMPORTANT)**

  **Why:** Fix 1 removed `recentTxFeed`. The endpoint must still exist for any callers, but it
  should now be user-scoped and require authentication, consistent with all other transaction
  endpoints. (The primary frontend polling uses `/api/mpesa/transactions`, but this endpoint
  serves as a convenience alias for the last 20 rows.)

  **File:** `backend/src/routes/mpesa.ts`

  After Fix 1 removed the old handler, add a new authenticated handler in its place. Insert it
  after the `GET /summary` handler (~line 108 after Fix 1 renumbering):

  ```typescript
  // GET /api/mpesa/recent-transactions — last 20 transactions for the logged-in user
  router.get('/recent-transactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
        [req.userId]
      )
      res.json(rows)
    } catch (err: any) {
      console.error('[recent-transactions]', err.message)
      res.status(500).json({ error: 'Failed to fetch recent transactions' })
    }
  })
  ```

  Note: `requireAuth` and `AuthRequest` are already imported in `mpesa.ts`; `pool` is already
  imported. No new imports needed.

  **Verify:** `cd backend && npx tsc --noEmit` — zero errors.
  Optionally: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/mpesa/recent-transactions`
  should return a JSON array; calling without a token should return 401.

---

- [ ] 6. **Fix 6 — Separate simulation route from real payment callbacks (MODERATE)**

  **Why:** `server.ts` mounts `paymentsRoutes` at both `/api/payments` and `/api/internal-payment`.
  This double-mount means the real Safaricom callbacks (`/api/payments/c2b-confirmation`) are also
  reachable at `/api/internal-payment/c2b-confirmation`, which is an unintended exposure. The
  simulation routes (`trigger-validation`, `trigger-confirmation`) should live in their own file,
  mounted only at `/api/internal-payment`.

  ### Step 6a — Create `backend/src/routes/simulation.ts`

  Create a new file at `backend/src/routes/simulation.ts` with the two simulation routes moved
  from `payments.ts`:

  ```typescript
  import { Router } from 'express'
  import { allocate } from '../daraja/callback.js'
  import { randomUUID } from 'crypto'
  import pool from '../db.js'
  import { requireAuth, type AuthRequest } from '../middleware/auth.js'

  const router = Router()

  // POST /api/internal-payment/trigger-validation
  // Used for local demo / pitch simulation — mirrors the Daraja C2B validation handshake
  router.post('/trigger-validation', (req, res) => {
    const { TransAmount, MSISDN, BillRefNumber } = req.body ?? {}
    console.log(`[Sim Validation] Phone: ${MSISDN}, Amount: ${TransAmount}, Ref: ${BillRefNumber}`)
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  })

  // POST /api/internal-payment/trigger-confirmation
  // Requires auth so the transaction is tied to the logged-in user.
  // Runs full 60/20/20 split and persists to DB.
  router.post('/trigger-confirmation', requireAuth, async (req: AuthRequest, res) => {
    const { TransID, TransAmount, MSISDN } = req.body ?? {}
    const amount = Number(TransAmount)

    if (!amount || !TransID || !MSISDN) {
      res.status(400).json({ error: 'TransID, TransAmount and MSISDN are required' })
      return
    }

    const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

    try {
      await pool.query(
        `INSERT INTO transactions
           (id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref,
            transaction_date, business_lock, savings_growth, flexible_funds, allocated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (mpesa_receipt) DO NOTHING`,
        [randomUUID(), req.userId, TransID, MSISDN, amount, 'sim', 'in', null,
         new Date().toISOString(), businessLock, savingsGrowth, flexibleFunds, 1]
      )
    } catch (err: any) {
      console.error('[Sim Confirmation] DB error:', err.message)
      res.status(500).json({ error: 'Failed to save transaction' })
      return
    }

    console.log(`[Sim Confirmation] KES ${amount} → Lock ${businessLock} | Savings ${savingsGrowth} | Available ${flexibleFunds}`)
    res.json({
      ResultCode: 0, ResultDesc: 'Accepted',
      split: { businessLock, savings: savingsGrowth, available: flexibleFunds },
    })
  })

  export default router
  ```

  ### Step 6b — Remove simulation routes from `backend/src/routes/payments.ts`

  **File:** `backend/src/routes/payments.ts`

  Remove the following imports that are only needed by the simulation routes:
  - `import { allocate } from '../daraja/callback.js'` — but keep the rest of the callback imports
  - `import { randomUUID } from 'crypto'`
  - `import { requireAuth, type AuthRequest } from '../middleware/auth.js'`
  - `import pool from '../db.js'`

  **Important:** Only remove these imports if they are no longer used in `payments.ts` after the
  simulation routes are removed. Since `payments.ts` will only contain the three Safaricom callback
  routes (`stk-callback`, `c2b-validation`, `c2b-confirmation`), none of these four imports will
  remain needed.

  Remove the entire simulation section (~lines 18–54):
  ```typescript
  // DELETE the comment block and both route handlers:
  // ── Internal simulation routes (no blocked keywords in path) ──────────────────
  // Used for local demo / pitch simulation — mirrors exact Daraja C2B logic

  // POST /api/internal-payment/trigger-validation
  router.post('/trigger-validation', (req, res) => {
    ...
  })

  // POST /api/internal-payment/trigger-confirmation
  router.post('/trigger-confirmation', requireAuth, async (req: AuthRequest, res) => {
    ...
  })
  ```

  After the removal, `payments.ts` should contain only:
  ```typescript
  import { Router } from 'express'
  import {
    handleStkCallback,
    handleC2BValidation,
    handleC2BConfirmation,
  } from '../daraja/callback.js'

  const router = Router()

  router.post('/stk-callback', handleStkCallback)
  router.post('/c2b-validation', handleC2BValidation)
  router.post('/c2b-confirmation', handleC2BConfirmation)

  export default router
  ```

  ### Step 6c — Update `backend/src/server.ts`

  **File:** `backend/src/server.ts`

  1. Add import for `simulationRoutes` (after the existing `paymentsRoutes` import):
     ```typescript
     import simulationRoutes from './routes/simulation.js'
     ```

  2. Replace the duplicate mount:
     ```typescript
     // OLD:
     app.use('/api/payments', paymentsRoutes)
     app.use('/api/internal-payment', paymentsRoutes)

     // NEW:
     app.use('/api/payments', paymentsRoutes)
     app.use('/api/internal-payment', simulationRoutes)
     ```

  **Verify:** `cd backend && npx tsc --noEmit` — zero errors.
  Then confirm the simulation button in the dashboard still works end-to-end:
  `POST /api/internal-payment/trigger-confirmation` with a valid JWT should return
  `{ ResultCode: 0, split: { ... } }`.

---

- [ ] 7. **Fix 7 — Add Refresh button to dashboard transaction feed (MODERATE)**

  **Why:** The 30-second polling (Fix 4) is silent. Users also need a way to manually trigger a
  refresh — especially after being told a payment has arrived.

  **File:** `src/App.tsx` — `Dashboard` component, in the transaction feed section (~line 845)

  ### Step 7a — Add `isRefreshing` local state

  Inside the `Dashboard` function, alongside the existing `useState` calls (~line 615), add:
  ```typescript
  const [isRefreshing, setIsRefreshing] = useState(false)
  ```

  ### Step 7b — Add `handleRefresh` function

  Inside the `Dashboard` function, add a handler after the existing `runSimulation` function:
  ```typescript
  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      await refresh()
    } finally {
      setIsRefreshing(false)
    }
  }
  ```

  ### Step 7c — Add the refresh button next to the "Transactions" heading

  **Current code (~line 845):**
  ```tsx
  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2 px-1">Transactions</p>
  ```

  **Replace with a flex row containing the label and button:**
  ```tsx
  <div className="flex items-center justify-between mb-2 px-1">
    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Transactions</p>
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      aria-label="Refresh transactions"
      className="w-6 h-6 flex items-center justify-center text-[#94a3b8] hover:text-[#1a6b3c] disabled:opacity-40 transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14" height="14"
        viewBox="0 0 24 24"
        fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={isRefreshing ? 'animate-spin' : ''}
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  </div>
  ```

  **Verify:** `pnpm run build` — zero errors. In the browser, clicking the refresh icon next to
  "Transactions" should briefly spin and then update the list.

---

- [ ] 8. **Fix 8 — Register C2B URLs button in Settings (MODERATE)**

  **Why:** After a user adds a new Till or Paybill channel, Safaricom must be re-notified of the
  callback URLs. Currently the admin must call the API manually. A "Sync M-PESA Callbacks" button
  in Settings gives the user a self-service way to trigger this.

  **File:** `src/App.tsx` — `Settings` component, Payment Channels section (~line 1356–1362)

  ### Step 8a — Add `syncStatus` local state

  Inside the `Settings` function (near the other `useState` calls), add:
  ```typescript
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  ```

  ### Step 8b — Add `handleSyncCallbacks` function

  Inside the `Settings` function, add alongside `handleAdd` / `handleRemove`:
  ```typescript
  async function handleSyncCallbacks() {
    setSyncStatus('loading')
    try {
      const res = await fetch('/api/mpesa/register-c2b', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Request failed: ${res.status}`)
      }
      setSyncStatus('success')
      setTimeout(() => setSyncStatus('idle'), 4000)
    } catch (err: any) {
      console.error('[register-c2b]', err.message)
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 5000)
    }
  }
  ```

  ### Step 8c — Add the Sync button in the Payment Channels card

  **Current code (~line 1357–1362):**
  ```tsx
  <div className="flex items-center justify-between mb-3">
    <h3 className="font-display font-bold text-[#1c1c1e]">Payment Channels</h3>
    <button onClick={() => setAdding(a => !a)}
      className="text-xs font-semibold text-[#1a6b3c] hover:underline">
      {adding ? 'Cancel' : '+ Add channel'}
    </button>
  </div>
  ```

  **Replace with (adds the Sync button below the heading row):**
  ```tsx
  <div className="flex items-center justify-between mb-2">
    <h3 className="font-display font-bold text-[#1c1c1e]">Payment Channels</h3>
    <button onClick={() => setAdding(a => !a)}
      className="text-xs font-semibold text-[#1a6b3c] hover:underline">
      {adding ? 'Cancel' : '+ Add channel'}
    </button>
  </div>
  <div className="mb-3">
    <button
      onClick={handleSyncCallbacks}
      disabled={syncStatus === 'loading'}
      className="text-xs font-semibold text-[#4a5568] border border-[#e2e8f0] rounded-lg px-3 py-1.5 hover:border-[#1a6b3c] hover:text-[#1a6b3c] disabled:opacity-50 transition-colors"
    >
      {syncStatus === 'loading' ? 'Syncing...' : '⟳ Sync M-PESA Callbacks'}
    </button>
    {syncStatus === 'success' && (
      <p className="text-xs text-green-600 mt-1 font-medium">✓ Callbacks registered with Safaricom</p>
    )}
    {syncStatus === 'error' && (
      <p className="text-xs text-red-500 mt-1">Failed to register. Check your network and try again.</p>
    )}
    <p className="text-[10px] text-[#94a3b8] mt-1">
      Run once after adding a new channel — Sync M-PESA Callbacks registers your confirmation and validation URLs with Safaricom.
    </p>
  </div>
  ```

  **Verify:** `pnpm run build` — zero errors. In the browser, navigate to Settings → Payment
  Channels; the "⟳ Sync M-PESA Callbacks" button should be visible. Clicking it should show
  "Syncing..." and then either the green success message or a red error (if the backend is not
  running).

---

## Final verification pass

After all 8 fixes are applied:

```bash
# 1. Backend TypeScript — must be zero errors
cd backend && npx tsc --noEmit

# 2. Frontend build — must complete without errors
cd .. && pnpm run build
```

No test suite is currently configured. Once the dev server is running, do a manual end-to-end
smoke test:

1. Register a new user → SetupChannel screen appears → add a Pochi number `0712345678` →
   confirm the stored identifier is `254712345678` (check DB: `SELECT identifier FROM channels WHERE type='pochi'`).
2. On the dashboard, click "Sync M-PESA Callbacks" in Settings — should succeed against the sandbox.
3. Use the Safaricom Daraja sandbox simulator (developer.safaricom.co.ke) to send a test C2B
   payment to the registered shortcode.
4. Within 30 seconds the dashboard transaction feed should update automatically (or click the
   ↻ refresh button for immediate update).
5. Verify the transaction row shows the correct channel badge (`till`, `paybill`, or `pochi`)
   and the balance cards reflect the 60/20/20 split.

---

## Dependency order

The fixes are ordered so each one leaves the codebase in a buildable state:

| Fix | Depends on |
|-----|-----------|
| Fix 1 | — (independent, removes dead code) |
| Fix 2 | — (independent, frontend only) |
| Fix 3 | — (independent, backend callback.ts only) |
| Fix 4 | — (independent, frontend hook) |
| Fix 5 | Fix 1 (replaces the deleted handler with an authenticated one) |
| Fix 6 | — (independent refactor, but logically after Fix 1 for clarity) |
| Fix 7 | Fix 4 (calls `refresh()` which exists already, but aligns with polling intent) |
| Fix 8 | — (independent, Settings UI) |
