import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { randomUUID } from 'crypto'
import pool from '../db.js'

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: `${process.env.CALLBACK_BASE_URL}/api/auth/google/callback`,
}, async (_accessToken, _refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value
    const name = profile.displayName ?? 'Business Owner'

    if (!email) return done(new Error('No email from Google'))

    // Find existing user or create one
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])

    if (rows.length > 0) {
      return done(null, rows[0])
    }

    const id = randomUUID()
    const { rows: newRows } = await pool.query(
      `INSERT INTO users (id, email, password_hash, business_name, owner_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, email, 'google-oauth', name, name]
    )

    return done(null, newRows[0])
  } catch (err) {
    return done(err as Error)
  }
}))

export default passport
