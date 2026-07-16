// ============================================
// Cook Session Routes — Nisse guided cooking v2
// DB-persisted sessions (survive reload/restart),
// coordinated child/adult timeline, rescue mode.
// The legacy in-memory /cooking API is untouched.
// ============================================

import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  validate,
  startCookSessionSchema,
  updateCookSessionSchema,
  rescueRequestSchema,
  sessionAskSchema,
  mealFeedbackSchema,
  prepVerifySchema,
  missingIngredientSchema,
  behindScheduleSchema,
} from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { getOwnedHousehold } from '../services/nisse/householdAccess.js';
import { buildSessionData } from '../services/nisse/cookSessionService.js';
import { resolveEaters } from '../services/nisse/recommendationService.js';
import { hardGates } from '../services/nisse/engine/allergenGate.js';
import { resolveMissingIngredient, replanRemaining } from '../services/nisse/engine/rescuePlan.js';
import { rescueHelp } from '../services/nisse/ai/nisseAi.js';
import { askCookingAssistant } from '../services/claude.js';
import { buildCookingPrompt } from '../services/cookingPrompt.js';
import { logEvent } from '../services/nisse/analytics.js';

const router = Router();
const MAX_CONVERSATION_TURNS = 20;

async function getOwnedSession(userId, sessionId) {
  const household = await getOwnedHousehold(prisma, userId);
  const session = await prisma.cookingSession.findFirst({
    where: { id: sessionId, householdId: household.id },
  });
  if (!session) {
    throw new AppError(404, 'session_not_found', 'Matlagningssessionen hittades inte.');
  }
  return { session, household };
}

function sessionResponse(session) {
  return {
    id: session.id,
    status: session.status,
    recipeData: session.recipeData,
    timeline: session.timeline,
    currentStepIndex: session.currentStepIndex,
    branchState: session.branchState,
    recommendationId: session.recommendationId,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    hasFeedback: undefined, // set by GET when included
  };
}

// ──────────────────────────────────────────
// POST /cook-sessions — start guided cooking
// ──────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  validate(startCookSessionSchema),
  asyncHandler(async (req, res) => {
    const { recommendationId, templateSlug, branch, eaterIds } = req.validated;
    const household = await getOwnedHousehold(prisma, req.user.id);

    let template;
    let recommendation = null;
    let eaters;

    if (recommendationId) {
      recommendation = await prisma.mealRecommendation.findFirst({
        where: { id: recommendationId, request: { householdId: household.id } },
        include: { template: true, request: true },
      });
      if (!recommendation) {
        throw new AppError(404, 'recommendation_not_found', 'Rekommendationen hittades inte.');
      }
      template = recommendation.template;
      eaters = resolveEaters(household.members, recommendation.request.parsed || {});
    } else {
      template = await prisma.recipeTemplate.findUnique({ where: { slug: templateSlug } });
      if (!template || !template.isActive) {
        throw new AppError(404, 'template_not_found', 'Receptet hittades inte.');
      }
      eaters = resolveEaters(household.members, { eaterIds: eaterIds || null });
    }

    // SAFETY: re-run the hard gates at session start — the household
    // may have changed since the recommendation was computed.
    const gates = hardGates(template, eaters);
    if (!gates.safe) {
      const v = gates.allergen.violations[0] || gates.dietary.violations[0];
      throw new AppError(
        409,
        'unsafe_for_household',
        `Receptet är inte säkert för ${v.memberName} (${v.allergen || v.restriction}). Välj ett annat.`
      );
    }

    const inventory = await prisma.inventoryItem.findMany({ where: { householdId: household.id } });

    // Branched templates default to split when children+adults eat together
    const wantsSplit =
      branch === 'split' ||
      (template.hasChildAdultBranch &&
        eaters.some((m) => m.ageCategory === 'CHILD' || m.ageCategory === 'BABY') &&
        eaters.some((m) => m.ageCategory !== 'CHILD' && m.ageCategory !== 'BABY'));

    const { recipeData, timeline } = buildSessionData(template, {
      eaters,
      inventory,
      branch: wantsSplit ? 'split' : 'base',
    });

    const session = await prisma.cookingSession.create({
      data: {
        householdId: household.id,
        recommendationId: recommendation?.id || null,
        templateId: template.id,
        recipeData,
        timeline,
        branchState: wantsSplit ? {} : undefined,
      },
    });

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'cooking_started',
      payload: { sessionId: session.id, templateId: template.id, branch: recipeData.branch },
    });

    res.status(201).json({ session: sessionResponse(session) });
  })
);

// ──────────────────────────────────────────
// GET /cook-sessions/:id
// ──────────────────────────────────────────
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { session } = await getOwnedSession(req.user.id, req.params.id);
    const feedback = await prisma.mealFeedback.findUnique({ where: { sessionId: session.id } });
    res.json({ session: { ...sessionResponse(session), hasFeedback: Boolean(feedback) } });
  })
);

