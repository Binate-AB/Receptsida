// ============================================
// Dinner Routes — "Lös middagen"
// The Nisse decision engine endpoint: parses tonight's
// situation, gates + ranks recipe templates and returns
// max 3 recommendations with one clearly recommended.
//
// Step 4 ships the deterministic (chips) path; the AI
// free-text parse + motivations are layered on via
// services/nisse/ai/ without changing this contract.
// ============================================

import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { dinnerSolveRateLimit } from '../middleware/rateLimit.js';
import { validate, solveDinnerSchema, alternativeSchema } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { getOwnedHousehold } from '../services/nisse/householdAccess.js';
import { rankCandidates } from '../services/nisse/engine/ranker.js';
import { deterministicParse } from '../services/nisse/engine/chipsParse.js';
import {
  resolveEaters,
  buildComputedPayload,
  buildFeedbackScores,
} from '../services/nisse/recommendationService.js';
import { parseMealSituation, writeMotivations } from '../services/nisse/ai/nisseAi.js';
import { logEvent } from '../services/nisse/analytics.js';

const router = Router();

/**
 * Load everything the ranker needs for a household.
 */
async function loadRankingContext(householdId) {
  const [inventory, templates, feedbackRows, recentAccepted] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { householdId } }),
    prisma.recipeTemplate.findMany({ where: { isActive: true } }),
    prisma.mealFeedback.findMany({ where: { householdId } }),
    prisma.mealRecommendation.findMany({
      where: {
        status: 'ACCEPTED',
        request: { householdId },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { templateId: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    inventory,
    templates,
    feedbackScores: buildFeedbackScores(feedbackRows),
    recentTemplateIds: recentAccepted.map((r) => r.templateId),
  };
}

/**
 * Slim template projection for API responses.
 */
function templateSummary(tpl) {
  return {
    id: tpl.id,
    slug: tpl.slug,
    title: tpl.title,
    description: tpl.description,
    tags: tpl.tags,
    difficulty: tpl.difficulty,
    totalTimeMin: tpl.totalTimeMin,
    activeTimeMin: tpl.activeTimeMin,
    childFriendly: tpl.childFriendly,
    hasChildAdultBranch: tpl.hasChildAdultBranch,
    variants: tpl.variants,
  };
}

/**
 * Rank + persist recommendations for a request. Shared by solve
 * and alternative endpoints.
 */
async function createRecommendations(requestRow, household, parsed, options = {}) {
  const ctx = await loadRankingContext(household.id);
  const eaters = resolveEaters(household.members, parsed);

  const { slots, rejected } = rankCandidates(ctx.templates, {
    parsed,
    eaters,
    inventory: ctx.inventory,
    equipment: household.equipment || [],
    feedbackScores: ctx.feedbackScores,
    recentTemplateIds: ctx.recentTemplateIds,
    excludeTemplateIds: options.excludeTemplateIds || [],
    ...options.rankOverrides,
  });

  const limited = options.limitSlots ? slots.slice(0, options.limitSlots) : slots;

  const created = [];
  for (const slotResult of limited) {
    const computed = buildComputedPayload(slotResult, { eaters, inventory: ctx.inventory });
    const rec = await prisma.mealRecommendation.create({
      data: {
        requestId: requestRow.id,
        templateId: slotResult.template.id,
        slot: slotResult.slot,
        computed,
      },
    });
    created.push({ rec, template: slotResult.template, computed });
  }

  return { created, rejected, eaters };
}

/**
 * Try to add AI motivations to freshly created recommendations.
 * Fail-open: cards work without motivations.
 */
async function attachMotivations(created, parsed, household) {
  try {
    const motivations = await writeMotivations(
      created.map(({ rec, template, computed }) => ({
        slot: rec.slot,
        title: template.title,
        description: template.description,
        totalTimeMin: computed.totalTimeMin,
        cost: computed.cost.totalLabel,
        reasons: computed.reasons,
        branchPossible: computed.branchPossible,
      })),
      parsed,
      { memberCount: household.members.length }
    );
    if (!motivations) return;

    for (const { rec } of created) {
      const motivation = motivations[rec.slot];
      if (motivation) {
        rec.motivation = motivation;
        await prisma.mealRecommendation.update({
          where: { id: rec.id },
          data: { motivation },
        });
      }
    }
  } catch (err) {
    console.error('Motivations failed (fail-open):', err.message);
  }
}

function recommendationResponse({ rec, template, computed }) {
  return {
    id: rec.id,
    slot: rec.slot,
    recommended: rec.slot === 'NISSE',
    motivation: rec.motivation || null,
    status: rec.status,
    template: templateSummary(template),
    computed,
  };
}

// ──────────────────────────────────────────
// POST /dinner/solve — Lös middagen
// ──────────────────────────────────────────
router.post(
  '/solve',
  requireAuth,
  dinnerSolveRateLimit,
  validate(solveDinnerSchema),
  asyncHandler(async (req, res) => {
    const { rawText, chips } = req.validated;
    const household = await getOwnedHousehold(prisma, req.user.id);

    if (household.members.length === 0) {
      throw new AppError(400, 'no_members', 'Lägg till minst en hushållsmedlem först.');
    }

    // Parse the situation: AI for free text (validated + fallback),
    // pure deterministic parse for chips-only input.
    const parseResult = await parseMealSituation(rawText, chips, {
      members: household.members.map((m) => ({
        id: m.id,
        name: m.name,
        ageCategory: m.ageCategory,
      })),
    });

    const requestRow = await prisma.mealRequest.create({
      data: {
        householdId: household.id,
        rawText: rawText || null,
        chips: chips || undefined,
        parsed: parseResult.parsed,
        parseSource: parseResult.source,
        aiConfidence: parseResult.confidence ?? null,
      },
    });

    const { created, rejected } = await createRecommendations(
      requestRow,
      household,
      parseResult.parsed
    );

    await attachMotivations(created, parseResult.parsed, household);

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'dinner_solved',
      payload: {
        requestId: requestRow.id,
        parseSource: parseResult.source,
        slotCount: created.length,
        rejectedCount: rejected.length,
      },
    });

    res.status(201).json({
      request: {
        id: requestRow.id,
        parsed: parseResult.parsed,
        parseSource: parseResult.source,
      },
      recommendations: created.map(recommendationResponse),
      degraded:
        created.length < 3
          ? 'Med hushållets krav finns just nu färre än tre säkra förslag.'
          : null,
    });
  })
);

