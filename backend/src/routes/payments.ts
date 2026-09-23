import { Router } from 'express'
import {
  handleStkCallback,
  handleC2BValidation,
  handleC2BConfirmation,
} from '../daraja/callback.js'

const router = Router()

// Safaricom rejects callback URLs containing the word "mpesa"
// These are registered via POST /api/mpesa/register-c2b
router.post('/stk-callback', handleStkCallback)
router.post('/c2b-validation', handleC2BValidation)
router.post('/c2b-confirmation', handleC2BConfirmation)

export default router
