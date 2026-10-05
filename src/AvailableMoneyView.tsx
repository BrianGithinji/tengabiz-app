import { fmt2 } from './utils'

interface Props {
  amount: number
  onBack: () => void
}

const ACTIONS = [
  {
    icon: '🔒',
    title: 'Transfer to Business Lock',
    desc: 'Move available money into protected lock',
    iconBg: '#fffbeb',
  },
  {
    icon: '🎯',
    title: 'Save Money',
    desc: 'Deposit funds into your savings goals',
    iconBg: '#f0faf4',
  },
  {
    icon: '→',
    title: 'Transfer to Personal Money',
    desc: 'Move business money to your personal wallet',
    iconBg: '#eff6ff',
  },
  {
    icon: '💳',
    title: 'Pay Someone',
    desc: 'Make a payment directly from available cash',
    iconBg: '#f5f3ff',
  },
]

export default function AvailableMoneyView({ amount, onBack }: Props) {
  return (
    <div className="space-y-4">

      {/* Back row + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center text-[#1a6b3c] shadow-sm text-lg leading-none"
        >
          ‹
        </button>
        <div>
          <h2 className="font-display text-lg font-bold text-[#1c1c1e] leading-tight">Available Money</h2>
          <p className="text-xs text-[#718096]">Operating funds ready for deployment</p>
        </div>
      </div>

      {/* Hero card */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}
      >
        <p className="text-green-100 text-[10px] font-bold uppercase tracking-widest mb-1">Available Money</p>
        <p className="font-display text-4xl font-extrabold tracking-tight">KES {fmt2(amount)}</p>
        <p className="text-green-200 text-xs mt-2">20% of total business balance · Ready to use</p>
      </div>

      {/* 2×2 action grid */}
      <div>
        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3 px-1">
          Available Money Activities
        </p>
        <div className="grid grid-cols-2 gap-3">
          {ACTIONS.map(a => (
            <button
              key={a.title}
              className="bg-white rounded-2xl p-4 border border-[#e2e8f0] text-left flex flex-col gap-2 active:scale-95 transition-transform shadow-sm"
            >
              {/* Icon badge + chevron row */}
              <div className="flex items-center justify-between w-full">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                  style={{ background: a.iconBg }}
                >
                  {a.icon}
                </div>
                <span className="text-[#c0c0c0] text-base leading-none">›</span>
              </div>
              {/* Text */}
              <div>
                <p className="text-sm font-bold text-[#1c1c1e] leading-snug">{a.title}</p>
                <p className="text-[11px] text-[#718096] mt-0.5 leading-snug">{a.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
