// ============================================
// Shopping List Routes — Nisse persistent lists
// Lists are created by accepting a recommendation
// (routes/dinner.js); these endpoints read and
// update them.
// ============================================

import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, updateListItemSchema, updateListStatusSchema } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { getOwnedHousehold } from '../services/nisse/householdAccess.js';

const router = Router();

async function getOwnedList(userId, listId) {
  const household = await getOwnedHousehold(prisma, userId);
  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, householdId: household.id },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      recommendation: { include: { template: { select: { slug: true, title: true } } } },
    },
  });
  if (!list) {
    throw new AppError(404, 'list_not_found', 'Inköpslistan hittades inte.');
  }
  return list;
}

// ──────────────────────────────────────────
// GET /shopping-lists?status=ACTIVE
// ──────────────────────────────────────────
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);
    const status = req.query.status === 'DONE' ? 'DONE' : req.query.status === 'ACTIVE' ? 'ACTIVE' : undefined;

    const lists = await prisma.shoppingList.findMany({
      where: { householdId: household.id, ...(status && { status }) },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        recommendation: { include: { template: { select: { slug: true, title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ lists });
  })
);

// ──────────────────────────────────────────
// GET /shopping-lists/:id
// ──────────────────────────────────────────
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await getOwnedList(req.user.id, req.params.id);
    res.json({ list });
  })
);

// ──────────────────────────────────────────
// PATCH /shopping-lists/:id — status
// ──────────────────────────────────────────
router.patch(
  '/:id',
  requireAuth,
  validate(updateListStatusSchema),
  asyncHandler(async (req, res) => {
    const list = await getOwnedList(req.user.id, req.params.id);
    const updated = await prisma.shoppingList.update({
      where: { id: list.id },
      data: { status: req.validated.status },
    });
    res.json({ list: updated });
  })
);

// ──────────────────────────────────────────
// PATCH /shopping-lists/:id/items/:itemId — check off
// ──────────────────────────────────────────
router.patch(
  '/:id/items/:itemId',
  requireAuth,
  validate(updateListItemSchema),
  asyncHandler(async (req, res) => {
    const list = await getOwnedList(req.user.id, req.params.id);
    const item = list.items.find((i) => i.id === req.params.itemId);
    if (!item) {
      throw new AppError(404, 'item_not_found', 'Varan hittades inte på listan.');
    }

    const updated = await prisma.shoppingListItem.update({
      where: { id: item.id },
      data: req.validated,
    });

    res.json({ item: updated });
  })
);

export default router;