// ──────────────────────────────────────────
// POST /dinner/requests/:id/alternative
// "Enklare / Billigare / Barnvänligare"
// The replacement is chosen DETERMINISTICALLY by
// re-ranking with adjusted weights — AI only ever
// writes the copy, never picks the meal.
// ──────────────────────────────────────────
router.post(
  '/requests/:id/alternative',
  requireAuth,
  validate(alternativeSchema),
  asyncHandler(async (req, res) => {
    const { direction, excludeTemplateIds } = req.validated;
    const household = await getOwnedHousehold(prisma, req.user.id);

    const requestRow = await prisma.mealRequest.findFirst({
      where: { id: req.params.id, householdId: household.id },
      include: { recommendations: true },
    });
    if (!requestRow) {
      throw new AppError(404, 'request_not_found', 'Middagsförfrågan hittades inte.');
    }

    // Adjust the parsed request per direction and exclude already-shown templates
    const parsed = { ...requestRow.parsed };
    if (direction === 'enklare') parsed.energy = 'slut';
    if (direction === 'billigare') parsed.budget = 'snålt';

    const alreadyShown = requestRow.recommendations.map((r) => r.templateId);
    const exclude = [...new Set([...alreadyShown, ...excludeTemplateIds])];

    const rankOverrides = {};
    if (direction === 'barnvänligare') {
      // Treat everyone as if a child is eating — the ranker's childFriendly
      // weighting reacts to eaters; simplest deterministic lever is filtering
      // low child-friendliness templates out via excludeTemplateIds below.
    }

    const ctx = await loadRankingContext(household.id);
    let templates = ctx.templates;
    if (direction === 'barnvänligare') {
      templates = templates.filter((t) => t.childFriendly >= 2);
    }

    const eaters = resolveEaters(household.members, parsed);
    const { slots } = rankCandidates(templates, {
      parsed,
      eaters,
      inventory: ctx.inventory,
      equipment: household.equipment || [],
      feedbackScores: ctx.feedbackScores,
      recentTemplateIds: ctx.recentTemplateIds,
      excludeTemplateIds: exclude,
      ...rankOverrides,
    });

    if (slots.length === 0) {
      throw new AppError(404, 'no_alternative', 'Det finns inget fler säkert alternativ som matchar. Justera kraven och försök igen.');
    }

    // Pick by direction: enklare → lowest effort, billigare → cheapest, barnvänligare → most child friendly
    let pick = slots[0];
    if (direction === 'enklare') {
      pick = [...slots].sort((a, b) => a.template.effortScore - b.template.effortScore)[0];
    } else if (direction === 'billigare') {
      pick = [...slots].sort((a, b) => a.template.costPerPortionMin - b.template.costPerPortionMin)[0];
    } else if (direction === 'barnvänligare') {
      pick = [...slots].sort((a, b) => b.template.childFriendly - a.template.childFriendly)[0];
    }

    const computed = buildComputedPayload(pick, { eaters, inventory: ctx.inventory });
    const rec = await prisma.mealRecommendation.create({
      data: {
        requestId: requestRow.id,
        templateId: pick.template.id,
        slot: pick.slot,
        computed,
      },
    });

    const created = [{ rec, template: pick.template, computed }];
    await attachMotivations(created, parsed, household);

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'alternative_requested',
      payload: { requestId: requestRow.id, direction, templateId: pick.template.id },
    });

    res.status(201).json({ recommendation: recommendationResponse(created[0]) });
  })
);