// ──────────────────────────────────────────
// PATCH /cook-sessions/:id — progress / status
// ──────────────────────────────────────────
router.patch(
  '/:id',
  requireAuth,
  validate(updateCookSessionSchema),
  asyncHandler(async (req, res) => {
    const { session, household } = await getOwnedSession(req.user.id, req.params.id);
    const { currentStepIndex, branchState, status } = req.validated;

    const updated = await prisma.cookingSession.update({
      where: { id: session.id },
      data: {
        ...(currentStepIndex != null && { currentStepIndex }),
        ...(branchState && { branchState }),
        ...(status && {
          status,
          ...(status === 'COMPLETED' && { completedAt: new Date() }),
        }),
      },
    });

    if (status === 'COMPLETED' || status === 'ABANDONED') {
      await logEvent(prisma, {
        userId: req.user.id,
        householdId: household.id,
        name: status === 'COMPLETED' ? 'cooking_completed' : 'cooking_abandoned',
        payload: { sessionId: session.id, templateId: session.templateId },
      });
    }

    res.json({ session: sessionResponse(updated) });
  })
);

/**
 * Upsert learned pantry confidence for a household ingredient
 * (level 1 verification and missing reports are the strongest
 * learning signals we have).
 */
async function setIngredientConfidence(householdId, canonical, confidence) {
  await prisma.householdIngredientConfidence.upsert({
    where: { householdId_canonical: { householdId, canonical } },
    create: { householdId, canonical, confidence },
    update: { confidence },
  });
}

// ──────────────────────────────────────────
// POST /cook-sessions/:id/prep — level 1 verification
// Confirm/deny the critical ingredients before the
// stove goes on. Updates learned pantry confidence.
// ──────────────────────────────────────────
router.post(
  '/:id/prep',
  requireAuth,
  validate(prepVerifySchema),
  asyncHandler(async (req, res) => {
    const { session, household } = await getOwnedSession(req.user.id, req.params.id);
    const { confirmed, missing } = req.validated;

    for (const canonical of confirmed) {
      await setIngredientConfidence(household.id, canonical, 0.95);
    }
    for (const canonical of missing) {
      await setIngredientConfidence(household.id, canonical, 0.05);
      await prisma.inventoryItem.deleteMany({ where: { householdId: household.id, canonical } });
    }

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'prep_verified',
      payload: {
        sessionId: session.id,
        critical_confirmed: confirmed.length,
        critical_missing: missing.length,
      },
    });

    res.json({ ok: true, confirmed: confirmed.length, missing: missing.length });
  })
);

// ──────────────────────────────────────────
// POST /cook-sessions/:id/missing — "Jag saknar något"
// Deterministic resolution: safe substitution →
// simplification → fallback plan. Substitutions can
// never bypass the allergen gate.
// ──────────────────────────────────────────
router.post(
  '/:id/missing',
  requireAuth,
  validate(missingIngredientSchema),
  asyncHandler(async (req, res) => {
    const { session, household } = await getOwnedSession(req.user.id, req.params.id);
    const { canonical } = req.validated;

    const template = await prisma.recipeTemplate.findUnique({
      where: { id: session.templateId },
    });
    if (!template) {
      throw new AppError(404, 'template_not_found', 'Receptet hittades inte.');
    }

    // Conservative: gate substitutions against ALL household members —
    // a substitute is only offered when it is safe for everyone.
    const plan = resolveMissingIngredient(template, canonical, household.members);

    // The report itself is a learning signal: the household did not have it.
    await setIngredientConfidence(household.id, canonical, 0.05);
    await prisma.inventoryItem.deleteMany({ where: { householdId: household.id, canonical } });

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'missing_ingredient_reported',
      payload: {
        sessionId: session.id,
        canonical,
        resolution: plan.resolution,
        substitute_canonical: plan.substitute?.canonical || null,
      },
    });

    res.json(plan);
  })
);

