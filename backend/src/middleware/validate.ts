import type { Request, Response, NextFunction } from 'express'
import { z, ZodSchema } from 'zod'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const details = result.error.flatten()
      console.error('[validate] Failed:', JSON.stringify(details))
      res.status(400).json({ error: 'Validation failed', details })
      return
    }
    req.body = result.data
    next()
  }
}

// ── Shared schemas ────────────────────────────────────────────────────────────

export const stkPushSchema = z.object({
  phone: z
    .string()
    .regex(/^(07|01|2547|2541)\d{8}$/, 'Invalid Kenyan phone number'),
  amount: z.number().int().min(1).max(150000),
  accountRef: z.string().min(1).max(20),
  description: z.string().min(1).max(13),
})

export const stkQuerySchema = z.object({
  checkoutRequestId: z.string().min(1),
})

export const transactionStatusSchema = z.object({
  transactionId: z.string().min(1),
})
