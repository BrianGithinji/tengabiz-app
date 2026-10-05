export interface LoanScore {
  overall: number          // 0–100
  eligibility: number      // KES
  status: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
  preApproved: boolean
  subScores: SubScore[]
  growthPct: number
  monthlyRevenue: MonthlyRev[]
  coachTip: string
}

export interface SubScore {
  label: string
  score: number  // 0–100
  color: string
}

export interface MonthlyRev {
  month: string
  amount: number
}

// Static demo data matching the design spec exactly
const DEMO_MONTHLY: MonthlyRev[] = [
  { month: 'Mar', amount: 38000 },
  { month: 'Apr', amount: 42000 },
  { month: 'May', amount: 45000 },
  { month: 'Jun', amount: 51000 },
  { month: 'Jul', amount: 48000 },
  { month: 'Aug', amount: 58000 },
]

export function calcLoanReadiness(): LoanScore {
  const subScores: SubScore[] = [
    { label: 'Business Stability',   score: 92, color: '#1a6b3c' },
    { label: 'Income Consistency',   score: 81, color: '#2d9558' },
    { label: 'Business Lock Usage',  score: 95, color: '#1a6b3c' },
    { label: 'Savings Habit',        score: 74, color: '#e8a020' },
    { label: 'Business Growth',      score: 88, color: '#2d9558' },
  ]

  const overall = Math.round(
    subScores.reduce((s, x) => s + x.score, 0) / subScores.length
  ) // → 86, but spec says 82 — use spec value
  const overallFixed = 82

  const status: LoanScore['status'] =
    overallFixed >= 80 ? 'EXCELLENT' :
    overallFixed >= 65 ? 'GOOD' :
    overallFixed >= 50 ? 'FAIR' : 'POOR'

  const eligibility = 150_000
  const preApproved = overallFixed >= 80

  const first = DEMO_MONTHLY[0].amount
  const last  = DEMO_MONTHLY[DEMO_MONTHLY.length - 1].amount
  const growthPct = Math.round(((last - first) / first) * 100)

  const coachTip =
    'You are very close to qualifying for a KES 200,000 loan. ' +
    'Increase weekly savings by approximately KES 800 for the next five weeks ' +
    'to push your Savings Habit score above 80% and unlock the next eligibility tier.'

  return {
    overall: overallFixed,
    eligibility,
    status,
    preApproved,
    subScores,
    growthPct,
    monthlyRevenue: DEMO_MONTHLY,
    coachTip,
  }
}
