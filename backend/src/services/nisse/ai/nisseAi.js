// ============================================
// Nisse AI — Service boundary
// The only interface routes use for generative AI.
// Every function: validated structured output +
// deterministic fallback. AI NEVER decides safety —
// its output only ever narrows (avoidIngredients) or
// explains; allergen gating stays in the engine.
// ============================================

import { PROMPTS } from './prompts.js';
import { parsedMealRequestSchema, motivationsSchema, rescueSchema } from './schemas.js';
import { callStructured, aiAvailable, AiOutputError } from './client.js';
import { deterministicParse } from '../engine/chipsParse.js';
import { rescueFallback } from '../engine/rescueFallbacks.js';
import { canonicalIngredient } from '../engine/normalize.js';
import { cacheGet, cacheSet } from '../../../config/redis.js';
import crypto from 'crypto';

/**
 * Reject a promise after `ms` so a slow AI call can never block the request
 * past the serverless function budget. Callers already fall back to the
 * deterministic path on any rejection.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Per-call budgets. Two AI calls (parse + motivations) can run in one
// /dinner/solve; keeping each well under the Vercel Hobby 10s limit leaves
// headroom for DB work. Both degrade gracefully when they trip.
const PARSE_BUDGET_MS = 7_000;
const MOTIVATIONS_BUDGET_MS = 6_000;
const RESCUE_BUDGET_MS = 8_000;

/**
 * Parse tonight's situation.
 * Free text → AI parse (validated, retried once) merged over the
 * chips baseline. No free text, no AI, or AI failure → pure
 * deterministic chips parse.
 *
 * @param {string|undefined} rawText
 * @param {object|undefined} chips
 * @param {object} householdSummary — { members: [{id, name, ageCategory}] }
 * @returns {Promise<{ parsed: object, source: 'ai'|'chips_fallback', confidence: number|null }>}
 */
export async function parseMealSituation(rawText, chips, householdSummary) {
  const baseline = deterministicParse(chips || {});

  if (!rawText || !aiAvailable()) {
    return { parsed: baseline, source: 'chips_fallback', confidence: null };
  }

  // Cache identical situations (text + chips + member set) for 1h
  const cacheKey = 'nisse:parse:' + crypto
    .createHash('sha256')
    .update(JSON.stringify({ rawText: rawText.trim().toLowerCase(), chips, m: (householdSummary?.members || []).map((x) => x.id).sort() }))
    .digest('hex')
    .slice(0, 24);
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const prompt = PROMPTS.mealParse;
    const { data } = await withTimeout(
      callStructured({
        promptKey: 'mealParse',
        promptVersion: prompt.version,
        system: prompt.system,
        user: prompt.build({ rawText, chips, householdSummary }),
        maxTokens: prompt.maxTokens,
        schema: parsedMealRequestSchema,
      }),
      PARSE_BUDGET_MS,
      'mealParse'
    );

    // Chips take precedence over AI interpretation on conflict
    // (explicit clicks beat inferred text), and eaterIds must be
    // real member ids.
    const memberIds = new Set((householdSummary?.members || []).map((m) => m.id));
    const eaterIds =
      chips?.eaterIds?.length > 0
        ? baseline.eaterIds
        : data.eaterIds?.filter((id) => memberIds.has(id)) || null;

    const { confidence, ...aiParsed } = data;
    const parsed = {
      ...aiParsed,
      timeBudgetMin: chips?.timeBudgetMin ?? data.timeBudgetMin,
      energy: chips?.energy ?? data.energy,
      budget: chips?.budget ?? data.budget,
      occasion: chips?.occasion ?? data.occasion,
      eaterIds: eaterIds?.length ? eaterIds : null,
      // Canonicalize tonight-only avoids so they match template ingredients
      avoidIngredients: (data.avoidIngredients || []).map((n) => canonicalIngredient(n)),
    };

    const result = { parsed, source: 'ai', confidence: data.confidence };
    await cacheSet(cacheKey, result, 3600);
    return result;
  } catch (err) {
    if (!(err instanceof AiOutputError)) {
      console.error('mealParse AI call failed:', err.message);
    }
    return { parsed: baseline, source: 'chips_fallback', confidence: null };
  }
}

/**
 * Write short Swedish motivations for slotted recommendations.
 * Returns null on any failure — cards render fine without copy.
 *
 * @param {Array<object>} recommendations — [{ slot, title, description, totalTimeMin, cost, reasons, branchPossible }]
 * @param {object} parsed
 * @param {object} householdSummary
 * @returns {Promise<Record<string, string>|null>} slot → motivation
 */
export async function writeMotivations(recommendations, parsed, householdSummary) {
  if (!aiAvailable() || recommendations.length === 0) return null;

  try {
    const prompt = PROMPTS.motivations;
    const { data } = await withTimeout(
      callStructured({
        promptKey: 'motivations',
        promptVersion: prompt.version,
        system: prompt.system,
        user: prompt.build({ recommendations, parsed, householdSummary }),
        maxTokens: prompt.maxTokens,
        schema: motivationsSchema,
      }),
      MOTIVATIONS_BUDGET_MS,
      'motivations'
    );

    const map = {};
    for (const item of data.items) map[item.slot] = item.motivation;
    return map;
  } catch (err) {
    console.error('motivations AI call failed (fail-open):', err.message);
    return null;
  }
}

/**
 * Contextual rescue help during cooking.
 * AI when available, canned deterministic fixes otherwise —
 * the SOS button must always answer.
 *
 * @param {object} sessionSnapshot — { recipeTitle, currentStep, stepText, timers }
 * @param {string} problemText
 * @returns {Promise<{ assessment, actions, voiceCue, source: 'ai'|'fallback' }>}
 */
export async function rescueHelp(sessionSnapshot, problemText) {
  if (!aiAvailable()) {
    return rescueFallback(problemText);
  }

  try {
    const prompt = PROMPTS.rescue;
    const { data } = await withTimeout(
      callStructured({
        promptKey: 'rescue',
        promptVersion: prompt.version,
        system: prompt.system,
        user: prompt.build({ problem: problemText, ...sessionSnapshot }),
        maxTokens: prompt.maxTokens,
        schema: rescueSchema,
      }),
      RESCUE_BUDGET_MS,
      'rescue'
    );
    return { ...data, source: 'ai' };
  } catch (err) {
    console.error('rescue AI call failed, using fallback:', err.message);
    return rescueFallback(problemText);
  }
}
