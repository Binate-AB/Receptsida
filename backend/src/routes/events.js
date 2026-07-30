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
    const { name, payload, clientEventId } = req.validated;

    // §26: offline-queue dedup — the same clientEventId is written at
    // most once per user, so a flush racing a retry can't double-count.
    if (clientEventId) {
      const existing = await prisma.analyticsEvent.findFirst({
        where: {
          userId: req.user.id,
          name,
          payload: { path: ['clientEventId'], equals: clientEventId },
        },
        select: { id: true },
      });
      if (existing) {
        res.json({ ok: true, deduped: true });
        return;
      }
    }

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household?.id,
      name,
      payload: clientEventId ? { ...(payload || {}), clientEventId } : payload,
    });

    res.json({ ok: true });
  })
);

export default router;
