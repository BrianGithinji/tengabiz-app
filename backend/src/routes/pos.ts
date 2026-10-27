import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import pool from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { calculateSaleTotals, applyStockChange, createReceiptNumber } from '../pos/ledger.js'

const router = Router()

const productSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal('')),
  sku: z.string().trim().optional().or(z.literal('')),
  barcode: z.string().trim().optional().or(z.literal('')),
  category: z.string().trim().optional().or(z.literal('')),
  unit: z.string().trim().default('units'),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  wholesalePrice: z.coerce.number().min(0).optional(),
  currentStock: z.coerce.number().int().min(0).optional().default(0),
  reorderThreshold: z.coerce.number().int().min(0).optional().default(0),
  supplierName: z.string().trim().optional().or(z.literal('')),
  expiryDate: z.string().trim().optional().or(z.literal('')),
  active: z.boolean().optional().default(true),
})

const stockInSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional().or(z.literal('')),
  supplierName: z.string().trim().optional().or(z.literal('')),
})

const saleSchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive(),
  })).min(1),
  paymentMethod: z.enum(['cash', 'mpesa', 'mixed', 'credit']).default('cash'),
  amountPaid: z.coerce.number().min(0).optional().default(0),
  customerName: z.string().trim().optional().or(z.literal('')),
  idempotencyKey: z.string().trim().min(1).optional(),
})

router.get('/dashboard', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!
  const [summary, lowStock, outOfStock, recentMovements, recentSales] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS active_products,
        COALESCE(SUM(current_stock), 0)::int AS total_units_in_stock,
        COALESCE(SUM(current_stock * cost_price), 0)::numeric AS inventory_value,
        COALESCE(
          (
            SELECT SUM(total)
            FROM sales
            WHERE user_id = $1 AND created_at >= NOW()::date
          ), 0
        )::numeric AS today_revenue,
        COALESCE(
          (
            SELECT SUM(cogs)
            FROM sales
            WHERE user_id = $1 AND created_at >= NOW()::date
          ), 0
        )::numeric AS today_cogs,
        COALESCE(
          (
            SELECT SUM(gross_profit)
            FROM sales
            WHERE user_id = $1 AND created_at >= NOW()::date
          ), 0
        )::numeric AS today_gross_profit
      FROM products
      WHERE user_id = $1 AND active = TRUE
    `, [userId]),
    pool.query(`
      SELECT id, name, sku, current_stock, reorder_threshold, cost_price, selling_price
      FROM products
      WHERE user_id = $1 AND active = TRUE AND current_stock <= reorder_threshold
      ORDER BY current_stock ASC, name ASC
      LIMIT 10
    `, [userId]),
    pool.query(`
      SELECT id, name, sku, current_stock
      FROM products
      WHERE user_id = $1 AND active = TRUE AND current_stock <= 0
      ORDER BY name ASC
      LIMIT 10
    `, [userId]),
    pool.query(`
      SELECT sm.*, p.name AS product_name
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE sm.user_id = $1
      ORDER BY sm.created_at DESC
      LIMIT 10
    `, [userId]),
    pool.query(`
      SELECT *
      FROM sales
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]),
  ])

  res.json({
    metrics: summary.rows[0] ?? {
      active_products: 0,
      total_units_in_stock: 0,
      inventory_value: '0',
      today_revenue: '0',
      today_cogs: '0',
      today_gross_profit: '0',
    },
    lowStockProducts: lowStock.rows,
    outOfStockProducts: outOfStock.rows,
    recentMovements: recentMovements.rows,
    recentSales: recentSales.rows,
  })
})

router.get('/products', requireAuth, async (req: AuthRequest, res) => {
  const query = req.query.q ? String(req.query.q).trim() : ''
  const sql = `
    SELECT *
    FROM products
    WHERE user_id = $1 AND (
      $2 = '' OR
      name ILIKE '%' || $2 || '%' OR
      sku ILIKE '%' || $2 || '%' OR
      barcode ILIKE '%' || $2 || '%' OR
      category ILIKE '%' || $2 || '%'
    )
    ORDER BY updated_at DESC, created_at DESC
  `
  const { rows } = await pool.query(sql, [req.userId!, query])
  res.json(rows)
})

