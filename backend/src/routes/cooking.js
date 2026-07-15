// ============================================
// Cooking Routes — Session-managed cooking mode
// Uses buildCookingPrompt for voice-guided assistance
// ============================================

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { validate, cookingAskSchema } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { askCookingAssistant } from '../services/claude.js';
import { buildCookingPrompt } from '../services/cookingPrompt.js';

const router = Router();

// ── Bounded session store ──────────────────
// Hard cap prevents unbounded memory growth.
// LRU eviction: oldest session is removed when cap is reached.
// TTL: sessions expire after 2 hours of inactivity.

const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const sessions = new Map();

function evictExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function evictOldestIfNeeded() {
  if (sessions.size < MAX_SESSIONS) return;
  // Map iterates in insertion order — first key is the oldest
  const oldestKey = sessions.keys().next().value;
  if (oldestKey !== undefined) {
    sessions.delete(oldestKey);
  }
}

function touchSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  // Move to end of Map (refreshes LRU position)
  sessions.delete(id);
  session.lastActive = Date.now();
  sessions.set(id, session);
  return session;
}

// Periodic cleanup every 10 minutes
setInterval(evictExpired, 10 * 60 * 1000).unref();

// ──────────────────────────────────────────
// POST /cooking/sessions — Start a cooking session
// ──────────────────────────────────────────
router.post(
  '/sessions',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { recipe } = req.body;
    if (!recipe?.title || !recipe?.steps?.length) {
      throw new AppError(400, 'invalid_recipe', 'Recept med titel och steg krävs.');
    }

    evictExpired();
    evictOldestIfNeeded();

    const sessionId = `cook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    sessions.set(sessionId, {
      recipe,
      currentStep: 0,
      timers: [],
      conversation: [],
      lastActive: Date.now(),
    });

    res.status(201).json({
      sessionId,
      totalSteps: recipe.steps.length,
      prompt: buildCookingPrompt(recipe, 0, [], []),
    });
  })
);

// ──────────────────────────────────────────
// POST /cooking/sessions/:id/ask — Ask Nisse during cooking
// ──────────────────────────────────────────
router.post(
  '/sessions/:id/ask',
  optionalAuth,
  validate(cookingAskSchema),
  asyncHandler(async (req, res) => {
    const session = touchSession(req.params.id);
    if (!session) {
      throw new AppError(404, 'session_not_found', 'Matlagningssessionen hittades inte eller har gått ut.');
    }

    const { question, context } = req.validated;

    // Update session state from client context
    if (context?.currentStep != null) {
      session.currentStep = context.currentStep;
    }
    if (context?.activeTimers) {
      session.timers = context.activeTimers;
    }

    const result = await askCookingAssistant(
      session.recipe,
      question,
      session.conversation.slice(-6),
      {
        ...context,
        systemPrompt: buildCookingPrompt(
          session.recipe,
          session.currentStep,
          session.timers,
          session.conversation,
        ),
      },
    );

    // Persist conversation in session
    session.conversation.push(
      { role: 'user', content: question },
      { role: 'assistant', content: result.answer },
    );

    res.json({ answer: result.answer });
  })
);

// ──────────────────────────────────────────
// PATCH /cooking/sessions/:id — Update session state
// ──────────────────────────────────────────
router.patch(
  '/sessions/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const session = touchSession(req.params.id);
    if (!session) {
      throw new AppError(404, 'session_not_found', 'Matlagningssessionen hittades inte eller har gått ut.');
    }

    const { currentStep, timers } = req.body;
    if (currentStep != null) session.currentStep = currentStep;
    if (timers) session.timers = timers;

    res.json({
      currentStep: session.currentStep,
      prompt: buildCookingPrompt(
        session.recipe,
        session.currentStep,
        session.timers,
        session.conversation,
      ),
    });
  })
);

// ──────────────────────────────────────────
// DELETE /cooking/sessions/:id — End a cooking session
// ──────────────────────────────────────────
router.delete(
  '/sessions/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    sessions.delete(req.params.id);
    res.json({ message: 'Session ended' });
  })
);

// ──────────────────────────────────────────
// GET /cooking/sessions/:id — Get session state
// ──────────────────────────────────────────
router.get(
  '/sessions/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const session = touchSession(req.params.id);
    if (!session) {
      throw new AppError(404, 'session_not_found', 'Matlagningssessionen hittades inte eller har gått ut.');
    }

    res.json({
      currentStep: session.currentStep,
      totalSteps: session.recipe.steps.length,
      recipeTitle: session.recipe.title,
      conversationLength: session.conversation.length,
    });
  })
);

export default router;
