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
  methodLabel: string   // e.g. "M-PESA Buy Goods"
  methodDetail: string  // e.g. "Till #889211"
}

interface PayeeTx {
  date: string
  amount: number
  method: string
  ref: string
}

const SEED_PAYEES: Payee[] = [
  {
    id: '1',
    name: 'Mama Grace Wholesalers',
    category: 'Stock',
    amount: 3000,
    methodLabel: 'M-PESA Buy Goods',
    methodDetail: 'Till #889211',
  },
  {
    id: '2',
    name: 'John',
    category: 'Rent',
    amount: 3000,
    methodLabel: 'M-PESA Pochi la Biashara',
    methodDetail: '0712 345 678',
  },
  {
    id: '3',
    name: 'Mary',
    category: 'Utilities',
    amount: 1500,
    methodLabel: 'M-PESA PayBill',
    methodDetail: 'PayBill 888888 (Acc: 14229901)',
  },
]

// Seed transaction history keyed by payee id
const SEED_TXS: Record<string, PayeeTx[]> = {
  '1': [
    { date: '18 Sep', amount: 3000, method: 'M-PESA Buy Goods', ref: 'QK7892KL12' },
    { date: '11 Sep', amount: 2500, method: 'M-PESA Buy Goods', ref: 'QJ5129MM44' },
    { date: '04 Sep', amount: 3000, method: 'M-PESA Buy Goods', ref: 'QH88120P90' },
  ],
  '2': [],
  '3': [],
}

const CATEGORY_COLORS: Record<string, string> = {
  Stock: 'bg-green-100 text-green-800',
  Rent: 'bg-blue-100 text-blue-800',
  Utilities: 'bg-amber-100 text-amber-800',
}

