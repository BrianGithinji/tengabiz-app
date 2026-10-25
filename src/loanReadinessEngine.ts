import type { Summary, Transaction } from './lib/mpesa'

export interface LoanScore {
  overall: number
  status: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'BUILDING'
  subScores: SubScore[]
  growthPct: number | null
  monthlyRevenue: MonthlyRev[]
  activeMonths: number
  incomingTransactions: number
  totalRevenue: number
  totalSavings: number
  savingsRate: number
  businessLockRate: number
  coachTip: string
}

export interface SubScore {
  label: string
  score: number
  weight: number
  color: string
  description: string
}

export interface MonthlyRev {
  month: string
  amount: number
}

const FACTOR_COLORS = ['#1a6b3c', '#2d9558', '#1a6b3c', '#e8a020', '#2d9558']

function parseTransactionDate(value: string): Date | null {
  const raw = String(value)
  const date = raw.length === 14
    ? new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`)
    : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function getIncomeConsistencyScore(monthlyAmounts: number[], activeMonths: number): number {
  const activeAmounts = monthlyAmounts.filter(amount => amount > 0)
  if (activeAmounts.length === 0) return 0

  const average = activeAmounts.reduce((sum, amount) => sum + amount, 0) / activeAmounts.length
  const variance = activeAmounts.reduce((sum, amount) => sum + (amount - average) ** 2, 0) / activeAmounts.length
  const coefficientOfVariation = average > 0 ? Math.sqrt(variance) / average : 1
  const consistency = 100 / (1 + coefficientOfVariation)
  const evidenceCap = activeMonths >= 3 ? 100 : activeMonths * 20 + 20

  return Math.round(Math.min(consistency, evidenceCap))
}

function getCoachTip(subScores: SubScore[]): string {
  const lowestFactor = [...subScores].sort((left, right) => left.score - right.score)[0]
  const tips: Record<string, string> = {
    'Business activity history': 'Keep recording business income through TENGABIZ each month to build a longer transaction history.',
    'Income consistency': 'Record all business income consistently. More months of transaction history help demonstrate reliable cash flow.',
    'Payment activity': 'Record customer payments through your linked business channels to build transaction evidence.',
    'Savings discipline': 'Set aside a regular portion of business income as savings and keep it recorded in TENGABIZ.',
    'Business lock usage': 'Allocate a sustainable portion of your income to Business Lock to show how you reserve funds for business needs.',
  }

  return tips[lowestFactor.label] ?? 'Keep your business transactions and savings up to date to build a stronger financial history.'
}

export function calcLoanReadiness(transactions: Transaction[], summary: Summary, now = new Date()): LoanScore {
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1)
    return {
      date,
      label: date.toLocaleString('en-KE', { month: 'short' }),
      amount: 0,
    }
  })

  const incomingTransactions = transactions.filter(transaction => transaction.type === 'in')
  let recentIncomingTransactions = 0
  for (const transaction of incomingTransactions) {
    const date = parseTransactionDate(transaction.transaction_date)
    if (!date || date < firstMonth || date > now) continue
    recentIncomingTransactions++
    const month = months.find(item =>
      item.date.getFullYear() === date.getFullYear() && item.date.getMonth() === date.getMonth(),
    )
    if (month) month.amount += Number(transaction.amount) || 0
  }

  const activeMonths = months.filter(month => month.amount > 0).length
  const totalRevenue = Math.max(0, Number(summary.total_in) || 0)
  const totalSavings = Math.max(0, Number(summary.total_savings) || 0)
  const totalBusinessLock = Math.max(0, Number(summary.total_business_lock) || 0)
  const savingsRate = totalRevenue > 0 ? totalSavings / totalRevenue : 0
  const businessLockRate = totalRevenue > 0 ? totalBusinessLock / totalRevenue : 0
  const monthlyAmounts = months.map(month => month.amount)

  const subScores: SubScore[] = [
    {
      label: 'Business activity history',
      score: Math.round((activeMonths / 6) * 100),
      weight: 20,
      color: FACTOR_COLORS[0],
      description: 'Number of the last six calendar months with recorded income.',
    },
    {
      label: 'Income consistency',
      score: getIncomeConsistencyScore(monthlyAmounts, activeMonths),
      weight: 25,
      color: FACTOR_COLORS[1],
      description: 'How steady monthly income is, based on active months; limited history caps this score.',
    },
    {
      label: 'Payment activity',
      score: Math.round(Math.min(recentIncomingTransactions / 30, 1) * 100),
      weight: 15,
      color: FACTOR_COLORS[2],
      description: 'Incoming transactions recorded in the last six months, up to 30.',
    },
    {
      label: 'Savings discipline',
      score: Math.round(Math.min(savingsRate / 0.1, 1) * 100),
      weight: 20,
      color: FACTOR_COLORS[3],
      description: 'Recorded savings as a share of total recorded income, up to a 10% target.',
    },
    {
      label: 'Business lock usage',
      score: Math.round(Math.min(businessLockRate / 0.3, 1) * 100),
      weight: 20,
      color: FACTOR_COLORS[4],
      description: 'Recorded Business Lock allocations as a share of income, up to a 30% target.',
    },
  ]

  const overall = Math.round(
    subScores.reduce((total, factor) => total + factor.score * factor.weight, 0) / 100,
  )
  const status: LoanScore['status'] = overall >= 80
    ? 'EXCELLENT'
    : overall >= 65
      ? 'GOOD'
      : overall >= 45
        ? 'FAIR'
        : 'BUILDING'

  const firstRevenue = months[0].amount
  const lastRevenue = months[months.length - 1].amount
  const growthPct = firstRevenue > 0
    ? Math.round(((lastRevenue - firstRevenue) / firstRevenue) * 100)
    : null

  return {
    overall,
    status,
    subScores,
    growthPct,
    monthlyRevenue: months.map(({ label, amount }) => ({ month: label, amount: Math.round(amount) })),
    activeMonths,
    incomingTransactions: recentIncomingTransactions,
    totalRevenue,
    totalSavings,
    savingsRate: Math.round(savingsRate * 100),
    businessLockRate: Math.round(businessLockRate * 100),
    coachTip: getCoachTip(subScores),
  }
}
