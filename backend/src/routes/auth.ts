import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import pool from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { z } from 'zod'
import passport from '../passport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../uploads'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype.startsWith('image/'))
}})

const certUpload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf')
}})

const router = Router()

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal('')),
  pin: z.string().length(4).regex(/^\d+$/),
  businessName: z.string().min(1),
  ownerName: z.string().min(1),
  businessType: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

const loginSchema = z.object({
  phone: z.string().min(9),
  pin: z.string().min(4),
})

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '30d' })
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() })
    return
  }

  const { firstName, lastName, phone, email, pin, businessName, ownerName, businessType, location, description, lat, lng } = result.data

  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone])
  if (existing.rows.length > 0) { res.status(409).json({ error: 'Phone number already registered' }); return }

  const pinHash = await bcrypt.hash(pin, 10)
  const id = randomUUID()
  const fullName = `${firstName} ${lastName}`.trim()

  await pool.query(
    `INSERT INTO users (id, email, pin_hash, business_name, owner_name, phone, business_type, location, description, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, email || null, pinHash, businessName, fullName, phone, businessType ?? null, location ?? null, description ?? null, lat ?? null, lng ?? null]
  )

  res.status(201).json({ token: signToken(id), userId: id, businessName, ownerName: fullName })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) { res.status(400).json({ error: 'Validation failed' }); return }

  const { phone, pin } = result.data
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone])

  if (rows.length === 0) { res.status(401).json({ error: 'Invalid phone number or PIN' }); return }

  const user = rows[0]
  const valid = await bcrypt.compare(pin, user.pin_hash)
  if (!valid) { res.status(401).json({ error: 'Invalid phone number or PIN' }); return }

  res.json({
    token: signToken(user.id),
    userId: user.id,
    businessName: user.business_name,
    ownerName: user.owner_name,
  })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, business_name, owner_name, phone, business_type, location, lat, lng, description, business_photo, reg_cert_url, created_at FROM users WHERE id = $1',
    [req.userId]
  )
  if (rows.length === 0) { res.status(404).json({ error: 'User not found' }); return }
  res.json(rows[0])
})

// PATCH /api/auth/update-profile
router.patch('/update-profile', requireAuth, async (req: AuthRequest, res) => {
  const { businessName } = req.body
  if (!businessName?.trim()) { res.status(400).json({ error: 'businessName required' }); return }
  await pool.query('UPDATE users SET business_name = $1 WHERE id = $2', [businessName.trim(), req.userId])
  res.json({ success: true })
})

// POST /api/auth/upload-photo
router.post('/upload-photo', requireAuth, upload.single('photo'), async (req: AuthRequest, res) => {
  if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return }
  const photoUrl = `/uploads/${req.file.filename}`
  await pool.query('UPDATE users SET business_photo = $1 WHERE id = $2', [photoUrl, req.userId])
  res.json({ photoUrl })
})

// POST /api/auth/upload-cert
router.post('/upload-cert', requireAuth, certUpload.single('cert'), async (req: AuthRequest, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file provided' }); return }
  const certUrl = `/uploads/${req.file.filename}`
  await pool.query('UPDATE users SET reg_cert_url = $1 WHERE id = $2', [certUrl, req.userId])
  res.json({ certUrl })
})

// ── Google OAuth ──────────────────────────────────────────────────────────────

// GET /api/auth/google — redirect to Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }))

// GET /api/auth/google/callback — Google redirects here after login
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err: any, user: any) => {
      if (err) {
        console.error('[google/callback] Auth error:', err.message)
        return res.redirect(`/?error=${encodeURIComponent(err.message)}`)
      }
      if (!user) {
        console.error('[google/callback] No user returned')
        return res.redirect('/?error=google_failed')
      }
      const token = signToken(user.id)
      res.redirect(`/?token=${token}&businessName=${encodeURIComponent(user.business_name)}&ownerName=${encodeURIComponent(user.owner_name)}&isNew=${user.is_new ? '1' : '0'}`)
    })(req, res, next)
  }
)

export default router