router.post('/products', requireAuth, async (req: AuthRequest, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
    return
  }

  const { name, description, sku, barcode, category, unit, costPrice, sellingPrice, wholesalePrice, currentStock, reorderThreshold, supplierName, expiryDate, active } = parsed.data

  const skuValue = (sku ?? '').trim()
  const barcodeValue = (barcode ?? '').trim()

  if (skuValue) {
    const duplicate = await pool.query('SELECT id FROM products WHERE user_id = $1 AND sku = $2 AND active = TRUE LIMIT 1', [req.userId!, skuValue])
    if (duplicate.rows.length > 0) {
      res.status(409).json({ error: 'A product with this SKU already exists for this business.' })
      return
    }
  }

  if (barcodeValue) {
    const duplicate = await pool.query('SELECT id FROM products WHERE user_id = $1 AND barcode = $2 AND active = TRUE LIMIT 1', [req.userId!, barcodeValue])
    if (duplicate.rows.length > 0) {
      res.status(409).json({ error: 'A product with this barcode already exists for this business.' })
      return
    }
  }

  const id = randomUUID()
  const { rows } = await pool.query(`
    INSERT INTO products (
      id, user_id, name, description, sku, barcode, category, unit,
      cost_price, selling_price, wholesale_price, current_stock, reorder_threshold,
      supplier_name, expiry_date, active, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, NOW(), NOW()
    ) RETURNING *
  `, [
    id,
    req.userId!,
    name,
    description || null,
    skuValue || null,
    barcodeValue || null,
    category || null,
    unit || 'units',
    Number(costPrice),
    Number(sellingPrice),
    wholesalePrice ? Number(wholesalePrice) : null,
    Number(currentStock),
    Number(reorderThreshold),
    supplierName || null,
    expiryDate || null,
    active,
  ])

  if (Number(currentStock) > 0) {
    await pool.query(`
      INSERT INTO stock_movements (
        id, user_id, product_id, movement_type, quantity_delta, reason,
        previous_quantity, new_quantity, created_by_user, created_at
      ) VALUES ($1, $2, $3, 'opening_stock', $4, 'Initial stock', $5, $6, $7, NOW())
    `, [randomUUID(), req.userId!, id, Number(currentStock), 0, Number(currentStock), req.userId!])
  }

  res.status(201).json(rows[0])
})

router.get('/products/:id', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.userId!])
  if (rows.length === 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }
  res.json(rows[0])
})

router.post('/products/:id/receive-stock', requireAuth, async (req: AuthRequest, res) => {
  const parsed = stockInSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
    return
  }

  const { quantity, unitCost, notes, supplierName } = parsed.data
  const productId = req.params.id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const productResult = await client.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [productId, req.userId!]
    )
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Product not found' })
      return
    }

    const product = productResult.rows[0]
    const previous = Number(product.current_stock)
    const next = previous + quantity

    if (typeof unitCost === 'number' && Number(unitCost) > 0) {
      await client.query(
        'UPDATE products SET cost_price = $1, current_stock = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4',
        [Number(unitCost), next, productId, req.userId!]
      )
    } else {
      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [next, productId, req.userId!]
      )
    }

    await client.query(`
      INSERT INTO stock_movements (
        id, user_id, product_id, movement_type, quantity_delta, reason,
        previous_quantity, new_quantity, created_by_user, notes, reference,
        created_at
      ) VALUES ($1, $2, $3, 'supplier_receipt', $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [
      randomUUID(),
      req.userId!,
      productId,
      quantity,
      notes || 'Supplier receipt',
      previous,
      next,
      req.userId!,
      notes || supplierName || 'Supplier delivery',
      supplierName || 'supplier-receipt',
    ])

    await client.query('COMMIT')
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [productId, req.userId!])
    res.status(201).json({ product: rows[0], movement: { previous, next, quantity } })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

router.get('/sales', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, json_agg(json_build_object(
      'id', si.id,
      'productId', si.product_id,
      'productName', si.product_name,
      'quantity', si.quantity,
      'unitPrice', si.unit_price,
      'unitCost', si.unit_cost,
      'subtotal', si.subtotal,
      'cogs', si.cogs
    ) ORDER BY si.created_at ASC) AS items
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.user_id = $1
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `, [req.userId!])
  res.json(rows)
})

