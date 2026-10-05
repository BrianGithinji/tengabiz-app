import { useState } from 'react'
import { fmt2 } from './utils'

interface Props {
  amount: number
  onBack: () => void
}

interface Payee {
  id: string
  name: string
  category: string
  amount: number
  method: string
}

const SEED_PAYEES: Payee[] = [
  {
    id: '1',
    name: 'Mama Grace Wholesalers',
    category: 'Stock',
    amount: 3000,
    method: 'M-PESA Buy Goods: Till #889211',
  },
  {
    id: '2',
    name: 'John',
    category: 'Rent',
    amount: 3000,
    method: 'M-PESA Pochi la Biashara: 0712 345 678',
  },
  {
    id: '3',
    name: 'Mary',
    category: 'Utilities',
    amount: 1500,
    method: 'M-PESA PayBill: PayBill 888888 (Acc: 14229901)',
  },
]

const CATEGORY_COLORS: Record<string, string> = {
  Stock: 'bg-green-100 text-green-800',
  Rent: 'bg-blue-100 text-blue-800',
  Utilities: 'bg-amber-100 text-amber-800',
}

export default function ProfitLockView({ amount, onBack }: Props) {
  const [payees, setPayees] = useState<Payee[]>(SEED_PAYEES)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', amount: '', method: '' })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount) return
    setPayees(p => [...p, {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      category: form.category.trim(),
      amount: Number(form.amount),
      method: form.method.trim(),
    }])
    setForm({ name: '', category: '', amount: '', method: '' })
    setAdding(false)
  }

  function handleRemove(id: string) {
    setPayees(p => p.filter(x => x.id !== id))
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
          <h2 className="font-display text-lg font-bold text-[#1c1c1e] leading-tight">Business Lock</h2>
          <p className="text-xs text-[#718096]">Money protected for your business needs &amp; supplier payments</p>
        </div>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>
        <p className="text-green-100 text-xs font-semibold uppercase tracking-widest mb-1">Business Lock Balance</p>
        <p className="font-display text-4xl font-extrabold tracking-tight">KES {fmt2(amount)}</p>
        <p className="text-green-200 text-xs mt-2">60% of total business balance · Protected for operations</p>
      </div>

      {/* People I Pay */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#f0f0f0]">
          <div>
            <p className="font-display font-bold text-[#1c1c1e] text-sm">People I Pay</p>
            <p className="text-xs text-[#718096] mt-0.5">Recurring business commitments</p>
          </div>
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1 text-xs font-semibold text-white bg-[#1a6b3c] hover:bg-[#0f3d22] px-3 py-1.5 rounded-full transition-all">
            {adding ? '✕ Cancel' : '+ Add Person'}
          </button>
        </div>

        {adding && (
          <form onSubmit={handleAdd} className="px-5 py-4 space-y-3 bg-[#f7f7f7] border-b border-[#e2e8f0]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input required value={form.name} placeholder="e.g. Mama Grace"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <input value={form.category} placeholder="e.g. Stock"
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Amount (KES)</label>
              <input required type="number" min="1" value={form.amount} placeholder="e.g. 3000"
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <input value={form.method} placeholder="e.g. M-PESA Buy Goods: Till #889211"
                onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                className={inputCls} />
            </div>
            <button type="submit"
              className="w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
              Save Person
            </button>
          </form>
        )}

        <div className="divide-y divide-[#f0f0f0]">
          {payees.map(p => (
            <div key={p.id} className="px-5 py-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#f0faf4] flex items-center justify-center shrink-0 text-[#1a6b3c] font-bold text-sm">
                {p.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-[#1c1c1e]">{p.name}</p>
                  {p.category && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${CATEGORY_COLORS[p.category] ?? 'bg-gray-100 text-gray-700'}`}>
                      {p.category}
                    </span>
                  )}
                </div>
                <p className="font-display font-extrabold text-base text-[#1a6b3c] mt-0.5">
                  KES {fmt2(p.amount)}
                </p>
                <p className="text-[11px] text-[#718096] mt-0.5 leading-snug">{p.method}</p>
              </div>
              <button onClick={() => handleRemove(p.id)}
                className="text-[#c0c0c0] hover:text-red-400 text-lg leading-none shrink-0 mt-0.5">×</button>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
