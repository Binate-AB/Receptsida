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

  try {
    const prompt = PROMPTS.mealParse;
    const { data } = await callStructured({
      promptKey: 'mealParse',
      promptVersion: prompt.version,
      system: prompt.system,
      user: prompt.build({ rawText, chips, householdSummary }),
      maxTokens: prompt.maxTokens,
      schema: parsedMealRequestSchema,
    });

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

    return { parsed, source: 'ai', confidence: data.confidence };
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
    const { data } = await callStructured({
      promptKey: 'motivations',
      promptVersion: prompt.version,
      system: prompt.system,
      user: prompt.build({ recommendations, parsed, householdSummary }),
      maxTokens: prompt.maxTokens,
      schema: motivationsSchema,
    });

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
    const { data } = await callStructured({
      promptKey: 'rescue',
      promptVersion: prompt.version,
      system: prompt.system,
      user: prompt.build({ problem: problemText, ...sessionSnapshot }),
      maxTokens: prompt.maxTokens,
      schema: rescueSchema,
    });
    return { ...data, source: 'ai' };
  } catch (err) {
    console.error('rescue AI call failed, using fallback:', err.message);
    return rescueFallback(problemText);
  }
}
