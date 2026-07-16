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
import {
  validate,
  solveDinnerSchema,
  alternativeSchema,
  assumptionCorrectionSchema,
} from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { getOwnedHousehold } from '../services/nisse/householdAccess.js';
import { rankCandidates } from '../services/nisse/engine/ranker.js';
import { deterministicParse } from '../services/nisse/engine/chipsParse.js';
import {
  resolveEaters,
  buildComputedPayload,
  buildFeedbackScores,
} from '../services/nisse/recommendationService.js';
import {
  buildAssumptions,
  applyAssumptionCorrection,
} from '../services/nisse/assumptionService.js';
import { parseMealSituation, writeMotivations } from '../services/nisse/ai/nisseAi.js';
import { logEvent } from '../services/nisse/analytics.js';

const router = Router();

/**
 * Load everything the ranker needs for a household.
 */
async function loadRankingContext(householdId) {
  const [inventory, templates, feedbackRows, recentAccepted, confidenceRows, preferenceRows] = await Promise.all([
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
    prisma.householdIngredientConfidence.findMany({ where: { householdId } }),
    prisma.dishPreference.findMany({ where: { householdId } }),
  ]);

  return {
    inventory,
    templates,
    feedbackScores: buildFeedbackScores(feedbackRows),
    recentTemplateIds: recentAccepted.map((r) => r.templateId),
    confidenceRows,
    dishPreferences: new Map(preferenceRows.map((p) => [p.templateId, p.source])),
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
    confidenceRows: ctx.confidenceRows,
    dishPreferences: ctx.dishPreferences,
    ...options.rankOverrides,
  });

  const limited = options.limitSlots ? slots.slice(0, options.limitSlots) : slots;

  const created = [];
  for (const slotResult of limited) {
    const computed = buildComputedPayload(slotResult, {
      eaters,
      inventory: ctx.inventory,
      portionsOverride: parsed.portionsOverride ?? null,
    });
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

  return { created, rejected, eaters, ctx };
}

/**
 * Build + persist the decision's assumptions (replacing any existing
 * rows for the request — corrections re-solve and re-assume).
 */
async function persistAssumptions(requestRow, household, parsed, created, ctx, meta = {}) {
  const eaters = resolveEaters(household.members, parsed);
  const topTemplate = created.find((c) => c.rec.slot === 'NISSE')?.template || created[0]?.template || null;

  const assumptions = buildAssumptions({
    parsed,
    parseSource: meta.parseSource || requestRow.parseSource,
    aiConfidence: meta.aiConfidence ?? requestRow.aiConfidence,
    chips: requestRow.chips || null,
    eaters,
    topTemplate,
    inventory: ctx.inventory,
    confidenceRows: ctx.confidenceRows,
  });

  // Preserve correction history: only upsert values, never wipe correctedAt
  for (const a of assumptions) {
    await prisma.dinnerAssumption.upsert({
      where: { requestId_key: { requestId: requestRow.id, key: a.key } },
      create: { requestId: requestRow.id, ...a },
      update: { value: a.value, confidence: a.confidence, level: a.level },
    });
  }

  return prisma.dinnerAssumption.findMany({
    where: { requestId: requestRow.id },
    orderBy: { createdAt: 'asc' },
  });
}

function assumptionResponse(rows) {
  return rows.map((a) => ({
    key: a.key,
    level: a.level,
    value: a.correctedValue ?? a.value,
    confidence: a.confidence,
    corrected: a.correctedAt != null,
  }));
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

    const { created, rejected, ctx } = await createRecommendations(
      requestRow,
      household,
      parseResult.parsed
    );

    const assumptionRows = await persistAssumptions(
      requestRow,
      household,
      parseResult.parsed,
      created,
      ctx,
      { parseSource: parseResult.source, aiConfidence: parseResult.confidence }
    );

    await attachMotivations(created, parseResult.parsed, household);

    // Mean pantry uncertainty over the shown slots (decision-level signal)
    const uncertainties = created
      .map((c) => c.computed.uncertainty)
      .filter((u) => Number.isFinite(u));
    const uncertainty = uncertainties.length
      ? Math.round((uncertainties.reduce((a, b) => a + b, 0) / uncertainties.length) * 100) / 100
      : null;

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'dinner_solved',
      payload: {
        requestId: requestRow.id,
        parseSource: parseResult.source,
        slotCount: created.length,
        rejectedCount: rejected.length,
        uncertainty,
      },
    });

    res.status(201).json({
      request: {
        id: requestRow.id,
        parsed: parseResult.parsed,
        parseSource: parseResult.source,
      },
      recommendations: created.map(recommendationResponse),
      assumptions: assumptionResponse(assumptionRows),
      degraded:
        created.length < 3
          ? 'Med hushållets krav finns just nu färre än tre säkra förslag.'
          : null,
    });
  })
);

