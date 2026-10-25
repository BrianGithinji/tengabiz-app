import { Router, type Request } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import pool from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { z } from 'zod'
import passport from '../passport.js'
import { isRecoverySmsConfigured, sendRecoveryCode } from '../sms.js'

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
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
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

const forgotPinSchema = z.object({
  phone: z.string().trim().min(9).max(16),
})

const resetPinSchema = z.object({
  phone: z.string().trim().min(9).max(16),
  code: z.string().regex(/^\d{6}$/),
  pin: z.string().regex(/^\d{4}$/),
})

function signToken(userId: string, authVersion = 0) {
  return jwt.sign({ userId, authVersion }, process.env.JWT_SECRET!, { expiresIn: '30d' })
}

function normalizeKenyanPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const international = digits.startsWith('0')
    ? `254${digits.slice(1)}`
    : digits.length === 9
      ? `254${digits}`
      : digits
  return /^254[71]\d{8}$/.test(international) ? `+${international}` : null
}

function hashRecoveryValue(value: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required for secure PIN recovery.')
  return createHmac('sha256', secret).update(value).digest('hex')
}

async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const keyHash = hashRecoveryValue(key)
  await pool.query("DELETE FROM auth_rate_limits WHERE window_started_at < NOW() - INTERVAL '1 day'")
  const { rows } = await pool.query<{ request_count: number }>(`
    INSERT INTO auth_rate_limits (key_hash, window_started_at, request_count)
    VALUES ($1, NOW(), 1)
    ON CONFLICT (key_hash) DO UPDATE SET
      request_count = CASE
        WHEN auth_rate_limits.window_started_at <= NOW() - ($2 * INTERVAL '1 second') THEN 1
        ELSE auth_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at <= NOW() - ($2 * INTERVAL '1 second') THEN NOW()
        ELSE auth_rate_limits.window_started_at
      END
    RETURNING request_count
  `, [keyHash, windowSeconds])
  return rows[0].request_count <= limit
}

function getClientAddress(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { firstName, lastName, phone, email, pin, businessName, ownerName, businessType, location, description, lat, lng } = req.body

    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone])
    if (existing.rows.length > 0) { res.status(409).json({ error: 'Phone number already registered' }); return }

    if (email) {
      const emailExists = await pool.query('SELECT id FROM users WHERE email = $1', [email])
      if (emailExists.rows.length > 0) { res.status(409).json({ error: 'Email already registered' }); return }
    }

    const pinHash = await bcrypt.hash(pin, 10)
    const id = randomUUID()
    const fullName = `${firstName} ${lastName}`.trim()

    await pool.query(
      `INSERT INTO users (id, email, pin_hash, business_name, owner_name, phone, business_type, location, description, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, email || null, pinHash, businessName, fullName, phone, businessType ?? null, location ?? null, description ?? null, lat ?? null, lng ?? null]
    )

    res.status(201).json({ token: signToken(id), userId: id, businessName, ownerName: fullName })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auth/register] Failed:', message)
    // Handle any remaining unique constraint violations gracefully
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      res.status(409).json({ error: 'An account with this phone or email already exists' })
      return
    }
    res.status(500).json({ error: 'Unable to create your account. Please try again.' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) { res.status(400).json({ error: 'Validation failed' }); return }

  try {
    const { phone, pin } = result.data
    const normalizedPhone = normalizeKenyanPhone(phone) ?? phone.replace(/\D/g, '')
    const ipAllowed = await consumeRateLimit(`login:ip:${getClientAddress(req)}`, 30, 60 * 60)
    if (!ipAllowed) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' })
      return
    }
    const phoneAllowed = await consumeRateLimit(`login:phone:${normalizedPhone}`, 10, 15 * 60)
    if (!phoneAllowed) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' })
      return
    }

    const phoneDigits = normalizedPhone.replace(/\D/g, '')
    const localPhone = phoneDigits.startsWith('254') ? `0${phoneDigits.slice(3)}` : phoneDigits
    const { rows } = await pool.query(
      `SELECT * FROM users
       WHERE phone = $1 OR regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])
       LIMIT 1`,
      [phone, [phoneDigits, phoneDigits.slice(3), localPhone]]
    )

    if (rows.length === 0) { res.status(401).json({ error: 'Invalid phone number or PIN' }); return }

    const user = rows[0]
    const valid = await bcrypt.compare(pin, user.pin_hash)
    if (!valid) { res.status(401).json({ error: 'Invalid phone number or PIN' }); return }

    res.json({
      token: signToken(user.id, user.auth_version),
      userId: user.id,
      businessName: user.business_name,
      ownerName: user.owner_name,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auth/login] Failed:', message)
    res.status(500).json({ error: 'Unable to sign in. Please try again.' })
  }
})

// POST /api/auth/forgot-pin
router.post('/forgot-pin', async (req, res) => {
  const parsed = forgotPinSchema.safeParse(req.body)
  const phone = parsed.success ? normalizeKenyanPhone(parsed.data.phone) : null
  if (!phone) {
    res.status(400).json({ error: 'Enter a valid Kenyan mobile number.' })
    return
  }

  if (!isRecoverySmsConfigured()) {
    res.status(503).json({ error: 'PIN recovery is not configured yet. Please contact TENGABIZ support.' })
    return
  }

  try {
    const ipAllowed = await consumeRateLimit(`pin-reset:ip:${getClientAddress(req)}`, 10, 60 * 60)
    if (!ipAllowed) {
      res.status(429).json({ error: 'Too many recovery requests. Please try again later.' })
      return
    }
    const phoneAllowed = await consumeRateLimit(`pin-reset:phone:${phone}`, 3, 15 * 60)
    if (!phoneAllowed) {
      res.status(429).json({ error: 'Too many recovery requests. Please try again later.' })
      return
    }

    const phoneDigits = phone.slice(1)
    const localPhone = `0${phoneDigits.slice(3)}`
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id, phone FROM users
       WHERE regexp_replace(phone, '\\D', '', 'g') = ANY($1::text[])
       LIMIT 1`,
      [[phoneDigits, phoneDigits.slice(3), localPhone]]
    )

    if (rows.length > 0) {
      const user = rows[0]
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      const challengeId = randomUUID()
      await pool.query(
        `UPDATE pin_reset_challenges SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      )
      await pool.query(
        `INSERT INTO pin_reset_challenges (id, user_id, phone, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
        [challengeId, user.id, phone, hashRecoveryValue(`${challengeId}:${code}`)]
      )

      try {
        await sendRecoveryCode(phone, code)
      } catch (error) {
        await pool.query(
          'UPDATE pin_reset_challenges SET used_at = NOW() WHERE id = $1',
          [challengeId]
        )
        const message = error instanceof Error ? error.message : String(error)
        console.error('[auth/forgot-pin] SMS delivery failed:', message)
      }
    }

    res.json({ message: 'If an account matches that number, a recovery code will be sent.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auth/forgot-pin] Failed:', message)
    res.status(500).json({ error: 'Unable to process the recovery request. Please try again.' })
  }
})

