import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateSaleTotals,
  applyStockChange,
  createReceiptNumber,
} from './ledger.js'

test('calculateSaleTotals totals quantity, tax and profit from historical cost', () => {
  const totals = calculateSaleTotals([
    { productId: 'p1', name: 'Maize Flour', quantity: 2, unitPrice: 160, unitCost: 120 },
    { productId: 'p2', name: 'Sugar', quantity: 3, unitPrice: 100, unitCost: 70 },
  ])

  assert.equal(totals.subtotal, 620)
  assert.equal(totals.total, 620)
  assert.equal(totals.cogs, 450)
  assert.equal(totals.grossProfit, 170)
})

test('applyStockChange prevents overselling and records resulting balance', () => {
  const result = applyStockChange({ currentQuantity: 5, delta: -7, movementType: 'sale' })
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'insufficient_stock')

  const receipt = applyStockChange({ currentQuantity: 5, delta: 3, movementType: 'supplier_receipt' })
  assert.equal(receipt.valid, true)
  assert.equal(receipt.newQuantity, 8)
})

test('receipt numbers are unique and human readable', () => {
  const first = createReceiptNumber('POS')
  const second = createReceiptNumber('POS')
  assert.match(first, /^POS-/)
  assert.notEqual(first, second)
})
