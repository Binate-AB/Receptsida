// ============================================
// Household Routes — Nisse household profile
// The household is the central entity for the
// dinner engine: members, allergies, equipment,
// and a simple manual inventory.
// ============================================

import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  validate,
  upsertHouseholdSchema,
  householdMemberSchema,
  updateHouseholdMemberSchema,
  inventoryBulkSchema,
} from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { getOwnedHousehold } from '../services/nisse/householdAccess.js';
import { canonicalIngredient } from '../services/nisse/engine/normalize.js';
import { ALLERGEN_TAXONOMY, DIETARY_RESTRICTIONS, EQUIPMENT } from '../services/nisse/engine/allergens.js';

const router = Router();

// Default portion factors per age category (adjustable per member)
const DEFAULT_PORTION_FACTOR = {
  BABY: 0.3,
  CHILD: 0.6,
  TEEN: 1.3,
  ADULT: 1.0,
  SENIOR: 0.9,
};

// ──────────────────────────────────────────
// GET /households/meta — taxonomies for UI pickers
// ──────────────────────────────────────────
router.get(
  '/meta',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({
      allergens: ALLERGEN_TAXONOMY,
      dietaryRestrictions: DIETARY_RESTRICTIONS,
      equipment: EQUIPMENT,
    });
  })
);

// ──────────────────────────────────────────
// POST /households — create or update (upsert for owner)
// ──────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  validate(upsertHouseholdSchema),
  asyncHandler(async (req, res) => {
    const { name, cookingSkill, equipment } = req.validated;

    const household = await prisma.household.upsert({
      where: { ownerId: req.user.id },
      create: {
        ownerId: req.user.id,
        ...(name && { name }),
        ...(cookingSkill && { cookingSkill }),
        ...(equipment && { equipment }),
      },
      update: {
        ...(name && { name }),
        ...(cookingSkill && { cookingSkill }),
        ...(equipment && { equipment }),
      },
      include: { members: { orderBy: { sortOrder: 'asc' } } },
    });

    res.status(201).json({ household });
  })
);

// ──────────────────────────────────────────
// GET /households/current — the caller's household
// ──────────────────────────────────────────
router.get(
  '/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);
    res.json({ household });
  })
);

// ──────────────────────────────────────────
// PATCH /households/current
// ──────────────────────────────────────────
router.patch(
  '/current',
  requireAuth,
  validate(upsertHouseholdSchema),
  asyncHandler(async (req, res) => {
    const existing = await getOwnedHousehold(prisma, req.user.id);
    const household = await prisma.household.update({
      where: { id: existing.id },
      data: req.validated,
      include: { members: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ household });
  })
);

// ──────────────────────────────────────────
// POST /households/current/members
// ──────────────────────────────────────────
router.post(
  '/current/members',
  requireAuth,
  validate(householdMemberSchema),
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);
    const data = req.validated;

    const member = await prisma.householdMember.create({
      data: {
        householdId: household.id,
        ...data,
        dislikedIngredients: data.dislikedIngredients.map((n) => canonicalIngredient(n)),
        portionFactor: data.portionFactor ?? DEFAULT_PORTION_FACTOR[data.ageCategory] ?? 1.0,
        sortOrder: household.members.length,
      },
    });

    res.status(201).json({ member });
  })
);

// ──────────────────────────────────────────
// PATCH /households/current/members/:id
// ──────────────────────────────────────────
router.patch(
  '/current/members/:id',
  requireAuth,
  validate(updateHouseholdMemberSchema),
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);
    const existing = household.members.find((m) => m.id === req.params.id);
    if (!existing) {
      throw new AppError(404, 'member_not_found', 'Hushållsmedlemmen hittades inte.');
    }

    const data = { ...req.validated };
    if (data.dislikedIngredients) {
      data.dislikedIngredients = data.dislikedIngredients.map((n) => canonicalIngredient(n));
    }

    const member = await prisma.householdMember.update({
      where: { id: existing.id },
      data,
    });

    res.json({ member });
  })
);

// ──────────────────────────────────────────
// DELETE /households/current/members/:id
// ──────────────────────────────────────────
router.delete(
  '/current/members/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);
    const existing = household.members.find((m) => m.id === req.params.id);
    if (!existing) {
      throw new AppError(404, 'member_not_found', 'Hushållsmedlemmen hittades inte.');
    }

    await prisma.householdMember.delete({ where: { id: existing.id } });
    res.json({ deleted: true });
  })
);

// ──────────────────────────────────────────
// GET /households/current/inventory
// ──────────────────────────────────────────
router.get(
  '/current/inventory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);
    const items = await prisma.inventoryItem.findMany({
      where: { householdId: household.id },
      orderBy: { name: 'asc' },
    });
    res.json({ items });
  })
);

// ──────────────────────────────────────────
// PUT /households/current/inventory — bulk replace
// Manual entries get confidence 1.0; the schema reserves
// lower confidence for fas 2 photo scanning.
// ──────────────────────────────────────────
router.put(
  '/current/inventory',
  requireAuth,
  validate(inventoryBulkSchema),
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);

    // Deduplicate on canonical name (last entry wins)
    const byCanonical = new Map();
    for (const item of req.validated.items) {
      const canonical = canonicalIngredient(item.name);
      if (!canonical) continue;
      byCanonical.set(canonical, {
        householdId: household.id,
        name: item.name.trim(),
        canonical,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        confidence: 1.0,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
      });
    }

    await prisma.$transaction([
      prisma.inventoryItem.deleteMany({ where: { householdId: household.id } }),
      prisma.inventoryItem.createMany({ data: [...byCanonical.values()] }),
    ]);

    const items = await prisma.inventoryItem.findMany({
      where: { householdId: household.id },
      orderBy: { name: 'asc' },
    });

    res.json({ items });
  })
);

export default router;
