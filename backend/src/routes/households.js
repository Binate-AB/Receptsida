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
  joinHouseholdSchema,
} from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import crypto from 'crypto';
import {
  getOwnedHousehold,
  getMemberHousehold,
  findMemberHousehold,
} from '../services/nisse/householdAccess.js';
import { canonicalIngredient } from '../services/nisse/engine/normalize.js';
import { ALLERGEN_TAXONOMY, DIETARY_RESTRICTIONS, EQUIPMENT } from '../services/nisse/engine/allergens.js';
import { logEvent } from '../services/nisse/analytics.js';

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
    // Curated quick-pick for taste anchoring at onboarding:
    // "Vilka av dessa brukar fungera hemma hos er?"
    const dishChoices = await prisma.recipeTemplate.findMany({
      where: { isActive: true },
      select: { slug: true, title: true, tags: true, childFriendly: true },
      orderBy: { childFriendly: 'desc' },
      take: 24,
    });

    res.json({
      allergens: ALLERGEN_TAXONOMY,
      dietaryRestrictions: DIETARY_RESTRICTIONS,
      equipment: EQUIPMENT,
      dishChoices,
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
    const { name, cookingSkill, equipment, dishPreferences, onboardingCompleted, onboardingDurationMs } =
      req.validated;

    // A joined adult updates the SHARED household — never a second one.
    const existing = await findMemberHousehold(prisma, req.user.id);
    const data = {
      ...(name && { name }),
      ...(cookingSkill && { cookingSkill }),
      ...(equipment && { equipment }),
    };

    let household;
    if (existing) {
      household = await prisma.household.update({
        where: { id: existing.id },
        data,
        include: { members: { orderBy: { sortOrder: 'asc' } } },
      });
    } else {
      household = await prisma.household.create({
        data: {
          ownerId: req.user.id,
          ...data,
          memberships: { create: { userId: req.user.id, role: 'OWNER' } },
        },
        include: { members: { orderBy: { sortOrder: 'asc' } } },
      });
    }

    // Smakförankring: replace the ONBOARDING-sourced set with the given slugs
    // (LEARNED preferences are never touched here).
    if (dishPreferences) {
      const templates = await prisma.recipeTemplate.findMany({
        where: { slug: { in: dishPreferences }, isActive: true },
        select: { id: true },
      });
      await prisma.dishPreference.deleteMany({
        where: { householdId: household.id, source: 'ONBOARDING' },
      });
      if (templates.length > 0) {
        await prisma.dishPreference.createMany({
          data: templates.map((t) => ({
            householdId: household.id,
            templateId: t.id,
            source: 'ONBOARDING',
          })),
          skipDuplicates: true,
        });
      }
    }

    // onboarding_completed — once per household (first wizard completion)
    if (onboardingCompleted) {
      const already = await prisma.analyticsEvent.findFirst({
        where: { householdId: household.id, name: 'onboarding_completed' },
        select: { id: true },
      });
      if (!already) {
        await logEvent(prisma, {
          userId: req.user.id,
          householdId: household.id,
          name: 'onboarding_completed',
          payload: {
            householdId: household.id,
            members: household.members.length,
            children: household.members.filter((m) => m.ageCategory === 'BABY' || m.ageCategory === 'CHILD').length,
            allergies_count: household.members.reduce((acc, m) => acc + (m.allergies?.length || 0), 0),
            dish_prefs_count: dishPreferences?.length || 0,
            duration_ms: onboardingDurationMs ?? null,
          },
        });
      }
    }

    res.status(201).json({ household });
  })
);

// ──────────────────────────────────────────
// POST /households/join — join with invite code
// Several adults share one household (profile,
// allergies, preferences, outcomes, learning).
// ──────────────────────────────────────────
router.post(
  '/join',
  requireAuth,
  validate(joinHouseholdSchema),
  asyncHandler(async (req, res) => {
    const code = req.validated.inviteCode.trim().toUpperCase();

    const target = await prisma.household.findUnique({
      where: { inviteCode: code },
      include: { members: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!target) {
      throw new AppError(404, 'invalid_invite', 'Ogiltig inbjudningskod. Kontrollera koden och försök igen.');
    }

    const existing = await findMemberHousehold(prisma, req.user.id);
    if (existing && existing.id === target.id) {
      return res.json({ household: target, joined: false }); // idempotent
    }
    if (existing) {
      throw new AppError(
        409,
        'already_in_household',
        'Du tillhör redan ett hushåll. Lämna det först för att gå med i ett annat.'
      );
    }

    await prisma.householdMembership.create({
      data: { userId: req.user.id, householdId: target.id, role: 'ADULT' },
    });

    res.status(201).json({ household: target, joined: true });
  })
);

// ──────────────────────────────────────────
// GET /households/current/invite — invite code
// (generated lazily; any member may share it)
// ──────────────────────────────────────────
router.get(
  '/current/invite',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getMemberHousehold(prisma, req.user.id);

    let code = household.inviteCode;
    if (!code) {
      // Short, readable, no ambiguous chars
      code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
      await prisma.household.update({
        where: { id: household.id },
        data: { inviteCode: code },
      });
    }

    res.json({ inviteCode: code });
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
    // Only actual Household columns — the schema also allows onboarding
    // metadata and dishPreferences, which are handled by POST /households.
    const { name, cookingSkill, equipment } = req.validated;
    const household = await prisma.household.update({
      where: { id: existing.id },
      data: {
        ...(name && { name }),
        ...(cookingSkill && { cookingSkill }),
        ...(equipment && { equipment }),
      },
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
