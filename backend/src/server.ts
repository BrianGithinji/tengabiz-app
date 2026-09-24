import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import mpesaRoutes from './routes/mpesa.js'
import paymentsRoutes from './routes/payments.js'
import authRoutes from './routes/auth.js'
import channelsRoutes from './routes/channels.js'
import passport from './passport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3000

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:8443' }))
app.use(express.json())
app.use(passport.initialize())

// ── Routes (must be before static) ───────────────────────────────────────────
app.use('/api/mpesa', mpesaRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/channels', channelsRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TENGABIZ API', env: process.env.MPESA_ENV ?? 'sandbox' })
})

// ── Static frontend ──────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))

// Catch-all: serve React app for non-API routes only
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled error]', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`TENGABIZ API running on http://0.0.0.0:${PORT}`)
  console.log(`M-PESA environment: ${process.env.MPESA_ENV ?? 'sandbox'}`)
})
