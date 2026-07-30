// ============================================
// Nisse — deterministic search over the VERIFIED
// candidate pool. Replaces the legacy AI web-search
// (services/claude.js searchRecipes), which bypassed
// the pool gate and 502'd on any model/API error.
//
// No AI, no network: matches the query against the
// verified templates' title / tags / canonical
// ingredients and maps hits to the legacy recipe
// shape the RecipeCard renders. Never returns
// DRAFT/RETIRED dishes (VERIFIED_POOL_WHERE).
// ============================================

import { VERIFIED_POOL_WHERE } from './candidatePool.js';
import { canonicalIngredient } from './engine/normalize.js';
import { scaleIngredients } from './engine/portions.js';
import { formatAmount } from './engine/units.js';

const STOPWORDS = new Set([
  'och', 'med', 'en', 'ett', 'på', 'för', 'till', 'av', 'jag', 'vi', 'vill', 'ha',
  'ska', 'laga', 'äta', 'middag', 'mat', 'recept', 'något', 'lite', 'som', 'kan',
]);

function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Map a RecipeTemplate row to the legacy recipe shape used by RecipeCard.
 * Ingredients are scaled to the household's portion count via the §28 rules.
 */
export function templateToLegacyRecipe(tpl, householdSize = 2) {
  const portions = Math.max(1, Number(householdSize) || 2);
  const scaled = scaleIngredients(tpl.ingredients || [], portions, {
    servingsBase: tpl.servingsBase,
  });
  const ingredients = scaled.map((ing) => ({
    amount: ing.qty != null ? formatAmount(ing.qty, ing.unit) : '',
    name: ing.name,
    have: false,
    est_price: ing.estPriceSek ? `ca ${ing.estPriceSek} kr` : null,
  }));

  return {
    id: tpl.slug,
    title: tpl.title,
    description: tpl.description,
    time_minutes: tpl.totalTimeMin,
    difficulty: tpl.difficulty,
    servings: portions,
    cost_estimate: `ca ${tpl.costPerPortionMin}–${tpl.costPerPortionMax} kr/port`,
    ingredients,
    tools: tpl.equipmentRequired || [],
    steps: (tpl.steps || []).filter((s) => s.branch === 'base' || !s.branch),
    tips: null,
    // These come from Nisse's own verified database, not a scraped web source.
    source_name: 'Nisses verifierade recept',
    source_url: null,
    tags: tpl.tags || [],
  };
}

/** Score a template against the query tokens. 0 = no textual match. */
function scoreTemplate(tpl, tokens) {
  if (tokens.length === 0) return 0;
  const title = String(tpl.title || '').toLowerCase();
  const tagSet = new Set((tpl.tags || []).map((t) => t.toLowerCase()));
  const canonicalSet = new Set(
    (tpl.ingredients || []).map((i) => String(i.canonical || '').toLowerCase())
  );
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 5;
    if (tagSet.has(token)) score += 3;
    // Canonical ingredients match EXACTLY (=== on the canonical key),
    // never includes() — the lexicon specificity invariant.
    if (canonicalSet.has(canonicalIngredient(token))) score += 2;
  }
  return score;
}

/**
 * Search the verified candidate pool deterministically.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} query
 * @param {{ householdSize?: number, limit?: number }} [opts]
 * @returns {Promise<Array<object>>} legacy-shaped recipes (ranked)
 */
export async function searchVerifiedPool(prisma, query, opts = {}) {
  const householdSize = opts.householdSize || 2;
  const limit = Math.min(opts.limit || 6, 12);

  const templates = await prisma.recipeTemplate.findMany({ where: VERIFIED_POOL_WHERE });
  const tokens = tokenize(query);

  const scored = templates
    .map((tpl) => ({ tpl, score: scoreTemplate(tpl, tokens) }))
    .sort((a, b) => b.score - a.score);

  const anyMatch = scored.some((s) => s.score > 0);
  // No textual hit (e.g. "vad ska jag laga?") → still return a useful spread,
  // ordered by child-friendliness then robustness, so the view is never blank.
  const chosen = anyMatch
    ? scored.filter((s) => s.score > 0).slice(0, limit)
    : [...templates]
        .sort((a, b) => (b.childFriendly - a.childFriendly) || (b.robustness - a.robustness))
        .slice(0, limit)
        .map((tpl) => ({ tpl, score: 0 }));

  return chosen.map((s) => templateToLegacyRecipe(s.tpl, householdSize));
}
