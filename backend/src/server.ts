import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import mpesaRoutes from './routes/mpesa.js'
import paymentsRoutes from './routes/payments.js'
import simulationRoutes from './routes/simulation.js'
import authRoutes from './routes/auth.js'
import channelsRoutes from './routes/channels.js'
import passport from './passport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3000
const frontendOrigin = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:8443').replace(/\/$/, '')
if (process.env.RENDER) app.set('trust proxy', 1)
const requiredConfig = [
  'DATABASE_URL',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_STK_SHORTCODE',
  'MPESA_PASSKEY',
  'CALLBACK_BASE_URL',
]
for (const name of requiredConfig) {
  if (!process.env[name]) console.error(`[config] Missing required variable: ${name}`)
}

const uploadsDir = path.join(__dirname, '../../uploads')
mkdirSync(uploadsDir, { recursive: true })

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: frontendOrigin }))
app.use(express.json())
app.use(passport.initialize())
app.use('/uploads', express.static(uploadsDir))

// ── Routes (must be before static) ───────────────────────────────────────────
app.use('/api/mpesa', mpesaRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/internal-payment', simulationRoutes)
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
