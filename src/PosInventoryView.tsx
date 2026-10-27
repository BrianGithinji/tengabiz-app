import { useEffect, useMemo, useState } from 'react'
import { pos, type Product } from './lib/mpesa'

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(value)
}

export default function PosInventoryView({ token }: { token: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [productForm, setProductForm] = useState({
    name: '', description: '', sku: '', barcode: '', category: '', unit: 'units',
    costPrice: '0', sellingPrice: '0', wholesalePrice: '', currentStock: '0', reorderThreshold: '0',
    supplierName: '', expiryDate: '', active: true,
  })
  const [stockForm, setStockForm] = useState({ productId: '', quantity: '1', unitCost: '', notes: '' })
  const [saleForm, setSaleForm] = useState({ productId: '', quantity: '1', paymentMethod: 'cash', amountPaid: '0', customerName: '' })
  const [receipt, setReceipt] = useState<{ receiptNumber?: string; total?: number; status?: string } | null>(null)

  async function refreshProducts() {
    setLoading(true)
    setError(null)
    try {
      const data = await pos.listProducts()
      setProducts(data)
      if (data[0] && !stockForm.productId) setStockForm(f => ({ ...f, productId: data[0].id }))
      if (data[0] && !saleForm.productId) setSaleForm(f => ({ ...f, productId: data[0].id }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshProducts()
  }, [token])

  function clearNotice() {
    setMessage(null)
    setReceipt(null)
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      const payload = {
        name: productForm.name,
        description: productForm.description,
        sku: productForm.sku,
        barcode: productForm.barcode,
        category: productForm.category,
        unit: productForm.unit,
        costPrice: Number(productForm.costPrice),
        sellingPrice: Number(productForm.sellingPrice),
        wholesalePrice: productForm.wholesalePrice ? Number(productForm.wholesalePrice) : undefined,
        currentStock: Number(productForm.currentStock),
        reorderThreshold: Number(productForm.reorderThreshold),
        supplierName: productForm.supplierName,
        expiryDate: productForm.expiryDate,
        active: productForm.active,
      }
      await pos.createProduct(payload)
      setMessage('Product created successfully.')
      setProductForm({ name: '', description: '', sku: '', barcode: '', category: '', unit: 'units', costPrice: '0', sellingPrice: '0', wholesalePrice: '', currentStock: '0', reorderThreshold: '0', supplierName: '', expiryDate: '', active: true })
      await refreshProducts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleReceiveStock(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      const res = await pos.receiveStock(stockForm.productId, {
        quantity: Number(stockForm.quantity),
        unitCost: stockForm.unitCost ? Number(stockForm.unitCost) : undefined,
        notes: stockForm.notes,
      })
      setMessage(`Stock updated: ${res.movement.quantity} units received. New balance: ${res.movement.next}`)
      setStockForm(f => ({ ...f, quantity: '1', unitCost: '', notes: '' }))
      await refreshProducts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleSale(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      const product = products.find((p) => p.id === saleForm.productId)
      if (!product) throw new Error('Select a product first.')
      const quantity = Number(saleForm.quantity)
      if (quantity <= 0) throw new Error('Quantity must be greater than zero.')
      const result = await pos.createSale({
        items: [{ productId: product.id, quantity }],
        paymentMethod: saleForm.paymentMethod,
        amountPaid: Number(saleForm.amountPaid || product.selling_price * quantity),
        customerName: saleForm.customerName,
        idempotencyKey: `${product.id}-${Date.now()}`,
      })
      setReceipt({ receiptNumber: result.receiptNumber, total: Number((result.sale as any)?.total ?? 0), status: result.duplicate ? 'Duplicate request - no extra stock deducted' : 'Completed' })
      setMessage('Sale completed and stock deducted successfully.')
      setSaleForm(f => ({ ...f, quantity: '1', amountPaid: '0', customerName: '' }))
      await refreshProducts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const lowStockCount = useMemo(() => products.filter((p) => p.current_stock <= p.reorder_threshold).length, [products])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-[#1c1c1e]">Inventory & POS</h2>
        <p className="text-sm text-[#718096]">Create products, receive stock, and complete a sale with real stock movement records.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#718096]">Products</p>
          <p className="font-display text-2xl font-bold text-[#1c1c1e] mt-1">{products.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#718096]">Units</p>
          <p className="font-display text-2xl font-bold text-[#1c1c1e] mt-1">{products.reduce((sum, p) => sum + p.current_stock, 0)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#718096]">Low stock</p>
          <p className="font-display text-2xl font-bold text-[#1a6b3c] mt-1">{lowStockCount}</p>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {receipt && (
        <div className="rounded-2xl border border-[#1a6b3c] bg-[#f0faf4] px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-[#1a6b3c]">Receipt</p>
          <p className="font-display text-xl font-bold text-[#1c1c1e] mt-1">{receipt.receiptNumber}</p>
          <p className="text-sm text-[#4a5568]">Status: {receipt.status} • Total: {fmtCurrency(receipt.total ?? 0)}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={handleCreateProduct} className="space-y-3 rounded-2xl bg-white border border-[#e2e8f0] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[#1c1c1e]">Add product</h3>
            <span className="text-[10px] uppercase tracking-widest text-[#718096]">Product</span>
          </div>

          <input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="Product name" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" required />
          <textarea value={productForm.description} onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" rows={2} />

          <div className="grid grid-cols-2 gap-2">
            <input value={productForm.sku} onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
            <input value={productForm.barcode} onChange={(e) => setProductForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Barcode" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={productForm.category} onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value }))} placeholder="Category" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
            <input value={productForm.unit} onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value }))} placeholder="Units" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" step="0.01" value={productForm.costPrice} onChange={(e) => setProductForm((f) => ({ ...f, costPrice: e.target.value }))} placeholder="Cost price" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" required />
            <input type="number" min="0" step="0.01" value={productForm.sellingPrice} onChange={(e) => setProductForm((f) => ({ ...f, sellingPrice: e.target.value }))} placeholder="Selling price" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" required />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" step="0.01" value={productForm.wholesalePrice} onChange={(e) => setProductForm((f) => ({ ...f, wholesalePrice: e.target.value }))} placeholder="Wholesale price (optional)" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
            <input type="number" min="0" step="1" value={productForm.currentStock} onChange={(e) => setProductForm((f) => ({ ...f, currentStock: e.target.value }))} placeholder="Opening stock" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" step="1" value={productForm.reorderThreshold} onChange={(e) => setProductForm((f) => ({ ...f, reorderThreshold: e.target.value }))} placeholder="Reorder threshold" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
            <input type="date" value={productForm.expiryDate} onChange={(e) => setProductForm((f) => ({ ...f, expiryDate: e.target.value }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-[#f7f7f7] px-3 py-2 text-sm">
            <span className="text-[#4a5568]">Active</span>
            <input type="checkbox" checked={productForm.active} onChange={(e) => setProductForm((f) => ({ ...f, active: e.target.checked }))} />
          </div>

          <button type="submit" className="w-full rounded-xl bg-[#1a6b3c] px-3 py-2.5 text-sm font-semibold text-white">Save product</button>
        </form>

        <form onSubmit={handleReceiveStock} className="space-y-3 rounded-2xl bg-white border border-[#e2e8f0] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[#1c1c1e]">Receive stock</h3>
            <span className="text-[10px] uppercase tracking-widest text-[#718096]">Receipt</span>
          </div>

          <select value={stockForm.productId} onChange={(e) => setStockForm((f) => ({ ...f, productId: e.target.value }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm">
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name} ({product.current_stock} in stock)</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="1" step="1" value={stockForm.quantity} onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" placeholder="Quantity" required />
            <input type="number" min="0" step="0.01" value={stockForm.unitCost} onChange={(e) => setStockForm((f) => ({ ...f, unitCost: e.target.value }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" placeholder="Unit cost" />
          </div>

          <textarea value={stockForm.notes} onChange={(e) => setStockForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Supplier note or purchase reference" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" rows={3} />

          <button type="submit" className="w-full rounded-xl bg-[#e8a020] px-3 py-2.5 text-sm font-semibold text-white">Record delivery</button>
        </form>
      </div>

      <form onSubmit={handleSale} className="space-y-3 rounded-2xl bg-white border border-[#e2e8f0] p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-[#1c1c1e]">POS checkout</h3>
          <span className="text-[10px] uppercase tracking-widest text-[#718096]">Sale</span>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <select value={saleForm.productId} onChange={(e) => setSaleForm((f) => ({ ...f, productId: e.target.value }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm">
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          <input type="number" min="1" step="1" value={saleForm.quantity} onChange={(e) => setSaleForm((f) => ({ ...f, quantity: e.target.value }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" placeholder="Qty" required />
          <select value={saleForm.paymentMethod} onChange={(e) => setSaleForm((f) => ({ ...f, paymentMethod: e.target.value as 'cash' | 'mpesa' | 'mixed' | 'credit' }))} className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm">
            <option value="cash">Cash</option>
            <option value="mpesa">M-PESA</option>
            <option value="mixed">Mixed</option>
            <option value="credit">Customer credit</option>
          </select>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <input value={saleForm.customerName} onChange={(e) => setSaleForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Customer name (optional)" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
          <input type="number" min="0" step="0.01" value={saleForm.amountPaid} onChange={(e) => setSaleForm((f) => ({ ...f, amountPaid: e.target.value }))} placeholder="Amount paid" className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm" />
        </div>

        <div className="rounded-xl bg-[#f7f7f7] p-3 text-sm text-[#4a5568]">
          {(() => {
            const product = products.find((p) => p.id === saleForm.productId)
            const qty = Number(saleForm.quantity || 0)
            const total = product ? product.selling_price * qty : 0
            return <p><strong>Preview total:</strong> {fmtCurrency(total)}</p>
          })()}
        </div>

        <button type="submit" className="w-full rounded-xl bg-[#1a6b3c] px-3 py-2.5 text-sm font-semibold text-white">Complete sale</button>
      </form>

      <div className="rounded-2xl bg-white border border-[#e2e8f0] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0]">
          <h3 className="font-display font-bold text-[#1c1c1e]">Stock list</h3>
          <span className="text-xs text-[#718096]">{loading ? 'Loading...' : `${products.length} products`}</span>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {products.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#718096] text-center">No products yet. Add one to start the POS flow.</p>
          ) : products.map((product) => (
            <div key={product.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#1c1c1e]">{product.name}</p>
                <p className="text-xs text-[#718096]">SKU: {product.sku || '—'} • {product.current_stock} {product.unit} available</p>
              </div>
              <div className="text-right">
                <p className="font-mono-data text-sm font-semibold text-[#1a6b3c]">{fmtCurrency(product.selling_price)}</p>
                <p className="text-[10px] text-[#718096]">Cost {fmtCurrency(product.cost_price)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