export default function ProfitLockView({ amount, onBack }: Props) {
  const [payees, setPayees] = useState<Payee[]>(SEED_PAYEES)
  const [txMap, setTxMap] = useState<Record<string, PayeeTx[]>>(SEED_TXS)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', amount: '', methodLabel: '', methodDetail: '' })
  const [selected, setSelected] = useState<Payee | null>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount) return
    const id = crypto.randomUUID()
    setPayees(p => [...p, {
      id,
      name: form.name.trim(),
      category: form.category.trim(),
      amount: Number(form.amount),
      methodLabel: form.methodLabel.trim(),
      methodDetail: form.methodDetail.trim(),
    }])
    setTxMap(m => ({ ...m, [id]: [] }))
    setForm({ name: '', category: '', amount: '', methodLabel: '', methodDetail: '' })
    setAdding(false)
  }

  function handleRemove(id: string) {
    setPayees(p => p.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const [reminderDates, setReminderDates] = useState<Record<string, string>>({})
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
            <h2 className="font-display text-lg font-bold text-[#1c1c1e] leading-tight">Business Lock</h2>
            <p className="text-xs text-[#718096]">Money protected for your business needs &amp; supplier payments</p>
          </div>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl p-5 text-white"
          style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>
          <p className="text-green-100 text-[10px] font-bold uppercase tracking-widest mb-1">Business Lock Balance</p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Payment Method</label>
                  <input value={form.methodLabel} placeholder="e.g. M-PESA Buy Goods"
                    onChange={e => setForm(f => ({ ...f, methodLabel: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Payment Details</label>
                  <input value={form.methodDetail} placeholder="e.g. Till #889211"
                    onChange={e => setForm(f => ({ ...f, methodDetail: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <button type="submit"
                className="w-full py-2.5 bg-[#1a6b3c] text-white rounded-xl font-semibold text-sm hover:bg-[#0f3d22]">
                Save Person
              </button>
            </form>
          )}

          <div className="divide-y divide-[#f0f0f0]">
            {payees.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-[#fafafa] transition-colors active:bg-[#f0faf4]"
              >
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
                  <p className="text-[11px] text-[#718096] mt-0.5 leading-snug">
                    {p.methodLabel}{p.methodDetail ? `: ${p.methodDetail}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[#c0c0c0] text-base leading-none">›</span>
                  {/* Calendar reminder picker */}
                  <input
                    type="date"
                    value={reminderDates[p.id] ?? ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); setReminderDates(r => ({ ...r, [p.id]: e.target.value })) }}
                    className="text-[9px] text-[#94a3b8] border border-[#e2e8f0] rounded-lg px-1 py-0.5 bg-white cursor-pointer"
                    title="Set payment reminder"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── Bottom Sheet Modal ── */}
      {selected && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelected(null)}
          />

          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-white rounded-t-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}>

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[#e2e8f0]" />
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 pb-6">

              {/* Sheet header */}
              <div className="flex items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-[#f0faf4] border-2 border-[#1a6b3c]/20 flex items-center justify-center shrink-0">
                  <span className="text-[#1a6b3c] font-bold text-lg">{selected.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-[#1c1c1e] text-base leading-tight truncate">{selected.name}</p>
                  {selected.category && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${CATEGORY_COLORS[selected.category] ?? 'bg-gray-100 text-gray-700'}`}>
                      {selected.category}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-8 h-8 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] hover:bg-[#e2e8f0] shrink-0 text-lg leading-none">
                  ×
                </button>
              </div>

              {/* Metadata table */}
              <div className="bg-[#f7f9f7] rounded-2xl p-4 space-y-3 mb-4">
                {[
                  { label: 'What they are paid for', value: selected.category || '—' },
                  { label: 'Payment Method', value: selected.methodLabel || '—' },
                  { label: 'Payment Details', value: selected.methodDetail || '—' },
                ].map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-3">
                    <span className="text-xs text-[#718096] shrink-0">{row.label}</span>
                    <span className="text-xs font-semibold text-[#1c1c1e] text-right">{row.value}</span>
                  </div>
                ))}
                {/* Amount row — green bold */}
                <div className="flex items-start justify-between gap-3 pt-2 border-t border-[#e2e8f0]">
                  <span className="text-xs text-[#718096] shrink-0">Amount</span>
                  <span className="text-sm font-extrabold text-[#1a6b3c]">KES {fmt2(selected.amount)}</span>
                </div>
              </div>

              {/* Transaction ledger — primary focal block */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm">📅</span>
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Transactions</p>
                </div>

                {(txMap[selected.id] ?? []).length === 0 ? (
                  <div className="bg-[#f7f7f7] rounded-xl px-4 py-5 text-center">
                    <p className="text-sm text-[#718096]">No payment history yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden divide-y divide-[#f0f0f0]">
                    {(txMap[selected.id] ?? []).map((tx, i) => (
                      <div key={i} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#f0faf4] flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-[#1a6b3c] text-center leading-tight">{tx.date}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-[#1c1c1e] tracking-tight">KES {fmt2(tx.amount)}</p>
                          <p className="text-[11px] text-[#718096] truncate">{tx.method} · Ref: {tx.ref}</p>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">
                          ✓ Paid
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pay button — below transactions */}
              <button className="w-full py-3.5 rounded-2xl bg-[#1a6b3c] hover:bg-[#0f3d22] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors mb-5">
                <span>💳</span>
                Pay {selected.name}
              </button>

              {/* Manage Person */}
              <div>
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Manage Person</p>
                <div className="grid grid-cols-2 gap-3">
                  <button className="bg-[#f7f7f7] hover:bg-[#e2e8f0] rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-colors">
                    <span className="text-xl">📝</span>
                    <span className="text-xs font-semibold text-[#4a5568]">Edit Person</span>
                  </button>
                  <button
                    onClick={() => handleRemove(selected.id)}
                    className="bg-[#f7f7f7] hover:bg-red-50 rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-colors">
                    <span className="text-xl">🗑️</span>
                    <span className="text-xs font-semibold text-red-500">Remove Person</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </>
  )
}