router.post('/sales', requireAuth, async (req: AuthRequest, res) => {
  const parsed = saleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
    return
  }

  const { items, paymentMethod, amountPaid, customerName, idempotencyKey } = parsed.data
  const userId = req.userId!

  if (idempotencyKey) {
    const existing = await pool.query('SELECT * FROM sales WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1', [userId, idempotencyKey])
    if (existing.rows.length > 0) {
      res.status(200).json({ sale: existing.rows[0], duplicate: true })
      return
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const productIds = items.map(item => item.productId)
    const productRows = await client.query(
      'SELECT * FROM products WHERE id = ANY($1) AND user_id = $2 AND active = TRUE FOR UPDATE',
      [productIds, userId]
    )

    const productMap = new Map(productRows.rows.map((product) => [product.id, product]))

    const saleItems = [] as Array<{ productId: string; quantity: number; unitPrice: number; unitCost: number; productName: string }>
    let subtotal = 0
    let cogsTotal = 0

    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: `Product not found: ${item.productId}` })
        return
      }
      const currentStock = Number(product.current_stock)
      const unitPrice = Number(product.selling_price)
      const unitCost = Number(product.cost_price)
      const result = applyStockChange({ currentQuantity: currentStock, delta: -item.quantity, movementType: 'sale' })
      if (!result.valid) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${currentStock}` })
        return
      }

      const lineSubtotal = item.quantity * unitPrice
      const lineCogs = item.quantity * unitCost
      subtotal += lineSubtotal
      cogsTotal += lineCogs
      saleItems.push({ productId: item.productId, quantity: item.quantity, unitPrice, unitCost, productName: product.name })
    }

    const total = Number((subtotal).toFixed(2))
    const cogs = Number((cogsTotal).toFixed(2))
    const grossProfit = Number((total - cogs).toFixed(2))
    const paymentTotal = Number(amountPaid)
    const change = paymentMethod === 'cash' ? Math.max(0, paymentTotal - total) : 0
    const saleId = randomUUID()
    const receiptNumber = createReceiptNumber('POS')

    const saleRes = await client.query(`
      INSERT INTO sales (
        id, user_id, receipt_number, payment_method, status, subtotal, tax, total,
        amount_paid, change_due, cogs, gross_profit, customer_name, idempotency_key,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'completed', $5, 0, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
      ) RETURNING *
    `, [saleId, userId, receiptNumber, paymentMethod, Number(subtotal.toFixed(2)), Number(total.toFixed(2)), paymentTotal, Number(change.toFixed(2)), Number(cogs.toFixed(2)), Number(grossProfit.toFixed(2)), customerName || null, idempotencyKey || null])

    for (const item of saleItems) {
      const product = productMap.get(item.productId)!
      const lineSubtotal = item.quantity * item.unitPrice
      const lineCogs = item.quantity * item.unitCost
      const nextQuantity = Number(product.current_stock) - item.quantity
      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [nextQuantity, item.productId, userId]
      )
      await client.query(`
        INSERT INTO sale_items (
          id, sale_id, product_id, product_name, quantity, unit_price, unit_cost,
          subtotal, cogs, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        randomUUID(),
        saleId,
        item.productId,
        item.productName,
        item.quantity,
        Number(item.unitPrice.toFixed(2)),
        Number(item.unitCost.toFixed(2)),
        Number(lineSubtotal.toFixed(2)),
        Number(lineCogs.toFixed(2)),
      ])

      await client.query(`
        INSERT INTO stock_movements (
          id, user_id, product_id, movement_type, quantity_delta, reason,
          previous_quantity, new_quantity, created_by_user, reference, created_at
        ) VALUES ($1, $2, $3, 'sale', $4, 'Point of sale sale', $5, $6, $7, $8, NOW())
      `, [randomUUID(), userId, item.productId, -item.quantity, Number(product.current_stock), nextQuantity, userId, saleId])
    }

    await client.query('COMMIT')
    res.status(201).json({ sale: saleRes.rows[0], receiptNumber, duplicate: false })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

export default router
