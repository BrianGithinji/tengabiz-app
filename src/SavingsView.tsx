import { useState } from 'react'
import { fmt2 } from './utils'

interface Props {
  amount: number
  onBack: () => void
}

interface Goal {
  id: string
  icon: string
  name: string
  target: number
  saved: number
  weeklyAmount: number
  estimatedFinish: string
}

interface GoalTx {
  ref: string
  amount: number
  date: string
}

const SEED_GOALS: Goal[] = [
  {
    id: '1',
    icon: '🧊',
    name: 'New Refrigerator',
    target: 20000,
    saved: 2700,
    weeklyAmount: 1800,
    estimatedFinish: 'September 2026',
  },
  {
    id: '2',
    icon: '⚖️',
    name: 'Electronic Weighing Scale',
    target: 8000,
    saved: 8000,
    weeklyAmount: 2000,
    estimatedFinish: 'Ready to Pay',
  },
]

const SEED_TXS: Record<string, GoalTx[]> = {
  '1': [
    { ref: 'TB-89421', amount: 1800, date: '20 Sep' },
    { ref: 'TB-89105', amount: 900,  date: '13 Sep' },
  ],
  '2': [
    { ref: 'TB-77301', amount: 2000, date: '18 Sep' },
    { ref: 'TB-77088', amount: 2000, date: '11 Sep' },
    { ref: 'TB-76812', amount: 2000, date: '04 Sep' },
    { ref: 'TB-76500', amount: 2000, date: '28 Aug' },
  ],
}

