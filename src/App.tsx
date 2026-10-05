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

function getGreeting(ownerName: string) {
  return `Jambo, ${ownerName}!`
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

// ─── Auth screens ────────────────────────────────────────────────────────────

const LOCKOUT_KEY = 'tengabiz_lockout'
const ATTEMPTS_KEY = 'tengabiz_attempts'
const MAX_ATTEMPTS = 3
const LOCKOUT_MS = 5 * 60 * 1000

function getLockoutRemaining(): number {
  const until = Number(localStorage.getItem(LOCKOUT_KEY) ?? 0)
  return Math.max(0, until - Date.now())
}

function recordFailedAttempt(): { locked: boolean } {
  const attempts = Number(localStorage.getItem(ATTEMPTS_KEY) ?? 0) + 1
  localStorage.setItem(ATTEMPTS_KEY, String(attempts))
  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS))
    localStorage.removeItem(ATTEMPTS_KEY)
    return { locked: true }
  }
  return { locked: false }
}

function clearAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY)
  localStorage.removeItem(LOCKOUT_KEY)
}

function AuthPage({ onSuccess }: { onSuccess: (user: SessionUser, isNew?: boolean) => void }) {
  const [screen, setScreen] = useState<AuthScreen>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Login state ──
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [lockRemaining, setLockRemaining] = useState(getLockoutRemaining)

  useEffect(() => {
    if (lockRemaining <= 0) return
    const t = setInterval(() => {
      const r = getLockoutRemaining()
      setLockRemaining(r)
      if (r <= 0) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  }, [lockRemaining])

  // ── Register wizard state ──
  const [slide, setSlide] = useState(0)
  const [reg, setReg] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpToken, setOtpToken] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (lockRemaining > 0) return
    setError(''); setLoading(true)
    try {
      const res = await auth.login(loginPhone, loginPin)
      clearAttempts()
      localStorage.setItem('tengabiz_token', res.token)
      onSuccess({ businessName: res.businessName, ownerName: res.ownerName, token: res.token })
    } catch (err: any) {
      const { locked } = recordFailedAttempt()
      if (locked) {
        setLockRemaining(LOCKOUT_MS)
        setError('Too many failed attempts. Locked for 5 minutes.')
      } else {
        const left = MAX_ATTEMPTS - Number(localStorage.getItem(ATTEMPTS_KEY) ?? 0)
        setError(`Incorrect phone or PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`)
      }
    } finally { setLoading(false) }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await auth.sendOtp(reg.phone)
      setSlide(1)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const code = otp.join('')
      const res = await auth.verifyOtp(reg.phone, code)
      setOtpToken(res.otpToken)
      setSlide(2)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (pin.length !== 4) { setError('PIN must be 4 digits'); return }
    if (pin !== confirmPin) { setError('PINs do not match'); return }
    setLoading(true)
    try {
      const res = await auth.register({
        firstName: reg.firstName, lastName: reg.lastName,
        phone: reg.phone, email: reg.email || undefined,
        pin, otpToken,
        businessName: `${reg.firstName} ${reg.lastName}`.trim(),
        ownerName: `${reg.firstName} ${reg.lastName}`.trim(),
      })
      localStorage.setItem('tengabiz_token', res.token)
      onSuccess({ businessName: res.businessName, ownerName: res.ownerName, token: res.token }, true)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  function handleOtpKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  function handleOtpChange(i: number, val: string) {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const lockMins = Math.ceil(lockRemaining / 60000)

  const bgCard = 'bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm overflow-y-auto'
  const inputCls = 'w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]'
  const labelCls = 'text-xs font-semibold text-[#4a5568] block mb-1'
  const btnPrimary = 'w-full py-3 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22] disabled:opacity-60'

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: 'url(/tenga.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="w-full max-w-sm relative z-10">
        <div className="flex justify-center mb-4">
          <img src={logo} alt="TENGABIZ" className="h-20 w-auto" />
        </div>
        <div className={bgCard} style={{ maxHeight: 'calc(100vh - 140px)' }}>
          {/* Tab switcher */}
          <div className="flex gap-1 mb-6 bg-[#f7f7f7] rounded-xl p-1">
            {(['login', 'register'] as AuthScreen[]).map(s => (
              <button key={s} onClick={() => { setScreen(s); setError(''); setSlide(0) }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  screen === s ? 'bg-white text-[#1c1c1e] shadow-sm' : 'text-[#718096]'
                }`}>{s === 'login' ? 'Sign In' : 'Register'}</button>
            ))}
          </div>

          {screen === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="tel" required value={loginPhone} placeholder="e.g. 0712345678"
                  onChange={e => setLoginPhone(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>4-Digit Security PIN</label>
                <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} required
                  value={loginPin} placeholder="••••"
                  onChange={e => { if (/^\d*$/.test(e.target.value)) setLoginPin(e.target.value.slice(0, 4)) }}
                  className={inputCls} />
              </div>
              {lockRemaining > 0 && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  Account locked. Try again in {lockMins} minute{lockMins !== 1 ? 's' : ''}.
                </p>
              )}
              {error && !lockRemaining && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading || lockRemaining > 0} className={btnPrimary}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <div>
              {/* Progress dots */}
              <div className="flex justify-center gap-2 mb-5">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${
                    i === slide ? 'w-6 bg-[#1a6b3c]' : i < slide ? 'w-4 bg-[#2d9558]' : 'w-4 bg-[#e2e8f0]'
                  }`} />
                ))}
              </div>

              {slide === 0 && (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <p className="text-sm font-semibold text-[#1c1c1e] mb-1">Your Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>First Name</label>
                      <input required value={reg.firstName} placeholder="Jane"
                        onChange={e => setReg(r => ({ ...r, firstName: e.target.value }))}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Last Name</label>
                      <input required value={reg.lastName} placeholder="Wanjiku"
                        onChange={e => setReg(r => ({ ...r, lastName: e.target.value }))}
                        className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Phone Number</label>
                    <input type="tel" required value={reg.phone} placeholder="0712345678"
                      onChange={e => setReg(r => ({ ...r, phone: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Email (optional)</label>
                    <input type="email" value={reg.email} placeholder="jane@example.com"
                      onChange={e => setReg(r => ({ ...r, email: e.target.value }))}
                      className={inputCls} />
                  </div>
                  {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
                  <button type="submit" disabled={loading} className={btnPrimary}>
                    {loading ? 'Sending code...' : 'Send Verification Code'}
                  </button>
                </form>
              )}

              {slide === 1 && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1c1c1e]">Enter Verification Code</p>
                    <p className="text-xs text-[#718096] mt-0.5">Sent to {reg.phone}</p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    {otp.map((d, i) => (
                      <input key={i}
                        ref={el => { otpRefs.current[i] = el }}
                        type="text" inputMode="numeric" maxLength={1} value={d}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKey(i, e)}
                        className="w-10 h-12 text-center text-lg font-bold border-2 rounded-xl focus:outline-none focus:border-[#1a6b3c] border-[#e2e8f0]" />
                    ))}
                  </div>
                  {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
                  <button type="submit" disabled={loading || otp.join('').length < 6} className={btnPrimary}>
                    {loading ? 'Verifying...' : 'Verify Code'}
                  </button>
                  <button type="button" onClick={() => { setSlide(0); setOtp(['','','','','','']); setError('') }}
                    className="w-full text-xs text-[#718096] hover:text-[#1a6b3c] font-semibold py-1">
                    Back
                  </button>
                </form>
              )}

              {slide === 2 && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1c1c1e]">Create Your PIN</p>
                    <p className="text-xs text-[#718096] mt-0.5">You'll use this to sign in every time</p>
                  </div>
                  <div>
                    <label className={labelCls}>4-Digit PIN</label>
                    <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} required
                      value={pin} placeholder="••••"
                      onChange={e => { if (/^\d*$/.test(e.target.value)) setPin(e.target.value.slice(0, 4)) }}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Confirm PIN</label>
                    <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} required
                      value={confirmPin} placeholder="••••"
                      onChange={e => { if (/^\d*$/.test(e.target.value)) setConfirmPin(e.target.value.slice(0, 4)) }}
                      className={inputCls} />
                  </div>
                  {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
                  <button type="submit" disabled={loading} className={btnPrimary}>
                    {loading ? 'Creating account...' : 'Create Account'}
                  </button>
                </form>
              )}
            </div>
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
  // Strip "KES " prefix for inside the ring to save space
  const ringValue = amount.replace('KES ', '')
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1">
          <span className="text-[9px] font-semibold text-[#718096] leading-none mb-0.5">KES</span>
          <span className="font-mono-data text-[11px] font-bold text-[#1c1c1e] leading-tight text-center">{ringValue}</span>
        </div>
      </div>
      <p className="font-display text-xs font-semibold text-[#4a5568] text-center leading-tight">
        {label} <span className="text-[10px] font-normal text-[#94a3b8]">({pct}%)</span>
      </p>
    </div>
  )
}

function fmt2(n: number) {
  return Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Dashboard({ transactions, summary, ownerName, userChannels }: {
  transactions: ApiTx[], summary: Summary, ownerName: string, userChannels: Channel[]
}) {
  const totalBalance = summary.total_in
  const businessLock = summary.total_business_lock
  const savings = summary.total_savings
  const flexible = summary.total_flexible
  const totalIncome = transactions.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = 0
  const net = totalIncome - totalExpenses
  const [moneyView, setMoneyView] = useState<'business' | 'personal'>('business')

  function formatDate(raw: string) {
    if (!raw) return ''
    const s = String(raw)
    if (s.length === 14) return `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)} ${s.slice(8,10)}:${s.slice(10,12)}`
    return new Date(raw).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })
  }

  // Channel connection status
  const hasPochi = userChannels.some(c => c.type === 'pochi')
  const hasTillOrPaybill = userChannels.some(c => c.type === 'till' || c.type === 'paybill')

  return (
    <div className="space-y-4">
      {/* Balance Hero */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 60%, #e8a020 140%)' }}
      >
        <div className="absolute top-0 right-0 w-48 h-48 opacity-10" style={{
          background: 'radial-gradient(circle, white 0%, transparent 70%)',
          transform: 'translate(30%, -30%)'
        }} />

        {/* App branding block */}
        <div className="mb-3">
          <p className="font-display text-lg font-bold text-white tracking-wide">TengaBiz</p>
          <p className="text-white/60 text-xs italic">Tenganisha pesa ya biashara na pesa yako binafsi</p>
        </div>

        {/* Merchant welcome block */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#e8a020] border-2 border-white/30 flex items-center justify-center text-[#0f3d22] font-bold text-sm shrink-0 shadow-sm">
            {ownerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{getGreeting(ownerName.split(' ')[0])}</p>
            <p className="text-green-200 text-xs leading-tight">{ownerName}</p>
          </div>
        </div>

        <p className="text-green-100 text-xs font-medium mb-1">Total Business Balance</p>
        <p className="font-display text-4xl font-bold mb-1 tracking-tight">
          KES {fmt2(totalBalance)}
        </p>
        <p className="text-green-200 text-xs font-mono-data">Updated: {transactions[0] ? formatDate(transactions[0].transaction_date) : 'No transactions yet'}</p>

        <div className="mt-5 flex gap-3">
          <div className="bg-white/15 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-green-100 text-xs">Income</p>
            <p className="font-display font-bold text-base">{totalIncome > 0 ? '+' : ''}{totalIncome.toLocaleString()}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-green-100 text-xs">Expenses</p>
            <p className="font-display font-bold text-base">{totalExpenses.toLocaleString()}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-green-100 text-xs">Net</p>
            <p className="font-display font-bold text-base">{net > 0 ? '+' : ''}{net.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Business / Personal toggle */}
      <div className="bg-[#f0f4f0] rounded-2xl p-1 flex gap-1">
        {(['business', 'personal'] as const).map(v => (
          <button key={v} onClick={() => setMoneyView(v)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              moneyView === v
                ? 'bg-[#1a6b3c] text-white shadow-sm'
                : 'text-[#4a5568] hover:text-[#1a6b3c]'
            }`}>
            {v === 'business' ? 'Business Money' : 'Personal Money'}
          </button>
        ))}
      </div>

      {/* Connected channels strip */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${
          hasPochi ? 'bg-[#0f3d22] text-white border-[#0f3d22]' : 'bg-white text-[#94a3b8] border-[#e2e8f0]'
        }`}>
          <span>{hasPochi ? '✓' : '○'}</span> Pochi la Biashara
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${
          hasTillOrPaybill ? 'bg-[#0f3d22] text-white border-[#0f3d22]' : 'bg-white text-[#94a3b8] border-[#e2e8f0]'
        }`}>
          <span>{hasTillOrPaybill ? '⚡' : '○'}</span> M-PESA Daraja 3.0
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
          <AllocationRing pct={60} color="#1a6b3c" label="Business Lock" amount={`KES ${fmt2(businessLock)}`} />
          <AllocationRing pct={20} color="#e8a020" label="Savings & Growth" amount={`KES ${fmt2(savings)}`} />
          <AllocationRing pct={20} color="#2563eb" label="Flexible Funds" amount={`KES ${fmt2(flexible)}`} />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-[#1c1c1e]">Recent Activity</h3>
            <p className="text-xs text-[#718096]">Latest incoming payments</p>
          </div>
          <span className="text-xs text-[#2d9558] font-semibold cursor-pointer">See all →</span>
        </div>
        {transactions.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[#f0f4f0] flex items-center justify-center text-[#1a6b3c] text-lg">↓</div>
            <p className="text-sm font-semibold text-[#4a5568]">No transactions yet</p>
            <p className="text-xs text-[#718096] text-center">Payments received via M-PESA will appear here automatically.</p>
          </div>
        ) : transactions.slice(0, 5).map((tx) => (
          <div key={tx.id} className="px-5 py-3 flex items-center gap-3 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
              tx.type === 'in' ? 'bg-green-50 text-[#1a6b3c]' : 'bg-red-50 text-[#e53e3e]'
            }`}>
              {tx.type === 'in' ? '↓' : '↑'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1c1c1e] truncate">{tx.mpesa_receipt ?? tx.account_ref ?? 'M-PESA Payment'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[#718096]">{formatDate(tx.transaction_date)}</span>
                <Badge channel={tx.channel} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-mono-data font-bold text-sm ${
                tx.type === 'in' ? 'text-[#1a6b3c]' : 'text-[#e53e3e]'
              }`}>
                {tx.type === 'in' ? '+' : '-'}KES {Number(tx.amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

  // Idle auto-lock: clear session after 60s in background/idle
  useEffect(() => {
    if (!user) return
    let idleTimer: ReturnType<typeof setTimeout>
    function startTimer() {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        localStorage.removeItem('tengabiz_token')
        localStorage.removeItem('tengabiz_business')
        localStorage.removeItem('tengabiz_owner')
        setUser(null)
      }, 60_000)
    }
    function cancelTimer() { clearTimeout(idleTimer) }
    document.addEventListener('visibilitychange', () => {
      document.hidden ? startTimer() : cancelTimer()
    })
    window.addEventListener('blur', startTimer)
    window.addEventListener('focus', cancelTimer)
    return () => {
      clearTimeout(idleTimer)
      document.removeEventListener('visibilitychange', startTimer)
      window.removeEventListener('blur', startTimer)
      window.removeEventListener('focus', cancelTimer)
    }
  }, [user])

  const { transactions, summary, loading } = useLiveData()
  const [userChannels, setUserChannels] = useState<Channel[]>([])
  useEffect(() => {
    if (user) channels.list().then(setUserChannels).catch(() => {})
  }, [user])

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
            <p className="font-display font-bold text-[#1c1c1e]">{getGreeting(user.ownerName)}</p>
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
              {tab === 'dashboard' && <Dashboard transactions={transactions} summary={summary} ownerName={user.ownerName} userChannels={userChannels} />}
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
