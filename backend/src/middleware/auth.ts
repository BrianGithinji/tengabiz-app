import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

export interface AuthRequest extends Request {
  userId?: string
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; authVersion?: number }
    const { rows } = await pool.query<{ auth_version: number }>(
      'SELECT auth_version FROM users WHERE id = $1',
      [payload.userId]
    )
    if (rows.length === 0 || Number(rows[0].auth_version) !== (payload.authVersion ?? 0)) {
      res.status(401).json({ error: 'Session expired. Please sign in again.' })
      return
    }
    req.userId = payload.userId
    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    next(error)
  }
}
