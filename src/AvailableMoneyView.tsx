import { fmt2 } from './utils'

interface Props {
  amount: number
  onBack: () => void
}

const ACTIVITIES = [
  { label: 'Daily Operations', desc: 'Petty cash & running costs', pct: 40, color: '#1a6b3c', bg: '#f0faf4' },
  { label: 'Stock Purchases', desc: 'Immediate restocking needs', pct: 30, color: '#2563eb', bg: '#eff6ff' },
  { label: 'Staff Wages', desc: 'Weekly & casual labour', pct: 20, color: '#e8a020', bg: '#fffbeb' },
  { label: 'Miscellaneous', desc: 'Unplanned small expenses', pct: 10, color: '#718096', bg: '#f7f7f7' },
]

export default function AvailableMoneyView({ amount, onBack }: Props) {
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center text-[#1a6b3c] shadow-sm">
          ‹
        </button>
        <div>
          <h2 className="font-display text-lg font-bold text-[#1c1c1e] leading-tight">Available Money</h2>
          <p className="text-xs text-[#718096]">Operating funds ready for deployment</p>
        </div>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>
        <p className="text-green-100 text-xs font-semibold uppercase tracking-widest mb-1">Available Balance</p>
        <p className="font-display text-4xl font-extrabold tracking-tight">KES {fmt2(amount)}</p>
        <p className="text-green-200 text-xs mt-2">20% of total business balance · Ready to use</p>
      </div>

      {/* 2×2 activity grid */}
      <div>
        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3 px-1">
          Available Money Activities
        </p>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITIES.map(a => {
            const alloc = Math.round(amount * a.pct / 100)
            return (
              <div key={a.label} className="rounded-2xl p-4 border border-[#e2e8f0]"
                style={{ background: a.bg }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: a.color }}>{a.pct}%</span>
                  <div className="w-6 h-1.5 rounded-full bg-white/60 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: a.color }} />
                  </div>
                </div>
                <p className="text-sm font-bold text-[#1c1c1e] leading-tight">{a.label}</p>
                <p className="text-[11px] text-[#718096] mt-0.5 leading-tight">{a.desc}</p>
                <p className="font-display font-extrabold text-base mt-2" style={{ color: a.color }}>
                  KES {fmt2(alloc)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
