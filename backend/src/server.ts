import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import mpesaRoutes from './routes/mpesa.js'
import paymentsRoutes from './routes/payments.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3000

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:8443' }))
app.use(express.json())

// ── Static frontend ──────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/mpesa', mpesaRoutes)
app.use('/api/payments', paymentsRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TENGABIZ API', env: process.env.MPESA_ENV ?? 'sandbox' })
})

// Catch-all: serve React app for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled error]', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`TENGABIZ API running on http://localhost:${PORT}`)
  console.log(`M-PESA environment: ${process.env.MPESA_ENV ?? 'sandbox'}`)
})