export default function SavingsView({ amount, onBack }: Props) {
  const [goals, setGoals] = useState<Goal[]>(SEED_GOALS)
  const [txMap]           = useState<Record<string, GoalTx[]>>(SEED_TXS)
  const [adding, setAdding] = useState(false)
  const [form, setForm]   = useState({ name: '', icon: '', target: '', saved: '', weeklyAmount: '', estimatedFinish: '' })
  const [selected, setSelected] = useState<Goal | null>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.target) return
    setGoals(g => [...g, {
      id: crypto.randomUUID(),
      icon: form.icon.trim() || '🎯',
      name: form.name.trim(),
      target: Number(form.target),
      saved: Number(form.saved) || 0,
      weeklyAmount: Number(form.weeklyAmount) || 0,
      estimatedFinish: form.estimatedFinish.trim() || '—',
    }])
    setForm({ name: '', icon: '', target: '', saved: '', weeklyAmount: '', estimatedFinish: '' })
    setAdding(false)
  }

  function handleDelete(id: string) {
    setGoals(g => g.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const inputCls = 'w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]'
  const labelCls = 'text-xs font-semibold text-[#4a5568] block mb-1'

  return (
    <>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="w-8 h-8 rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center text-[#1a6b3c] shadow-sm text-lg leading-none">
            ‹
          </button>
          <div>
            <h2 className="font-display text-lg font-bold text-[#1c1c1e] leading-tight">Savings</h2>
            <p className="text-xs text-[#718096]">Building toward your business goals</p>
          </div>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl p-5 text-white"
          style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>
          <p className="text-green-100 text-[10px] font-bold uppercase tracking-widest mb-1">Savings</p>
          <p className="font-display text-4xl font-extrabold tracking-tight">KES {fmt2(amount)}</p>
          <p className="text-green-200 text-xs mt-2">20% of total business balance · Growing every payment</p>
        </div>

        {/* Savings Goals list */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#f0f0f0]">
            <div>
              <p className="font-display font-bold text-[#1c1c1e] text-sm">Savings Goals</p>
              <p className="text-xs text-[#718096] mt-0.5">Track your business targets</p>
            </div>
            <button onClick={() => setAdding(a => !a)}
              className="flex items-center gap-1 text-xs font-semibold text-white bg-[#1a6b3c] hover:bg-[#0f3d22] px-3 py-1.5 rounded-full transition-all">
              {adding ? '✕ Cancel' : '+ New Goal'}
            </button>
          </div>

          {adding && (
            <form onSubmit={handleAdd} className="px-5 py-4 space-y-3 bg-[#f7f7f7] border-b border-[#e2e8f0]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Goal Name</label>
                  <input required value={form.name} placeholder="e.g. New Fridge"
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Icon (emoji)</label>
                  <input value={form.icon} placeholder="e.g. 🧊"
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Target (KES)</label>
                  <input required type="number" min="1" value={form.target} placeholder="20000"
                    onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Saved So Far (KES)</label>
                  <input type="number" min="0" value={form.saved} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, saved: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Saving / Week (KES)</label>
                  <input type="number" min="0" value={form.weeklyAmount} placeholder="1000"
                    onChange={e => setForm(f => ({ ...f, weeklyAmount: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Estimated Finish</label>
                  <input value={form.estimatedFinish} placeholder="e.g. March 2026"
                    onChange={e => setForm(f => ({ ...f, estimatedFinish: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <button type="submit"
                className="w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
                Save Goal
              </button>
            </form>
          )}

          <div className="divide-y divide-[#f0f0f0]">
            {goals.map((g, idx) => {
              const pct  = Math.min(Math.round((g.saved / g.target) * 100), 100)
              const done = pct >= 100
              return (
                <button key={g.id} onClick={() => setSelected(g)}
                  className="w-full px-5 py-4 text-left hover:bg-[#fafafa] active:bg-[#f0faf4] transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-[#f0faf4] flex items-center justify-center shrink-0 text-xl">
                      {g.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-bold text-[#1c1c1e]">{g.name}</p>
                        {done && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wide">
                            ✓ Ready to Pay
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden mb-1.5">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: done ? '#1a6b3c' : '#e8a020' }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-[#718096]">
                        <span>KES {fmt2(g.saved)} saved</span>
                        <span>{pct}% of KES {fmt2(g.target)}</span>
                      </div>
                    </div>
                    <span className="text-[#c0c0c0] text-base leading-none shrink-0 mt-1">›</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </div>

      {/* ── Bottom Sheet Modal ── */}
      {selected && (() => {
        const pct       = Math.min(Math.round((selected.saved / selected.target) * 100), 100)
        const done      = pct >= 100
        const remaining = Math.max(selected.target - selected.saved, 0)
        const goalIdx   = goals.findIndex(g => g.id === selected.id)
        const goalLabel = `GOAL ${goalIdx + 1}`
        const txs       = txMap[selected.id] ?? []

        return (
          <>
            {/* Scrim */}
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelected(null)} />

            {/* Sheet */}
            <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-white rounded-t-3xl flex flex-col"
              style={{ maxHeight: '92vh' }}>

              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-[#e2e8f0]" />
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-5 pb-8">

                {/* Sheet header */}
                <div className="flex items-center gap-3 py-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#f0faf4] flex items-center justify-center shrink-0 text-2xl">
                    {selected.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-[#1a6b3c] bg-green-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                      {goalLabel}
                    </span>
                    <p className="font-display font-bold text-[#1c1c1e] text-base leading-tight mt-0.5 truncate">
                      {selected.name}
                    </p>
                  </div>
                  <button onClick={() => setSelected(null)}
                    className="w-8 h-8 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] hover:bg-[#e2e8f0] shrink-0 text-lg leading-none">
                    ×
                  </button>
                </div>

                {/* 2×2 metric grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {/* Target */}
                  <div className="bg-[#f7f7f7] rounded-2xl p-3">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-1">Target</p>
                    <p className="font-display font-extrabold text-base text-[#1c1c1e]">KES {fmt2(selected.target)}</p>
                  </div>
                  {/* Saved — soft green bg */}
                  <div className="bg-[#f0faf4] rounded-2xl p-3">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-1">Saved</p>
                    <p className="font-display font-extrabold text-base text-[#1a6b3c]">KES {fmt2(selected.saved)}</p>
                  </div>
                  {/* Remaining */}
                  <div className="bg-[#f7f7f7] rounded-2xl p-3">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-1">Remaining</p>
                    <p className="font-display font-extrabold text-base text-[#1c1c1e]">KES {fmt2(remaining)}</p>
                  </div>
                  {/* Progress */}
                  <div className="bg-[#f7f7f7] rounded-2xl p-3">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-1">Progress</p>
                    <p className="font-display font-extrabold text-base" style={{ color: done ? '#1a6b3c' : '#e8a020' }}>
                      {pct}%
                    </p>
                  </div>
                </div>

                {/* Progress bar + meta row */}
                <div className="mb-5">
                  <div className="h-2.5 bg-[#e2e8f0] rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: done ? '#1a6b3c' : '#e8a020' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#4a5568] font-semibold">
                      Saving KES {fmt2(selected.weeklyAmount)} / week
                    </p>
                    <p className="text-xs text-[#718096] flex items-center gap-1">
                      <span>🕐</span> Est: {selected.estimatedFinish}
                    </p>
                  </div>
                </div>

                {/* Transaction ledger */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Transactions</p>
                    <p className="text-[10px] text-[#94a3b8] font-semibold">{txs.length} recorded</p>
                  </div>

                  {txs.length === 0 ? (
                    <div className="bg-[#f7f7f7] rounded-xl px-4 py-5 text-center">
                      <p className="text-sm text-[#718096]">No contributions recorded yet.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden divide-y divide-[#f0f0f0]">
                      {txs.map((tx, i) => (
                        <div key={i} className="px-4 py-3 flex items-center gap-3">
                          {/* Arrow icon */}
                          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <span className="text-green-700 text-sm font-bold">↗</span>
                          </div>
                          {/* Label + ref */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1c1c1e]">Savings contribution</p>
                            <p className="text-[11px] text-[#718096]">• Ref: {tx.ref}</p>
                          </div>
                          {/* Amount + date */}
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-[#1a6b3c]">+ KES {fmt2(tx.amount)}</p>
                            <p className="text-[11px] text-[#718096]">{tx.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pay button */}
                <button className="w-full py-3.5 rounded-2xl bg-[#1a6b3c] hover:bg-[#0f3d22] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors mb-5">
                  <span>💳</span> Pay
                </button>

                {/* Goal Settings */}
                <div>
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Goal Settings</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button className="bg-[#f7f7f7] hover:bg-[#e2e8f0] rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-colors">
                      <span className="text-xl">📝</span>
                      <span className="text-xs font-semibold text-[#4a5568]">Edit Goal</span>
                    </button>
                    <button onClick={() => handleDelete(selected.id)}
                      className="bg-[#f7f7f7] hover:bg-red-50 rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-colors">
                      <span className="text-xl">🗑️</span>
                      <span className="text-xs font-semibold text-red-500">Delete Goal</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </>
        )
      })()}
    </>
  )
}
