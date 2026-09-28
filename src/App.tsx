import { useState, useEffect, useRef } from 'react'
import { mpesa, auth, channels, type Transaction as ApiTx, type Summary, type Channel } from './lib/mpesa'
import logo from './logo.png'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'transactions' | 'savings' | 'loans' | 'settings'
type AuthScreen = 'login' | 'register'
type AppScreen = 'app' | 'setup'

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
            <p className="font-display text-lg font-bold text-[#1c1c1e]">Welcome, {user.ownerName.split(' ')[0]}!</p>
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

// ─── Credit Score Formula ─────────────────────────────────────────────────────
// Range: 300–850 (FICO-style), 4 factors × ~137pts each
// 1. Volume      — total income vs KES 500k ceiling
// 2. Frequency   — tx count vs 100 ceiling
// 3. Savings     — savings / total_in vs 20% target
// 4. Consistency — active months in last 6

function calcCreditScore(transactions: ApiTx[], summary: Summary) {
  const inTx = transactions.filter(t => t.type === 'in')
  const totalIn = Number(summary.total_in) || 0
  const totalSavings = Number(summary.total_savings) || 0

  const volumePts = Math.round(Math.min(totalIn / 500_000, 1) * 137)
  const freqPts = Math.round(Math.min(inTx.length / 100, 1) * 138)
  const savingsPts = Math.round(Math.min(totalIn > 0 ? (totalSavings / totalIn) / 0.20 : 0, 1) * 137)

  const now = new Date()
  const activeMonths = new Set(
    inTx.map(tx => {
      const raw = String(tx.transaction_date)
      const d = raw.length === 14
        ? new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`)
        : new Date(raw)
      const ago = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      return ago >= 0 && ago < 6 ? `${d.getFullYear()}-${d.getMonth()}` : null
    }).filter(Boolean)
  ).size
  const consistencyPts = Math.round(Math.min(activeMonths / 6, 1) * 138)

  const score = 300 + volumePts + freqPts + savingsPts + consistencyPts
  const label = score >= 750 ? 'Excellent' : score >= 700 ? 'Very Good' : score >= 650 ? 'Good' : score >= 580 ? 'Fair' : 'Poor'
  const color = score >= 700 ? '#1a6b3c' : score >= 580 ? '#e8a020' : '#e53e3e'
  const loanMax = Math.round((score - 300) / 550 * 500_000 / 1000) * 1000
  const loanMin = Math.round(loanMax * 0.3 / 1000) * 1000
  const loanRange = loanMax < 10_000
    ? 'Build more transaction history to qualify'
    : `KES ${loanMin.toLocaleString()} – ${loanMax.toLocaleString()}`

  return {
    score, label, color, loanRange,
    factors: [
      { name: 'Transaction Volume', pts: volumePts, max: 137 },
      { name: 'Payment Frequency', pts: freqPts, max: 138 },
      { name: 'Savings Discipline', pts: savingsPts, max: 137 },
      { name: 'Income Consistency', pts: consistencyPts, max: 138 },
    ],
  }
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Habari ya asubuhi'
  if (h < 17) return 'Habari ya mchana'
  return 'Habari ya jioni'
}

// ─── Google Maps helpers ──────────────────────────────────────────────────────

function loadMapsScript(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const key = (window as any).__GMAPS_KEY__
    if (!key || key === '%VITE_GOOGLE_MAPS_KEY%') { reject(new Error('no_key')); return }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('load_failed'))
    document.head.appendChild(s)
  })
}

function LocationPicker({ value, onChange }: {
  value: { address: string; lat: number | null; lng: number | null }
  onChange: (v: { address: string; lat: number | null; lng: number | null }) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadMapsScript()
      .then(() => setReady(true))
      .catch(() => setReady(false))
  }, [])

  useEffect(() => {
    if (!ready || !inputRef.current) return
    const ac = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'ke' },
    })
    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      const lat = place.geometry?.location?.lat() ?? null
      const lng = place.geometry?.location?.lng() ?? null
      onChange({ address: place.formatted_address ?? inputRef.current!.value, lat, lng })
    })
    return () => (window as any).google.maps.event.clearInstanceListeners(ac)
  }, [ready])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value.address}
      onChange={e => onChange({ address: e.target.value, lat: null, lng: null })}
      placeholder="Search for your business location..."
      className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]"
    />
  )
}

function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  const key = (window as any).__GMAPS_KEY__
  if (!key || key === '%VITE_GOOGLE_MAPS_KEY%') return null
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x200&markers=color:green%7C${lat},${lng}&key=${key}`
  return <img src={src} alt="Business location" className="w-full rounded-xl mt-3 object-cover" style={{ height: 160 }} />
}

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

function AuthPage({ onSuccess }: { onSuccess: (user: SessionUser, isNew?: boolean) => void }) {
  const [screen, setScreen] = useState<AuthScreen>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({
    email: '', password: '', confirmPassword: '', businessName: '', ownerName: '', phone: '', description: '', businessType: '',
    location: '', lat: null as number | null, lng: null as number | null,
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
    e.preventDefault(); setError('')
    if (regForm.password !== regForm.confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await auth.register({
        email: regForm.email, password: regForm.password, businessName: regForm.businessName,
        ownerName: regForm.ownerName, phone: regForm.phone, businessType: regForm.businessType, description: regForm.description,
        location: regForm.location, lat: regForm.lat ?? undefined, lng: regForm.lng ?? undefined,
      })
      localStorage.setItem('tengabiz_token', res.token)
      onSuccess({ businessName: res.businessName, ownerName: res.ownerName, token: res.token }, true)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: `url(/tenga.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="w-full max-w-sm relative z-10">
        <div className="flex items-center gap-2 justify-center mb-4">
          <img src={logo} alt="TENGABIZ" className="h-20 w-auto" />
        </div>
        <div className="bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
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
                { label: 'Confirm Password', key: 'confirmPassword', type: 'password', required: true },
                { label: 'Phone Number', key: 'phone', type: 'tel', required: true },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-[#4a5568] block mb-1">{f.label}</label>
                  <input type={f.type} required={f.required}
                    value={regForm[f.key as keyof typeof regForm] as string}
                    onChange={e => setRegForm(r => ({ ...r, [f.key]: e.target.value }))}
                    className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-[#4a5568] block mb-1">Business Type</label>
                <select value={regForm.businessType}
                  onChange={e => setRegForm(r => ({ ...r, businessType: e.target.value }))}
                  className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c] bg-white">
                  <option value="">Select business type...</option>
                  {[
                    'Grocery shop', 'Cosmetics & Beauty', 'Clothing & Apparel', 'Electronics & Phones',
                    'Hardware & Building', 'Pharmacy & Health', 'Food & Restaurant', 'Salon & Barbershop',
                    'Stationery & Books', 'Livestock & Farming', 'Transport & Logistics', 'Other',
                  ].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#4a5568] block mb-1">Business Location</label>
                <LocationPicker
                  value={{ address: regForm.location, lat: regForm.lat, lng: regForm.lng }}
                  onChange={v => setRegForm(r => ({ ...r, location: v.address, lat: v.lat, lng: v.lng }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#4a5568] block mb-1">Business Description</label>
                <textarea required rows={3} value={regForm.description}
                  placeholder="e.g. We sell fresh vegetables and groceries..."
                  onChange={e => setRegForm(r => ({ ...r, description: e.target.value }))}
                  className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c] resize-none" />
              </div>
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

function Dashboard({ transactions, summary, ownerName }: { transactions: ApiTx[], summary: Summary, ownerName: string }) {
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
        <p className="text-green-100 text-sm font-medium mb-1">{getGreeting()}, {ownerName}!</p>
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

function Savings({ summary }: { summary: Summary }) {
  const totalIn = Number(summary.total_in) || 0
  const totalSavings = Number(summary.total_savings) || 0
  const savingsRate = totalIn > 0 ? Math.round((totalSavings / totalIn) * 100) : 0

  const [goals, setGoals] = useState<{ id: string; name: string; target: number; saved: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('tengabiz_goals') ?? '[]') } catch { return [] }
  })
  const [showForm, setShowForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ name: '', target: '' })

  function saveGoals(next: typeof goals) {
    setGoals(next)
    localStorage.setItem('tengabiz_goals', JSON.stringify(next))
  }

  function addGoal(e: React.FormEvent) {
    e.preventDefault()
    const target = Number(goalForm.target)
    if (!goalForm.name.trim() || !target) return
    saveGoals([...goals, { id: crypto.randomUUID(), name: goalForm.name.trim(), target, saved: Math.min(totalSavings, target) }])
    setGoalForm({ name: '', target: '' })
    setShowForm(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Savings & Growth</h2>
        <p className="text-sm text-[#718096]">Building toward your business dreams</p>
      </div>

      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #e8a020 0%, #f5c054 100%)' }}>
        <p className="text-amber-100 text-sm">Total Savings Accumulated</p>
        <p className="font-display text-3xl font-bold mt-1">KES {totalSavings.toLocaleString()}</p>
        <div className="mt-3 h-2 bg-white/30 rounded-full">
          <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(savingsRate / 20 * 100, 100)}%` }} />
        </div>
        <p className="text-amber-100 text-xs mt-1">{savingsRate}% savings rate (target: 20% of income)</p>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] space-y-3">
        <h3 className="font-display font-bold text-[#1c1c1e]">Allocation Breakdown</h3>
        {[
          { label: 'Business Lock (60%)', val: Number(summary.total_business_lock), color: '#1a6b3c' },
          { label: 'Savings & Growth (20%)', val: totalSavings, color: '#e8a020' },
          { label: 'Flexible Funds (20%)', val: Number(summary.total_flexible), color: '#2563eb' },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between py-2 border-b border-[#f0f0f0] last:border-0">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
              <span className="text-sm text-[#4a5568]">{r.label}</span>
            </div>
            <span className="font-mono-data font-semibold text-sm" style={{ color: r.color }}>KES {r.val.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Savings Goals */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-[#1c1c1e]">Savings Goals</h3>
            <p className="text-xs text-[#718096]">Set targets and track your progress</p>
          </div>
          <button onClick={() => setShowForm(f => !f)}
            className="text-xs font-semibold text-[#1a6b3c] hover:underline">
            {showForm ? 'Cancel' : '+ New goal'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={addGoal} className="mb-4 bg-[#f7f7f7] rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Goal Name</label>
              <input required value={goalForm.name} placeholder="e.g. New fridge, Stock expansion"
                onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#4a5568] block mb-1">Target Amount (KES)</label>
              <input required type="number" min="1" value={goalForm.target} placeholder="e.g. 50000"
                onChange={e => setGoalForm(f => ({ ...f, target: e.target.value }))}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]" />
            </div>
            <button type="submit" className="w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
              Save Goal
            </button>
          </form>
        )}

        {goals.length === 0 && !showForm ? (
          <p className="text-sm text-[#718096] text-center py-3">No goals yet. Add one to start tracking your savings targets.</p>
        ) : goals.map(g => {
          const pct = Math.min(Math.round((g.saved / g.target) * 100), 100)
          const done = pct >= 100
          return (
            <div key={g.id} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1c1c1e]">{g.name}</span>
                  {done && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">✓ Reached</span>}
                </div>
                <button onClick={() => saveGoals(goals.filter(x => x.id !== g.id))}
                  className="text-[#c0c0c0] hover:text-red-400 text-lg leading-none">×</button>
              </div>
              <div className="flex justify-between text-xs text-[#718096] mb-1">
                <span>KES {g.saved.toLocaleString()} saved</span>
                <span>KES {g.target.toLocaleString()} target · {pct}%</span>
              </div>
              <div className="h-2 bg-[#e2e8f0] rounded-full">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? '#1a6b3c' : '#e8a020' }} />
              </div>
            </div>
          )
        })}
      </div>

      {totalIn === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-semibold">No savings data yet</p>
          <p className="text-xs text-amber-700 mt-0.5">Savings are automatically calculated from incoming M-PESA payments.</p>
        </div>
      )}
    </div>
  )
}

function LoanReadiness({ transactions, summary }: { transactions: ApiTx[], summary: Summary }) {
  const cs = calcCreditScore(transactions, summary)
  const totalIn = Number(summary.total_in) || 0
  const totalSavings = Number(summary.total_savings) || 0
  const savingsRate = totalIn > 0 ? Math.round((totalSavings / totalIn) * 100) : 0

  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { label: d.toLocaleString('en-KE', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() }
  })
  const incomeByMonth = months.map(m =>
    transactions.filter(tx => {
      if (tx.type !== 'in') return false
      const raw = String(tx.transaction_date)
      const d = raw.length === 14
        ? new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`)
        : new Date(raw)
      return d.getFullYear() === m.year && d.getMonth() === m.month
    }).reduce((s, tx) => s + Number(tx.amount), 0)
  )
  const maxVal = Math.max(...incomeByMonth, 1)
  const activeMonths = incomeByMonth.filter(v => v > 0).length
  const avgMonthly = activeMonths > 0 ? Math.round(totalIn / activeMonths) : 0

  const checklist = [
    { label: 'Has M-PESA payment channel', done: transactions.length > 0 || totalIn > 0 },
    { label: 'At least 3 months of income history', done: activeMonths >= 3 },
    { label: 'Savings rate ≥ 10%', done: savingsRate >= 10 },
    { label: 'Credit score ≥ 580 (Fair)', done: cs.score >= 580 },
    { label: '10+ transactions recorded', done: transactions.filter(t => t.type === 'in').length >= 10 },
  ]
  const readyCount = checklist.filter(c => c.done).length
  const readyPct = Math.round((readyCount / checklist.length) * 100)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Loan Readiness</h2>
        <p className="text-sm text-[#718096]">Your financial story, ready for lenders</p>
      </div>

      {/* Readiness score hero */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 60%, #e8a020 140%)' }}>
        <p className="text-green-100 text-sm mb-1">Overall Loan Readiness</p>
        <div className="flex items-end gap-3">
          <p className="font-display text-5xl font-bold">{readyPct}%</p>
          <p className="text-green-200 text-sm mb-1">{readyCount}/{checklist.length} criteria met</p>
        </div>
        <div className="mt-3 h-2.5 bg-white/30 rounded-full">
          <div className="h-full bg-white rounded-full" style={{ width: `${readyPct}%` }} />
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <h3 className="font-display font-bold text-[#1c1c1e] mb-3">Readiness Checklist</h3>
        <div className="space-y-2">
          {checklist.map(c => (
            <div key={c.label} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                c.done ? 'bg-green-100 text-green-700' : 'bg-[#f0f0f0] text-[#a0aec0]'
              }`}>{c.done ? '✓' : '○'}</div>
              <span className={`text-sm ${c.done ? 'text-[#1c1c1e]' : 'text-[#718096]'}`}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Credit score */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-bold text-[#1c1c1e]">Business Credit Score</h3>
            <p className="text-xs text-[#718096]">Calculated from your transaction history</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-bold" style={{ color: cs.color }}>{cs.score}</p>
            <p className="text-xs font-semibold" style={{ color: cs.color }}>{cs.label}</p>
          </div>
        </div>
        <div className="h-2.5 bg-[#e2e8f0] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${((cs.score - 300) / 550) * 100}%`, background: 'linear-gradient(90deg, #e8a020, #1a6b3c)' }} />
        </div>
        <div className="flex justify-between mt-1 mb-3">
          <span className="text-[10px] text-[#718096]">Poor (300)</span>
          <span className="text-[10px] text-[#718096]">Excellent (850)</span>
        </div>
        <div className="space-y-2">
          {cs.factors.map(f => (
            <div key={f.name}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-[#4a5568]">{f.name}</span>
                <span className="font-mono-data font-semibold text-[#1c1c1e]">{f.pts}/{f.max}</span>
              </div>
              <div className="h-1.5 bg-[#e2e8f0] rounded-full">
                <div className="h-full rounded-full bg-[#1a6b3c]" style={{ width: `${(f.pts / f.max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#4a5568] mt-3 bg-green-50 px-3 py-2 rounded-lg border border-green-100">
          Estimated loan range: {cs.loanRange}
        </p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Revenue', val: `KES ${totalIn.toLocaleString()}` },
          { label: 'Avg Monthly Income', val: avgMonthly > 0 ? `KES ${avgMonthly.toLocaleString()}` : '—' },
          { label: 'Total Savings', val: `KES ${totalSavings.toLocaleString()}` },
          { label: 'Savings Rate', val: `${savingsRate}%` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-[#e2e8f0]">
            <p className="text-xs text-[#718096] mb-1">{s.label}</p>
            <p className="font-display font-bold text-lg text-[#1c1c1e]">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Monthly income chart */}
      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
        <h3 className="font-display font-bold text-[#1c1c1e] mb-1">Monthly Income</h3>
        <p className="text-xs text-[#718096] mb-4">Last 6 months (KES)</p>
        {totalIn === 0 ? (
          <p className="text-sm text-[#718096] text-center py-4">No income data yet.</p>
        ) : (
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {months.map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex items-end" style={{ height: 100 }}>
                  <div className="w-full rounded-t bg-[#1a6b3c]" style={{ height: `${(incomeByMonth[i] / maxVal) * 100}%`, minHeight: incomeByMonth[i] > 0 ? 4 : 0 }} />
                </div>
                <span className="text-[10px] text-[#718096] font-mono-data">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Settings({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [userChannels, setUserChannels] = useState<Channel[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ type: 'till' as 'till' | 'paybill' | 'pochi', identifier: '', label: '' })
  const [error, setError] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [certUrl, setCertUrl] = useState<string | null>(null)
  const [certUploading, setCertUploading] = useState(false)
  const [profileInfo, setProfileInfo] = useState({ phone: '', businessType: '', description: '', location: '', lat: null as number | null, lng: null as number | null })
  const isNewUser = localStorage.getItem('tengabiz_new') === '1'

  useEffect(() => {
    channels.list().then(setUserChannels).catch(console.error)
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${user.token}` } })
      .then(r => r.json()).then(d => {
        if (d.business_photo) setPhotoUrl(d.business_photo)
        if (d.reg_cert_url) setCertUrl(d.reg_cert_url)
        if (d.phone) setProfileInfo(p => ({ ...p, phone: d.phone }))
        if (d.business_type) setProfileInfo(p => ({ ...p, businessType: d.business_type }))
        if (d.description) setProfileInfo(p => ({ ...p, description: d.description }))
        if (d.location) setProfileInfo(p => ({ ...p, location: d.location }))
        if (d.lat) setProfileInfo(p => ({ ...p, lat: d.lat, lng: d.lng }))
      })
      .catch(console.error)
  }, [])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('photo', file)
      const res = await fetch('/api/auth/upload-photo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPhotoUrl(data.photoUrl)
    } catch (err: any) { setError(err.message) }
    finally { setPhotoUploading(false) }
  }

  async function handleCertChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCertUploading(true)
    try {
      const fd = new FormData()
      fd.append('cert', file)
      const res = await fetch('/api/auth/upload-cert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCertUrl(data.certUrl)
    } catch (err: any) { setError(err.message) }
    finally { setCertUploading(false) }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      const ch = await channels.add(form)
      setUserChannels(c => [...c, ch])
      setForm({ type: 'till', identifier: '', label: '' })
      setAdding(false)
      localStorage.removeItem('tengabiz_new')
    } catch (err: any) { setError(err.message) }
  }

  async function handleRemove(id: string) {
    await channels.remove(id)
    setUserChannels(c => c.filter(ch => ch.id !== id))
  }

  const CHANNEL_TYPE_LABELS = { till: 'M-PESA Till', paybill: 'PayBill', pochi: 'Pochi la Biashara' }
  const CHANNEL_TYPE_BADGE = { till: 'bg-green-100 text-green-800', paybill: 'bg-blue-100 text-blue-800', pochi: 'bg-amber-100 text-amber-800' }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Business Profile</h2>
          <p className="text-sm text-[#718096]">Your business details and payment channels</p>
        </div>
        <button onClick={onLogout} className="text-xs text-red-500 font-semibold hover:text-red-700">Sign out</button>
      </div>

      {isNewUser && (
        <div className="bg-[#1a6b3c] text-white rounded-2xl p-4 flex items-start gap-3">
          <div className="flex-1">
            <p className="font-display font-bold text-sm">Welcome, {user.ownerName.split(' ')[0]}! Complete your profile</p>
            <p className="text-green-100 text-xs mt-0.5 mb-3">Add a business photo and payment channel to get started.</p>
            <label className="cursor-pointer inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-all">
              {photoUploading ? 'Uploading...' : photoUrl ? 'Photo uploaded — change it' : 'Upload business photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={photoUploading} />
            </label>
          </div>
          {photoUrl && <img src={photoUrl} alt="Business" className="w-14 h-14 rounded-xl object-cover shrink-0" />}
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] space-y-3">
        <div className="flex items-center gap-4">
          {photoUrl
            ? <img src={photoUrl} alt="Business" className="w-16 h-16 rounded-xl object-cover shrink-0" />
            : <label className="cursor-pointer w-16 h-16 rounded-xl bg-[#f7f7f7] border-2 border-dashed border-[#e2e8f0] flex flex-col items-center justify-center text-[#718096] hover:border-[#1a6b3c] transition-all shrink-0">
                <span className="text-xl">{photoUploading ? '...' : '+'}</span>
                <span className="text-[9px] font-semibold mt-0.5">{photoUploading ? 'Uploading' : 'Add photo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={photoUploading} />
              </label>
          }
          <div className="flex-1">
            <h3 className="font-display font-bold text-[#1c1c1e]">{user.businessName}</h3>
            {photoUrl && (
              <label className="cursor-pointer text-xs text-[#1a6b3c] font-semibold hover:underline mt-1 inline-block">
                {photoUploading ? 'Uploading...' : 'Change photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={photoUploading} />
              </label>
            )}
          </div>
        </div>
        {[
          { label: 'Business Owner', val: user.ownerName },
          ...(profileInfo.businessType ? [{ label: 'Business Type', val: profileInfo.businessType }] : []),
          ...(profileInfo.phone ? [{ label: 'Phone', val: profileInfo.phone }] : []),
          ...(profileInfo.description ? [{ label: 'Description', val: profileInfo.description }] : []),
          ...(profileInfo.location ? [{ label: 'Location', val: profileInfo.location }] : []),
        ].map(f => (
          <div key={f.label} className="flex justify-between py-2 border-b border-[#f0f0f0] last:border-0">
            <span className="text-sm text-[#718096]">{f.label}</span>
            <span className="text-sm font-medium text-[#1c1c1e] text-right max-w-[60%]">{f.val}</span>
          </div>
        ))}
        {profileInfo.lat && profileInfo.lng && <StaticMap lat={profileInfo.lat} lng={profileInfo.lng} />}

        <div className="pt-2 border-t border-[#f0f0f0]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#1c1c1e]">Registration Certificate</p>
              <p className="text-xs text-[#718096] mt-0.5">Optional — upload your business registration document</p>
            </div>
            {certUrl ? (
              <a href={certUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#1a6b3c] font-semibold hover:underline">View ↗</a>
            ) : null}
          </div>
          <label className={`mt-2 cursor-pointer flex items-center gap-2 border-2 border-dashed rounded-xl px-4 py-3 transition-all ${
            certUrl ? 'border-green-300 bg-green-50' : 'border-[#e2e8f0] hover:border-[#1a6b3c]'
          }`}>
            <span className="text-lg">{certUploading ? '...' : certUrl ? 'PDF' : 'Upload'}</span>
            <span className="text-xs font-semibold text-[#4a5568]">
              {certUploading ? 'Uploading...' : certUrl ? 'Certificate uploaded — click to replace' : 'Upload registration certificate (PDF or image)'}
            </span>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleCertChange} disabled={certUploading} />
          </label>
        </div>
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
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[#1c1c1e]">{ch.label ?? ch.identifier}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${CHANNEL_TYPE_BADGE[ch.type]}`}>{CHANNEL_TYPE_LABELS[ch.type]}</span>
              </div>
              <p className="text-xs text-[#718096] font-mono-data mt-0.5">{ch.identifier}</p>
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

// ─── Notification Bell ───────────────────────────────────────────────────────

function NotificationBell({ transactions }: { transactions: ApiTx[] }) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('tengabiz_dismissed') ?? '[]')) }
    catch { return new Set() }
  })

  const notifications = transactions
    .filter(tx => tx.type === 'in' && !dismissed.has(tx.id))
    .slice(0, 10)
    .map(tx => ({
      id: tx.id,
      title: `+KES ${Number(tx.amount).toLocaleString()} received`,
      body: tx.mpesa_receipt ? `Receipt: ${tx.mpesa_receipt}` : tx.account_ref ? `Ref: ${tx.account_ref}` : 'M-PESA payment',
      unallocated: !tx.allocated,
    }))

  function dismiss(id: string) {
    const next = new Set(dismissed).add(id)
    setDismissed(next)
    localStorage.setItem('tengabiz_dismissed', JSON.stringify([...next]))
  }

  function dismissAll() {
    const next = new Set([...dismissed, ...notifications.map(n => n.id)])
    setDismissed(next)
    localStorage.setItem('tengabiz_dismissed', JSON.stringify([...next]))
    setOpen(false)
  }

  if (notifications.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 rounded-full bg-[#fdf8f0] border border-[#e2e8f0] flex items-center justify-center text-sm hover:bg-[#e8a020]/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#e8a020] text-[#0f3d22] text-[9px] font-bold flex items-center justify-center">
          {notifications.length > 9 ? '9+' : notifications.length}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-xl border border-[#e2e8f0] z-30 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
              <p className="font-display font-bold text-sm text-[#1c1c1e]">Notifications</p>
              <button onClick={dismissAll} className="text-xs text-[#718096] hover:text-[#1a6b3c] font-semibold">Clear all</button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#f0f0f0]">
              {notifications.map(n => (
                <div key={n.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[#f7f7f7]">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-green-600 text-sm">↓</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1c1c1e]">{n.title}</p>
                    <p className="text-xs text-[#718096] truncate">{n.body}</p>
                    {n.unallocated && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold mt-1 inline-block">Pending allocation</span>
                    )}
                  </div>
                  <button onClick={() => dismiss(n.id)} className="text-[#c0c0c0] hover:text-[#718096] text-lg leading-none shrink-0">×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sidebar Nav ─────────────────────────────────────────────────────────────

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'transactions', label: 'Transactions', icon: '↕' },
  { id: 'savings', label: 'Savings', icon: '◎' },
  { id: 'loans', label: 'Loan Readiness', icon: '◈' },
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

  function handleAuthSuccess(u: SessionUser, isNew = false) {
    localStorage.setItem('tengabiz_business', u.businessName)
    localStorage.setItem('tengabiz_owner', u.ownerName)
    if (isNew) { localStorage.setItem('tengabiz_new', '1'); setTab('settings') }
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
            <p className="font-display font-bold text-[#1c1c1e]">{getGreeting()}, {user.ownerName}</p>
            <p className="text-xs text-[#718096]">{user.businessName}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell transactions={transactions} />
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
              {tab === 'dashboard' && <Dashboard transactions={transactions} summary={summary} ownerName={user.ownerName} />}
              {tab === 'transactions' && <Transactions transactions={transactions} />}
              {tab === 'savings' && <Savings summary={summary} />}
              {tab === 'loans' && <LoanReadiness transactions={transactions} summary={summary} />}
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