// ──────────────────────────────────────────
// POST /dinner/recommendations/:id/accept
// Accept → auto-create shopping list from the
// frozen computed snapshot.
// ──────────────────────────────────────────
router.post(
  '/recommendations/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);

    const rec = await prisma.mealRecommendation.findFirst({
      where: { id: req.params.id, request: { householdId: household.id } },
      include: { template: true },
    });
    if (!rec) {
      throw new AppError(404, 'recommendation_not_found', 'Rekommendationen hittades inte.');
    }

    const updated = await prisma.mealRecommendation.update({
      where: { id: rec.id },
      data: { status: 'ACCEPTED' },
    });

    // Create shopping list from the computed snapshot (skip when nothing to buy)
    const items = rec.computed?.shoppingItems || [];
    let shoppingList = null;
    if (items.length > 0) {
      shoppingList = await prisma.shoppingList.create({
        data: {
          householdId: household.id,
          recommendationId: rec.id,
          title: `Inköp: ${rec.template.title}`,
          // Cost of the necessary items to buy; max adds optional items
          estCostMin: rec.computed?.shoppingCostSek || null,
          estCostMax:
            (rec.computed?.shoppingCostSek || 0) +
              items
                .filter((i) => !i.necessary && !i.probablyHome)
                .reduce((acc, i) => acc + (Number(i.estPrice) || 0), 0) || null,
          items: {
            create: items.map((item) => ({
              name: item.name,
              canonical: item.canonical,
              quantity: item.quantity,
              unit: item.unit,
              aisle: item.aisle,
              necessary: item.necessary,
              probablyHome: item.probablyHome,
              estPrice: item.estPrice,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });

      await logEvent(prisma, {
        userId: req.user.id,
        householdId: household.id,
        name: 'shopping_list_created',
        payload: { listId: shoppingList.id, recommendationId: rec.id, itemCount: items.length },
      });
    }

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'recommendation_accepted',
      payload: { recommendationId: rec.id, templateId: rec.templateId, slot: rec.slot },
    });

    res.json({
      recommendation: { id: updated.id, status: updated.status, slot: updated.slot },
      shoppingList,
    });
  })
);

export default router;