// ──────────────────────────────────────────
// POST /cook-sessions/:id/behind — "Jag ligger efter"
// Deterministic replan of the remaining steps:
// drop optional steps, re-pack, new realistic ETA.
// ──────────────────────────────────────────
router.post(
  '/:id/behind',
  requireAuth,
  validate(behindScheduleSchema),
  asyncHandler(async (req, res) => {
    const { session, household } = await getOwnedSession(req.user.id, req.params.id);

    const template = await prisma.recipeTemplate.findUnique({
      where: { id: session.templateId },
    });
    if (!template) {
      throw new AppError(404, 'template_not_found', 'Receptet hittades inte.');
    }

    const sessionSteps = session.recipeData?.steps || [];
    const completedIds = new Set(
      sessionSteps.slice(0, session.currentStepIndex).map((s) => s.id)
    );

    const replan = replanRemaining(template.steps, completedIds, {
      branch: session.recipeData?.branch || 'base',
    });

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'time_problem_reported',
      payload: {
        sessionId: session.id,
        stepIndex: session.currentStepIndex,
        minutes_behind: req.validated.minutesBehind ?? null,
        new_eta_min: replan.newEtaMin,
        steps_simplified: replan.skipped.length,
      },
    });

    res.json({
      newEtaMin: replan.newEtaMin,
      skipped: replan.skipped,
      remainingSteps: replan.steps.map((s) => ({
        id: s.id,
        text: s.text,
        durationMin: s.durationMin,
        lane: s.lane,
        startMin: s.startMin,
      })),
      message:
        replan.skipped.length > 0
          ? `Ingen fara. Vi hoppar över ${replan.skipped.length} moment som inte behövs — klart om ca ${replan.newEtaMin} min.`
          : `Ingen fara. Fokusera på nästa steg i taget — klart om ca ${replan.newEtaMin} min.`,
    });
  })
);

// ──────────────────────────────────────────
// POST /cook-sessions/:id/rescue — SOS mode
// AI when available, canned deterministic fixes
// otherwise. Always answers.
// ──────────────────────────────────────────
router.post(
  '/:id/rescue',
  requireAuth,
  validate(rescueRequestSchema),
  asyncHandler(async (req, res) => {
    const { session, household } = await getOwnedSession(req.user.id, req.params.id);
    const steps = session.recipeData?.steps || [];
    const step = steps[session.currentStepIndex] || steps[0] || {};

    const result = await rescueHelp(
      {
        recipeTitle: session.recipeData?.title || 'Recept',
        currentStep: session.currentStepIndex + 1,
        stepText: step.text || '',
        timers: [],
      },
      req.validated.problem
    );

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'rescue_used',
      payload: { sessionId: session.id, problem: req.validated.problem, source: result.source },
    });

    res.json(result);
  })
);

// ──────────────────────────────────────────
// POST /cook-sessions/:id/ask — Fråga Nisse
// Reuses the proven cooking assistant with the
// session's frozen recipe; conversation persisted.
// ──────────────────────────────────────────
router.post(
  '/:id/ask',
  requireAuth,
  validate(sessionAskSchema),
  asyncHandler(async (req, res) => {
    const { session } = await getOwnedSession(req.user.id, req.params.id);
    const { question, context } = req.validated;

    const conversation = Array.isArray(session.conversation) ? session.conversation : [];
    const currentStep = context.currentStep ?? session.currentStepIndex;

    const result = await askCookingAssistant(
      session.recipeData,
      question,
      conversation.slice(-6),
      {
        ...context,
        systemPrompt: buildCookingPrompt(
          session.recipeData,
          currentStep,
          context.activeTimers || [],
          conversation
        ),
      }
    );

    const nextConversation = [
      ...conversation,
      { role: 'user', content: question },
      { role: 'assistant', content: result.answer },
    ].slice(-MAX_CONVERSATION_TURNS * 2);

    await prisma.cookingSession.update({
      where: { id: session.id },
      data: { conversation: nextConversation, currentStepIndex: currentStep },
    });

    res.json({ answer: result.answer });
  })
);

// ──────────────────────────────────────────
// POST /cook-sessions/:id/feedback
// ──────────────────────────────────────────
router.post(
  '/:id/feedback',
  requireAuth,
  validate(mealFeedbackSchema),
  asyncHandler(async (req, res) => {
    const { session, household } = await getOwnedSession(req.user.id, req.params.id);

    const existing = await prisma.mealFeedback.findUnique({ where: { sessionId: session.id } });
    if (existing) {
      throw new AppError(409, 'feedback_exists', 'Feedback är redan lämnad för denna måltid.');
    }

    const memberIds = new Set(household.members.map((m) => m.id));
    const memberRatings = req.validated.memberRatings.filter((r) => memberIds.has(r.memberId));

    const feedback = await prisma.mealFeedback.create({
      data: {
        sessionId: session.id,
        householdId: household.id,
        templateId: session.templateId,
        cooked: req.validated.cooked,
        actualTimeMin: req.validated.actualTimeMin ?? null,
        cookAgain: req.validated.cookAgain ?? null,
        avoid: req.validated.avoid,
        comment: req.validated.comment ?? null,
        memberRatings,
      },
    });

    await logEvent(prisma, {
      userId: req.user.id,
      householdId: household.id,
      name: 'feedback_submitted',
      payload: {
        sessionId: session.id,
        templateId: session.templateId,
        cookAgain: feedback.cookAgain,
        avoid: feedback.avoid,
        ratingCount: memberRatings.length,
      },
    });

    res.status(201).json({ feedback });
  })
);

export default router;
