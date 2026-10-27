export type SaleItemInput = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  unitCost: number
}

export function calculateSaleTotals(items: SaleItemInput[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const cogs = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
  const grossProfit = subtotal - cogs
  const tax = 0
  const total = subtotal + tax

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
    cogs: Number(cogs.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
  }
}

export function applyStockChange({
  currentQuantity,
  delta,
  movementType,
}: {
  currentQuantity: number
  delta: number
  movementType: string
}) {
  const newQuantity = currentQuantity + delta
  if (delta < 0 && currentQuantity + delta < 0) {
    return {
      valid: false,
      reason: 'insufficient_stock',
      newQuantity: currentQuantity,
      previousQuantity: currentQuantity,
      movementType,
    }
  }

  return {
    valid: true,
    reason: null,
    previousQuantity: currentQuantity,
    newQuantity,
    movementType,
  }
}

export function createReceiptNumber(prefix = 'POS') {
  const stamp = new Date()
  const datePart = stamp.toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${datePart}-${randomPart}`
}
