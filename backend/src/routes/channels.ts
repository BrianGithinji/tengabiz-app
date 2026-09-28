import { Router } from 'express'
import { randomUUID } from 'crypto'
import pool from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { z } from 'zod'

const router = Router()

const channelSchema = z.object({
  type: z.enum(['till', 'paybill', 'pochi']),
  identifier: z.string().min(1), // Till number, Paybill shortcode, or phone number
  label: z.string().optional(),  // e.g. "Main Shop Till"
})

// GET /api/channels — list all channels for logged-in user
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at ASC',
    [req.userId]
  )
  res.json(rows)
})

// POST /api/channels — add a new channel
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const result = channelSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() })
    return
  }

  const { type, identifier, label } = result.data

  // Check if this channel is already registered to another user
  const existing = await pool.query(
    'SELECT user_id FROM channels WHERE type = $1 AND identifier = $2',
    [type, identifier]
  )
  if (existing.rows.length > 0 && existing.rows[0].user_id !== req.userId) {
    res.status(409).json({ error: 'This channel is already registered to another account' })
    return
  }

  const id = randomUUID()
  const { rows } = await pool.query(
    `INSERT INTO channels (id, user_id, type, identifier, label)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (type, identifier) DO UPDATE SET label = $5, active = TRUE
     RETURNING *`,
    [id, req.userId, type, identifier, label ?? null]
  )

  res.status(201).json(rows[0])
})

// DELETE /api/channels/:id — remove a channel
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  await pool.query(
    'DELETE FROM channels WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  )
  res.json({ success: true })
})

export default router
