import { useState } from 'react'
import { fmt2 } from './utils'

interface Props {
  amount: number
  onBack: () => void
}

type ActiveSheet = 'lock' | 'save' | 'personal' | 'pay' | null

export default function AvailableMoneyView({ amount, onBack }: Props) {
  const [sheet, setSheet] = useState<ActiveSheet>(null)
  const [lockAmt, setLockAmt] = useState('')
  const [saveAmt, setSaveAmt] = useState('')
  const [personalAmt, setPersonalAmt] = useState('')
  const [payName, setPayName] = useState('')
  const [payAmt, setPayAmt] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  function confirmLock() {
    if (!lockAmt || Number(lockAmt) <= 0) return
    showToast(`KES ${fmt2(Number(lockAmt))} moved to Business Lock ✓`)
    setLockAmt(''); setSheet(null)
  }
  function confirmSave() {
    if (!saveAmt || Number(saveAmt) <= 0) return
    showToast(`KES ${fmt2(Number(saveAmt))} added to Savings ✓`)
    setSaveAmt(''); setSheet(null)
  }
  function confirmPersonal() {
    if (!personalAmt || Number(personalAmt) <= 0) return
    showToast(`KES ${fmt2(Number(personalAmt))} sent to Personal Money ✓`)
    setPersonalAmt(''); setSheet(null)
  }
  function confirmPay() {
    if (!payName.trim() || !payAmt || Number(payAmt) <= 0) return
    showToast(`Payment of KES ${fmt2(Number(payAmt))} to ${payName} initiated ✓`)
    setPayName(''); setPayAmt(''); setPayMethod(''); setSheet(null)
  }

  const inputCls = 'w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a6b3c]'
  const labelCls = 'text-xs font-semibold text-[#4a5568] block mb-1'

  const ACTIONS = [
    { key: 'lock' as ActiveSheet,     icon: '🔒', title: 'Transfer to Business Lock',   desc: 'Move available money into protected lock',          iconBg: '#fffbeb' },
    { key: 'save' as ActiveSheet,     icon: '🎯', title: 'Save Money',                  desc: 'Deposit funds into your savings goals',             iconBg: '#f0faf4' },
    { key: 'personal' as ActiveSheet, icon: '→',  title: 'Transfer to Personal Money',  desc: 'Move business money to your personal wallet',       iconBg: '#eff6ff' },
    { key: 'pay' as ActiveSheet,      icon: '💳', title: 'Pay Someone',                 desc: 'Make a payment directly from available cash',       iconBg: '#f5f3ff' },
  ]

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
            <h2 className="font-display text-lg font-bold text-[#1c1c1e] leading-tight">Available Money</h2>
            <p className="text-xs text-[#718096]">Operating funds ready for deployment</p>
          </div>
        </div>

        {/* Hero */}
        <div className="rounded-2xl p-5 text-white"
          style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>
          <p className="text-green-100 text-[10px] font-bold uppercase tracking-widest mb-1">Available Money</p>
          <p className="font-display text-4xl font-black tracking-tight">KES {fmt2(amount)}</p>
          <p className="text-green-200 text-xs mt-2">20% of total business balance · Ready to use</p>
        </div>

        {/* 2×2 action grid */}
        <div>
          <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3 px-1">
            Available Money Activities
          </p>
          <div className="grid grid-cols-2 gap-3">
            {ACTIONS.map(a => (
              <button key={a.key} onClick={() => setSheet(a.key)}
                className="bg-white rounded-2xl p-4 border border-[#e2e8f0] text-left flex flex-col gap-2 active:scale-95 transition-transform shadow-sm">
                <div className="flex items-center justify-between w-full">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                    style={{ background: a.iconBg }}>
                    {a.icon}
                  </div>
                  <span className="text-[#c0c0c0] text-base leading-none">›</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1c1c1e] leading-snug">{a.title}</p>
                  <p className="text-[11px] text-[#718096] mt-0.5 leading-snug">{a.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-[#1a6b3c] text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* ── Action Sheets ── */}
      {sheet && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSheet(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-white rounded-t-3xl"
            style={{ maxHeight: '70vh' }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[#e2e8f0]" />
            </div>

            <div className="px-5 pb-8 pt-2 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 20px)' }}>

              {/* ── Transfer to Business Lock ── */}
              {sheet === 'lock' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display font-bold text-[#1c1c1e] text-base">Transfer to Business Lock</p>
                      <p className="text-xs text-[#718096] mt-0.5">Move funds into your protected 60% lock</p>
                    </div>
                    <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] text-lg leading-none">×</button>
                  </div>
                  <div className="bg-[#fffbeb] rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-xs text-[#718096]">Available to transfer</span>
                    <span className="font-black text-[#1c1c1e] tracking-tight">KES {fmt2(amount)}</span>
                  </div>
                  <div>
                    <label className={labelCls}>Amount (KES)</label>
                    <input type="number" min="1" value={lockAmt} placeholder="e.g. 2000"
                      onChange={e => setLockAmt(e.target.value)} className={inputCls} />
                  </div>
                  <button onClick={confirmLock}
                    className="w-full py-3.5 rounded-2xl bg-[#1a6b3c] hover:bg-[#0f3d22] text-white font-bold text-sm transition-colors">
                    🔒 Confirm Transfer to Lock
                  </button>
                </div>
              )}

              {/* ── Save Money ── */}
              {sheet === 'save' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display font-bold text-[#1c1c1e] text-base">Save Money</p>
                      <p className="text-xs text-[#718096] mt-0.5">Top up your active savings goals</p>
                    </div>
                    <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] text-lg leading-none">×</button>
                  </div>
                  <div className="bg-[#f0faf4] rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-xs text-[#718096]">Available to save</span>
                    <span className="font-black text-[#1a6b3c] tracking-tight">KES {fmt2(amount)}</span>
                  </div>
                  <div>
                    <label className={labelCls}>Amount (KES)</label>
                    <input type="number" min="1" value={saveAmt} placeholder="e.g. 1800"
                      onChange={e => setSaveAmt(e.target.value)} className={inputCls} />
                  </div>
                  <button onClick={confirmSave}
                    className="w-full py-3.5 rounded-2xl bg-[#1a6b3c] hover:bg-[#0f3d22] text-white font-bold text-sm transition-colors">
                    🎯 Confirm Savings Deposit
                  </button>
                </div>
              )}

              {/* ── Transfer to Personal Money ── */}
              {sheet === 'personal' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display font-bold text-[#1c1c1e] text-base">Transfer to Personal Money</p>
                      <p className="text-xs text-[#718096] mt-0.5">Move funds to your personal wallet</p>
                    </div>
                    <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] text-lg leading-none">×</button>
                  </div>
                  <div className="bg-[#eff6ff] rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-xs text-[#718096]">Available to transfer</span>
                    <span className="font-black text-[#2563eb] tracking-tight">KES {fmt2(amount)}</span>
                  </div>
                  <div>
                    <label className={labelCls}>Amount (KES)</label>
                    <input type="number" min="1" value={personalAmt} placeholder="e.g. 500"
                      onChange={e => setPersonalAmt(e.target.value)} className={inputCls} />
                  </div>
                  <button onClick={confirmPersonal}
                    className="w-full py-3.5 rounded-2xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm transition-colors">
                    → Confirm Transfer to Personal
                  </button>
                </div>
              )}

              {/* ── Pay Someone ── */}
              {sheet === 'pay' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display font-bold text-[#1c1c1e] text-base">Pay Someone</p>
                      <p className="text-xs text-[#718096] mt-0.5">Send payment via M-PESA or bank</p>
                    </div>
                    <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] text-lg leading-none">×</button>
                  </div>
                  <div>
                    <label className={labelCls}>Recipient Name</label>
                    <input value={payName} placeholder="e.g. Mama Grace"
                      onChange={e => setPayName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Amount (KES)</label>
                    <input type="number" min="1" value={payAmt} placeholder="e.g. 3000"
                      onChange={e => setPayAmt(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Payment Method / Reference</label>
                    <input value={payMethod} placeholder="e.g. M-PESA Till #889211"
                      onChange={e => setPayMethod(e.target.value)} className={inputCls} />
                  </div>
                  <button onClick={confirmPay}
                    className="w-full py-3.5 rounded-2xl bg-[#1a6b3c] hover:bg-[#0f3d22] text-white font-bold text-sm transition-colors">
                    💳 Confirm Payment
                  </button>
                </div>
              )}

            </div>
          </div>
        </>
      )}
    </>
  )
}
