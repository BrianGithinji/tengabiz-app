import { useState } from 'react'
import { calcLoanReadiness } from './loanReadinessEngine'
import LoanReportModal from './LoanReportModal'
import { fmt2 } from './utils'

interface Props {
  businessName: string
  ownerName: string
}

export default function BusinessHub({ businessName, ownerName }: Props) {
  const score = calcLoanReadiness()
  const [showReport, setShowReport] = useState(false)

  const maxRev = Math.max(...score.monthlyRevenue.map(m => m.amount))

  return (
    <>
      <div className="space-y-4">

        {/* Page title */}
        <div>
          <h2 className="font-display text-xl font-black text-[#1c1c1e] tracking-tight">Loan Readiness</h2>
          <p className="text-sm text-[#718096]">Your financial story, ready for lenders</p>
        </div>

        {/* ── Hero score card ── */}
        <div className="rounded-3xl p-5 text-white overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>

          {/* Score + badge row */}
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-green-100 text-[10px] font-bold uppercase tracking-widest mb-1">Overall Credit Score</p>
              <div className="flex items-end gap-2">
                <p className="font-display font-black text-6xl tracking-tight leading-none">{score.overall}</p>
                <p className="text-green-200 text-xl font-bold mb-1">/ 100</p>
              </div>
            </div>
            <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-white text-[#1a6b3c] uppercase tracking-widest shrink-0 mt-1">
              {score.status}
            </span>
          </div>

          {/* Score bar */}
          <div className="h-2.5 bg-white/30 rounded-full overflow-hidden mt-3 mb-4">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${score.overall}%` }} />
          </div>

          {/* Eligibility glass box */}
          <div className="bg-black/20 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white/70 text-[10px] uppercase tracking-widest font-semibold mb-0.5">
                Estimated Loan Eligibility
              </p>
              <p className="font-display font-black text-2xl tracking-tight text-white">
                KES {fmt2(score.eligibility)}
              </p>
            </div>
            {score.preApproved && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white text-[#1a6b3c] uppercase tracking-widest shrink-0">
                Pre-Approved ✓
              </span>
            )}
          </div>
        </div>

        {/* ── Sub-score progress indicators ── */}
        <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] space-y-3">
          <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Score Breakdown</p>
          {score.subScores.map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-[#4a5568]">{s.label}</span>
                <span className="text-sm font-black tracking-tight" style={{ color: s.color }}>{s.score}%</span>
              </div>
              <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${s.score}%`, background: s.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* ── 6-month revenue bar chart ── */}
        <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-display font-bold text-[#1c1c1e] text-sm">Monthly Revenue</p>
              <p className="text-xs text-[#718096]">Last 6 months (KES)</p>
            </div>
            <span className="text-[11px] font-black text-[#1a6b3c] bg-[#f0faf4] px-2.5 py-1 rounded-full">
              +{score.growthPct}% Growth 📈
            </span>
          </div>
          <div className="flex items-end gap-2" style={{ height: 110 }}>
            {score.monthlyRevenue.map((m, i) => {
              const heightPct = (m.amount / maxRev) * 100
              const isLast = i === score.monthlyRevenue.length - 1
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <p className="text-[9px] font-bold text-[#1a6b3c]">
                    {m.amount >= 1000 ? `${Math.round(m.amount / 1000)}K` : m.amount}
                  </p>
                  <div className="w-full flex items-end" style={{ height: 80 }}>
                    <div className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${heightPct}%`,
                        background: isLast
                          ? 'linear-gradient(180deg, #e8a020, #1a6b3c)'
                          : '#1a6b3c',
                        minHeight: 4,
                      }} />
                  </div>
                  <span className="text-[10px] text-[#718096] font-semibold">{m.month}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── AI Coach banner ── */}
        <div className="rounded-2xl p-4 border border-green-200" style={{ background: '#E8F8EF' }}>
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🤖</span>
            <div>
              <p className="text-xs font-black text-[#1a6b3c] uppercase tracking-widest mb-1">AI Business Coach</p>
              <p className="text-sm text-[#2d5a3d] leading-relaxed">{score.coachTip}</p>
            </div>
          </div>
        </div>

        {/* ── Download report button ── */}
        <button
          onClick={() => setShowReport(true)}
          className="w-full py-4 rounded-2xl bg-[#1a6b3c] hover:bg-[#0f3d22] text-white font-black text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
          📥 Download Loan Report
        </button>

      </div>

      {/* Certificate modal */}
      {showReport && (
        <LoanReportModal
          score={score}
          businessName={businessName}
          ownerName={ownerName}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  )
}