// POST /api/auth/reset-pin
router.post('/reset-pin', async (req, res) => {
  const parsed = resetPinSchema.safeParse(req.body)
  const phone = parsed.success ? normalizeKenyanPhone(parsed.data.phone) : null
  if (!parsed.success || !phone) {
    res.status(400).json({ error: 'Enter a valid phone number, six-digit code, and four-digit PIN.' })
    return
  }

  try {
    const ipAllowed = await consumeRateLimit(`pin-reset-verify:ip:${getClientAddress(req)}`, 20, 60 * 60)
    if (!ipAllowed) {
      res.status(429).json({ error: 'Too many verification attempts. Please try again later.' })
      return
    }
    const phoneAllowed = await consumeRateLimit(`pin-reset-verify:phone:${phone}`, 10, 60 * 60)
    if (!phoneAllowed) {
      res.status(429).json({ error: 'Too many verification attempts. Please try again later.' })
      return
    }

    const phoneDigits = phone.slice(1)
    const localPhone = `0${phoneDigits.slice(3)}`
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: users } = await client.query<{ id: string }>(
        `SELECT id FROM users
         WHERE regexp_replace(phone, '\\D', '', 'g') = ANY($1::text[])
         LIMIT 1`,
        [[phoneDigits, phoneDigits.slice(3), localPhone]]
      )

      if (users.length === 0) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'The code is invalid or expired. Request a new code and try again.' })
        return
      }

      const userId = users[0].id
      const { rows: challenges } = await client.query<{
        id: string
        code_hash: string
        attempts: number
        expired: boolean
      }>(
        `SELECT id, code_hash, attempts, expires_at <= NOW() AS expired
         FROM pin_reset_challenges
         WHERE user_id = $1 AND phone = $2 AND used_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [userId, phone]
      )
      const challenge = challenges[0]

      if (!challenge || challenge.expired || challenge.attempts >= 5) {
        if (challenge) {
          await client.query('UPDATE pin_reset_challenges SET used_at = NOW() WHERE id = $1', [challenge.id])
        }
        await client.query('COMMIT')
        res.status(400).json({ error: 'The code is invalid or expired. Request a new code and try again.' })
        return
      }

      const submittedHash = hashRecoveryValue(`${challenge.id}:${parsed.data.code}`)
      const validCode = timingSafeEqual(Buffer.from(submittedHash, 'hex'), Buffer.from(challenge.code_hash, 'hex'))
      if (!validCode) {
        const attempts = challenge.attempts + 1
        await client.query(
          `UPDATE pin_reset_challenges SET attempts = $1, used_at = CASE WHEN $1 >= 5 THEN NOW() ELSE used_at END
           WHERE id = $2`,
          [attempts, challenge.id]
        )
        await client.query('COMMIT')
        res.status(400).json({ error: 'The code is invalid or expired. Request a new code and try again.' })
        return
      }

      const pinHash = await bcrypt.hash(parsed.data.pin, 10)
      await client.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pinHash, userId])
      await client.query('UPDATE users SET auth_version = auth_version + 1 WHERE id = $1', [userId])
      await client.query(
        'UPDATE pin_reset_challenges SET used_at = COALESCE(used_at, NOW()) WHERE user_id = $1',
        [userId]
      )
      await client.query('COMMIT')
      res.json({ message: 'Your PIN has been reset. You can now sign in.' })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auth/reset-pin] Failed:', message)
    res.status(500).json({ error: 'Unable to reset your PIN. Please try again.' })
  }
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
      const token = signToken(user.id, user.auth_version ?? 0)
      res.redirect(`/?token=${token}&businessName=${encodeURIComponent(user.business_name)}&ownerName=${encodeURIComponent(user.owner_name)}&isNew=${user.is_new ? '1' : '0'}`)
    })(req, res, next)
  }
)

export default router
