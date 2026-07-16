// ============================================
// Events Route — UI-only analytics events
// Server-side writes remain the source of truth
// for funnel metrics; this endpoint accepts a
// whitelisted set of client-side events.
// ============================================

import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, analyticsEventSchema } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logEvent } from '../services/nisse/analytics.js';
import { findMemberHousehold } from '../services/nisse/householdAccess.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  validate(analyticsEventSchema),
  asyncHandler(async (req, res) => {
    const household = await findMemberHousehold(prisma, req.user.id);

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household?.id,
      name: req.validated.name,
      payload: req.validated.payload,
    });

    res.json({ ok: true });
  })
);

export default router;