// ──────────────────────────────────────────
// PATCH /dinner/requests/:id/assumptions
// One-tap assumption correction → deterministic
// re-rank (no new AI call). The correction itself
// is a learning signal.
// ──────────────────────────────────────────
router.patch(
  '/requests/:id/assumptions',
  requireAuth,
  validate(assumptionCorrectionSchema),
  asyncHandler(async (req, res) => {
    const { key, value } = req.validated;
    const household = await getOwnedHousehold(prisma, req.user.id);

    const requestRow = await prisma.mealRequest.findFirst({
      where: { id: req.params.id, householdId: household.id },
      include: { recommendations: true },
    });
    if (!requestRow) {
      throw new AppError(404, 'request_not_found', 'Middagsförfrågan hittades inte.');
    }

    let correction;
    try {
      correction = applyAssumptionCorrection(requestRow.parsed, key, value);
    } catch (err) {
      throw new AppError(400, 'invalid_correction', err.message);
    }

    // Pantry corrections persist to the household model (that IS the learning)
    if (correction.isPantry) {
      const confidence = correction.normalized ? 0.95 : 0.05;
      await prisma.householdIngredientConfidence.upsert({
        where: {
          householdId_canonical: { householdId: household.id, canonical: correction.canonical },
        },
        create: { householdId: household.id, canonical: correction.canonical, confidence },
        update: { confidence },
      });
      if (correction.normalized === false) {
        await prisma.inventoryItem.deleteMany({
          where: { householdId: household.id, canonical: correction.canonical },
        });
      }
    }

    // Record the correction on the assumption row
    await prisma.dinnerAssumption.upsert({
      where: { requestId_key: { requestId: requestRow.id, key } },
      create: {
        requestId: requestRow.id,
        key,
        level: 2,
        value: correction.normalized,
        confidence: 0.95,
        correctedValue: correction.normalized,
        correctedAt: new Date(),
      },
      update: { correctedValue: correction.normalized, correctedAt: new Date(), confidence: 0.95 },
    });

    // Persist the corrected parsed request, retire current proposals, re-rank
    await prisma.mealRequest.update({
      where: { id: requestRow.id },
      data: { parsed: correction.parsed },
    });
    await prisma.mealRecommendation.updateMany({
      where: { requestId: requestRow.id, status: 'PROPOSED' },
      data: { status: 'REJECTED' },
    });

    const updatedRequest = { ...requestRow, parsed: correction.parsed };
    const { created, ctx } = await createRecommendations(
      updatedRequest,
      household,
      correction.parsed
    );
    const assumptionRows = await persistAssumptions(
      updatedRequest,
      household,
      correction.parsed,
      created,
      ctx
    );
    await attachMotivations(created, correction.parsed, household);

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'assumption_corrected',
      payload: {
        requestId: requestRow.id,
        key,
        level: 2,
        to: typeof correction.normalized === 'object' ? null : correction.normalized,
      },
    });

    res.json({
      request: { id: requestRow.id, parsed: correction.parsed },
      recommendations: created.map(recommendationResponse),
      assumptions: assumptionResponse(assumptionRows),
      degraded:
        created.length < 3
          ? 'Med hushållets krav finns just nu färre än tre säkra förslag.'
          : null,
    });
  })
);

// ──────────────────────────────────────────
// POST /dinner/requests/:id/regenerate
// "Inget av dessa" → three NEW options, excluding
// everything already shown. Logged as a learning
// signal (rejection).
// ──────────────────────────────────────────
router.post(
  '/requests/:id/regenerate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const household = await getOwnedHousehold(prisma, req.user.id);

    const requestRow = await prisma.mealRequest.findFirst({
      where: { id: req.params.id, householdId: household.id },
      include: { recommendations: true },
    });
    if (!requestRow) {
      throw new AppError(404, 'request_not_found', 'Middagsförfrågan hittades inte.');
    }

    const rejectedBefore = requestRow.recommendations.filter((r) => r.status === 'REJECTED').length;
    const regenerationRound = Math.floor(rejectedBefore / 3) + 1;

    await prisma.mealRecommendation.updateMany({
      where: { requestId: requestRow.id, status: 'PROPOSED' },
      data: { status: 'REJECTED' },
    });

    const alreadyShown = requestRow.recommendations.map((r) => r.templateId);
    const { created, ctx } = await createRecommendations(requestRow, household, requestRow.parsed, {
      excludeTemplateIds: alreadyShown,
    });

    if (created.length === 0) {
      throw new AppError(
        404,
        'no_more_options',
        'Det finns inga fler säkra förslag som matchar just nu. Justera ett antagande eller kraven och försök igen.'
      );
    }

    const assumptionRows = await persistAssumptions(
      requestRow,
      household,
      requestRow.parsed,
      created,
      ctx
    );
    await attachMotivations(created, requestRow.parsed, household);

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'no_option_accepted',
      payload: { requestId: requestRow.id, regeneration_round: regenerationRound },
    });

    res.status(201).json({
      request: { id: requestRow.id, parsed: requestRow.parsed },
      recommendations: created.map(recommendationResponse),
      assumptions: assumptionResponse(assumptionRows),
      degraded:
        created.length < 3
          ? 'Med hushållets krav finns just nu färre än tre säkra förslag kvar.'
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
      confidenceRows: ctx.confidenceRows,
      dishPreferences: ctx.dishPreferences,
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
      include: { template: true, request: { include: { recommendations: true } } },
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

    // Time-to-decision + which regeneration round the accepted card came from
    const msSinceSolve = Date.now() - new Date(rec.request.createdAt).getTime();
    const rejectedCount = rec.request.recommendations.filter((r) => r.status === 'REJECTED').length;

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'recommendation_accepted',
      payload: {
        recommendationId: rec.id,
        templateId: rec.templateId,
        slot: rec.slot,
        ms_since_solve: msSinceSolve,
        regeneration_round: Math.floor(rejectedCount / 3),
      },
    });

    res.json({
      recommendation: { id: updated.id, status: updated.status, slot: updated.slot },
      shoppingList,
    });
  })
);

export default router;
