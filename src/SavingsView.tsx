import { useState } from 'react'
import { fmt2 } from './utils'

interface Props {
  amount: number
  onBack: () => void
}

interface Goal {
  id: string
  name: string
  target: number
  saved: number
  weeklyAmount: number
  estimatedFinish: string
}

const SEED_GOALS: Goal[] = [
  {
    id: '1',
    name: 'New Refrigerator',
    target: 20000,
    saved: 2700,
    weeklyAmount: 1800,
    estimatedFinish: 'September 2026',
  },
  {
    id: '2',
    name: 'Electronic Weighing Scale',
    target: 8000,
    saved: 8000,
    weeklyAmount: 2000,
    estimatedFinish: 'Ready to Pay',
  },
]

export default function SavingsView({ amount, onBack }: Props) {
  const [goals, setGoals] = useState<Goal[]>(SEED_GOALS)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', target: '', saved: '', weeklyAmount: '', estimatedFinish: '' })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.target) return
    setGoals(g => [...g, {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      target: Number(form.target),
      saved: Number(form.saved) || 0,
      weeklyAmount: Number(form.weeklyAmount) || 0,
      estimatedFinish: form.estimatedFinish.trim() || '—',
    }])
    setForm({ name: '', target: '', saved: '', weeklyAmount: '', estimatedFinish: '' })
    setAdding(false)
  }

  function handleRemove(id: string) {
    setGoals(g => g.filter(x => x.id !== id))
  }

  const inputCls = 'w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]'
  const labelCls = 'text-xs font-semibold text-[#4a5568] block mb-1'

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center text-[#1a6b3c] shadow-sm">
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
        <p className="text-green-100 text-xs font-semibold uppercase tracking-widest mb-1">Savings</p>
        <p className="font-display text-4xl font-extrabold tracking-tight">KES {fmt2(amount)}</p>
        <p className="text-green-200 text-xs mt-2">20% of total business balance · Growing every payment</p>
      </div>

      {/* Savings Goals */}
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
                <label className={labelCls}>Target (KES)</label>
                <input required type="number" min="1" value={form.target} placeholder="20000"
                  onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Saved So Far (KES)</label>
                <input type="number" min="0" value={form.saved} placeholder="0"
                  onChange={e => setForm(f => ({ ...f, saved: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Saving / Week (KES)</label>
                <input type="number" min="0" value={form.weeklyAmount} placeholder="1000"
                  onChange={e => setForm(f => ({ ...f, weeklyAmount: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Estimated Finish</label>
              <input value={form.estimatedFinish} placeholder="e.g. March 2026"
                onChange={e => setForm(f => ({ ...f, estimatedFinish: e.target.value }))}
                className={inputCls} />
            </div>
            <button type="submit"
              className="w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
              Save Goal
            </button>
          </form>
        )}

        <div className="divide-y divide-[#f0f0f0]">
          {goals.map(g => {
            const pct = Math.min(Math.round((g.saved / g.target) * 100), 100)
            const done = pct >= 100
            return (
              <div key={g.id} className="px-5 py-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[#1c1c1e]">{g.name}</p>
                    {done && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wide">
                        ✓ Ready to Pay
                      </span>
                    )}
                  </div>
                  <button onClick={() => handleRemove(g.id)}
                    className="text-[#c0c0c0] hover:text-red-400 text-lg leading-none shrink-0 ml-2">×</button>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: done ? '#1a6b3c' : '#e8a020' }} />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                  <div>
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide font-semibold">Target</p>
                    <p className="text-sm font-bold text-[#1c1c1e]">KES {fmt2(g.target)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide font-semibold">Progress</p>
                    <p className="text-sm font-bold" style={{ color: done ? '#1a6b3c' : '#e8a020' }}>{pct}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide font-semibold">Saving / Week</p>
                    <p className="text-sm font-bold text-[#1c1c1e]">KES {fmt2(g.weeklyAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide font-semibold">Est. Finish</p>
                    <p className="text-sm font-bold text-[#1c1c1e]">{g.estimatedFinish}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide font-semibold">Saved</p>
                    <p className="text-sm font-bold text-[#1a6b3c]">KES {fmt2(g.saved)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
