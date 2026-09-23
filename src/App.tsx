import { useState, useEffect } from 'react'
import { mpesa, auth, channels, type Transaction as ApiTx, type Summary, type Channel } from './lib/mpesa'
import logo from './logo.png'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'transactions' | 'savings' | 'reports' | 'settings'
type AuthScreen = 'login' | 'register'
type AppScreen = 'app' | 'setup'

interface SavingsGoal {
  id: string
  name: string
  target: number
  saved: number
  deadline: string
}

interface SessionUser {
  businessName: string
  ownerName: string
  token: string
}

// ─── Setup Channel Screen (shown once after Google OAuth) ─────────────────────

function SetupChannel({ user, onDone }: { user: SessionUser; onDone: (businessName: string) => void }) {
  const [form, setForm] = useState({ businessName: user.businessName === user.ownerName ? '' : user.businessName, type: 'till' as 'till' | 'paybill' | 'pochi', identifier: '', label: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (form.businessName.trim()) {
        await fetch('/api/auth/update-profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
          body: JSON.stringify({ businessName: form.businessName.trim() }),
        })
      }
      await channels.add({ type: form.type, identifier: form.identifier, label: form.label || undefined })
      onDone(form.businessName.trim() || user.businessName)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: `url(/tenga.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="w-full max-w-sm relative z-10">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="TENGABIZ" className="h-20 w-auto" />
        </div>
        <div className="bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm">
          <div className="mb-5">
            <p className="font-display text-lg font-bold text-[#1c1c1e]">Welcome, {user.ownerName.split(' ')[0]}! 👋</p>
            <p className="text-sm text-[#718096] mt-1">Set up your business to start tracking payments.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Business Name</label>
              <input required value={form.businessName}
                placeholder="e.g. Mama Njeri's Shop"
                onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Payment Channel Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c] bg-white">
                <option value="till">M-PESA Till Number</option>
                <option value="paybill">PayBill Shortcode</option>
                <option value="pochi">Pochi la Biashara (Phone)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">
                {form.type === 'pochi' ? 'Phone Number' : 'Shortcode / Number'}
              </label>
              <input required value={form.identifier}
                placeholder={form.type === 'pochi' ? '0712345678' : form.type === 'till' ? '174379' : '600984'}
                onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Label (optional)</label>
              <input value={form.label} placeholder="e.g. Main Shop Till"
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22] disabled:opacity-60">
              {loading ? 'Saving...' : 'Save & Go to Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Live data hook ───────────────────────────────────────────────────────────

function useLiveData() {
  const [transactions, setTransactions] = useState<ApiTx[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_in: 0, total_business_lock: 0, total_savings: 0, total_flexible: 0, tx_count: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([mpesa.getTransactions(), mpesa.getSummary()])
      .then(([txs, sum]) => { setTransactions(txs); setSummary(sum) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { transactions, summary, loading }
}

// ─── Sample Data (savings goals — not yet from API) ───────────────────────────

const SAVINGS_GOALS: SavingsGoal[] = [
  { id: '1', name: 'New Display Fridge', target: 45000, saved: 28500, deadline: 'Dec 2026' },
  { id: '2', name: 'Business License Renewal', target: 15000, saved: 9000, deadline: 'Jan 2027' },
  { id: '3', name: 'Extra Stock Buffer', target: 20000, saved: 4200, deadline: 'Nov 2026' },
]

const CHANNEL_COLORS: Record<string, string> = {
  mpesa: 'bg-green-100 text-green-800',
  paybill: 'bg-blue-100 text-blue-800',
  pochi: 'bg-amber-100 text-amber-800',
}

const CHANNEL_LABELS: Record<string, string> = {
  mpesa: 'M-PESA Till',
  paybill: 'PayBill',
  pochi: 'Pochi la Biashara',
}

// ─── Components ──────────────────────────────────────────────────────────────

// ─── Auth screens ───────────────────────────────────────────────────────────────

function AuthPage({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [screen, setScreen] = useState<AuthScreen>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({
    email: '', password: '', businessName: '', ownerName: '', phone: '', location: ''
  })

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await auth.login(loginForm.email, loginForm.password)
      localStorage.setItem('tengabiz_token', res.token)
      onSuccess({ businessName: res.businessName, ownerName: res.ownerName, token: res.token })
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await auth.register(regForm)
      localStorage.setItem('tengabiz_token', res.token)
      onSuccess({ businessName: res.businessName, ownerName: res.ownerName, token: res.token })
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: `url(/tenga.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="w-full max-w-sm relative z-10">
        <div className="flex items-center gap-2 justify-center mb-8">
          <img src={logo} alt="TENGABIZ" className="h-28 w-auto" />
        </div>
        <div className="bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm">
          <div className="flex gap-1 mb-6 bg-[#f7f7f7] rounded-xl p-1">
            {(['login', 'register'] as AuthScreen[]).map(s => (
              <button key={s} onClick={() => { setScreen(s); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  screen === s ? 'bg-white text-[#1c1c1e] shadow-sm' : 'text-[#718096]'
                }`}>{s === 'login' ? 'Sign In' : 'Register'}</button>
            ))}
          </div>
          {screen === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#4a5568] block mb-1">Email</label>
                <input type="email" required value={loginForm.email}
                  onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#4a5568] block mb-1">Password</label>
                <input type="password" required value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22] disabled:opacity-60">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <div className="relative flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-[#e2e8f0]" />
                <span className="text-xs text-[#718096]">or</span>
                <div className="flex-1 h-px bg-[#e2e8f0]" />
              </div>
              <a href="/api/auth/google"
                className="w-full py-3 border border-[#e2e8f0] rounded-xl font-semibold text-sm text-[#1c1c1e] hover:bg-gray-50 flex items-center justify-center gap-2">
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Continue with Google
              </a>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              {([
                { label: 'Business Name', key: 'businessName', type: 'text', required: true },
                { label: 'Your Name', key: 'ownerName', type: 'text', required: true },
                { label: 'Email', key: 'email', type: 'email', required: true },
                { label: 'Password (min 6 chars)', key: 'password', type: 'password', required: true },
                { label: 'Phone (optional)', key: 'phone', type: 'tel', required: false },
                { label: 'Location (optional)', key: 'location', type: 'text', required: false },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-[#4a5568] block mb-1">{f.label}</label>
                  <input type={f.type} required={f.required}
                    value={regForm[f.key as keyof typeof regForm]}
                    onChange={e => setRegForm(r => ({ ...r, [f.key]: e.target.value }))}
                    className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
                </div>
              ))}
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22] disabled:opacity-60">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-white/70 mt-4">Smart Business Finance for Kenyan MSMEs</p>
      </div>
    </div>
  )
}

function Badge({ channel }: { channel: string }) {
  return (
    <span className={`text-[10px] font-mono-data font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${CHANNEL_COLORS[channel]}`}>
      {CHANNEL_LABELS[channel]}
    </span>
  )
}

function AllocationRing({ pct, color, label, amount }: { pct: number; color: string; label: string; amount: string }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
          <circle
            cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-base font-bold text-[#1c1c1e]">{pct}%</span>
        </div>
      </div>
      <p className="font-display text-xs font-semibold text-[#4a5568] text-center leading-tight">{label}</p>
      <p className="font-mono-data text-sm font-semibold" style={{ color }}>{amount}</p>
    </div>
  )
}

function Dashboard({ transactions, summary }: { transactions: ApiTx[], summary: Summary }) {
  const totalBalance = summary.total_in
  const businessLock = summary.total_business_lock
  const savings = summary.total_savings
  const flexible = summary.total_flexible
  const weeklyIncome = transactions
    .filter(t => t.type === 'in')
    .reduce((s, t) => s + t.amount, 0)
  const weeklyExpenses = 0 // outgoing not yet tracked via Daraja

  function formatDate(raw: string) {
    if (!raw) return ''
    const s = String(raw)
    if (s.length === 14) {
      return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
    }
    return new Date(raw).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="space-y-6">
      {/* Balance Hero */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 60%, #e8a020 140%)' }}
      >
        <div className="absolute top-0 right-0 w-48 h-48 opacity-10" style={{
          background: 'radial-gradient(circle, white 0%, transparent 70%)',
          transform: 'translate(30%, -30%)'
        }} />
        <p className="text-green-100 text-sm font-medium mb-1">Total Business Balance</p>
        <p className="font-display text-4xl font-bold mb-1 tracking-tight">
          KES {totalBalance.toLocaleString()}
        </p>
        <p className="text-green-200 text-xs font-mono-data">Updated: {transactions[0] ? formatDate(transactions[0].transaction_date) : 'No transactions yet'}</p>

        <div className="mt-5 flex gap-4">
          <div className="bg-white/15 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="text-green-100 text-xs">Total Income</p>
            <p className="font-display font-bold text-lg">+{weeklyIncome.toLocaleString()}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="text-green-100 text-xs">Expenses</p>
            <p className="font-display font-bold text-lg">-{weeklyExpenses.toLocaleString()}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="text-green-100 text-xs">Net</p>
            <p className="font-display font-bold text-lg">+{(weeklyIncome - weeklyExpenses).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 60/20/20 Allocation */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#1c1c1e]">TENGA Allocation</h3>
            <p className="text-xs text-[#718096]">Your money, organized automatically</p>
          </div>
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">60 · 20 · 20</span>
        </div>
        <div className="flex justify-around">
          <AllocationRing pct={60} color="#1a6b3c" label="Business Lock" amount={`KES ${businessLock.toLocaleString()}`} />
          <AllocationRing pct={20} color="#e8a020" label="Savings & Growth" amount={`KES ${savings.toLocaleString()}`} />
          <AllocationRing pct={20} color="#2563eb" label="Flexible Funds" amount={`KES ${flexible.toLocaleString()}`} />
        </div>
      </div>

      {/* Alerts */}
      {transactions.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
          <div>
            <p className="font-display font-semibold text-amber-800 text-sm">No transactions yet</p>
            <p className="text-amber-700 text-xs mt-0.5">Payments received via M-PESA will appear here automatically.</p>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <h3 className="font-display font-bold text-[#1c1c1e]">Recent Activity</h3>
          <span className="text-xs text-[#2d9558] font-semibold cursor-pointer">See all →</span>
        </div>
        {transactions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[#718096] text-center">Transactions will appear here once payments come in.</p>
        ) : transactions.slice(0, 5).map((tx) => (
          <div key={tx.id} className="px-5 py-3 flex items-center gap-3 border-b border-[#f7f7f7] last:border-0 hover:bg-gray-50">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base ${tx.type === 'in' ? 'bg-green-50' : 'bg-red-50'}`}>
              {tx.type === 'in' ? '↓' : '↑'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1c1c1e] truncate">{tx.mpesa_receipt ?? tx.account_ref ?? 'Payment'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[#718096]">{formatDate(tx.transaction_date)}</span>
                <Badge channel={tx.channel} />
              </div>
            </div>
            <div className="text-right">
              <p className={`font-mono-data font-semibold text-sm ${tx.type === 'in' ? 'text-[#1a6b3c]' : 'text-[#e53e3e]'}`}>
                {tx.type === 'in' ? '+' : '-'}{tx.amount.toLocaleString()}
              </p>
              {!tx.allocated && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Pending</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Credit Score Bar */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-bold text-[#1c1c1e]">Business Credit Score</h3>
            <p className="text-xs text-[#718096]">Based on your transaction history</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-bold text-[#1a6b3c]">682</p>
            <p className="text-xs text-green-600 font-semibold">Good</p>
          </div>
        </div>
        <div className="h-2.5 bg-[#e2e8f0] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: '68%', background: 'linear-gradient(90deg, #e8a020, #1a6b3c)' }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#718096]">Poor</span>
          <span className="text-[10px] text-[#718096]">Excellent</span>
        </div>
        <p className="text-xs text-[#4a5568] mt-3 bg-green-50 px-3 py-2 rounded-lg border border-green-100">
          You qualify for KES 50,000 – 150,000 business loans from M-Pawa, KCB Mtaani, and Equity Wezesha.
        </p>
      </div>
    </div>
  )
}

function Transactions({ transactions }: { transactions: ApiTx[] }) {
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all')
  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter)

  function formatDate(raw: string) {
    if (!raw) return ''
    const s = String(raw)
    if (s.length === 14) return `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)} ${s.slice(8,10)}:${s.slice(10,12)}`
    return new Date(raw).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-[#1c1c1e]">All Transactions</h2>
        <p className="text-sm text-[#718096]">Every shilling, tracked and allocated</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'in', 'out'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${filter === f
              ? 'bg-[#1a6b3c] text-white border-[#1a6b3c]'
              : 'bg-white text-[#4a5568] border-[#e2e8f0] hover:border-[#1a6b3c]'}`}
          >
            {f === 'all' ? 'All' : f === 'in' ? '↓ Income' : '↑ Expenses'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[#718096] text-center">No transactions found.</p>
        ) : filtered.map((tx, i) => (
          <div key={tx.id} className={`px-5 py-4 flex items-center gap-3 hover:bg-gray-50 ${i < filtered.length - 1 ? 'border-b border-[#f0f0f0]' : ''}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${tx.type === 'in' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {tx.type === 'in' ? '↓' : '↑'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1c1c1e]">{tx.mpesa_receipt ?? tx.account_ref ?? 'Payment'}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-[#718096]">{formatDate(tx.transaction_date)}</span>
                <Badge channel={tx.channel} />
                {!tx.allocated && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Needs allocation</span>}
              </div>
            </div>
            <p className={`font-mono-data font-bold ${tx.type === 'in' ? 'text-[#1a6b3c]' : 'text-[#e53e3e]'}`}>
              {tx.type === 'in' ? '+' : '-'}KES {tx.amount.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Savings() {
  const totalSaved = SAVINGS_GOALS.reduce((s, g) => s + g.saved, 0)
  const totalTarget = SAVINGS_GOALS.reduce((s, g) => s + g.target, 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Savings & Growth</h2>
        <p className="text-sm text-[#718096]">Building toward your business dreams</p>
      </div>

      {/* Summary */}
      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #e8a020 0%, #f5c054 100%)' }}>
        <p className="text-amber-100 text-sm">Total Saved This Month</p>
        <p className="font-display text-3xl font-bold mt-1">KES {totalSaved.toLocaleString()}</p>
        <div className="mt-3 h-2 bg-white/30 rounded-full">
          <div className="h-full bg-white rounded-full" style={{ width: `${(totalSaved / totalTarget) * 100}%` }} />
        </div>
        <p className="text-amber-100 text-xs mt-1">{Math.round((totalSaved / totalTarget) * 100)}% of KES {totalTarget.toLocaleString()} total goal</p>
      </div>

      {/* Goals */}
      <div className="space-y-3">
        {SAVINGS_GOALS.map(goal => {
          const pct = Math.round((goal.saved / goal.target) * 100)
          return (
            <div key={goal.id} className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-display font-bold text-[#1c1c1e]">{goal.name}</p>
                    <p className="text-xs text-[#718096]">Target: {goal.deadline}</p>
                  </div>
                </div>
                <span className="font-mono-data text-sm font-bold text-[#e8a020]">{pct}%</span>
              </div>
              <div className="h-2.5 bg-[#f0f0f0] rounded-full mb-2">
                <div className="h-full rounded-full bg-[#e8a020]" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-mono-data text-[#1a6b3c] font-semibold">KES {goal.saved.toLocaleString()} saved</span>
                <span className="text-xs font-mono-data text-[#718096]">of KES {goal.target.toLocaleString()}</span>
              </div>
            </div>
          )
        })}
      </div>

      <button className="w-full py-3 rounded-xl border-2 border-dashed border-[#e2e8f0] text-[#718096] font-semibold text-sm hover:border-[#1a6b3c] hover:text-[#1a6b3c]">
        + Add New Savings Goal
      </button>
    </div>
  )
}

function Reports() {
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
  const income =  [42000, 38500, 51000, 47200, 55000, 61800]
  const expenses = [29000, 27000, 33000, 31000, 36000, 39000]
  const maxVal = Math.max(...income)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Business Reports</h2>
        <p className="text-sm text-[#718096]">Your financial story, ready for lenders</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Avg Monthly Revenue', val: 'KES 49,250', delta: '+14%', up: true },
          { label: 'Avg Monthly Expenses', val: 'KES 32,500', delta: '+8%', up: false },
          { label: 'Avg Net Profit', val: 'KES 16,750', delta: '+22%', up: true },
          { label: 'Savings Rate', val: '20%', delta: 'Consistent', up: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-[#e2e8f0]">
            <p className="text-xs text-[#718096] mb-1">{s.label}</p>
            <p className="font-display font-bold text-lg text-[#1c1c1e]">{s.val}</p>
            <p className={`text-xs font-semibold ${s.up ? 'text-green-600' : 'text-red-500'}`}>{s.delta} vs last period</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <h3 className="font-display font-bold text-[#1c1c1e] mb-1">Income vs Expenses</h3>
        <p className="text-xs text-[#718096] mb-4">Last 6 months (KES)</p>
        <div className="flex items-end gap-2 h-36">
          {months.map((m, i) => (
            <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex gap-0.5 items-end" style={{ height: 120 }}>
                <div
                  className="flex-1 rounded-t bg-[#1a6b3c]"
                  style={{ height: `${(income[i] / maxVal) * 100}%` }}
                />
                <div
                  className="flex-1 rounded-t bg-[#e8a020]"
                  style={{ height: `${(expenses[i] / maxVal) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-[#718096] font-mono-data">{m}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3">
          <span className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full bg-[#1a6b3c] inline-block" /> Income</span>
          <span className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full bg-[#e8a020] inline-block" /> Expenses</span>
        </div>
      </div>

      {/* Loan readiness */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
        <p className="font-display font-bold text-[#1a6b3c] mb-1">Loan Readiness Report</p>
        <p className="text-sm text-[#4a5568] mb-3">Your TENGABIZ records are ready to share with lenders. 6 months of verified transactions on file.</p>
        <div className="space-y-2">
          {[
            { label: 'Business age verified', ok: true },
            { label: 'Consistent income history', ok: true },
            { label: 'Savings discipline shown', ok: true },
            { label: 'Low debt-to-income ratio', ok: true },
            { label: 'Tax PIN registered', ok: false },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${item.ok ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-500'}`}>
                {item.ok ? '✓' : '○'}
              </span>
              <span className={`text-sm ${item.ok ? 'text-[#1c1c1e]' : 'text-[#718096]'}`}>{item.label}</span>
            </div>
          ))}
        </div>
        <button className="mt-4 w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
          Download PDF Statement
        </button>
      </div>
    </div>
  )
}

function Settings({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [userChannels, setUserChannels] = useState<Channel[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ type: 'till' as 'till' | 'paybill' | 'pochi', identifier: '', label: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    channels.list().then(setUserChannels).catch(console.error)
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      const ch = await channels.add(form)
      setUserChannels(c => [...c, ch])
      setForm({ type: 'till', identifier: '', label: '' })
      setAdding(false)
    } catch (err: any) { setError(err.message) }
  }

  async function handleRemove(id: string) {
    await channels.remove(id)
    setUserChannels(c => c.filter(ch => ch.id !== id))
  }

  const CHANNEL_TYPE_LABELS = { till: 'M-PESA Till', paybill: 'PayBill', pochi: 'Pochi la Biashara' }
  const CHANNEL_TYPE_COLORS = { till: 'bg-green-500', paybill: 'bg-blue-500', pochi: 'bg-amber-500' }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Business Profile</h2>
          <p className="text-sm text-[#718096]">Your business details and payment channels</p>
        </div>
        <button onClick={onLogout} className="text-xs text-red-500 font-semibold hover:text-red-700">Sign out</button>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] space-y-3">
        <h3 className="font-display font-bold text-[#1c1c1e]">{user.businessName}</h3>
        {[
          { label: 'Business Owner', val: user.ownerName },
        ].map(f => (
          <div key={f.label} className="flex justify-between py-2 border-b border-[#f0f0f0] last:border-0">
            <span className="text-sm text-[#718096]">{f.label}</span>
            <span className="text-sm font-medium text-[#1c1c1e]">{f.val}</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-[#1c1c1e]">Payment Channels</h3>
          <button onClick={() => setAdding(a => !a)}
            className="text-xs font-semibold text-[#1a6b3c] hover:underline">
            {adding ? 'Cancel' : '+ Add channel'}
          </button>
        </div>

        {adding && (
          <form onSubmit={handleAdd} className="mb-4 space-y-3 bg-[#f7f7f7] rounded-xl p-4">
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Channel Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c] bg-white">
                <option value="till">M-PESA Till Number</option>
                <option value="paybill">PayBill Shortcode</option>
                <option value="pochi">Pochi la Biashara (Phone)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">
                {form.type === 'pochi' ? 'Phone Number' : 'Shortcode / Number'}
              </label>
              <input required value={form.identifier}
                placeholder={form.type === 'pochi' ? '0712345678' : form.type === 'till' ? '174379' : '600984'}
                onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Label (optional)</label>
              <input value={form.label} placeholder="e.g. Main Shop Till"
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" className="w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
              Save Channel
            </button>
          </form>
        )}

        {userChannels.length === 0 && !adding ? (
          <p className="text-sm text-[#718096] text-center py-4">No channels added yet. Add your Till, PayBill, or Pochi number to start tracking payments.</p>
        ) : userChannels.map(ch => (
          <div key={ch.id} className="flex items-center gap-3 py-2 border-b border-[#f0f0f0] last:border-0">
            <div className={`w-2.5 h-2.5 rounded-full ${CHANNEL_TYPE_COLORS[ch.type]}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#1c1c1e]">{ch.label ?? CHANNEL_TYPE_LABELS[ch.type]}</p>
              <p className="text-xs text-[#718096] font-mono-data">{ch.identifier}</p>
            </div>
            <button onClick={() => handleRemove(ch.id)}
              className="text-xs text-red-400 hover:text-red-600 font-semibold">Remove</button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <h3 className="font-display font-bold text-[#1c1c1e] mb-1">Allocation Model</h3>
        <p className="text-xs text-[#718096] mb-4">How TENGABIZ splits incoming money</p>
        {[
          { label: 'Business Lock', pct: 60, color: '#1a6b3c' },
          { label: 'Savings & Growth', pct: 20, color: '#e8a020' },
          { label: 'Flexible Funds', pct: 20, color: '#2563eb' },
        ].map(a => (
          <div key={a.label} className="flex items-center gap-3 mb-3 last:mb-0">
            <div className="w-3 h-3 rounded-full" style={{ background: a.color }} />
            <span className="flex-1 text-sm text-[#1c1c1e]">{a.label}</span>
            <span className="font-mono-data font-bold text-sm" style={{ color: a.color }}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sidebar Nav ─────────────────────────────────────────────────────────────

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'transactions', label: 'Transactions', icon: '↕' },
  { id: 'savings', label: 'Savings', icon: '◎' },
  { id: 'reports', label: 'Reports', icon: '▦' },
  { id: 'settings', label: 'Profile', icon: '⚙' },
]

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [screen, setScreen] = useState<AppScreen>('app')
  const [user, setUser] = useState<SessionUser | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const urlBusiness = params.get('businessName')
    const urlOwner = params.get('ownerName')
    const isNew = params.get('isNew') === '1'
    if (urlToken && urlBusiness && urlOwner) {
      localStorage.setItem('tengabiz_token', urlToken)
      localStorage.setItem('tengabiz_business', urlBusiness)
      localStorage.setItem('tengabiz_owner', urlOwner)
      if (isNew) localStorage.setItem('tengabiz_setup', '1')
      window.history.replaceState({}, '', '/')
      return { token: urlToken, businessName: urlBusiness, ownerName: urlOwner }
    }
    const token = localStorage.getItem('tengabiz_token')
    const name = localStorage.getItem('tengabiz_business')
    const owner = localStorage.getItem('tengabiz_owner')
    return token && name && owner ? { token, businessName: name, ownerName: owner } : null
  })

  useEffect(() => {
    if (user && localStorage.getItem('tengabiz_setup') === '1') {
      setScreen('setup')
    }
  }, [user])

  const { transactions, summary, loading } = useLiveData()

  function handleAuthSuccess(u: SessionUser) {
    localStorage.setItem('tengabiz_business', u.businessName)
    localStorage.setItem('tengabiz_owner', u.ownerName)
    setUser(u)
  }

  function handleSetupDone(businessName: string) {
    localStorage.removeItem('tengabiz_setup')
    localStorage.setItem('tengabiz_business', businessName)
    setUser(u => u ? { ...u, businessName } : u)
    setScreen('app')
  }

  function handleLogout() {
    localStorage.removeItem('tengabiz_token')
    localStorage.removeItem('tengabiz_business')
    localStorage.removeItem('tengabiz_owner')
    setUser(null)
  }

  if (!user) return <AuthPage onSuccess={handleAuthSuccess} />
  if (screen === 'setup') return <SetupChannel user={user} onDone={handleSetupDone} />

  return (
    <div className="min-h-screen bg-[#fdf8f0] flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-[#0f3d22] text-white shrink-0 py-6 px-4 sticky top-0 h-screen">
        {/* Logo */}
        <div className="mb-8 px-2">
          <img src={logo} alt="TENGABIZ" className="h-16 w-auto" />
          <p className="text-green-400 text-[10px] mt-1 font-mono-data">Smart Business Finance</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-all ${
                tab === n.id
                  ? 'bg-[#e8a020] text-[#0f3d22]'
                  : 'text-green-200 hover:bg-white/10'
              }`}
            >
              <span className="text-base w-5 text-center">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Bottom profile */}
        <div className="mt-4 px-2 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#e8a020] flex items-center justify-center text-[#0f3d22] font-bold text-sm">{user.ownerName[0]}</div>
            <div>
              <p className="text-xs font-semibold text-white">{user.ownerName}</p>
              <p className="text-[10px] text-green-400">{user.businessName}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="bg-white border-b border-[#e2e8f0] px-5 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 md:hidden">
            <img src={logo} alt="TENGABIZ" className="h-12 w-auto" />
          </div>
          <div className="hidden md:block">
            <p className="font-display font-bold text-[#1c1c1e] capitalize">{tab}</p>
            <p className="text-xs text-[#718096]">Wednesday, 23 September 2026</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative w-8 h-8 rounded-full bg-[#fdf8f0] border border-[#e2e8f0] flex items-center justify-center text-sm hover:bg-[#e8a020]/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#e8a020] text-[#0f3d22] text-[9px] font-bold flex items-center justify-center">1</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-[#1a6b3c] flex items-center justify-center text-white font-bold text-sm md:hidden">A</div>
          </div>
        </header>

        {/* Page */}
        <div className="flex-1 p-5 md:p-6 max-w-2xl w-full mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-[#718096]">Loading...</p>
            </div>
          ) : (
            <>
              {tab === 'dashboard' && <Dashboard transactions={transactions} summary={summary} />}
              {tab === 'transactions' && <Transactions transactions={transactions} />}
              {tab === 'savings' && <Savings />}
              {tab === 'reports' && <Reports />}
              {tab === 'settings' && <Settings user={user} onLogout={handleLogout} />}
            </>
          )}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden sticky bottom-0 bg-white border-t border-[#e2e8f0] flex justify-around py-2 z-10">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${tab === n.id ? 'text-[#1a6b3c]' : 'text-[#718096]'}`}
            >
              <span className="text-lg">{n.icon}</span>
              <span className="text-[10px] font-semibold">{n.label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  )
}
